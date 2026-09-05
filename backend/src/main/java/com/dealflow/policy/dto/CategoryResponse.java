package com.dealflow.policy.dto;

import java.math.BigDecimal;

/** ceilingPct is null when the category sets none of its own and defers to the tier. */
public record CategoryResponse(long id, String name, BigDecimal ceilingPct, boolean stockable) {}
