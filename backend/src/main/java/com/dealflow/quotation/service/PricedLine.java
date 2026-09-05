package com.dealflow.quotation.service;

import java.math.BigDecimal;

/**
 * One line after pricing. {@code effectiveDiscountPct} is what the risk engine checks --
 * the line's own discount plus the order-level discount pushed down onto it.
 */
public record PricedLine(
        long lineId,
        String productName,
        String category,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineDiscountPct,
        BigDecimal effectiveDiscountPct,
        BigDecimal netTotal,
        BigDecimal margin
) {}
