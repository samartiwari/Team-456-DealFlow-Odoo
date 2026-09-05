package com.dealflow.quotation.dto;

import java.math.BigDecimal;

public record LineResponse(
        long id,
        String productName,
        /** Null for the plain product. */
        Long variantId,
        String variantName,
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
