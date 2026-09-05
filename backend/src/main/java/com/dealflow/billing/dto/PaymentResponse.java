package com.dealflow.billing.dto;

import java.math.BigDecimal;

public record PaymentResponse(
        long id,
        BigDecimal amount,
        String reference,
        String recordedByName,
        String recordedAt
) {}
