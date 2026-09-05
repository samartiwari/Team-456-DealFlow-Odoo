package com.dealflow.domain.allocation;

/** Ship this many of this product from this warehouse. */
public record Allocation(long productId, long warehouseId, int quantity) {}
