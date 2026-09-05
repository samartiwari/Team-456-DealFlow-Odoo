package com.dealflow.catalog.dto;

import java.math.BigDecimal;

public record VariantBody(String name, BigDecimal unitPrice, BigDecimal unitCost) {}
