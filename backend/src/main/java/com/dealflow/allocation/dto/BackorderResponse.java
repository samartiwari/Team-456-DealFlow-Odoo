package com.dealflow.allocation.dto;

public record BackorderResponse(
        long productId,
        String productName,
        int quantity,
        String promisedDate
) {}
