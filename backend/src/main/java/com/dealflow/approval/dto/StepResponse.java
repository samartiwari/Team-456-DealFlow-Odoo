package com.dealflow.approval.dto;

public record StepResponse(
        long id,
        int order,
        String role,
        String state,
        String decidedByName,
        String reason,
        String decidedAt
) {}
