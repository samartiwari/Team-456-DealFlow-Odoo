package com.dealflow.approval.dto;

public record AuditResponse(
        long id,
        String action,
        String fromState,
        String toState,
        String actorName,
        String reason,
        String createdAt
) {}
