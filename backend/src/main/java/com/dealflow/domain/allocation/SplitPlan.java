package com.dealflow.domain.allocation;

import java.math.BigDecimal;
import java.util.List;

public record SplitPlan(
        List<Allocation> allocations,
        List<BackorderLine> backorders,
        int shipmentCount,
        BigDecimal cost
) {
    public boolean isComplete() {
        return backorders.isEmpty();
    }
}
