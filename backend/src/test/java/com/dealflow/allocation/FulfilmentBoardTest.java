package com.dealflow.allocation;

import com.dealflow.TestcontainersConfiguration;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The fulfilment screen's one call: what is on the shelves, and what is waiting to ship.
 *
 * <p>The board is computed, never stored, so the invariant worth pinning is that its three
 * stock figures always reconcile -- a reserved column that drifts from the free column is
 * how a warehouse promises the same units twice.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class FulfilmentBoardTest {

    private static final long REP = 1;
    private static final long OPS = 3;   // Farid Finance stands in for operations here

    /**
     * Docking Station, not Laptop Pro.
     *
     * <p>These tests share one database with the allocation tests, whose whole point is that
     * Main holds exactly 3 laptops so an order for 6 must split. Touching that shelf here --
     * ordering from it or receiving onto it -- would silently rewrite their scenario. The
     * docking station has 30 units across both warehouses and nothing else competes for it.
     */
    private static final long DOCK = 4;

    @Autowired
    private WebApplicationContext context;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context).build();
        }
        return mvc;
    }

    private String board() throws Exception {
        return mvc().perform(get("/api/fulfilment"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private long approvedQuote(long productId, int quantity) throws Exception {
        String created = mvc().perform(post("/api/quotations").param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + id + "/lines").param("userId", String.valueOf(REP))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"productId\":" + productId + ",\"quantity\":" + quantity
                        + ",\"discountPct\":12}"));
        mvc().perform(post("/api/quotations/" + id + "/confirm").param("userId", String.valueOf(REP)))
                .andExpect(jsonPath("$.quotation.stage").value("APPROVED"));
        return id;
    }

    @Test
    @DisplayName("Every stock row reconciles: on hand is what is free plus what is committed")
    void stockFiguresReconcile() throws Exception {
        List<Map<String, Object>> rows = JsonPath.read(board(), "$.stock");

        assertThat(rows).isNotEmpty();
        for (Map<String, Object> row : rows) {
            int onHand = (int) row.get("onHand");
            int reserved = (int) row.get("reserved");
            int available = (int) row.get("available");
            assertThat(onHand)
                    .as("%s at %s", row.get("productName"), row.get("warehouseName"))
                    .isEqualTo(reserved + available);
            assertThat(reserved).isNotNegative();
        }
    }

    @Test
    @DisplayName("Only physical goods appear -- services hold no stock and no shelf")
    void servicesNeverAppearOnTheBoard() throws Exception {
        // Named by what must be absent rather than by what is allowed: listing the
        // permitted products meant every new catalog row broke this test for the wrong
        // reason, when what it actually asserts is that nothing unshippable has a shelf.
        Set<String> stocked = new HashSet<>(JsonPath.read(
                mvc().perform(get("/api/fulfilment")).andReturn().getResponse().getContentAsString(),
                "$.stock[*].productName"));

        Set<String> neverShipped = new HashSet<>(JsonPath.read(
                mvc().perform(get("/api/products")).andReturn().getResponse().getContentAsString(),
                "$[?(@.stockable == false)].name"));

        assertThat(neverShipped).isNotEmpty();
        assertThat(stocked)
                .as("a service or a subscription must never hold stock")
                .doesNotContainAnyElementsOf(neverShipped);
    }

    @Test
    @DisplayName("An approved order waits as AWAITING_SPLIT, then reads as SPLIT_ACCEPTED")
    void orderStatusFollowsThePlan() throws Exception {
        long id = approvedQuote(DOCK, 2);

        mvc().perform(get("/api/fulfilment"))
                .andExpect(jsonPath("$.orders[?(@.quotationId == " + id + ")].status")
                        .value(contains("AWAITING_SPLIT")))
                .andExpect(jsonPath("$.orders[?(@.quotationId == " + id + ")].warehouseNames")
                        .value(contains(empty())));

        mvc().perform(post("/api/quotations/" + id + "/allocation").param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());

        mvc().perform(get("/api/fulfilment"))
                .andExpect(jsonPath("$.orders[?(@.quotationId == " + id + ")].status")
                        .value(contains("SPLIT_ACCEPTED")))
                .andExpect(jsonPath("$.orders[?(@.quotationId == " + id + ")].warehouseNames")
                        .value(contains(hasSize(greaterThan(0)))));
    }

    @Test
    @DisplayName("Accepting a plan moves units from available to reserved, not out of existence")
    void acceptingReservesRatherThanConsumes() throws Exception {
        long id = approvedQuote(DOCK, 2);
        int onHandBefore = totalOnHand(board());

        mvc().perform(post("/api/quotations/" + id + "/allocation").param("userId", String.valueOf(REP))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());

        String after = board();
        assertThat(totalOnHand(after))
                .as("physical stock is unchanged by a reservation")
                .isEqualTo(onHandBefore);
        assertThat(totalReserved(after)).isGreaterThanOrEqualTo(2);
    }

    @Test
    @DisplayName("A rep cannot receive stock; operations can, and gets the board back")
    void receivingIsOperationsWork() throws Exception {
        mvc().perform(post("/api/warehouses/1/stock").param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":4,\"quantity\":5}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(containsString("operations")));

        int before = totalOnHand(board());

        mvc().perform(post("/api/warehouses/1/stock").param("userId", String.valueOf(OPS))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":4,\"quantity\":5}"))
                .andExpect(status().isOk())
                // the board comes back, so the screen needs no second call
                .andExpect(jsonPath("$.stock").isArray())
                .andExpect(jsonPath("$.orders").isArray());

        assertThat(totalOnHand(board())).isEqualTo(before + 5);
    }

    @Test
    @DisplayName("A warehouse that has never carried a product has no shelf to receive it onto")
    void receivingNeedsAnExistingShelf() throws Exception {
        // Setup Service is not stocked anywhere -- V5 removed those rows.
        mvc().perform(post("/api/warehouses/1/stock").param("userId", String.valueOf(OPS))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":2,\"quantity\":5}"))
                .andExpect(status().isNotFound());
    }

    private static int totalOnHand(String board) {
        return ((List<Integer>) JsonPath.<List<Integer>>read(board, "$.stock[*].onHand"))
                .stream().mapToInt(Integer::intValue).sum();
    }

    private static int totalReserved(String board) {
        return ((List<Integer>) JsonPath.<List<Integer>>read(board, "$.stock[*].reserved"))
                .stream().mapToInt(Integer::intValue).sum();
    }
}
