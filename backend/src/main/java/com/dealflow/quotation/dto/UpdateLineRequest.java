package com.dealflow.quotation.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.*;

/** Both fields optional -- send only what changed. */
public record UpdateLineRequest(
        @Min(value = 1, message = "Quantity must be at least 1.") Integer quantity,
        @DecimalMin(value = "0", message = "A discount cannot be negative.")
        @DecimalMax(value = "100", message = "A discount cannot exceed 100%.")
        BigDecimal discountPct
) {}
