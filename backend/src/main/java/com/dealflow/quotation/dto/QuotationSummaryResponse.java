package com.dealflow.quotation.dto;

import java.math.BigDecimal;

public record QuotationSummaryResponse(
        long id,
        String ref,
        String customerName,
        String stage,
        BigDecimal grandTotal,
        String currency
) {}
