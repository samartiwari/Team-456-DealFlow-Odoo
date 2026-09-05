package com.dealflow.api;

import java.math.BigDecimal;

public record LineResponse(
        long id,
        String productName,
        String category,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal discountPct,
        BigDecimal effectiveDiscountPct,
        BigDecimal allowedDiscountPct,
        BigDecimal overagePts,
        BigDecimal weightPct,
        BigDecimal netTotal
) {}
