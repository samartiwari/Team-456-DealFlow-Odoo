package com.dealflow.analytics;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The deal health dashboard against the seeded ninety days (B9).
 *
 * <p>The rule itself is pinned in AnomalyRuleTest without a database. What is worth an
 * integration test is that the detectors read the right history: that Priya's 22% is
 * flagged against her own 8% average, and that Arjun's 19% -- more than double hers -- is
 * not flagged at all, because it is ordinary for him.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class DealHealthFlowTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    private static final long FINANCE = 3;

    /** Seeded: Priya at 22% on a stale approval, Arjun at 10% stale, Arjun at 19% fresh. */
    private static final int PRIYAS_OUTLIER = 200;
    private static final int ARJUNS_STALE = 201;
    private static final int ARJUNS_HIGH_BUT_NORMAL = 202;
    /** Stale in PENDING_APPROVAL and nothing else -- no other test disturbs it. */
    private static final int QUIETLY_STALE_APPROVAL = 203;

    @Autowired
    private WebApplicationContext context;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context).build();
        }
        return mvc;
    }

    /** A JsonPath filter yields an array, even when it matches exactly one thing. */
    private static int firstId(String json, String path) {
        List<Integer> ids = JsonPath.read(json, path);
        assertThat(ids).as("nothing matched %s", path).isNotEmpty();
        return ids.get(0);
    }

    private String board(long userId) throws Exception {
        return mvc().perform(get("/api/dashboard/health").param("userId", String.valueOf(userId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("An anomaly is a departure from the rep's own pattern, not a big number")
    void theBiggestDiscounterIsNotTheAnomaly() throws Exception {
        String json = board(MANAGER);

        List<Integer> flagged = JsonPath.read(json,
                "$.alerts[?(@.type == 'DISCOUNT_ANOMALY')].quotationId");

        assertThat(flagged)
                .as("Priya's 22%% is far outside her own 8%% average")
                .contains(PRIYAS_OUTLIER);
        assertThat(flagged)
                .as("Arjun's 19%% is more than double Priya's average and still ordinary "
                        + "for him -- a fixed threshold could not tell these apart")
                .doesNotContain(ARJUNS_HIGH_BUT_NORMAL);
    }

    @Test
    @DisplayName("The anomaly card shows its working")
    void theAlertCarriesTheFiguresBehindIt() throws Exception {
        mvc().perform(get("/api/dashboard/health").param("userId", String.valueOf(MANAGER)))
                .andExpect(jsonPath("$.alerts[?(@.quotationId == " + PRIYAS_OUTLIER
                        + " && @.type == 'DISCOUNT_ANOMALY')].metrics.usedTeamBaseline",
                        contains(false)))
                .andExpect(jsonPath("$.alerts[?(@.quotationId == " + PRIYAS_OUTLIER
                        + " && @.type == 'DISCOUNT_ANOMALY')].metrics.discountPct",
                        contains(22.0)))
                .andExpect(jsonPath("$.alerts[?(@.quotationId == " + PRIYAS_OUTLIER
                        + " && @.type == 'DISCOUNT_ANOMALY')].explanation",
                        contains(containsString("Priya Rao's average"))));
    }

    @Test
    @DisplayName("Stalled is judged per stage, not by one timeout")
    void stalledThresholdsDifferByStage() throws Exception {
        String json = board(MANAGER);
        List<Integer> stalled = JsonPath.read(json,
                "$.alerts[?(@.type == 'STALLED')].quotationId");

        // 12 days in DRAFT is past its 5-day threshold; 4 days in PENDING_APPROVAL is
        // past its 2-day one; 1 day in PENDING_APPROVAL is not past anything.
        assertThat(stalled).contains(ARJUNS_STALE, QUIETLY_STALE_APPROVAL);
        assertThat(stalled)
                .as("a day old and waiting on a colleague is not yet stalled")
                .doesNotContain(ARJUNS_HIGH_BUT_NORMAL);

        mvc().perform(get("/api/dashboard/health").param("userId", String.valueOf(MANAGER)))
                .andExpect(jsonPath("$.alerts[?(@.quotationId == " + ARJUNS_STALE
                        + " && @.type == 'STALLED')].explanation",
                        contains(containsString("after 5"))))
                .andExpect(jsonPath("$.alerts[?(@.quotationId == " + QUIETLY_STALE_APPROVAL
                        + " && @.type == 'STALLED')].explanation",
                        contains(containsString("after 2"))));
    }

    @Test
    @DisplayName("Running the detectors again does not raise the same alert twice")
    void detectorsAreSafeToReRun() throws Exception {
        int first = JsonPath.read(board(MANAGER), "$.counts.total");
        board(MANAGER);
        board(MANAGER);
        int after = JsonPath.read(board(MANAGER), "$.counts.total");

        // The unique partial index is what guarantees this, so it holds however many
        // managers open the dashboard at once.
        assertThat(after).isEqualTo(first);
    }

    @Test
    @DisplayName("A rep cannot see how their discounting compares to the team's")
    void theDashboardIsManagerOnly() throws Exception {
        mvc().perform(get("/api/dashboard/health").param("userId", String.valueOf(REP)))
                .andExpect(status().isForbidden());
        mvc().perform(get("/api/alerts").param("userId", String.valueOf(REP)))
                .andExpect(status().isForbidden());
        mvc().perform(get("/api/alerts").param("userId", String.valueOf(FINANCE)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Nudge drafts a message rather than claiming to have sent one")
    void nudgeReturnsTheDraft() throws Exception {
        int alertId = firstId(board(MANAGER), "$.alerts[?(@.type == 'STALLED')].id");

        mvc().perform(post("/api/alerts/" + alertId + "/nudge")
                        .param("userId", String.valueOf(MANAGER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draft").value(containsString("needs a look")))
                .andExpect(jsonPath("$.board.alerts").isArray());

        // Nudging marks it seen without resolving it -- the deal is still stalled.
        mvc().perform(get("/api/alerts").param("userId", String.valueOf(MANAGER)))
                .andExpect(jsonPath("$[?(@.id == " + alertId + ")].ackedAt",
                        contains(notNullValue())));
    }

    @Test
    @DisplayName("Escalating adds a Finance step to the real approval, and is audited")
    void escalationChangesWhoMustSign() throws Exception {
        int alertId = firstId(board(MANAGER), "$.alerts[?(@.quotationId == " + PRIYAS_OUTLIER
                + " && @.type == 'DISCOUNT_ANOMALY')].id");

        mvc().perform(post("/api/alerts/" + alertId + "/escalate")
                        .param("userId", String.valueOf(MANAGER)))
                .andExpect(status().isOk());

        String approvals = mvc().perform(get("/api/approvals").param("userId", String.valueOf(MANAGER)))
                .andReturn().getResponse().getContentAsString();
        int approvalId = firstId(approvals,
                "$[?(@.quotationId == " + PRIYAS_OUTLIER + ")].approvalId");

        mvc().perform(get("/api/approvals/" + approvalId))
                .andExpect(jsonPath("$.steps", hasSize(2)))
                .andExpect(jsonPath("$.steps[1].role").value("FINANCE"))
                // appended BLOCKED, so the sequence still holds
                .andExpect(jsonPath("$.steps[1].state").value("BLOCKED"))
                .andExpect(jsonPath("$.audit[*].action", hasItem("ESCALATED")));

        // Finance is on it now, so there is nothing left to escalate.
        mvc().perform(post("/api/alerts/" + alertId + "/escalate")
                        .param("userId", String.valueOf(MANAGER)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("A rep cannot escalate, and an unknown alert is not found")
    void actionsAreGuarded() throws Exception {
        int alertId = JsonPath.read(board(MANAGER), "$.alerts[0].id");

        mvc().perform(post("/api/alerts/" + alertId + "/escalate")
                        .param("userId", String.valueOf(REP)))
                .andExpect(status().isForbidden());
        mvc().perform(post("/api/alerts/999999/nudge").param("userId", String.valueOf(MANAGER)))
                .andExpect(status().isNotFound());
    }
}
