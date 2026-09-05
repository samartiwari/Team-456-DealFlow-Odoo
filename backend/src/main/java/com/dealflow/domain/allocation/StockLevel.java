package com.dealflow.domain.allocation;

public record StockLevel(long warehouseId, long productId, int quantity) {}
