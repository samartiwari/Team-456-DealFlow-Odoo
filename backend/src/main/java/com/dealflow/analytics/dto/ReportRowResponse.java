package com.dealflow.analytics.dto;

import java.math.BigDecimal;

public record ReportRowResponse(
        long quotationId,
        String ref,
        String customerName,
        String repName,
        String stage,
        BigDecimal orderDiscountPct,
        BigDecimal subtotal,
        BigDecimal marginPct,
        int riskScore,
        String createdAt
) {}
