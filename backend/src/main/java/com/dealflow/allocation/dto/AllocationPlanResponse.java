package com.dealflow.allocation.dto;

import java.math.BigDecimal;
import java.util.List;

/** status is SUGGESTED until someone accepts it, ACCEPTED afterwards. */
public record AllocationPlanResponse(
        long quotationId,
        String ref,
        String status,
        List<AllocationLineResponse> lines,
        List<BackorderResponse> backorders,
        int shipmentCount,
        BigDecimal estimatedCost,
        String currency,
        boolean consolidatable
) {}
