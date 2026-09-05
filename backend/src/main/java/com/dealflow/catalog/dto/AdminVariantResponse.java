package com.dealflow.catalog.dto;

import java.math.BigDecimal;

/** Carries cost, unlike {@link ProductVariantResponse}, for the same reason. */
public record AdminVariantResponse(long id, String name, BigDecimal unitPrice,
                                   BigDecimal unitCost) {}
