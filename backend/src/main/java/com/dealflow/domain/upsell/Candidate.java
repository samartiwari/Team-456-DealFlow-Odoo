package com.dealflow.domain.upsell;

import java.math.BigDecimal;

/**
 * A product some pairing has put forward, with everything the ranker needs to judge it.
 *
 * @param confidence   how strongly the pairing holds. Admin-authored rows arrive at 1.0;
 *                     mined co-purchase statistics would arrive below it.
 * @param minMarginPct the pairing's floor -- below this the candidate is dropped however
 *                     well it pairs, because a suggestion that dilutes the deal is worse
 *                     than no suggestion
 * @param unavailable  out of stock. Always false for services and subscriptions: they hold
 *                     no stock, so stock can never rule them out
 */
public record Candidate(
        long productId,
        BigDecimal unitPrice,
        BigDecimal unitCost,
        BigDecimal confidence,
        boolean promoted,
        BigDecimal minMarginPct,
        boolean inCart,
        boolean dismissed,
        boolean unavailable
) {}
