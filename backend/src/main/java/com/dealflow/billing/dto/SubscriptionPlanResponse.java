package com.dealflow.billing.dto;

/** A5. The three billing decisions, as the plan editor sees them. */
public record SubscriptionPlanResponse(
        long id,
        String name,
        long productId,
        String productName,
        String interval,
        String prorationPolicy,
        String cancellationPolicy,
        boolean active
) {}
