package com.dealflow.billing.dto;

import java.math.BigDecimal;

public record InvoiceLineResponse(
        long id,
        String description,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal discountPct,
        BigDecimal netTotal,
        /** True for a line added by a mid-period quantity increase. */
        boolean proration
) {}
