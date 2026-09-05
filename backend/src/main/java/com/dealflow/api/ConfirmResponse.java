package com.dealflow.api;

/** approvalId is null when the score was 0 and the quote auto-approved. */
public record ConfirmResponse(RecomputeResponse quotation, Long approvalId) {}
