package com.dealflow.quotation.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.*;

public record UpdateQuotationRequest(
        @DecimalMin(value = "0", message = "A discount cannot be negative.")
        @DecimalMax(value = "100", message = "A discount cannot exceed 100%.")
        BigDecimal orderDiscountPct,

        /**
         * The customer is chosen inside the builder, so it can change after the quotation
         * exists. It sets the tier ceiling every line is measured against, so switching it
         * re-prices and re-scores the whole quotation.
         */
        Long customerId
) {
    public boolean isEmpty() {
        return orderDiscountPct == null && customerId == null;
    }
}
