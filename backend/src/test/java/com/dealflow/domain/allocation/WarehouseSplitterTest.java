package com.dealflow.domain.allocation;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The seed is arranged so the demo order MUST split: Main holds 3 laptops, East holds 5,
 * and the demo orders 6. These tests lock that behaviour in.
 */
class WarehouseSplitterTest {

    private final WarehouseSplitter splitter = new WarehouseSplitter();

    private static final long LAPTOP = 1L;
    private static final long DOCK = 4L;

    private static final WarehouseInfo MAIN =
            new WarehouseInfo(1, "Main Warehouse", bd(500), bd("1.0"), 5);
    private static final WarehouseInfo EAST =
            new WarehouseInfo(2, "East Depot", bd(500), bd("1.4"), 7);

    private static final List<WarehouseInfo> BOTH = List.of(MAIN, EAST);

    private static BigDecimal bd(String v) { return new BigDecimal(v); }
    private static BigDecimal bd(int v)    { return BigDecimal.valueOf(v); }

    @Test
    @DisplayName("One warehouse can cover everything -- one shipment, no split")
    void singleWarehouseCovers() {
        var plan = splitter.split(
                List.of(new DemandLine(LAPTOP, 2)),
                BOTH,
                List.of(new StockLevel(1, LAPTOP, 3), new StockLevel(2, LAPTOP, 5)));

        assertThat(plan.shipmentCount()).isEqualTo(1);
        assertThat(plan.allocations()).hasSize(1);
        assertThat(plan.backorders()).isEmpty();
        assertThat(plan.isComplete()).isTrue();
        // cheapest single shipment wins: Main at weight 1.0 beats East at 1.4
        assertThat(plan.allocations().get(0).warehouseId()).isEqualTo(1);
        assertThat(plan.cost()).isEqualByComparingTo("502.00");   // 500 + 1.0 x 2
    }

    @Test
    @DisplayName("The demo case: 6 laptops must split 3 from Main and 3 from East")
    void forcedSplit() {
        var plan = splitter.split(
                List.of(new DemandLine(LAPTOP, 6)),
                BOTH,
                List.of(new StockLevel(1, LAPTOP, 3), new StockLevel(2, LAPTOP, 5)));

        assertThat(plan.shipmentCount()).isEqualTo(2);
        assertThat(plan.backorders()).isEmpty();
        // Main is cheaper to ship from (weight 1.0 vs 1.4), so it is drained first --
        // its 3 laptops, then the remaining 3 come from East.
        assertThat(plan.allocations())
                .extracting(Allocation::warehouseId, Allocation::quantity)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple(1L, 3),
                        org.assertj.core.groups.Tuple.tuple(2L, 3));

        assertThat(plan.allocations().stream().mapToInt(Allocation::quantity).sum()).isEqualTo(6);
        // 500 + 1.0x3  +  500 + 1.4x3
        assertThat(plan.cost()).isEqualByComparingTo("1007.20");
    }

    @Test
    @DisplayName("Not enough stock anywhere -- the shortfall becomes a backorder")
    void partialWithBackorder() {
        var plan = splitter.split(
                List.of(new DemandLine(LAPTOP, 10)),
                BOTH,
                List.of(new StockLevel(1, LAPTOP, 3), new StockLevel(2, LAPTOP, 5)));

        assertThat(plan.allocations().stream().mapToInt(Allocation::quantity).sum()).isEqualTo(8);
        assertThat(plan.backorders()).hasSize(1);
        assertThat(plan.backorders().get(0).quantity()).isEqualTo(2);
        // promised from the fastest warehouse that stocks it -- Main at 5 days, not East at 7
        assertThat(plan.backorders().get(0).replenishmentDays()).isEqualTo(5);
        assertThat(plan.isComplete()).isFalse();
    }

    @Test
    @DisplayName("A product nobody stocks is entirely backordered")
    void nothingInStock() {
        var plan = splitter.split(
                List.of(new DemandLine(LAPTOP, 4)),
                BOTH,
                List.of());

        assertThat(plan.allocations()).isEmpty();
        assertThat(plan.shipmentCount()).isZero();
        assertThat(plan.cost()).isEqualByComparingTo("0.00");
        assertThat(plan.backorders()).hasSize(1);
        assertThat(plan.backorders().get(0).quantity()).isEqualTo(4);
    }

    @Test
    @DisplayName("Several products, one warehouse holding all of them, still one shipment")
    void multipleProductsOneWarehouse() {
        var plan = splitter.split(
                List.of(new DemandLine(LAPTOP, 2), new DemandLine(DOCK, 3)),
                BOTH,
                List.of(new StockLevel(1, LAPTOP, 3), new StockLevel(1, DOCK, 10),
                        new StockLevel(2, LAPTOP, 5)));

        assertThat(plan.shipmentCount()).isEqualTo(1);
        assertThat(plan.allocations()).allMatch(a -> a.warehouseId() == 1L);
        assertThat(plan.backorders()).isEmpty();
    }

    @Test
    @DisplayName("An empty order allocates nothing rather than failing")
    void emptyOrder() {
        var plan = splitter.split(List.of(), BOTH, List.of());

        assertThat(plan.allocations()).isEmpty();
        assertThat(plan.backorders()).isEmpty();
        assertThat(plan.shipmentCount()).isZero();
    }
}
