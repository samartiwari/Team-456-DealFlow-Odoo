package com.dealflow.portal.service;

import com.dealflow.negotiation.model.NegotiationCounter;
import com.dealflow.negotiation.model.NegotiationMessage;
import com.dealflow.negotiation.model.PortalToken;
import com.dealflow.negotiation.service.NegotiationService;
import com.dealflow.negotiation.service.PortalTokenService;
import com.dealflow.portal.dto.*;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.service.PricedQuotation;
import com.dealflow.quotation.service.PricingService;
import com.dealflow.quotation.service.QuotationMapper;
import com.dealflow.quotation.service.QuotationService;

import java.math.BigDecimal;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The customer's side of the wall.
 *
 * <p>Everything leaving this class is a {@code Portal*} record, and those records have no
 * cost, margin, risk or approver fields at all. The isolation is structural rather than a
 * filter applied on the way out -- there is no code path here that could serialise an
 * internal figure by mistake, because the objects it builds have nowhere to put one.
 *
 * <p>The quotation is resolved from the caller's session token. No id is accepted from the
 * request, so there is no neighbouring quotation to ask for.
 */
@Service
public class PortalService {

    private final PortalTokenService tokens;
    private final NegotiationService negotiation;
    private final QuotationService quotations;
    private final PricingService pricing;

    public PortalService(PortalTokenService tokens, NegotiationService negotiation,
                         QuotationService quotations, PricingService pricing) {
        this.tokens = tokens;
        this.negotiation = negotiation;
        this.quotations = quotations;
        this.pricing = pricing;
    }

    @Transactional
    public VerifyResponse verify(VerifyRequest request) {
        PortalTokenService.Session session = tokens.verify(request == null ? null : request.token());
        return new VerifyResponse(
                session.rawSessionToken(),
                QuotationMapper.iso(session.token().getSessionExpiresAt()),
                session.token().getCustomer().getName());
    }

    @Transactional(readOnly = true)
    public PortalQuotationResponse quotation(String sessionToken) {
        return view(resolve(sessionToken));
    }

    @Transactional
    public PortalQuotationResponse comment(String sessionToken, PortalMessageRequest request) {
        Quotation quotation = resolve(sessionToken);
        negotiation.addCustomerMessage(quotation, request == null ? null : request.lineId(),
                request == null ? null : request.body());
        return view(quotations.load(quotation.getId()));
    }

    @Transactional
    public PortalQuotationResponse counter(String sessionToken, PortalCounterRequest request) {
        Quotation quotation = resolve(sessionToken);
        negotiation.applyCounter(quotation, request == null ? null : request.discountPct(),
                request == null ? null : request.note());
        return view(quotations.load(quotation.getId()));
    }

    @Transactional
    public PortalQuotationResponse confirm(String sessionToken) {
        Quotation quotation = resolve(sessionToken);
        negotiation.confirmByCustomer(quotation);
        return view(quotations.load(quotation.getId()));
    }

    /** The one quotation this session grants, and only that one. */
    private Quotation resolve(String sessionToken) {
        PortalToken token = tokens.requireSession(sessionToken);
        return quotations.load(token.getQuotation().getId());
    }

    private PortalQuotationResponse view(Quotation quotation) {
        PricedQuotation priced = pricing.price(quotation);

        var lines = priced.lines().stream()
                .map(l -> new PortalLineResponse(
                        l.lineId(), l.productName(), l.category(), l.quantity(),
                        l.unitPrice(), l.effectiveDiscountPct(), l.netTotal()))
                .toList();

        var messages = negotiation.thread(quotation).stream()
                .map(PortalService::toMessage)
                .toList();

        PortalCounterResponse counter = negotiation.counterFor(quotation)
                .map(PortalService::toCounter)
                .orElse(null);

        QuotationState state = quotation.getState();
        return new PortalQuotationResponse(
                quotation.getPublicRef().toString(),
                quotation.getCustomer().getName(),
                state.name(),
                QuotationMapper.CURRENCY,
                lines,
                quotation.getOrderDiscountPct(),
                priced.subtotal(),
                priced.subtotal(),   // no tax in this slice, so the total tracks the subtotal
                messages,
                counter,
                state.isWithCustomer(),
                state.isWithCustomer());
    }

    private static PortalMessageResponse toMessage(NegotiationMessage m) {
        return new PortalMessageResponse(
                m.getId(), m.getAuthor().name(), m.getAuthorName(),
                m.getLine() == null ? null : m.getLine().getId(),
                m.getBody(), QuotationMapper.iso(m.getCreatedAt()));
    }

    private static PortalCounterResponse toCounter(NegotiationCounter c) {
        BigDecimal pct = c.getDiscountPct();
        return new PortalCounterResponse(pct, c.getNote(),
                QuotationMapper.iso(c.getProposedAt()), c.getState().name());
    }
}
