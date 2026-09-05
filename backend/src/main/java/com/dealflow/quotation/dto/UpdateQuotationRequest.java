package com.dealflow.quotation.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.*;

public record UpdateQuotationRequest(
        @NotNull(message = "An order discount is required.")
        @DecimalMin(value = "0", message = "A discount cannot be negative.")
        @DecimalMax(value = "100", message = "A discount cannot exceed 100%.")
        BigDecimal orderDiscountPct
) {}
