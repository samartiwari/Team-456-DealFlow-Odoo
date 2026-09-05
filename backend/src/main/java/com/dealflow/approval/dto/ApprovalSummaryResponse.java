package com.dealflow.approval.dto;

import java.math.BigDecimal;
import java.util.List;

public record ApprovalSummaryResponse(
        long approvalId,
        long quotationId,
        String ref,
        String customerName,
        int riskScore,
        List<String> requiredChain,
        String awaitingRole,
        BigDecimal grandTotal,
        String currency,
        String createdAt
) {}
