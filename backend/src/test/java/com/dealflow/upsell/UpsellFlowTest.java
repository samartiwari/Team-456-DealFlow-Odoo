package com.dealflow.upsell;

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

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The upsell panel end to end (B5).
 *
 * <p>Scores and deltas are pinned in SuggestionRankerTest, which needs no database. What is
 * worth an integration test is everything around the arithmetic: which candidates the rules
 * actually produce, that a dismissal persists and is scoped to one quotation, and -- the
 * scored step -- that adding a suggestion moves the order's margin by exactly the amount
 * the card promised, in the response to that one call.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class UpsellFlowTest {

    private static final long REP = 1;
    private static final long LAPTOP = 1;
    private static final long SETUP_SERVICE = 2;
    private static final long SUPPORT_PLAN = 3;
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

    private long quotation() throws Exception {
        String created = mvc().perform(post("/api/quotations").param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(created, "$.id")).longValue();
    }

    private String addLine(long id, long productId, int quantity, int discountPct) throws Exception {
        return mvc().perform(post("/api/quotations/" + id + "/lines")
                        .param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + productId + ",\"quantity\":" + quantity
                                + ",\"discountPct\":" + discountPct + "}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private long laptopQuote() throws Exception {
        long id = quotation();
        addLine(id, LAPTOP, 2, 12);
        return id;
    }

    @Test
    @DisplayName("A laptop pulls in its three pairings, best-fitting first")
    void laptopSuggestsItsPairings() throws Exception {
        long id = laptopQuote();

        mvc().perform(get("/api/quotations/" + id + "/suggestions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[*].productName",
                        contains("Support Plan", "Docking Station", "Setup Service")))
                .andExpect(jsonPath("$[0].score").value(0.93))
                .andExpect(jsonPath("$[0].promoted").value(true))
                .andExpect(jsonPath("$[2].promoted").value(false))
                .andExpect(jsonPath("$[0].category").value("Subscriptions"))
                .andExpect(jsonPath("$[1].unitPrice").value(12000));
    }

    @Test
    @DisplayName("The best-ranked card is not the most profitable one, and both numbers say so")
    void scoreAndMarginDisagree() throws Exception {
        long id = laptopQuote();
        String json = mvc().perform(get("/api/quotations/" + id + "/suggestions"))
                .andReturn().getResponse().getContentAsString();

        double topScore = ((Number) JsonPath.read(json, "$[0].score")).doubleValue();
        double topDelta = ((Number) JsonPath.read(json, "$[0].marginDeltaPt")).doubleValue();
        double lastScore = ((Number) JsonPath.read(json, "$[2].score")).doubleValue();
        double lastDelta = ((Number) JsonPath.read(json, "$[2].marginDeltaPt")).doubleValue();

        assertThat(topScore).isGreaterThan(lastScore);
        assertThat(topDelta)
                .as("the lowest-ranked pairing improves this deal the most, which is why "
                        + "the panel has to show the margin delta and not just the ranking")
                .isLessThan(lastDelta);
    }

    @Test
    @DisplayName("Something already on the quotation is never suggested back")
    void whatIsInTheCartIsNotOffered() throws Exception {
        long id = laptopQuote();
        addLine(id, DOCK, 1, 0);

        mvc().perform(get("/api/quotations/" + id + "/suggestions"))
                .andExpect(jsonPath("$[*].productId", not(hasItem(((int) DOCK)))))
                .andExpect(jsonPath("$[*].productName",
                        contains("Support Plan", "Setup Service")));
    }

    @Test
    @DisplayName("A candidate thinner than the order it would join reports a negative delta")
    void dilutingCandidateIsNegative() throws Exception {
        // Setup Service alone runs at 40%; Onsite Training is 36%, so it drags the deal down.
        long id = quotation();
        addLine(id, SETUP_SERVICE, 1, 0);

        mvc().perform(get("/api/quotations/" + id + "/suggestions"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].productName").value("Onsite Training"))
                .andExpect(jsonPath("$[0].marginDeltaPt").value(-2.50));
    }

    @Test
    @DisplayName("A dismissal sticks, repeats harmlessly, and belongs to one quotation only")
    void dismissalIsScopedAndIdempotent() throws Exception {
        long mine = laptopQuote();
        long theirs = laptopQuote();

        mvc().perform(delete("/api/quotations/" + mine + "/suggestions/" + SUPPORT_PLAN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[*].productName", not(hasItem("Support Plan"))));

        // dismissing again is not an error
        mvc().perform(delete("/api/quotations/" + mine + "/suggestions/" + SUPPORT_PLAN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));

        // it survives a fresh read -- it is a row, not request state
        mvc().perform(get("/api/quotations/" + mine + "/suggestions"))
                .andExpect(jsonPath("$", hasSize(2)));

        // and the other quotation still sees all three
        mvc().perform(get("/api/quotations/" + theirs + "/suggestions"))
                .andExpect(jsonPath("$", hasSize(3)));
    }

    @Test
    @DisplayName("Nothing to suggest is an empty list, not an error")
    void emptyCases() throws Exception {
        mvc().perform(get("/api/quotations/" + quotation() + "/suggestions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));

        // a confirmed quotation cannot take another line, so a card would be a dead end
        long confirmed = laptopQuote();
        mvc().perform(post("/api/quotations/" + confirmed + "/confirm")
                .param("userId", String.valueOf(REP))).andExpect(status().isOk());
        mvc().perform(get("/api/quotations/" + confirmed + "/suggestions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("Unknown quotation and unknown product are both refused")
    void unknownThingsAreRefused() throws Exception {
        mvc().perform(get("/api/quotations/999999/suggestions"))
                .andExpect(status().isNotFound());
        mvc().perform(delete("/api/quotations/" + laptopQuote() + "/suggestions/999999"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GATE 10: adding a suggestion moves the margin by exactly what the card promised")
    void addingASuggestionMovesTheMargin() throws Exception {
        long id = laptopQuote();

        String cards = mvc().perform(get("/api/quotations/" + id + "/suggestions"))
                .andReturn().getResponse().getContentAsString();
        int productId = ((Number) JsonPath.read(cards, "$[0].productId")).intValue();
        BigDecimal promised = new BigDecimal(
                JsonPath.read(cards, "$[0].marginDeltaPt").toString());

        BigDecimal before = new BigDecimal(
                JsonPath.read(mvc().perform(get("/api/quotations/" + id))
                        .andReturn().getResponse().getContentAsString(), "$.marginPct").toString());

        // The one call that adds the line answers with the whole quotation -- so the cart,
        // the margin indicator and the risk badge all repaint from the same response. That
        // is what makes the move visible in the same frame rather than a request later.
        String recomputed = addLine(id, productId, 1, 0);
        BigDecimal after = new BigDecimal(JsonPath.read(recomputed, "$.marginPct").toString());

        assertThat(after.subtract(before))
                .as("the card promised %s", promised)
                .isEqualByComparingTo(promised);
        assertThat(JsonPath.<Integer>read(recomputed, "$.riskScore")).isNotNull();
    }
}
