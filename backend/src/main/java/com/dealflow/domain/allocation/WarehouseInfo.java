package com.dealflow.domain.allocation;

import java.math.BigDecimal;

/**
 * A warehouse as the splitter sees it -- no JPA, no database.
 *
 * @param shipmentFee    fixed cost of despatching anything from here
 * @param shippingWeight per-unit cost from here
 */
public record WarehouseInfo(
        long id,
        String name,
        BigDecimal shipmentFee,
        BigDecimal shippingWeight,
        int replenishmentDays
) {}
