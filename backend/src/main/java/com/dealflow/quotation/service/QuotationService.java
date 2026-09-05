package com.dealflow.quotation.service;

import com.dealflow.approval.model.ApprovalRequest;
import com.dealflow.approval.model.ApprovalStep;
import com.dealflow.approval.model.ApproverRole;
import com.dealflow.approval.model.StepState;
import com.dealflow.approval.repository.ApprovalRequestRepository;
import com.dealflow.catalog.model.Product;
import com.dealflow.catalog.model.ProductVariant;
import com.dealflow.catalog.repository.ProductRepository;
import com.dealflow.catalog.repository.ProductVariantRepository;
import com.dealflow.common.audit.AuditService;
import com.dealflow.billing.service.QuotationApprovedEvent;
import com.dealflow.common.error.ApiException;
import com.dealflow.crm.model.Customer;
import com.dealflow.crm.repository.CustomerRepository;
import com.dealflow.domain.risk.RiskAssessment;
import com.dealflow.identity.model.AppUser;
import com.dealflow.identity.repository.AppUserRepository;
import com.dealflow.quotation.dto.AddLineRequest;
import com.dealflow.quotation.dto.ConfirmResponse;
import com.dealflow.quotation.dto.QuotationSummaryResponse;
import com.dealflow.quotation.dto.RecomputeResponse;
import com.dealflow.quotation.dto.UpdateLineRequest;
import com.dealflow.quotation.dto.UpdateQuotationRequest;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationLine;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.repository.QuotationRepository;

import java.math.BigDecimal;
import java.util.List;


