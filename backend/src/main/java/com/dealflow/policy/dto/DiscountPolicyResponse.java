package com.dealflow.policy.dto;

import java.util.List;

/** Everything the configuration screen renders, in one call. */
public record DiscountPolicyResponse(
        List<TierResponse> tiers,
        List<CategoryResponse> categories,
        ApprovalPolicyResponse approval,
        /** Newest first. */
        List<PolicyChangeResponse> history
) {}
