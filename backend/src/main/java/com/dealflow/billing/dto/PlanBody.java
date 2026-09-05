package com.dealflow.billing.dto;

/** Every field optional on a PATCH: absent means unchanged. */
public record PlanBody(String name, Long productId, String interval, String prorationPolicy,
                       String cancellationPolicy, Boolean active) {}
