package com.dealflow.negotiation.service;

import com.dealflow.common.audit.AuditService;
import com.dealflow.common.error.ApiException;
import com.dealflow.domain.risk.RiskAssessment;
import com.dealflow.identity.model.AppUser;
import com.dealflow.negotiation.dto.*;
import com.dealflow.negotiation.model.*;
import com.dealflow.negotiation.repository.NegotiationCounterRepository;
import com.dealflow.negotiation.repository.NegotiationMessageRepository;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationLine;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.repository.QuotationRepository;
import com.dealflow.quotation.service.PricedQuotation;
import com.dealflow.quotation.service.PricingService;
import com.dealflow.quotation.service.QuotationMapper;
import com.dealflow.quotation.service.QuotationService;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The conversation between a rep and a customer about one quotation.
 *
 * <p>The rule that matters here is that a counter applies itself. There is deliberately no
 * "accept counter" endpoint: the customer proposes terms, the quotation is re-priced and
 * re-scored, and if the result is worse than what was signed off it goes back into the
 * approval chain on its own. The rep approves it through the ordinary approvals screen,
 * which is the governance that already exists -- a second, parallel mechanism for saying
 * yes is exactly what would let a deal escape it.
 */
@Service
public class NegotiationService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final QuotationService quotations;
    private final QuotationRepository quotationRepository;
    private final PricingService pricing;
    private final QuotationMapper mapper;
    private final NegotiationMessageRepository messages;
    private final NegotiationCounterRepository counters;
    private final PortalTokenService portalTokens;
    private final AuditService audit;

    public NegotiationService(QuotationService quotations, QuotationRepository quotationRepository,
                              PricingService pricing, QuotationMapper mapper,
                              NegotiationMessageRepository messages,
                              NegotiationCounterRepository counters,
                              PortalTokenService portalTokens, AuditService audit) {
        this.quotations = quotations;
        this.quotationRepository = quotationRepository;
        this.pricing = pricing;
        this.mapper = mapper;
        this.messages = messages;
        this.counters = counters;
        this.portalTokens = portalTokens;
        this.audit = audit;
    }

    // ---------- the rep's side ----------

    /** Issues a magic link and hands the quotation to the customer. */
    @Transactional
    public SendToCustomerResponse send(long quotationId, long actorId, String portalBaseUrl) {
        Quotation quotation = quotations.load(quotationId);
        AppUser actor = quotations.actor(actorId);

        if (quotation.getState() != QuotationState.APPROVED) {
            throw ApiException.conflict(
                    "Only an approved quotation can be sent to a customer.");
        }

        String token = portalTokens.issue(quotation, quotation.getCustomer());
        QuotationState from = quotation.getState();
        quotation.setState(QuotationState.SENT);
        quotation.setSentAt(Instant.now());
        audit.record(quotation, actor, "SENT_TO_CUSTOMER", from, QuotationState.SENT,
                "portal link issued to " + quotation.getCustomer().getName());
        quotationRepository.save(quotation);

        return new SendToCustomerResponse(
                portalBaseUrl + "?token=" + token,
                Instant.now().plus(java.time.Duration.ofDays(7)).toString(),
                mapper.toRecompute(pricing.price(quotation)));
    }

    @Transactional(readOnly = true)
    public NegotiationThreadResponse thread(long quotationId) {
        return toThread(quotations.load(quotationId));
    }

    @Transactional
    public NegotiationThreadResponse reply(long quotationId, ReplyRequest request, long actorId) {
        Quotation quotation = quotations.load(quotationId);
        AppUser actor = quotations.actor(actorId);

        messages.save(new NegotiationMessage(quotation, lineOf(quotation, request.lineId()),
                MessageAuthor.SALES, actor.getName(), requireBody(request.body())));
        audit.record(quotation, actor, "NEGOTIATION_REPLY", "replied to the customer");
        return toThread(quotation);
    }

    // ---------- shared with the portal ----------

    @Transactional
    public void addCustomerMessage(Quotation quotation, Long lineId, String body) {
        requireOpenToCustomer(quotation);
        messages.save(new NegotiationMessage(quotation, lineOf(quotation, lineId),
                MessageAuthor.CUSTOMER, quotation.getCustomer().getName(), requireBody(body)));
        audit.record(quotation, null, "CUSTOMER_MESSAGE",
                quotation.getCustomer().getName() + " commented");
    }

    /**
     * Applies a customer's proposed discount, then lets governance decide for itself.
     *
     * <p>The new score is compared against the score the quotation carried when it was last
     * approved, not against zero. A customer asking for a <em>smaller</em> discount than the
     * one already signed off therefore changes nothing -- without that baseline every
     * trivial move would drag the whole chain through again.
     */
    @Transactional
    public void applyCounter(Quotation quotation, BigDecimal discountPct, String note) {
        requireOpenToCustomer(quotation);
        if (discountPct == null || discountPct.signum() < 0 || discountPct.compareTo(HUNDRED) > 0) {
            throw ApiException.invalid("A discount must be between 0 and 100.", "discountPct");
        }

        quotation.setOrderDiscountPct(discountPct);

        NegotiationCounter counter = counters.findByQuotationId(quotation.getId())
                .orElseGet(() -> new NegotiationCounter(quotation, discountPct, note));
        counter.setDiscountPct(discountPct);
        counter.setNote(note);
        counter.setState(CounterState.PENDING);
        counter.setProposedAt(Instant.now());
        counters.save(counter);

        PricedQuotation priced = pricing.price(quotation);
        RiskAssessment risk = priced.risk();
        QuotationState from = quotation.getState();
        quotation.setRiskScore(risk.score());
        quotation.setState(QuotationState.UNDER_NEGOTIATION);

        int baseline = quotation.getApprovedBaselineScore() == null
                ? 0 : quotation.getApprovedBaselineScore();

        if (risk.score() > baseline) {
            // Worse than what was signed off, so it goes back through the same chain --
            // nobody presses anything, which is the whole point of the step.
            quotations.routeForApproval(quotation, risk, null, "COUNTER_RECEIVED", from);
            return;
        }

        audit.record(quotation, null, "COUNTER_RECEIVED", from, QuotationState.UNDER_NEGOTIATION,
                "counter at " + discountPct + "%, risk " + risk.score()
                        + " within the approved baseline of " + baseline);
        quotationRepository.save(quotation);
    }

    /** The customer accepts the terms as they now stand. */
    @Transactional
    public void confirmByCustomer(Quotation quotation) {
        if (quotation.getState() == QuotationState.PENDING_APPROVAL) {
            throw ApiException.conflict("Your request is with the sales team.");
        }
        requireOpenToCustomer(quotation);

        QuotationState from = quotation.getState();
        quotation.setState(QuotationState.CONFIRMED);
        counters.findByQuotationId(quotation.getId()).ifPresent(c -> {
            c.setState(CounterState.ACCEPTED);
            counters.save(c);
        });
        audit.record(quotation, null, "CUSTOMER_CONFIRMED", from, QuotationState.CONFIRMED,
                quotation.getCustomer().getName() + " confirmed the quotation");
        quotationRepository.save(quotation);
    }

    // ---------- mapping ----------

    public NegotiationThreadResponse toThread(Quotation quotation) {
        Optional<NegotiationCounter> counter = counters.findByQuotationId(quotation.getId());
        return new NegotiationThreadResponse(
                quotation.getId(),
                quotation.ref(),
                quotation.getCustomer().getName(),
                quotation.getState().name(),
                quotation.getApprovedBaselineScore(),
                quotation.getSentAt() == null ? null : QuotationMapper.iso(quotation.getSentAt()),
                messagesFor(quotation),
                counter.map(c -> toCounter(c, quotation)).orElse(null));
    }

    private List<NegotiationMessageResponse> messagesFor(Quotation quotation) {
        return messages.findThread(quotation.getId()).stream()
                .map(m -> new NegotiationMessageResponse(
                        m.getId(), m.getAuthor().name(), m.getAuthorName(),
                        m.getLine() == null ? null : m.getLine().getId(),
                        m.getBody(), QuotationMapper.iso(m.getCreatedAt())))
                .toList();
    }

    private NegotiationCounterResponse toCounter(NegotiationCounter counter, Quotation quotation) {
        PricedQuotation priced = pricing.price(quotation);
        return new NegotiationCounterResponse(
                counter.getDiscountPct(),
                counter.getNote(),
                QuotationMapper.iso(counter.getProposedAt()),
                counter.getState().name(),
                priced.risk().score(),
                priced.marginPct(),
                priced.risk().requiredChain());
    }

    public List<NegotiationMessage> thread(Quotation quotation) {
        return messages.findThread(quotation.getId());
    }

    public Optional<NegotiationCounter> counterFor(Quotation quotation) {
        return counters.findByQuotationId(quotation.getId());
    }

    // ---------- guards ----------

    private static void requireOpenToCustomer(Quotation quotation) {
        if (!quotation.getState().isWithCustomer()) {
            throw ApiException.conflict(
                    "This quotation is not open for negotiation at the moment.");
        }
    }

    private static String requireBody(String body) {
        if (body == null || body.isBlank()) {
            throw ApiException.invalid("A message cannot be empty.", "body");
        }
        return body.trim();
    }

    private static QuotationLine lineOf(Quotation quotation, Long lineId) {
        if (lineId == null) {
            return null;
        }
        return quotation.getLines().stream()
                .filter(l -> l.getId().equals(lineId))
                .findFirst()
                .orElseThrow(() -> ApiException.invalid(
                        "That line is not on this quotation.", "lineId"));
    }
}
