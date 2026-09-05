package com.dealflow.analytics.dto;

import java.math.BigDecimal;

/**
 * The figures behind an anomaly, so the card can show its working.
 *
 * @param usedTeamBaseline the rep had too little history of their own
 */
public record AlertMetricsResponse(BigDecimal discountPct, BigDecimal mean, BigDecimal stdDev,
                                   int sampleSize, boolean usedTeamBaseline) {}
