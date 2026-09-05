package com.dealflow.allocation.dto;

import java.math.BigDecimal;

/**
 * A warehouse as an administrator sees it.
 *
 * <p>Adds {@code shipmentFee} and {@code archived} to {@link WarehouseResponse}. The three
 * tuning fields are not decoration: they are read by the allocation engine on every split,
 * so raising one warehouse's weight visibly changes which warehouse the next quotation
 * ships from.
 *
 * @param shipmentFee       flat fee per warehouse in a split -- why two warehouses cost
 *                          more than one
 * @param shippingWeight    per-unit multiplier used to pick the cheaper split
 * @param replenishmentDays lead time behind every promised backorder date
 */
public record AdminWarehouseResponse(
        long id,
        String name,
        BigDecimal shipmentFee,
        BigDecimal shippingWeight,
        int replenishmentDays,
        boolean archived
) {}
