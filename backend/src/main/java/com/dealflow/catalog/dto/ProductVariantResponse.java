package com.dealflow.catalog.dto;

import java.math.BigDecimal;

public record ProductVariantResponse(long id, String name, BigDecimal unitPrice) {}
