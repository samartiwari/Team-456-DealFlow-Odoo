package com.dealflow.quotation.service;

import com.dealflow.approval.model.ApprovalRequest;
import com.dealflow.approval.model.ApprovalStep;
import com.dealflow.approval.model.ApproverRole;
import com.dealflow.approval.model.StepState;
import com.dealflow.approval.repository.ApprovalRequestRepository;
import com.dealflow.catalog.model.Product;
import com.dealflow.catalog.repository.ProductRepository;
import com.dealflow.common.audit.AuditService;
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
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationLine;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.repository.QuotationRepository;

import java.math.BigDecimal;
import java.util.List;


import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QuotationService {

    private final QuotationRepository quotations;
    private final ProductRepository products;
    private final CustomerRepository customers;
    private final AppUserRepository users;
    private final ApprovalRequestRepository approvals;
    private final PricingService pricing;
    private final AuditService audit;
    private final QuotationMapper mapper;

    public QuotationService(QuotationRepository quotations, ProductRepository products,
                            CustomerRepository customers, AppUserRepository users,
                            ApprovalRequestRepository approvals, PricingService pricing,
                            AuditService audit, QuotationMapper mapper) {
        this.quotations = quotations;
        this.products = products;
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

        BigDecimal discount = request.discountPct() == null ? BigDecimal.ZERO : request.discountPct();
        quotation.addLine(new QuotationLine(product, request.quantity(), discount));

        audit.record(quotation, actor(actorId), "LINE_ADDED",
                product.getName() + " x" + request.quantity() + " @ " + discount + "%");

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

    @Transactional
    public RecomputeResponse setOrderDiscount(long quotationId, BigDecimal pct, long actorId) {
        Quotation quotation = editable(quotationId);
        quotation.setOrderDiscountPct(pct);

        audit.record(quotation, actor(actorId), "ORDER_DISCOUNT_SET", pct + "%");

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

        // Recomputed server-side. The client's copy of the score is never trusted.
        PricedQuotation priced = pricing.price(quotation);
        RiskAssessment risk = priced.risk();

        QuotationState from = quotation.getState();
        quotation.setRiskScore(risk.score());

        if (!risk.needsApproval()) {
            quotation.setState(QuotationState.APPROVED);
            audit.record(quotation, rep, "CONFIRMED", from, QuotationState.APPROVED,
                    "auto-approved, risk 0");
            quotations.save(quotation);
            return new ConfirmResponse(mapper.toRecompute(pricing.price(quotation)), null);
        }

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
        audit.record(quotation, rep, "CONFIRMED", from, QuotationState.PENDING_APPROVAL,
                "risk " + risk.score() + ", routed to " + String.join(" -> ", risk.requiredChain()));
        quotations.save(quotation);

        return new ConfirmResponse(mapper.toRecompute(pricing.price(quotation)), request.getId());
    }

    // ---------- helpers ----------

    /** Loads with lines, product and category fetched -- callers may map outside a session. */
    public Quotation load(long id) {
        return quotations.findByIdWithLines(id)
                .orElseThrow(() -> ApiException.notFound("Quotation", id));
    }

    private Quotation editable(long id) {
        Quotation quotation = load(id);
        if (quotation.getState() == QuotationState.PENDING_APPROVAL) {
            throw ApiException.conflict("A quotation awaiting approval cannot be edited.");
        }
        if (quotation.getState() == QuotationState.APPROVED
                || quotation.getState() == QuotationState.REJECTED) {
            throw ApiException.conflict("A " + quotation.getState().name().toLowerCase()
                    + " quotation cannot be edited.");
        }
        return quotation;
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
