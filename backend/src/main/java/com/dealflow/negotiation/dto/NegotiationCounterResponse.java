package com.dealflow.negotiation.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * A counter with what it did to the deal.
 *
 * <p>These three figures are the reason the rep's view and the customer's view are
 * different objects rather than the same one filtered.
 */
public record NegotiationCounterResponse(
        BigDecimal discountPct,
        String note,
        String proposedAt,
        String state,
        int riskScore,
        BigDecimal marginPct,
        List<String> requiredChain
) {}
