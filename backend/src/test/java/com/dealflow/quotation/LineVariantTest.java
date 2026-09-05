package com.dealflow.quotation;

import com.dealflow.TestTokens;
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

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A2, completed: a line can name which shape of the product it is for.
 *
 * <p>The resolver has had a variant layer since Phase 4 and nothing running ever reached
 * it, because {@code AddLineRequest} took a product and nothing else. These tests are the
 * layer being reached.
 *
 * <p>Seeded variants of Laptop Pro (product 1, base 80,000): {@code 16GB / 512GB} at 80,000
 * and {@code 32GB / 1TB} at 96,000. Ultrawide Monitor (6) has its own two. Acme is GOLD,
 * which has no price list; Corex is BRONZE, whose Standard list prices Laptop Pro at 88,000.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class LineVariantTest {

    private static final long REP = 1;
    private static final long LAPTOP = 1;
    private static final long MONITOR = 6;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private TestTokens tokens;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context)
                    .apply(springSecurity())
                    .defaultRequest(get("/").header("Authorization", tokens.bearer(REP)))
                    .build();
        }
        return mvc;
    }

    private long quote(long customerId) throws Exception {
        String created = mvc().perform(post("/api/quotations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":" + customerId + "}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(created, "$.id")).longValue();
    }

    /** The id of a named variant, read off the product detail screen. */
    private long variantId(long productId, String name) throws Exception {
        String detail = mvc().perform(get("/api/products/" + productId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) ((net.minidev.json.JSONArray) JsonPath.read(detail,
                "$.variants[?(@.name == '" + name + "')].id")).get(0)).longValue();
    }

    @Test
    @DisplayName("a line with no variant prices exactly as it always did")
    void plainProductIsUnchanged() throws Exception {
        long id = quote(1);
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"quantity\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].unitPrice").value(80000.00))
                .andExpect(jsonPath("$.lines[0].variantId").value(nullValue()))
                .andExpect(jsonPath("$.lines[0].variantName").value(nullValue()));
    }

    @Test
    @DisplayName("a variant prices off its own price, and names itself on the line")
    void variantPricesOffItself() throws Exception {
        long bigger = variantId(LAPTOP, "32GB / 1TB");
        long id = quote(1);

        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"variantId\":" + bigger
                                + ",\"quantity\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].unitPrice").value(96000.00))
                .andExpect(jsonPath("$.lines[0].variantName").value("32GB / 1TB"))
                // 2 x 96,000, no discount
                .andExpect(jsonPath("$.subtotal").value(192000.00));
    }

    @Test
    @DisplayName("the margin follows the variant's own cost, not the product's")
    void variantCarriesItsOwnCost() throws Exception {
        long base = variantId(LAPTOP, "16GB / 512GB");
        long bigger = variantId(LAPTOP, "32GB / 1TB");

        long a = quote(1);
        String cheap = mvc().perform(post("/api/quotations/" + a + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"variantId\":" + base
                                + ",\"quantity\":1}"))
                .andReturn().getResponse().getContentAsString();

        long b = quote(1);
        String dear = mvc().perform(post("/api/quotations/" + b + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"variantId\":" + bigger
                                + ",\"quantity\":1}"))
                .andReturn().getResponse().getContentAsString();

        // Both are real margins computed from the variant's own cost, so they differ --
        // which they could not do if the line still priced off the product.
        double cheapMargin = ((Number) JsonPath.read(cheap, "$.marginPct")).doubleValue();
        double dearMargin = ((Number) JsonPath.read(dear, "$.marginPct")).doubleValue();
        org.assertj.core.api.Assertions.assertThat(cheapMargin).isNotEqualTo(dearMargin);
    }

    @Test
    @DisplayName("a tier's published price still outranks a variant")
    void priceListStillWins() throws Exception {
        long bigger = variantId(LAPTOP, "32GB / 1TB");
        long id = quote(3);

        // Corex is BRONZE. Their Standard list names Laptop Pro at 88,000, and a list is an
        // agreement about what this customer pays -- so it wins over the variant's 96,000.
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"variantId\":" + bigger
                                + ",\"quantity\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].unitPrice").value(88000.00))
                // still named, so the screen can show which shape was ordered
                .andExpect(jsonPath("$.lines[0].variantName").value("32GB / 1TB"));
    }

    @Test
    @DisplayName("a variant of a different product is refused")
    void mismatchedVariantIsRefused() throws Exception {
        long monitorVariant = variantId(MONITOR, "38-inch");
        long id = quote(1);

        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"variantId\":" + monitorVariant
                                + ",\"quantity\":1}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("variantId"))
                .andExpect(jsonPath("$.message").value(containsString("not a variant of")));

        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"variantId\":9999,\"quantity\":1}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a line can be switched to another variant, and back to the plain product")
    void variantCanBeChangedAndCleared() throws Exception {
        long base = variantId(LAPTOP, "16GB / 512GB");
        long bigger = variantId(LAPTOP, "32GB / 1TB");
        long id = quote(1);

        String added = mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"variantId\":" + base
                                + ",\"quantity\":1}"))
                .andExpect(jsonPath("$.lines[0].unitPrice").value(80000.00))
                .andReturn().getResponse().getContentAsString();
        long lineId = ((Number) JsonPath.read(added, "$.lines[0].id")).longValue();

        mvc().perform(patch("/api/quotations/" + id + "/lines/" + lineId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"variantId\":" + bigger + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].unitPrice").value(96000.00));

        // Zero means "back to the plain product" -- a JSON null cannot say that, because it
        // reads the same as a field the client simply left out.
        mvc().perform(patch("/api/quotations/" + id + "/lines/" + lineId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"variantId\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines[0].variantId").value(nullValue()))
                .andExpect(jsonPath("$.lines[0].unitPrice").value(80000.00));
    }

    @Test
    @DisplayName("a variant line freezes at confirm like any other")
    void variantPriceIsSnapshotted() throws Exception {
        long bigger = variantId(LAPTOP, "32GB / 1TB");
        long id = quote(1);
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"variantId\":" + bigger
                                + ",\"quantity\":1,\"discountPct\":10}"))
                .andExpect(status().isOk());
        mvc().perform(post("/api/quotations/" + id + "/confirm"))
                .andExpect(status().isOk());

        // The agreed price came from the variant, and it is what is now frozen on the line.
        mvc().perform(get("/api/quotations/" + id))
                .andExpect(jsonPath("$.lines[0].unitPrice").value(96000.00))
                .andExpect(jsonPath("$.lines[0].variantName").value("32GB / 1TB"));
    }
}
