package com.dealflow.upsell.dto;

import java.math.BigDecimal;

public record UpsellRuleBody(Long triggerProductId, Long suggestedProductId,
                             BigDecimal minMarginPct, Boolean promoted) {}