import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QuotationService {

    private final QuotationRepository quotations;
    private final ProductRepository products;
    private final ProductVariantRepository variants;
    private final CustomerRepository customers;
    private final AppUserRepository users;
    private final ApprovalRequestRepository approvals;
    private final PricingService pricing;
    private final AuditService audit;
    private final QuotationMapper mapper;
    private final ApplicationEventPublisher events;

    public QuotationService(QuotationRepository quotations, ProductRepository products,
                            ProductVariantRepository variants,
                            CustomerRepository customers, AppUserRepository users,
                            ApprovalRequestRepository approvals, PricingService pricing,
                            AuditService audit, QuotationMapper mapper,
                            ApplicationEventPublisher events) {
        this.events = events;
        this.quotations = quotations;
        this.products = products;
        this.variants = variants;
        this.customers = customers;
        this.users = users;
        this.approvals = approvals;
        this.pricing = pricing;
        this.audit = audit;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<QuotationSummaryResponse> list() {
        return quotations.findAllWithLines().stream()
                .map(pricing::price)
                .map(mapper::toSummary)
                .toList();
    }

    @Transactional(readOnly = true)
    public RecomputeResponse recompute(long quotationId) {
        return mapper.toRecompute(pricing.price(load(quotationId)));
    }

    @Transactional
    public RecomputeResponse create(long customerId, long actorId) {
        Customer customer = customers.findById(customerId)
                .orElseThrow(() -> ApiException.notFound("Customer", customerId));
        AppUser rep = actor(actorId);

        Quotation quotation = quotations.save(new Quotation(customer, rep));
        audit.record(quotation, rep, "QUOTATION_CREATED", null, QuotationState.DRAFT, null);

        return mapper.toRecompute(pricing.price(quotation));
    }

    @Transactional
    public RecomputeResponse addLine(long quotationId, AddLineRequest request, long actorId) {
        Quotation quotation = editable(quotationId);
        Product product = products.findById(request.productId())
                .orElseThrow(() -> ApiException.notFound("Product", request.productId()));
        if (product.isArchived()) {
            // It is out of the catalog, but lines that already carry it keep working -- so
            // this is refused here rather than by deleting the row out from under them.
            throw ApiException.conflict(product.getName()
                    + " has been archived and cannot be added to a quotation.");
        }

        BigDecimal discount = request.discountPct() == null ? BigDecimal.ZERO : request.discountPct();
        QuotationLine line = new QuotationLine(product, request.quantity(), discount);
        line.setVariant(variantOf(product, request.variantId()));
        quotation.addLine(line);

        audit.record(quotation, actor(actorId), "LINE_ADDED",
                describe(product, line.getVariant()) + " x" + request.quantity()
                        + " @ " + discount + "%");

        quotations.save(quotation);
        return mapper.toRecompute(pricing.price(quotation));
    }

    @Transactional
    public RecomputeResponse updateLine(long quotationId, long lineId,
                                        UpdateLineRequest request, long actorId) {
        Quotation quotation = editable(quotationId);
        QuotationLine line = lineOf(quotation, lineId);

        if (request.quantity() != null) {
            line.setQuantity(request.quantity());
        }
        if (request.variantId() != null) {
            // Zero clears it back to the plain product. A JSON null cannot mean "clear"
            // here, because it is indistinguishable from a field the client left out.
            line.setVariant(request.variantId() == 0
                    ? null
                    : variantOf(line.getProduct(), request.variantId()));
        }
        if (request.discountPct() != null) {
            line.setDiscountPct(request.discountPct());
        }

        audit.record(quotation, actor(actorId), "LINE_UPDATED",
                line.getProduct().getName() + " -> x" + line.getQuantity()
                        + " @ " + line.getDiscountPct() + "%");

        quotations.save(quotation);
        return mapper.toRecompute(pricing.price(quotation));
    }

    @Transactional
    public RecomputeResponse deleteLine(long quotationId, long lineId, long actorId) {
        Quotation quotation = editable(quotationId);
        QuotationLine line = lineOf(quotation, lineId);

        audit.record(quotation, actor(actorId), "LINE_REMOVED", line.getProduct().getName());
        quotation.removeLine(line);

        quotations.save(quotation);
        return mapper.toRecompute(pricing.price(quotation));
    }

    /**
     * Order discount, customer, or both. Absent means unchanged, which is why neither field
     * carries {@code @NotNull} -- the builder submits whichever one the user touched.
     */
    @Transactional
    public RecomputeResponse update(long quotationId, UpdateQuotationRequest request, long actorId) {
        if (request.isEmpty()) {
            throw ApiException.invalid("Send an order discount, a customer, or both.", null);
        }

        Quotation quotation = editable(quotationId);
        AppUser rep = actor(actorId);

        if (request.customerId() != null
                && !request.customerId().equals(quotation.getCustomer().getId())) {
            Customer next = customers.findById(request.customerId())
                    .orElseThrow(() -> ApiException.notFound("Customer", request.customerId()));

            // Worth auditing loudly: the tier ceiling moves with the customer, so the same
            // lines can be clean for one and over the ceiling for the next.
            audit.record(quotation, rep, "CUSTOMER_CHANGED",
                    quotation.getCustomer().getName() + " to " + next.getName());
            quotation.setCustomer(next);
        }

        if (request.orderDiscountPct() != null) {
            quotation.setOrderDiscountPct(request.orderDiscountPct());
            audit.record(quotation, rep, "ORDER_DISCOUNT_SET", request.orderDiscountPct() + "%");
        }

        quotations.save(quotation);
        return mapper.toRecompute(pricing.price(quotation));
    }

    /**
     * The graded moment. Approval is raised here, by the system -- there is deliberately no
     * "request approval" endpoint anywhere in this API. Its absence is the feature.
     */
    @Transactional
    public ConfirmResponse confirm(long quotationId, long actorId) {
        Quotation quotation = load(quotationId);
        AppUser rep = actor(actorId);

        if (!quotation.getState().isConfirmable()) {
            throw ApiException.conflict("Only a draft can be confirmed.");
        }
        if (quotation.getLines().isEmpty()) {
            throw ApiException.conflict("An empty quotation cannot be confirmed.");
        }

        // Settle the prices first: from here the quotation is a commitment, and a later
        // catalog edit must not move the numbers this approval decision is taken against.
        pricing.freeze(quotation);

        // Recomputed server-side. The client's copy of the score is never trusted.
        PricedQuotation priced = pricing.price(quotation);
        RiskAssessment risk = priced.risk();

        QuotationState from = quotation.getState();
        quotation.setRiskScore(risk.score());

        if (!risk.needsApproval()) {
            quotation.setState(QuotationState.APPROVED);
            quotation.setApprovedBaselineScore(risk.score());
            audit.record(quotation, rep, "CONFIRMED", from, QuotationState.APPROVED,
                    "auto-approved, risk 0");
            quotations.save(quotation);
            events.publishEvent(new QuotationApprovedEvent(quotation.getId()));
            return new ConfirmResponse(mapper.toRecompute(pricing.price(quotation)), null);
        }

        ApprovalRequest request = routeForApproval(quotation, risk, rep, "CONFIRMED", from);
        return new ConfirmResponse(mapper.toRecompute(pricing.price(quotation)), request.getId());
    }

    /**
     * Raises an approval chain and puts the quotation in front of it.
     *
     * <p>Shared by the rep confirming and by a customer's counter arriving through the
     * portal. One routing path, so a deal that comes back from negotiation is governed by
     * exactly the same rules as one that never left -- and {@code actor} is null when it
     * was the customer who set it off, because they are not a user of this system.
     */
    @Transactional
    public ApprovalRequest routeForApproval(Quotation quotation, RiskAssessment risk,
                                            AppUser actor, String action, QuotationState from) {
        ApprovalRequest request = new ApprovalRequest(quotation, risk.score());
        int order = 1;
        for (String role : risk.requiredChain()) {
            // Strictly sequential: only the first step is actionable, so Finance can never
            // approve something the Manager later rejects.
            request.addStep(new ApprovalStep(order, ApproverRole.valueOf(role),
                    order == 1 ? StepState.PENDING : StepState.BLOCKED));
            order++;
        }
        approvals.save(request);

        quotation.setState(QuotationState.PENDING_APPROVAL);
        audit.record(quotation, actor, action, from, QuotationState.PENDING_APPROVAL,
                "risk " + risk.score() + ", routed to " + String.join(" -> ", risk.requiredChain()));
        quotations.save(quotation);
        return request;
    }

    // ---------- helpers ----------

    /** Loads with lines, product and category fetched -- callers may map outside a session. */
    public Quotation load(long id) {
        return quotations.findByIdWithLines(id)
                .orElseThrow(() -> ApiException.notFound("Quotation", id));
    }

    /**
     * The variant this line is for, checked against the product it belongs to.
     *
     * <p>A variant of some other product would price off one thing while the line claimed
     * to be another -- and because the resolver takes the variant's price and cost
     * verbatim, the margin would be wrong too. Refused rather than resolved.
     */
    private ProductVariant variantOf(Product product, Long variantId) {
        if (variantId == null || variantId == 0) {
            return null;
        }
        ProductVariant variant = variants.findById(variantId)
                .orElseThrow(() -> ApiException.notFound("Variant", variantId));
        if (!variant.getProduct().getId().equals(product.getId())) {
            throw ApiException.invalid(
                    variant.getName() + " is not a variant of " + product.getName() + ".",
                    "variantId");
        }
        return variant;
    }

    private static String describe(Product product, ProductVariant variant) {
        return variant == null ? product.getName()
                : product.getName() + " (" + variant.getName() + ")";
    }

    private Quotation editable(long id) {
        Quotation quotation = load(id);
        if (quotation.getState().isEditable()) {
            return quotation;
        }
        // One rule, in QuotationState, but a message tailored to why it failed.
        if (quotation.getState() == QuotationState.PENDING_APPROVAL) {
            throw ApiException.conflict("A quotation awaiting approval cannot be edited.");
        }
        throw ApiException.conflict("A " + quotation.getState().name().toLowerCase()
                + " quotation cannot be edited.");
    }

    private static QuotationLine lineOf(Quotation quotation, long lineId) {
        return quotation.getLines().stream()
                .filter(l -> l.getId() != null && l.getId() == lineId)
                .findFirst()
                .orElseThrow(() -> ApiException.notFound("Line", lineId));
    }

    public AppUser actor(long actorId) {
        return users.findById(actorId)
                .orElseThrow(() -> ApiException.notFound("User", actorId));
    }
}
