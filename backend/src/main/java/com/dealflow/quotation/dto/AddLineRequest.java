package com.dealflow.quotation.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.*;

public record AddLineRequest(
        @NotNull(message = "A product is required.") Long productId,
        /** Optional. Must be a variant of {@code productId}. */
        Long variantId,
        @Min(value = 1, message = "Quantity must be at least 1.") int quantity,
        @DecimalMin(value = "0", message = "A discount cannot be negative.")
        @DecimalMax(value = "100", message = "A discount cannot exceed 100%.")
        BigDecimal discountPct
) {}
