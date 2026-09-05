package com.dealflow.api.dto;

import java.util.List;

/** The quotation is embedded, so the approval screen gets the risk breakdown with no second call. */
public record ApprovalDetailResponse(
        long approvalId,
        int riskScore,
        String state,
        RecomputeResponse quotation,
        List<StepResponse> steps,
        List<AuditResponse> audit
) {}
