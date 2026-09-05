package com.dealflow.domain.risk;

import java.util.List;

/** @param requiredChain [] | [MANAGER] | [MANAGER, FINANCE] */
public record RiskAssessment(
        int score,
        List<LineRisk> lines,
        List<String> requiredChain
) {
    public boolean needsApproval() {
        return !requiredChain.isEmpty();
    }
}
