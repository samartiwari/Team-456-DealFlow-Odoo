package com.dealflow.allocation;

import com.dealflow.TestTokens;
import com.dealflow.TestcontainersConfiguration;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A4. Seeded warehouses: 1 Main (weight 1.0, 5 days), 2 East Depot (weight 1.4, 7 days).
 * Main holds stock, which is what makes it un-closable.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class AdminWarehouseTest {

    private static final long MANAGER = 2;
    /** Section A belongs to Admin: the brief stops a manager at tiers and chains. */
    private static final long ADMIN = 7;
    private static final long MAIN = 1;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private TestTokens tokens;

    @Autowired
    private JdbcTemplate jdbc;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context)
                    .apply(springSecurity())
                    .defaultRequest(get("/").header("Authorization", tokens.bearer(ADMIN)))
                    .build();
        }
        return mvc;
    }

    @AfterEach
    void restoreWarehouses() {
        jdbc.update("update warehouse set shipping_weight = 1.0, replenishment_days = 5,"
                + " shipment_fee = 500, archived = false where id = 1");
        jdbc.update("delete from warehouse where id >= 100");
    }

    @Test
    @DisplayName("the tuning fields are editable and come back on the read")
    void tuningFieldsRoundTrip() throws Exception {
        mvc().perform(patch("/api/admin/warehouses/" + MAIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"shippingWeight\":2.5,\"replenishmentDays\":9}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shippingWeight").value(2.50))
                .andExpect(jsonPath("$.replenishmentDays").value(9));

        // The allocator reads the same row, so the rep-facing list moves with it.
        mvc().perform(get("/api/warehouses"))
                .andExpect(jsonPath("$[?(@.id == 1)].replenishmentDays", contains(9)));
    }

    @Test
    @DisplayName("a weight of zero is refused -- it would make a warehouse free to ship from")
    void zeroWeightIsRefused() throws Exception {
        mvc().perform(patch("/api/admin/warehouses/" + MAIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"shippingWeight\":0}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("shippingWeight"));
    }

    @Test
    @DisplayName("a warehouse holding stock cannot be closed")
    void closingAStockedWarehouseIsRefused() throws Exception {
        mvc().perform(delete("/api/admin/warehouses/" + MAIN))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("still holds stock")));
    }

    @Test
    @DisplayName("an empty warehouse closes, and leaves the allocator's list")
    void emptyWarehouseCloses() throws Exception {
        String created = mvc().perform(post("/api/admin/warehouses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"North Hub\",\"shipmentFee\":700,"
                                + "\"shippingWeight\":1.2,\"replenishmentDays\":4}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("North Hub"))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(get("/api/warehouses"))
                .andExpect(jsonPath("$[?(@.id == " + id + ")]", hasSize(1)));

        mvc().perform(delete("/api/admin/warehouses/" + id)).andExpect(status().isNoContent());

        // Gone from the list the allocator picks from, still present for the admin.
        mvc().perform(get("/api/warehouses"))
                .andExpect(jsonPath("$[?(@.id == " + id + ")]", empty()));
        mvc().perform(get("/api/admin/warehouses"))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].archived", contains(true)));
    }
}
