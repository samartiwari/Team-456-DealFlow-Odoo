package com.dealflow.policy;

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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A3, and the second half of Gate 7: the ceilings and bands the risk engine measures against
 * are editable at runtime, and an edit re-routes the very next quotation with no redeploy.
 *
 * <p>Every test restores the seeded policy afterwards. These rows are global, and a test that
 * left the finance band moved would silently change what every other test expects.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class DiscountPolicyFlowTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    private static final long FINANCE = 3;

    private static final String SEEDED = """
            {"tiers":[{"id":1,"ceilingPct":5},{"id":2,"ceilingPct":10},{"id":3,"ceilingPct":15}],
             "categories":[{"id":1,"ceilingPct":15},{"id":2,"ceilingPct":10},{"id":3,"ceilingPct":8}],
             "approval":{"weightedWeight":6,"maxWeight":4,"managerBandMin":1,"financeBandMin":50}}
            """;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private TestTokens tokens;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context)
                    .apply(springSecurity())
                    // Every request now needs an identity. Defaulting to the rep keeps the
                    // reads that never carried one working; MockMvc applies a default header
                    // only when the request has not set it, so an explicit role still wins.
                    .defaultRequest(get("/").header("Authorization", tokens.bearer(1)))
                    .build();
        }
        return mvc;
    }

    @AfterEach
    void restoreSeededPolicy() throws Exception {
        patch(SEEDED, MANAGER).andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions patch(String body, long userId)
            throws Exception {
        return mvc().perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .patch("/api/config/discount-policy")
                .header("Authorization", tokens.bearer(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** A quotation 3 points over Gold's ceiling: score 30, inside the manager band. */
    private long quoteScoring30() throws Exception {
        String created = mvc().perform(post("/api/quotations").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + id + "/lines").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":1,\"quantity\":2,\"discountPct\":18}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.riskScore").value(30));
        return id;
    }

    @Test
    @DisplayName("The policy reads back as one payload the screen can render")
    void readsWholePolicy() throws Exception {
        mvc().perform(get("/api/config/discount-policy"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tiers", hasSize(3)))
                .andExpect(jsonPath("$.categories", hasSize(3)))
                .andExpect(jsonPath("$.categories[1].name").value("Services"))
                .andExpect(jsonPath("$.categories[1].stockable").value(false))
                .andExpect(jsonPath("$.approval.financeBandMin").value(50))
                .andExpect(jsonPath("$.history").isArray());
    }

    @Test
    @DisplayName("Only a manager may change what needs approval")
    void onlyManagerMayEdit() throws Exception {
        patch("{\"approval\":{\"financeBandMin\":30}}", REP)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(containsString("sales manager")));

        patch("{\"approval\":{\"financeBandMin\":30}}", FINANCE)
                .andExpect(status().isForbidden());

        mvc().perform(get("/api/config/discount-policy"))
                .andExpect(jsonPath("$.approval.financeBandMin").value(50));
    }

    @Test
    @DisplayName("A rejected edit writes nothing at all")
    void validationIsAllOrNothing() throws Exception {
        // The tier edit on its own is valid; the band pair is not. Neither may land.
        patch("""
                {"tiers":[{"id":3,"ceilingPct":12}],
                 "approval":{"managerBandMin":60,"financeBandMin":50}}
                """, MANAGER)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("financeBandMin"));

        mvc().perform(get("/api/config/discount-policy"))
                .andExpect(jsonPath("$.tiers[2].ceilingPct").value(15))
                .andExpect(jsonPath("$.approval.managerBandMin").value(1));
    }

    @Test
    @DisplayName("Both weights cannot be zero -- nothing would ever need approval")
    void weightsCannotBothBeZero() throws Exception {
        patch("{\"approval\":{\"weightedWeight\":0,\"maxWeight\":0}}", MANAGER)
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("weightedWeight"));
    }

    @Test
    @DisplayName("GATE 7: lowering the finance band re-routes the same quotation, no redeploy")
    void loweringTheBandReroutes() throws Exception {
        long id = quoteScoring30();

        mvc().perform(get("/api/quotations/" + id))
                .andExpect(jsonPath("$.requiredChain", contains("MANAGER")));

        patch("{\"approval\":{\"financeBandMin\":25}}", MANAGER)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approval.financeBandMin").value(25));

        // Same quotation, same score, different signatories -- and nothing restarted.
        mvc().perform(get("/api/quotations/" + id))
                .andExpect(jsonPath("$.riskScore").value(30))
                .andExpect(jsonPath("$.requiredChain", contains("MANAGER", "FINANCE")));
    }

    @Test
    @DisplayName("An edit is logged with who and what; a no-op edit is not")
    void historyRecordsRealChangesOnly() throws Exception {
        int before = JsonPath.read(
                mvc().perform(get("/api/config/discount-policy"))
                        .andReturn().getResponse().getContentAsString(),
                "$.history.length()");

        // Submitting the value it already holds changes nothing, so it is not history.
        patch("{\"approval\":{\"financeBandMin\":50}}", MANAGER).andExpect(status().isOk());
        mvc().perform(get("/api/config/discount-policy"))
                .andExpect(jsonPath("$.history.length()").value(before));

        patch("{\"tiers\":[{\"id\":3,\"ceilingPct\":12}]}", MANAGER)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.history[0].actorName").value("Meera Manager"))
                .andExpect(jsonPath("$.history[0].summary")
                        .value("Gold tier ceiling 15% to 12%"));
    }
}
