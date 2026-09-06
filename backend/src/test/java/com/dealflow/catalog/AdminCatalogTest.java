package com.dealflow.catalog;

import com.dealflow.TestTokens;
import com.dealflow.TestcontainersConfiguration;

import com.jayway.jsonpath.JsonPath;
import com.jayway.jsonpath.PathNotFoundException;

import java.math.BigDecimal;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A2, the write side.
 *
 * <p>Seeded actors: 1 Rep One (REP), 2 Meera Manager (MANAGER). Seeded customers: 1 Acme
 * (GOLD), 3 Corex (BRONZE). Price list 1 is Standard, the BRONZE list, which prices Laptop
 * Pro at 88,000 against its 80,000 base.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class AdminCatalogTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    /** Section A belongs to Admin: the brief stops a manager at tiers and chains. */
    private static final long ADMIN = 7;
    private static final long LAPTOP = 1;
    private static final long BRONZE_LIST = 1;

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

    /** The catalog is shared by the whole run, so nothing here is left behind. */
    @AfterEach
    void restoreCatalog() {
        jdbc.update("update product set unit_price = 80000, unit_cost = 58000, archived = false"
                + " where id = ?", LAPTOP);
        jdbc.update("update price_list_item set unit_price = 88000"
                + " where price_list_id = ? and product_id = ?", BRONZE_LIST, LAPTOP);
        jdbc.update("delete from price_list where id > 2");
    }

    private String postJson(String path, String body) throws Exception {
        return mvc().perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    /** Quotations belong to the rep who writes them, never to the admin under test. */
    private String asRep(String path, String body) throws Exception {
        return mvc().perform(post(path).header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    // ---------------------------------------------------------------- access

    @Test
    @DisplayName("a manager sets policy but does not own the catalog")
    void managerStopsAtTiersAndChains() throws Exception {
        // The brief gives the Sales Manager "discount tiers and approval chains" and
        // nothing else; products, price lists, warehouses and subscription plans are
        // listed under Admin. Both used to share one permission, which quietly handed
        // a manager the whole of Section A.
        mvc().perform(get("/api/config/discount-policy")
                        .header("Authorization", tokens.bearer(MANAGER)))
                .andExpect(status().isOk());
        mvc().perform(patch("/api/config/discount-policy")
                        .header("Authorization", tokens.bearer(MANAGER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tiers\":[]}"))
                .andExpect(status().isOk());

        for (String path : new String[]{"/api/admin/products", "/api/admin/price-lists",
                "/api/admin/warehouses", "/api/admin/subscription-plans",
                "/api/admin/upsell-rules", "/api/admin/categories"}) {
            mvc().perform(get(path).header("Authorization", tokens.bearer(MANAGER)))
                    .andExpect(status().isForbidden());
        }

        // Finance configures nothing at all, including the policy.
        mvc().perform(patch("/api/config/discount-policy")
                        .header("Authorization", tokens.bearer(3))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tiers\":[]}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("the whole configuration area is closed to a rep")
    void repIsRefusedEverywhere() throws Exception {
        for (String path : new String[]{"/api/admin/products", "/api/admin/price-lists",
                "/api/admin/categories", "/api/admin/warehouses",
                "/api/admin/subscription-plans", "/api/admin/upsell-rules"}) {
            mvc().perform(get(path).header("Authorization", tokens.bearer(REP)))
                    .andExpect(status().isForbidden());
        }
        mvc().perform(post("/api/admin/products").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Sneaky\",\"categoryId\":1,\"unitPrice\":1,\"unitCost\":1}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("cost is on the admin shape and on no rep-facing one")
    void costDoesNotLeakToReps() throws Exception {
        String admin = mvc().perform(get("/api/admin/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].unitCost").exists())
                .andExpect(jsonPath("$[0].marginPct").exists())
                .andReturn().getResponse().getContentAsString();
        assertThat(admin).contains("unitCost");

        // The picker and the detail screen a rep sees carry price and never cost.
        String picker = mvc().perform(get("/api/products").header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThatThrownBy(() -> JsonPath.read(picker, "$[0].unitCost"))
                .isInstanceOf(PathNotFoundException.class);

        String detail = mvc().perform(get("/api/products/1").header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThatThrownBy(() -> JsonPath.read(detail, "$.unitCost"))
                .isInstanceOf(PathNotFoundException.class);
    }

    // ---------------------------------------------------------------- products

    @Test
    @DisplayName("a created product gets a server id and reaches the picker")
    void createReachesThePicker() throws Exception {
        String created = postJson("/api/admin/products",
                "{\"name\":\"Test Widget\",\"categoryId\":1,\"unitPrice\":1000,\"unitCost\":600}");
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        // Ids were hand-assigned in the seed files and stop at 12; the sequence starts at
        // 100 so nothing already published moves.
        assertThat(id).isGreaterThanOrEqualTo(100);
        assertThat(((Number) JsonPath.read(created, "$.marginPct")).doubleValue()).isEqualTo(40.0);

        mvc().perform(get("/api/products").header("Authorization", tokens.bearer(REP)))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].name", contains("Test Widget")));

        // and leaves again, without being deleted
        mvc().perform(delete("/api/admin/products/" + id)).andExpect(status().isNoContent());
        mvc().perform(get("/api/products").header("Authorization", tokens.bearer(REP)))
                .andExpect(jsonPath("$[?(@.id == " + id + ")]", empty()));
        mvc().perform(get("/api/products/" + id).header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an archived product cannot be put on a new line")
    void archivedProductIsRefusedOnALine() throws Exception {
        String created = postJson("/api/admin/products",
                "{\"name\":\"Discontinued\",\"categoryId\":1,\"unitPrice\":500,\"unitCost\":100}");
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();
        mvc().perform(delete("/api/admin/products/" + id)).andExpect(status().isNoContent());

        String quote = asRep("/api/quotations", "{\"customerId\":1}");
        long quotationId = ((Number) JsonPath.read(quote, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + quotationId + "/lines")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + id + ",\"quantity\":1}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("archived")));

        mvc().perform(post("/api/admin/products/" + id + "/restore"))
                .andExpect(jsonPath("$.archived").value(false));
    }

    @Test
    @DisplayName("a product cannot be saved below cost")
    void costAbovePriceIsRefused() throws Exception {
        mvc().perform(patch("/api/admin/products/" + LAPTOP)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"unitCost\":90000}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("unitCost"));

        // but raising both together is one legal edit, not two illegal halves
        mvc().perform(patch("/api/admin/products/" + LAPTOP)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"unitPrice\":120000,\"unitCost\":90000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unitPrice").value(120000.00));
    }

    @Test
    @DisplayName("impact counts what a price change would move, and what it would not")
    void impactSeparatesDraftsFromAgreedDeals() throws Exception {
        String before = mvc().perform(get("/api/admin/products/" + LAPTOP + "/impact"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long draftsBefore = ((Number) JsonPath.read(before, "$.openDrafts")).longValue();
        long frozenBefore = ((Number) JsonPath.read(before, "$.frozenQuotations")).longValue();

        // The 40 seeded confirmed orders are already settled, so there is history to count.
        assertThat(frozenBefore).isPositive();

        String quote = asRep("/api/quotations", "{\"customerId\":1}");
        long id = ((Number) JsonPath.read(quote, "$.id")).longValue();
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"quantity\":1,\"discountPct\":5}"))
                .andExpect(status().isOk());

        mvc().perform(get("/api/admin/products/" + LAPTOP + "/impact"))
                .andExpect(jsonPath("$.openDrafts").value(draftsBefore + 1))
                .andExpect(jsonPath("$.frozenQuotations").value(frozenBefore));

        // Confirming moves it across: one fewer draft, one more settled.
        mvc().perform(post("/api/quotations/" + id + "/confirm")
                        .header("Authorization", tokens.bearer(REP))).andExpect(status().isOk());
        mvc().perform(get("/api/admin/products/" + LAPTOP + "/impact"))
                .andExpect(jsonPath("$.openDrafts").value(draftsBefore))
                .andExpect(jsonPath("$.frozenQuotations").value(frozenBefore + 1));
    }

    // ---------------------------------------------------------------- price lists

    @Test
    @DisplayName("editing the Bronze list changes what a Bronze customer is quoted")
    void priceListEditReachesTheQuote() throws Exception {
        mvc().perform(put("/api/admin/price-lists/" + BRONZE_LIST + "/items/" + LAPTOP)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"unitPrice\":95000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.productId == 1)].unitPrice", contains(95000.00)))
                // basePrice is carried alongside so the screen can show the delta
                .andExpect(jsonPath("$.items[?(@.productId == 1)].basePrice", contains(80000.00)));

        // Corex is BRONZE, so the list is what they pay -- not the 80,000 base.
        String quote = asRep("/api/quotations", "{\"customerId\":3}");
        long id = ((Number) JsonPath.read(quote, "$.id")).longValue();
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"quantity\":1}"))
                .andExpect(jsonPath("$.lines[0].unitPrice").value(95000.00));

        // Acme is GOLD, which has no list, so nothing about them moved.
        String gold = asRep("/api/quotations", "{\"customerId\":1}");
        long goldId = ((Number) JsonPath.read(gold, "$.id")).longValue();
        mvc().perform(post("/api/quotations/" + goldId + "/lines")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"quantity\":1}"))
                .andExpect(jsonPath("$.lines[0].unitPrice").value(80000.00));
    }

    @Test
    @DisplayName("a tier can only have one active price list")
    void secondActiveListForATierIsRefused() throws Exception {
        mvc().perform(post("/api/admin/price-lists")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Second Bronze\",\"tierId\":1,\"active\":true}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("Standard")));

        // An inactive one is fine -- that is how a replacement is staged before the switch.
        mvc().perform(post("/api/admin/price-lists")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Bronze 2027\",\"tierId\":1,\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.tierName").value("Bronze"));
    }

    @Test
    @DisplayName("removing an item drops that product back to its base price")
    void removingAnItemFallsBackToBase() throws Exception {
        mvc().perform(delete("/api/admin/price-lists/" + BRONZE_LIST + "/items/" + LAPTOP))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.productId == 1)]", empty()));

        String quote = asRep("/api/quotations", "{\"customerId\":3}");
        long id = ((Number) JsonPath.read(quote, "$.id")).longValue();
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"quantity\":1}"))
                .andExpect(jsonPath("$.lines[0].unitPrice").value(80000.00));

        // put it back for the next test in the run
        mvc().perform(put("/api/admin/price-lists/" + BRONZE_LIST + "/items/" + LAPTOP)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"unitPrice\":88000}"))
                .andExpect(status().isOk());
    }

    // ---------------------------------------------------------------- variants

    @Test
    @DisplayName("variants are added and removed through the parent product")
    void variantsRoundTrip() throws Exception {
        String added = postJson("/api/admin/products/" + LAPTOP + "/variants",
                "{\"name\":\"64GB / 2TB\",\"unitPrice\":140000,\"unitCost\":95000}");
        long variantId = ((Number) ((net.minidev.json.JSONArray) JsonPath.read(added,
                "$.variants[?(@.name == '64GB / 2TB')].id")).get(0)).longValue();

        // The write answers with the refreshed parent, so one call repaints the screen.
        assertThat(JsonPath.read(added, "$.name").toString()).isEqualTo("Laptop Pro");

        mvc().perform(patch("/api/admin/variants/" + variantId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"unitPrice\":145000}"))
                .andExpect(jsonPath("$.variants[?(@.id == " + variantId + ")].unitPrice",
                        contains(145000.00)));

        mvc().perform(delete("/api/admin/variants/" + variantId))
                .andExpect(jsonPath("$.variants[?(@.id == " + variantId + ")]", empty()));
    }

    // ---------------------------------------------------------------- categories

    @Test
    @DisplayName("a category ceiling can be tuned, and the risk engine picks it up")
    void categoryCeilingIsLive() throws Exception {
        BigDecimal original = jdbc.queryForObject(
                "select ceiling_pct from product_category where id = 1", BigDecimal.class);
        try {
            // Hardware's ceiling drops to 5, so a discount that was clean is now over it.
            mvc().perform(patch("/api/admin/categories/1")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"ceilingPct\":5}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.ceilingPct").value(5.00));

            String quote = asRep("/api/quotations", "{\"customerId\":1}");
            long id = ((Number) JsonPath.read(quote, "$.id")).longValue();
            mvc().perform(post("/api/quotations/" + id + "/lines")
                            .header("Authorization", tokens.bearer(REP))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"productId\":" + LAPTOP + ",\"quantity\":1,\"discountPct\":12}"))
                    // 12% was inside the old 15 ceiling and scored 0; against 5 it does not
                    .andExpect(jsonPath("$.riskScore", greaterThan(0)));
        } finally {
            jdbc.update("update product_category set ceiling_pct = ? where id = 1", original);
        }
    }
}
