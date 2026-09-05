package com.dealflow.upsell.dto;

import java.math.BigDecimal;

/**
 * One pairing, as the rule editor sees it.
 *
 * <p>Both knobs are read by the ranker: {@code promoted} is 30% of a suggestion's score,
 * and {@code minMarginPct} withholds a suggestion whose margin would fall below it.
 */
public record AdminUpsellRuleResponse(
        long id,
        long triggerProductId,
        String triggerProductName,
        long suggestedProductId,
        String suggestedProductName,
        BigDecimal minMarginPct,
        boolean promoted
) {}
