package com.dealflow.crm.dto;

import java.math.BigDecimal;

public record CustomerResponse(long id, String name, String tier, BigDecimal tierCeilingPct) {}
