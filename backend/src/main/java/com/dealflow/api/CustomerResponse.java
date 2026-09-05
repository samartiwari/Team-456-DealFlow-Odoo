package com.dealflow.api;

import java.math.BigDecimal;

public record CustomerResponse(long id, String name, String tier, BigDecimal tierCeilingPct) {}
