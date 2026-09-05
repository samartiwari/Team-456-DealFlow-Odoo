package com.dealflow.allocation.service;

import com.dealflow.allocation.model.AllocationPlan;
import com.dealflow.allocation.model.Backorder;
import com.dealflow.allocation.repository.AllocationPlanRepository;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * When stock arrives for something a plan is still waiting on, that plan becomes
 * consolidatable -- which is what raises the "Consolidate Remaining Backorder" prompt.
 */
@Component
public class BackorderConsolidationListener {

    private final AllocationPlanRepository plans;

    public BackorderConsolidationListener(AllocationPlanRepository plans) {
        this.plans = plans;
    }

    @EventListener
    @Transactional
    public void onStockArrived(StockArrivedEvent event) {
        for (AllocationPlan plan : plans.findAwaitingStockFor(event.productId())) {
            plan.setConsolidatable(true);
            plans.save(plan);
        }
    }
}
