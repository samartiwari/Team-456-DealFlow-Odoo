package com.dealflow.api.dto;

/** approvalId is null when the score was 0 and the quote auto-approved. */
public record ConfirmResponse(RecomputeResponse quotation, Long approvalId) {}
