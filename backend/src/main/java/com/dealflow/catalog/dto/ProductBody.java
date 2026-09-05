package com.dealflow.catalog.dto;

import java.math.BigDecimal;

/** Every field is optional on a PATCH: absent means unchanged, not null. */
public record ProductBody(String name, Long categoryId, BigDecimal unitPrice,
                          BigDecimal unitCost) {}
