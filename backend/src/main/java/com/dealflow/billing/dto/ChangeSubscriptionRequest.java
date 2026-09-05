package com.dealflow.billing.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** effectiveDate is optional and defaults to the billing clock's today. */
public record ChangeSubscriptionRequest(
        @NotNull(message = "A quantity is required.")
        @Min(value = 0, message = "A quantity cannot be negative.")
        Integer quantity,
        String effectiveDate
) {}
