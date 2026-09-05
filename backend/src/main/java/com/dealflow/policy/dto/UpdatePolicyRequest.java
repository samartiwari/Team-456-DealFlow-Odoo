package com.dealflow.policy.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Send only what changed; each list is matched on id.
 *
 * <p>Every field is nullable rather than validated by annotation: the screen submits one
 * section at a time, and "absent" has to stay distinguishable from "set to zero".
 */
public record UpdatePolicyRequest(
        List<TierEdit> tiers,
        List<CategoryEdit> categories,
        ApprovalEdit approval
) {
    public record TierEdit(Long id, BigDecimal ceilingPct) {}

    /** A null ceilingPct is meaningful -- it clears the category ceiling. */
    public record CategoryEdit(Long id, BigDecimal ceilingPct) {}

    public record ApprovalEdit(
            BigDecimal weightedWeight,
            BigDecimal maxWeight,
            Integer managerBandMin,
            Integer financeBandMin
    ) {}
}
