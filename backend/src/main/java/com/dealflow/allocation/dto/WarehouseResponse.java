package com.dealflow.allocation.dto;

import java.math.BigDecimal;

public record WarehouseResponse(
        long id,
        String name,
        BigDecimal shippingWeight,
        int replenishmentDays
) {}
