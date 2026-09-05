package com.dealflow.allocation.service;

import com.dealflow.allocation.dto.FulfilmentBoardResponse;
import com.dealflow.allocation.dto.FulfilmentOrderResponse;
import com.dealflow.allocation.dto.StockRowResponse;
import com.dealflow.allocation.model.AllocationLine;
import com.dealflow.allocation.model.AllocationPlan;
import com.dealflow.allocation.model.Backorder;
import com.dealflow.allocation.model.StockItem;
import com.dealflow.allocation.repository.AllocationPlanRepository;
import com.dealflow.allocation.repository.StockItemRepository;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.repository.QuotationRepository;
import com.dealflow.quotation.service.PricingService;
import com.dealflow.quotation.service.QuotationMapper;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The fulfilment screen: what is on the shelves, and what is waiting to ship.
 *
 * <p>Read-only and computed on demand. Nothing here is stored -- the board is a view over
 * stock, accepted plans and approved quotations, so it cannot drift from them.
 */
@Service
public class FulfilmentService {

    private final StockItemRepository stock;
    private final AllocationPlanRepository plans;
    private final QuotationRepository quotations;
    private final PricingService pricing;

    public FulfilmentService(StockItemRepository stock, AllocationPlanRepository plans,
                             QuotationRepository quotations, PricingService pricing) {
        this.stock = stock;
        this.plans = plans;
        this.quotations = quotations;
        this.pricing = pricing;
    }

    @Transactional(readOnly = true)
    public FulfilmentBoardResponse board() {
        return new FulfilmentBoardResponse(stockRows(), orders());
    }

    private List<StockRowResponse> stockRows() {
        // What accepted plans still hold, keyed by warehouse and product.
        Map<String, Integer> reserved = new LinkedHashMap<>();
        for (AllocationPlan plan : plans.findAllWithLines()) {
            for (AllocationLine line : plan.getLines()) {
                reserved.merge(key(line.getWarehouse().getId(), line.getProduct().getId()),
                        line.getQuantity(), Integer::sum);
            }
        }

        return stock.findAllWithRefs().stream()
                .map(item -> toRow(item, reserved))
                .sorted(Comparator.comparing(StockRowResponse::warehouseName)
                        .thenComparing(StockRowResponse::productName))
                .toList();
    }

    private static StockRowResponse toRow(StockItem item, Map<String, Integer> reserved) {
        int available = item.getQuantity();
        int taken = reserved.getOrDefault(
                key(item.getWarehouse().getId(), item.getProduct().getId()), 0);
        return new StockRowResponse(
                item.getWarehouse().getId(),
                item.getWarehouse().getName(),
                item.getProduct().getId(),
                item.getProduct().getName(),
                available + taken,
                taken,
                available);
    }

    private List<FulfilmentOrderResponse> orders() {
        Map<Long, AllocationPlan> planByQuotation = new LinkedHashMap<>();
        for (AllocationPlan plan : plans.findAllWithLines()) {
            planByQuotation.put(plan.getQuotation().getId(), plan);
        }

        // Backorders come from their own query: fetching two collections at once multiplies rows.
        Map<Long, Integer> backorderedByQuotation = new LinkedHashMap<>();
        for (AllocationPlan plan : plans.findAllWithBackorders()) {
            int units = plan.getBackorders().stream().mapToInt(Backorder::getQuantity).sum();
            backorderedByQuotation.put(plan.getQuotation().getId(), units);
        }

        return quotations.findAllWithLines().stream()
                .filter(q -> q.getState() == QuotationState.APPROVED)
                .sorted(Comparator.comparing(Quotation::getId))
                .map(q -> toOrder(q, planByQuotation.get(q.getId()),
                        backorderedByQuotation.getOrDefault(q.getId(), 0)))
                .toList();
    }

    private FulfilmentOrderResponse toOrder(Quotation q, AllocationPlan plan, int backordered) {
        Set<String> warehouseNames = new LinkedHashSet<>();
        if (plan != null) {
            for (AllocationLine line : plan.getLines()) {
                warehouseNames.add(line.getWarehouse().getName());
            }
        }

        String status = plan == null ? "AWAITING_SPLIT"
                : backordered > 0 ? "BACKORDER"
                : "SPLIT_ACCEPTED";

        return new FulfilmentOrderResponse(
                q.getId(),
                q.ref(),
                q.getCustomer().getName(),
                status,
                List.copyOf(warehouseNames),
                backordered,
                pricing.price(q).subtotal(),   // no tax in this slice, so grandTotal tracks subtotal
                QuotationMapper.CURRENCY);
    }

    private static String key(long warehouseId, long productId) {
        return warehouseId + ":" + productId;
    }
}
