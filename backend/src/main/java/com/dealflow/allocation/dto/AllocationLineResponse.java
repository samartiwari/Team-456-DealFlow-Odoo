package com.dealflow.allocation.dto;

public record AllocationLineResponse(
        long productId,
        String productName,
        long warehouseId,
        String warehouseName,
        int quantity
) {}
