package com.dealflow.allocation.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.dealflow.allocation.dto.*;
import com.dealflow.allocation.model.*;
import com.dealflow.allocation.repository.*;
import com.dealflow.catalog.model.Product;
import com.dealflow.common.audit.AuditService;
import com.dealflow.common.error.ApiException;
import com.dealflow.domain.allocation.*;
import com.dealflow.identity.model.AppUser;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationLine;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.service.QuotationMapper;
import com.dealflow.quotation.service.QuotationService;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AllocationService {

    private final WarehouseRepository warehouses;
    private final StockItemRepository stock;
    private final AllocationPlanRepository plans;
    private final QuotationService quotationService;
    private final AuditService audit;
    private final ApplicationEventPublisher events;
    private final WarehouseSplitter splitter = new WarehouseSplitter();

    public AllocationService(WarehouseRepository warehouses, StockItemRepository stock,
                             AllocationPlanRepository plans, QuotationService quotationService,
                             AuditService audit, ApplicationEventPublisher events) {
        this.events = events;
        this.warehouses = warehouses;
        this.stock = stock;
        this.plans = plans;
        this.quotationService = quotationService;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<WarehouseResponse> listWarehouses() {
        return warehouses.findAll().stream()
                .map(w -> new WarehouseResponse(
                        w.getId(), w.getName(), w.getShippingWeight(), w.getReplenishmentDays()))
                .toList();
    }

    /** Computes a split and stores nothing. Safe to call as often as the screen likes. */
    @Transactional(readOnly = true)
    public AllocationPlanResponse suggest(long quotationId) {
        Quotation quotation = requireApproved(quotationId);

        return plans.findByQuotationId(quotationId)
                .map(this::toResponse)
                .orElseGet(() -> {
                    SplitPlan plan = computeSplit(quotation);
                    return toResponse(quotation, plan, "SUGGESTED", false);
                });
    }

    /** Commits a plan -- either the suggestion as-is, or a human's override of it. */
    @Transactional
    public AllocationPlanResponse accept(long quotationId, AcceptAllocationRequest request, long actorId) {
        Quotation quotation = requireApproved(quotationId);
        AppUser actor = quotationService.actor(actorId);

        if (plans.existsByQuotationId(quotationId)) {
            throw ApiException.conflict("This allocation has already been accepted.");
        }

        Map<Long, Product> productsById = productsOf(quotation);
        Map<Long, Warehouse> warehousesById = new LinkedHashMap<>();
        warehouses.findAll().forEach(w -> warehousesById.put(w.getId(), w));

        SplitPlan computed = request.isOverride()
                ? fromOverride(quotation, request.lines(), warehousesById)
                : computeSplit(quotation);

        // Draw the stock down under a row lock before recording anything. Two reps racing for
        // the last three laptops queue here, and the loser is told the truth rather than promised
        // stock that is already gone.
        reserve(computed.allocations(), warehousesById);

        AllocationPlan saved = new AllocationPlan(quotation);
        saved.setShipmentCount(computed.shipmentCount());
        saved.setEstimatedCost(computed.cost());
        saved.setOverridden(request.isOverride());

        for (Allocation a : computed.allocations()) {
            saved.addLine(new AllocationLine(
                    productsById.get(a.productId()), warehousesById.get(a.warehouseId()), a.quantity()));
        }
        for (BackorderLine b : computed.backorders()) {
            saved.addBackorder(new Backorder(
                    productsById.get(b.productId()), b.quantity(),
                    LocalDate.now().plusDays(b.replenishmentDays())));
        }
        plans.save(saved);

        audit.record(quotation, actor,
                request.isOverride() ? "ALLOCATION_OVERRIDDEN" : "ALLOCATION_ACCEPTED",
                computed.shipmentCount() + " shipment(s), cost " + computed.cost()
                        + (computed.isComplete() ? "" : ", " + computed.backorders().size() + " backordered"));

        return toResponse(saved);
    }

    /** Takes the allocated units out of stock, locking each row first. */
    private void reserve(List<Allocation> allocations, Map<Long, Warehouse> warehousesById) {
        for (Allocation a : allocations) {
            StockItem item = stock.findForUpdate(a.warehouseId(), a.productId())
                    .orElseThrow(() -> ApiException.conflict(
                            warehousesById.get(a.warehouseId()).getName()
                                    + " does not stock that product."));

            if (item.getQuantity() < a.quantity()) {
                throw ApiException.conflict(item.getWarehouse().getName()
                        + " has only " + item.getQuantity() + " of that product left.");
            }
            item.setQuantity(item.getQuantity() - a.quantity());
            stock.save(item);
        }
    }

    /**
     * Records a stock receipt. Anything still waiting on this product becomes consolidatable,
     * which is what raises the prompt on the fulfilment screen.
     */
    @Transactional
    public void receiveStock(long warehouseId, long productId, int quantity) {
        if (quantity <= 0) {
            throw ApiException.invalid("A receipt must be for at least one unit.", "quantity");
        }
        StockItem item = stock.findForUpdate(warehouseId, productId)
                .orElseThrow(() -> ApiException.notFound("Stock for that product at warehouse", warehouseId));

        item.setQuantity(item.getQuantity() + quantity);
        stock.save(item);

        events.publishEvent(new StockArrivedEvent(warehouseId, productId, quantity));
    }

    // ---------- the split ----------

    private SplitPlan computeSplit(Quotation quotation) {
        return splitter.split(demandOf(quotation), warehouseInfo(), stockLevels());
    }

    /** Lines are grouped by product -- the same product can appear on a quote twice. */
    private static List<DemandLine> demandOf(Quotation quotation) {
        Map<Long, Integer> byProduct = new LinkedHashMap<>();
        for (QuotationLine line : quotation.getLines()) {
            byProduct.merge(line.getProduct().getId(), line.getQuantity(), Integer::sum);
        }
        return byProduct.entrySet().stream()
                .map(e -> new DemandLine(e.getKey(), e.getValue()))
                .toList();
    }

    private List<WarehouseInfo> warehouseInfo() {
        return warehouses.findAll().stream()
                .map(w -> new WarehouseInfo(w.getId(), w.getName(),
                        w.getShipmentFee(), w.getShippingWeight(), w.getReplenishmentDays()))
                .toList();
    }

    private List<StockLevel> stockLevels() {
        return stock.findAllWithRefs().stream()
                .map(s -> new StockLevel(
                        s.getWarehouse().getId(), s.getProduct().getId(), s.getQuantity()))
                .toList();
    }

    /**
     * A manual override still has to add up and still has to fit in the warehouses --
     * it is re-validated against live stock rather than trusted.
     */
    private SplitPlan fromOverride(Quotation quotation, List<OverrideLine> lines,
                                   Map<Long, Warehouse> warehousesById) {

        Map<Long, Integer> ordered = new LinkedHashMap<>();
        for (QuotationLine l : quotation.getLines()) {
            ordered.merge(l.getProduct().getId(), l.getQuantity(), Integer::sum);
        }

        Map<Long, Integer> onHand = new LinkedHashMap<>();
        for (StockLevel s : stockLevels()) {
            onHand.put(key(s.warehouseId(), s.productId()), s.quantity());
        }

        Map<Long, Integer> allocatedPerProduct = new LinkedHashMap<>();
        Map<Long, Integer> unitsPerWarehouse = new LinkedHashMap<>();
        List<Allocation> allocations = new ArrayList<>();

        for (OverrideLine l : lines) {
            if (l.productId() == null || l.warehouseId() == null || l.quantity() == null || l.quantity() <= 0) {
                throw ApiException.invalid("Each override line needs a product, a warehouse and a quantity above zero.", "lines");
            }
            Warehouse w = warehousesById.get(l.warehouseId());
            if (w == null) {
                throw ApiException.notFound("Warehouse", l.warehouseId());
            }
            if (!ordered.containsKey(l.productId())) {
                throw ApiException.invalid("Product " + l.productId() + " is not on this quotation.", "lines");
            }

            int available = onHand.getOrDefault(key(l.warehouseId(), l.productId()), 0);
            int alreadyTaken = allocations.stream()
                    .filter(a -> a.warehouseId() == l.warehouseId() && a.productId() == l.productId())
                    .mapToInt(Allocation::quantity).sum();
            if (alreadyTaken + l.quantity() > available) {
                throw ApiException.conflict(
                        w.getName() + " has only " + available + " of that product.");
            }

            allocations.add(new Allocation(l.productId(), l.warehouseId(), l.quantity()));
            allocatedPerProduct.merge(l.productId(), l.quantity(), Integer::sum);
            unitsPerWarehouse.merge(l.warehouseId(), l.quantity(), Integer::sum);
        }

        for (Map.Entry<Long, Integer> want : ordered.entrySet()) {
            int got = allocatedPerProduct.getOrDefault(want.getKey(), 0);
            if (got != want.getValue()) {
                throw ApiException.invalid(
                        "Allocated quantity must equal the ordered quantity: expected "
                                + want.getValue() + ", got " + got + ".", "lines");
            }
        }

        BigDecimal cost = BigDecimal.ZERO;
        for (Map.Entry<Long, Integer> e : unitsPerWarehouse.entrySet()) {
            Warehouse w = warehousesById.get(e.getKey());
            cost = cost.add(w.getShipmentFee()
                    .add(w.getShippingWeight().multiply(BigDecimal.valueOf(e.getValue()))));
        }

        // An override must cover the whole order, so it never leaves a backorder.
        return new SplitPlan(allocations, List.of(), unitsPerWarehouse.size(), cost);
    }

    private static long key(long warehouseId, long productId) {
        return warehouseId * 1_000_000L + productId;
    }

    // ---------- mapping ----------

    private Quotation requireApproved(long quotationId) {
        Quotation quotation = quotationService.load(quotationId);
        if (quotation.getState() != QuotationState.APPROVED) {
            throw ApiException.conflict("Only an approved quotation can be allocated.");
        }
        return quotation;
    }

    private Map<Long, Product> productsOf(Quotation quotation) {
        Map<Long, Product> map = new LinkedHashMap<>();
        quotation.getLines().forEach(l -> map.putIfAbsent(l.getProduct().getId(), l.getProduct()));
        return map;
    }

    private AllocationPlanResponse toResponse(Quotation quotation, SplitPlan plan,
                                              String status, boolean consolidatable) {
        Map<Long, Product> products = productsOf(quotation);
        Map<Long, Warehouse> byId = new LinkedHashMap<>();
        warehouses.findAll().forEach(w -> byId.put(w.getId(), w));

        List<AllocationLineResponse> lines = plan.allocations().stream()
                .map(a -> new AllocationLineResponse(
                        a.productId(), products.get(a.productId()).getName(),
                        a.warehouseId(), byId.get(a.warehouseId()).getName(), a.quantity()))
                .toList();

        List<BackorderResponse> backorders = plan.backorders().stream()
                .map(b -> new BackorderResponse(
                        b.productId(), products.get(b.productId()).getName(), b.quantity(),
                        LocalDate.now().plusDays(b.replenishmentDays()).toString()))
                .toList();

        return new AllocationPlanResponse(
                quotation.getId(), quotation.ref(), status, lines, backorders,
                plan.shipmentCount(), plan.cost(), QuotationMapper.CURRENCY, consolidatable);
    }

    private AllocationPlanResponse toResponse(AllocationPlan saved) {
        List<AllocationLineResponse> lines = saved.getLines().stream()
                .map(l -> new AllocationLineResponse(
                        l.getProduct().getId(), l.getProduct().getName(),
                        l.getWarehouse().getId(), l.getWarehouse().getName(), l.getQuantity()))
                .toList();

        List<BackorderResponse> backorders = saved.getBackorders().stream()
                .map(b -> new BackorderResponse(
                        b.getProduct().getId(), b.getProduct().getName(),
                        b.getQuantity(), b.getPromisedDate().toString()))
                .toList();

        return new AllocationPlanResponse(
                saved.getQuotation().getId(), saved.getQuotation().ref(), "ACCEPTED",
                lines, backorders, saved.getShipmentCount(), saved.getEstimatedCost(),
                QuotationMapper.CURRENCY, saved.isConsolidatable());
    }
}
