package com.dealflow.allocation.dto;

import java.math.BigDecimal;

/** Every field optional on a PATCH: absent means unchanged. */
public record WarehouseBody(String name, BigDecimal shipmentFee, BigDecimal shippingWeight,
                            Integer replenishmentDays) {}
