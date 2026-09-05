package com.dealflow.upsell.dto;

import java.math.BigDecimal;

/**
 * One upsell card. Ranked and filtered server-side -- the client renders the array as it
 * arrives.
 *
 * @param score         0-1. Ordering only; it is not a percentage of anything
 * @param marginDeltaPt percentage points the order's margin moves if this is added at
 *                      quantity 1. Negative when it would dilute the deal
 */
public record SuggestionResponse(
        long productId,
        String productName,
        String category,
        BigDecimal unitPrice,
        BigDecimal score,
        BigDecimal marginDeltaPt,
        boolean promoted
) {}
