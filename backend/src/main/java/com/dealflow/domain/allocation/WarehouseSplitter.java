package com.dealflow.domain.allocation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Decides which warehouses ship which parts of an order.
 *
 * <p>Three rules, in order:
 * <ol>
 *   <li>If one warehouse holds everything, ship from it -- one shipment always beats two.</li>
 *   <li>If several could, take the cheapest of them.</li>
 *   <li>Otherwise split, drawing from the cheapest warehouse first until stock runs out.</li>
 * </ol>
 *
 * <p>Greedy rather than an optimal solver, deliberately: it runs in milliseconds and can be
 * explained on a stage.
 *
 * <p>Pure Java -- no Spring, no JPA -- so it is unit-testable without a database.
 */
public final class WarehouseSplitter {

    private static final int COST_SCALE = 2;

    public SplitPlan split(List<DemandLine> demand,
                           List<WarehouseInfo> warehouses,
                           List<StockLevel> stock) {

        Map<Long, Integer> remaining = new LinkedHashMap<>();
        for (DemandLine d : demand) {
            remaining.merge(d.productId(), d.quantity(), Integer::sum);
        }
        if (remaining.isEmpty()) {
            return new SplitPlan(List.of(), List.of(), 0, BigDecimal.ZERO);
        }

        // Mutable copy -- allocating draws stock down as we go.
        Map<Long, Map<Long, Integer>> available = new LinkedHashMap<>();
        for (StockLevel s : stock) {
            available.computeIfAbsent(s.warehouseId(), k -> new HashMap<>())
                    .merge(s.productId(), s.quantity(), Integer::sum);
        }

        // 1. If one warehouse can cover everything, use it -- cheapest single shipment wins.
        Optional<WarehouseInfo> single = warehouses.stream()
                .filter(w -> coversEverything(w, remaining, available))
                .min(Comparator.comparing(w -> costFor(w, totalUnits(remaining))));

        if (single.isPresent()) {
            WarehouseInfo w = single.get();
            List<Allocation> allocations = remaining.entrySet().stream()
                    .map(e -> new Allocation(e.getKey(), w.id(), e.getValue()))
                    .toList();
            return new SplitPlan(allocations, List.of(), 1,
                    round(costFor(w, totalUnits(remaining))));
        }

        // 2. Otherwise split, cheapest warehouse first. The shipping weight decides the
        //    order, which is the whole reason it is configurable per warehouse.
        List<Allocation> allocations = new ArrayList<>();
        Map<Long, Integer> unitsShipped = new LinkedHashMap<>();

        while (hasRemaining(remaining)) {
            WarehouseInfo best = warehouses.stream()
                    .filter(w -> canContribute(w, remaining, available))
                    .min(Comparator.comparing(WarehouseInfo::shippingWeight)
                            .thenComparing(WarehouseInfo::shipmentFee)
                            .thenComparing(WarehouseInfo::id))
                    .orElse(null);

            if (best == null) {
                break;      // nothing left anywhere -- the rest becomes a backorder
            }

            Map<Long, Integer> here = available.getOrDefault(best.id(), Map.of());
            for (Map.Entry<Long, Integer> need : remaining.entrySet()) {
                int wanted = need.getValue();
                if (wanted <= 0) {
                    continue;
                }
                int onHand = here.getOrDefault(need.getKey(), 0);
                int take = Math.min(wanted, onHand);
                if (take <= 0) {
                    continue;
                }
                allocations.add(new Allocation(need.getKey(), best.id(), take));
                need.setValue(wanted - take);
                available.get(best.id()).put(need.getKey(), onHand - take);
                unitsShipped.merge(best.id(), take, Integer::sum);
            }
        }

        // 3. Whatever is still unfilled is promised from the fastest warehouse that carries it.
        List<BackorderLine> backorders = new ArrayList<>();
        for (Map.Entry<Long, Integer> left : remaining.entrySet()) {
            if (left.getValue() > 0) {
                backorders.add(new BackorderLine(
                        left.getKey(), left.getValue(), fastestFor(left.getKey(), warehouses, stock)));
            }
        }

        BigDecimal cost = BigDecimal.ZERO;
        for (Map.Entry<Long, Integer> e : unitsShipped.entrySet()) {
            WarehouseInfo w = byId(warehouses, e.getKey());
            cost = cost.add(costFor(w, e.getValue()));
        }

        return new SplitPlan(allocations, backorders, unitsShipped.size(), round(cost));
    }

    // ---------- helpers ----------

    private static boolean coversEverything(WarehouseInfo w,
                                            Map<Long, Integer> remaining,
                                            Map<Long, Map<Long, Integer>> available) {
        Map<Long, Integer> here = available.getOrDefault(w.id(), Map.of());
        return remaining.entrySet().stream()
                .allMatch(e -> here.getOrDefault(e.getKey(), 0) >= e.getValue());
    }

    /** Can this warehouse supply any part of what is still outstanding? */
    private static boolean canContribute(WarehouseInfo w,
                                         Map<Long, Integer> remaining,
                                         Map<Long, Map<Long, Integer>> available) {
        Map<Long, Integer> here = available.getOrDefault(w.id(), Map.of());
        return remaining.entrySet().stream()
                .anyMatch(e -> e.getValue() > 0 && here.getOrDefault(e.getKey(), 0) > 0);
    }

    private static BigDecimal costFor(WarehouseInfo w, int units) {
        return w.shipmentFee().add(w.shippingWeight().multiply(BigDecimal.valueOf(units)));
    }

    private static int totalUnits(Map<Long, Integer> remaining) {
        return remaining.values().stream().mapToInt(Integer::intValue).sum();
    }

    private static boolean hasRemaining(Map<Long, Integer> remaining) {
        return remaining.values().stream().anyMatch(q -> q > 0);
    }

    private static WarehouseInfo byId(List<WarehouseInfo> warehouses, long id) {
        return warehouses.stream().filter(w -> w.id() == id).findFirst().orElseThrow();
    }

    /** The shortest restock among warehouses that stock this product at all. */
    private static int fastestFor(long productId, List<WarehouseInfo> warehouses, List<StockLevel> stock) {
        return stock.stream()
                .filter(s -> s.productId() == productId)
                .map(s -> byId(warehouses, s.warehouseId()).replenishmentDays())
                .min(Integer::compareTo)
                .orElseGet(() -> warehouses.stream()
                        .mapToInt(WarehouseInfo::replenishmentDays)
                        .min()
                        .orElse(0));
    }

    private static BigDecimal round(BigDecimal v) {
        return v.setScale(COST_SCALE, RoundingMode.HALF_UP);
    }
}
