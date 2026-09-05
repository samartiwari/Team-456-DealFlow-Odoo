package com.dealflow.catalog.dto;

import java.math.BigDecimal;

/**
 * @param ceilingPct null means "fall back to the customer's tier ceiling"
 */
public record CategoryResponse(long id, String name, BigDecimal ceilingPct,
                               boolean stockable, boolean recurring) {}
