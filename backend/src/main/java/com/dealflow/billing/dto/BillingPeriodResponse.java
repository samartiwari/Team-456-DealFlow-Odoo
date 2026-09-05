package com.dealflow.billing.dto;

import java.math.BigDecimal;

/**
 * @param days length of this period. Calendar months vary -- read it, never assume 30
 */
public record BillingPeriodResponse(
        long id,
        String periodStart,
        String periodEnd,
        int days,
        BigDecimal amount,
        String status,
        Long invoiceId
) {}
