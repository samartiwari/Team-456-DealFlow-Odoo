package com.dealflow.policy.dto;

import java.math.BigDecimal;

public record TierResponse(long id, String name, BigDecimal ceilingPct) {}
