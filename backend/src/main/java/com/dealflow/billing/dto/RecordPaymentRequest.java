package com.dealflow.billing.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.NotNull;

/**
 * No status field, deliberately. The invoice's status is recomputed from the sum of its
 * payments every time -- a client that could set it would make the whole step meaningless.
 */
public record RecordPaymentRequest(
        @NotNull(message = "An amount is required.") BigDecimal amount,
        String reference
) {}
