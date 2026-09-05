package com.dealflow.upsell;

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
 * A6. Six pairings are seeded; a laptop already suggests a dock, a support plan and a setup
 * service. What this proves is that a rule added through the editor is a rule the ranker
 * actually reads -- otherwise the screen would be a form over a table nothing consults.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class AdminUpsellRuleTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    private static final long LAPTOP = 1;
    private static final long MONITOR = 6;

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
                    .defaultRequest(get("/").header("Authorization", tokens.bearer(MANAGER)))
                    .build();
        }
        return mvc;
    }

    /** The seeded six are ids 1..6; anything this class adds goes again. */
    @AfterEach
    void restoreRules() {
        jdbc.update("delete from upsell_rule where id > 6");
    }

    @Test
    @DisplayName("a rule added here is read by the ranker")
    void aNewRuleReachesTheSuggestions() throws Exception {
        // Laptop Pro does not suggest the Ultrawide Monitor out of the box.
        String quote = mvc().perform(post("/api/quotations")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(quote, "$.id")).longValue();
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"quantity\":2}"))
                .andExpect(status().isOk());

        mvc().perform(get("/api/quotations/" + id + "/suggestions")
                        .header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.productId == " + MONITOR + ")]", empty()));

        mvc().perform(post("/api/admin/upsell-rules")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"triggerProductId\":" + LAPTOP + ",\"suggestedProductId\":"
                                + MONITOR + ",\"minMarginPct\":5,\"promoted\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.triggerProductName").value("Laptop Pro"))
                .andExpect(jsonPath("$.suggestedProductName").value("Ultrawide Monitor"));

        mvc().perform(get("/api/quotations/" + id + "/suggestions")
                        .header("Authorization", tokens.bearer(REP)))
                .andExpect(jsonPath("$[?(@.productId == " + MONITOR + ")]", hasSize(1)));
    }

    @Test
    @DisplayName("a product cannot suggest itself, and a pairing cannot be doubled")
    void invalidPairingsAreRefused() throws Exception {
        mvc().perform(post("/api/admin/upsell-rules")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"triggerProductId\":" + LAPTOP + ",\"suggestedProductId\":"
                                + LAPTOP + "}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("suggestedProductId"));

        // Laptop Pro already suggests the Docking Station.
        mvc().perform(post("/api/admin/upsell-rules")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"triggerProductId\":" + LAPTOP + ",\"suggestedProductId\":4}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("already suggests")));

        mvc().perform(post("/api/admin/upsell-rules")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"triggerProductId\":" + LAPTOP + ",\"suggestedProductId\":"
                                + MONITOR + ",\"minMarginPct\":140}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("minMarginPct"));
    }
}
