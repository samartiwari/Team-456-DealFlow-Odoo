package com.dealflow.catalog.dto;

import java.math.BigDecimal;

/**
 * @param ceilingPct explicitly nullable: clearing it hands the category back to the tier
 *                   ceiling, which is a real choice rather than an omission
 */
public record CategoryBody(BigDecimal ceilingPct, Boolean stockable, Boolean recurring) {}
