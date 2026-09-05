package com.dealflow.api.dto;

import java.math.BigDecimal;

/** unitCost is deliberately absent -- the picker never needs it. */
public record ProductResponse(
        long id,
        String name,
        String category,
        BigDecimal unitPrice,
        BigDecimal categoryCeilingPct
) {}
