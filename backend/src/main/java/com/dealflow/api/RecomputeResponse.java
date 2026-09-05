package com.dealflow.api;

import java.math.BigDecimal;
import java.util.List;

/** The single shape the whole quotation builder renders. */
public record RecomputeResponse(
        long id,
        String ref,
        String customerName,
        String tier,
        String stage,
        String currency,
        BigDecimal orderDiscountPct,
        List<LineResponse> lines,
        BigDecimal subtotal,
        BigDecimal grandTotal,
        BigDecimal marginPct,
        int riskScore,
        List<String> requiredChain
) {}
