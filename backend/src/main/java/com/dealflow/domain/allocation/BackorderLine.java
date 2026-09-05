package com.dealflow.domain.allocation;

/**
 * What stock could not cover.
 *
 * @param replenishmentDays from the fastest warehouse that carries the product
 */
public record BackorderLine(long productId, int quantity, int replenishmentDays) {}
