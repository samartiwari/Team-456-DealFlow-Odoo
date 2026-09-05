package com.dealflow.domain.upsell;

import java.math.BigDecimal;

/**
 * One card, ranked.
 *
 * @param score         0-1. Ordering only -- it is not a percentage of anything
 * @param marginDeltaPt percentage points the order's margin moves if this is added at
 *                      quantity 1. Negative when the candidate would dilute the deal,
 *                      which is exactly what a rep needs to see before pushing it
 */
public record RankedSuggestion(
        long productId,
        BigDecimal score,
        BigDecimal marginDeltaPt,
        boolean promoted
) {}
