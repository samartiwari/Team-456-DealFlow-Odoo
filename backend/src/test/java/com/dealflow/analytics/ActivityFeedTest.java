package com.dealflow.analytics;

import com.dealflow.TestTokens;
import com.dealflow.TestcontainersConfiguration;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The dashboard's Recent Activity feed (Phase 13).
 *
 * <p>Nothing here writes an audit row on purpose. Every assertion works by doing ordinary
 * things to a quotation and then reading them back off the feed -- if the feed only
 * reported what a test had planted, it would not be evidence that the real flows are
 * recorded.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class ActivityFeedTest {

    private static final long REP = 1;

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

    private long newQuotation() throws Exception {
        String body = mvc().perform(post("/api/quotations")
                        .contentType("application/json")
                        .content("{\"customerId\":1}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    private void addLine(long id, long productId, int quantity) throws Exception {
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType("application/json")
                        .content("{\"productId\":" + productId + ",\"quantity\":" + quantity
                                + ",\"discountPct\":0}"))
                .andExpect(status().isOk());
    }

    private String feed(String query) throws Exception {
        return mvc().perform(get("/api/activity" + query))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("Creating a quotation puts it at the top of the feed, named and attributed")
    void newestFirst() throws Exception {
        long id = newQuotation();

        String json = feed("");

        assertThat((int) (Integer) JsonPath.read(json, "$[0].quotationId")).isEqualTo((int) id);
        assertThat((String) JsonPath.read(json, "$[0].action")).isEqualTo("QUOTATION_CREATED");
        assertThat((String) JsonPath.read(json, "$[0].ref"))
                .isEqualTo(String.format("Q-%04d", id));
        assertThat((String) JsonPath.read(json, "$[0].actorName")).isEqualTo("Rep One");
        assertThat((String) JsonPath.read(json, "$[0].toStage")).isEqualTo("DRAFT");
    }

    @Test
    @DisplayName("The feed spans quotations rather than reporting only the newest one")
    void spansQuotations() throws Exception {
        long first = newQuotation();
        long second = newQuotation();

        List<Integer> ids = JsonPath.read(feed(""), "$[*].quotationId");

        assertThat(ids).contains((int) first, (int) second);
        // Newest first, so the later quotation is reported ahead of the earlier one.
        assertThat(ids.indexOf((int) second)).isLessThan(ids.indexOf((int) first));
    }

    @Test
    @DisplayName("Ordinary edits are reported without the feed being told about them")
    void reportsWhatTheFlowsRecord() throws Exception {
        long id = newQuotation();
        addLine(id, 1, 2);

        List<String> actions = JsonPath.read(
                feed("?limit=100"), "$[?(@.quotationId == " + id + ")].action");

        assertThat(actions).containsExactly("LINE_ADDED", "QUOTATION_CREATED");
    }

    @Test
    @DisplayName("A confirmation carries the states it moved between")
    void stateChangesCarryBothEnds() throws Exception {
        long id = newQuotation();
        addLine(id, 1, 1);
        mvc().perform(post("/api/quotations/" + id + "/confirm")).andExpect(status().isOk());

        String json = feed("?limit=100");
        String path = "$[?(@.quotationId == " + id + " && @.action == 'CONFIRMED')]";

        assertThat((List<String>) JsonPath.read(json, path + ".fromStage")).containsExactly("DRAFT");
        assertThat((List<String>) JsonPath.read(json, path + ".toStage"))
                .containsExactly("APPROVED");
    }

    @Test
    @DisplayName("limit trims the feed, defaults to twenty and is capped at a hundred")
    void limitIsHonouredAndCapped() throws Exception {
        newQuotation();
        newQuotation();

        mvc().perform(get("/api/activity?limit=1")).andExpect(jsonPath("$", hasSize(1)));
        mvc().perform(get("/api/activity")).andExpect(jsonPath("$", hasSize(lessThanOrEqualTo(20))));
        mvc().perform(get("/api/activity?limit=5000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(lessThanOrEqualTo(100))));
    }

    @Test
    @DisplayName("A feed of no entries is a refusal, not an empty answer")
    void nonsenseLimitIsRefused() throws Exception {
        mvc().perform(get("/api/activity?limit=0"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("limit"));
        mvc().perform(get("/api/activity?limit=-3"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("The feed needs an identity like every other internal read")
    void requiresAuthentication() throws Exception {
        MockMvc anonymous = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        anonymous.perform(get("/api/activity")).andExpect(status().isUnauthorized());
    }
}
