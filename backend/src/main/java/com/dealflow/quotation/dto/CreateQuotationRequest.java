package com.dealflow.quotation.dto;

import jakarta.validation.constraints.NotNull;

public record CreateQuotationRequest(@NotNull(message = "A customer is required.") Long customerId) {}
