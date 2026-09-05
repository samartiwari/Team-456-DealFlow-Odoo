package com.dealflow.billing;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A5. A plan is a live setting, not a label.
 *
 * <p>The three policies used to be constants inside {@code BillingService}. These tests are
 * the argument that moving them into a plan was real: change the policy through the admin
 * API, and the next quantity change or cancellation behaves differently.
 *
 * <p>Product 3 is Support Plan, a recurring product seeded with the default plan --
 * MONTHLY, PRORATE, IMMEDIATE_WITH_CREDIT, which is exactly what billing did before plans
 * existed. Product 1, Laptop Pro, is not recurring.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class SubscriptionPlanTest {

    private static final long MANAGER = 2;
    private static final long FINANCE = 3;
    private static final long SUPPORT_PLAN = 3;
    private static final long LAPTOP = 1;

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

    /** Every test leaves the seeded plans exactly as it found them. */
    @AfterEach
    void restorePlans() {
        jdbc.update("delete from subscription_plan where name not like '% Monthly'");
        jdbc.update("update subscription_plan set interval_unit = 'MONTHLY',"
                + " proration_policy = 'PRORATE',"
                + " cancellation_policy = 'IMMEDIATE_WITH_CREDIT', active = true");
    }

    private long planIdFor(long productId) {
        return jdbc.queryForObject(
                "select id from subscription_plan where product_id = ? and active", Long.class,
                productId);
    }

    private void setPolicy(long productId, String field, String value) throws Exception {
        mvc().perform(patch("/api/admin/subscription-plans/" + planIdFor(productId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"" + field + "\":\"" + value + "\"}"))
                .andExpect(status().isOk());
    }

    /** A confirmed order carrying a Support Plan line, which raises a subscription. */
    private long subscriptionFor(int quantity) throws Exception {
        String created = mvc().perform(post("/api/quotations")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + SUPPORT_PLAN + ",\"quantity\":" + quantity + "}"))
                .andExpect(status().isOk());
        mvc().perform(post("/api/quotations/" + id + "/confirm")).andExpect(status().isOk());

        String billing = mvc().perform(get("/api/quotations/" + id + "/billing"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(billing, "$.subscriptions[0].id")).longValue();
    }

    // ---------------------------------------------------------------- setup

    @Test
    @DisplayName("every recurring product is seeded with the behaviour billing already had")
    void seededPlansReproduceTheOldDefaults() throws Exception {
        mvc().perform(get("/api/admin/subscription-plans"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", not(empty())))
                .andExpect(jsonPath("$[*].interval", everyItem(is("MONTHLY"))))
                .andExpect(jsonPath("$[*].prorationPolicy", everyItem(is("PRORATE"))))
                .andExpect(jsonPath("$[*].cancellationPolicy",
                        everyItem(is("IMMEDIATE_WITH_CREDIT"))));
    }

    @Test
    @DisplayName("a plan is refused on a product that never bills again")
    void planOnANonRecurringProductIsRefused() throws Exception {
        mvc().perform(post("/api/admin/subscription-plans")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Laptop Monthly\",\"productId\":" + LAPTOP
                                + ",\"interval\":\"MONTHLY\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("productId"));
    }

    @Test
    @DisplayName("a product prices one way at a time")
    void secondActivePlanIsRefused() throws Exception {
        mvc().perform(post("/api/admin/subscription-plans")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Support Yearly\",\"productId\":" + SUPPORT_PLAN
                                + ",\"interval\":\"YEARLY\",\"active\":true}"))
                .andExpect(status().isConflict());

        // staged inactive, ready to be switched over
        mvc().perform(post("/api/admin/subscription-plans")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Support Yearly\",\"productId\":" + SUPPORT_PLAN
                                + ",\"interval\":\"YEARLY\",\"active\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interval").value("YEARLY"));
    }

    @Test
    @DisplayName("an unknown policy is named back rather than silently defaulted")
    void unknownPolicyIsRefused() throws Exception {
        mvc().perform(patch("/api/admin/subscription-plans/" + planIdFor(SUPPORT_PLAN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"prorationPolicy\":\"SOMETIMES\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("prorationPolicy"))
                .andExpect(jsonPath("$.message").value(containsString("PRORATE")));
    }

    // ---------------------------------------------------------------- effect

    @Test
    @DisplayName("the interval decides how long a period runs")
    void quarterlySchedulesFourPeriodsOfThreeMonths() throws Exception {
        setPolicy(SUPPORT_PLAN, "interval", "QUARTERLY");

        long id = subscriptionFor(1);
        String billing = mvc().perform(get("/api/invoices")).andReturn()
                .getResponse().getContentAsString();
        assertThat(billing).isNotBlank();

        // A year's horizon either way: twelve monthly periods, or four quarters.
        jdbc.query("select period_start, period_end from billing_period"
                        + " where subscription_id = ? order by period_start", rs -> {
                    assertThat(rs.getDate("period_end").toLocalDate())
                            .isEqualTo(rs.getDate("period_start").toLocalDate()
                                    .plusMonths(3).minusDays(1));
                }, id);
        Integer periods = jdbc.queryForObject(
                "select count(*) from billing_period where subscription_id = ?", Integer.class, id);
        assertThat(periods).isEqualTo(4);
    }

    @Test
    @DisplayName("FULL_PERIOD moves the quantity without charging for the remainder")
    void fullPeriodChargesNothingNow() throws Exception {
        setPolicy(SUPPORT_PLAN, "prorationPolicy", "FULL_PERIOD");
        long id = subscriptionFor(10);

        mvc().perform(post("/api/subscriptions/" + id + "/change")
                        .header("Authorization", tokens.bearer(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":20}"))
                .andExpect(status().isOk())
                // nothing was billed or credited for the period already running
                .andExpect(jsonPath("$.deltaAmount").value(0.00))
                .andExpect(jsonPath("$.creditNote").value(nullValue()))
                .andExpect(jsonPath("$.explanation").value(containsString("next period")));

        // and the quantity itself did move
        assertThat(jdbc.queryForObject("select quantity from subscription where id = ?",
                Integer.class, id)).isEqualTo(20);
    }

    @Test
    @DisplayName("PRORATE still bills the remainder, which is what the default does")
    void prorateIsUnchanged() throws Exception {
        long id = subscriptionFor(10);

        mvc().perform(post("/api/subscriptions/" + id + "/change")
                        .header("Authorization", tokens.bearer(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":20}"))
                .andExpect(status().isOk())
                // an increase mid-period is a charge, so the delta is not zero
                .andExpect(jsonPath("$.deltaAmount", not(is(0.00))))
                .andExpect(jsonPath("$.explanation", containsString("days")));

        assertThat(jdbc.queryForObject("select quantity from subscription where id = ?",
                Integer.class, id)).isEqualTo(20);
    }

    @Test
    @DisplayName("END_OF_PERIOD runs to the end of what was paid for, and credits nothing")
    void endOfPeriodCreditsNothing() throws Exception {
        setPolicy(SUPPORT_PLAN, "cancellationPolicy", "END_OF_PERIOD");
        long id = subscriptionFor(10);

        String cancelled = mvc().perform(post("/api/subscriptions/" + id + "/cancel")
                        .header("Authorization", tokens.bearer(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"switching\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deltaAmount").value(0.00))
                .andExpect(jsonPath("$.creditNote").value(nullValue()))
                .andReturn().getResponse().getContentAsString();
        assertThat(cancelled).contains("end of the period");
        assertThat(jdbc.queryForObject("select status from subscription where id = ?",
                String.class, id)).isEqualTo("CANCELLED");

        // It stops at the period end, not today -- so the period already running is still
        // owed, and the close job will bill it.
        java.time.LocalDate cancelledAt = jdbc.queryForObject(
                "select cancelled_at from subscription where id = ?",
                java.sql.Date.class, id).toLocalDate();
        java.time.LocalDate periodEnd = jdbc.queryForObject(
                "select min(period_end) from billing_period where subscription_id = ?",
                java.sql.Date.class, id).toLocalDate();
        assertThat(cancelledAt).isEqualTo(periodEnd);
    }

    @Test
    @DisplayName("IMMEDIATE_NO_CREDIT stops now and keeps the money")
    void immediateNoCreditKeepsTheRemainder() throws Exception {
        setPolicy(SUPPORT_PLAN, "cancellationPolicy", "IMMEDIATE_NO_CREDIT");
        long id = subscriptionFor(10);

        mvc().perform(post("/api/subscriptions/" + id + "/cancel")
                        .header("Authorization", tokens.bearer(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"switching\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deltaAmount").value(0.00))
                .andExpect(jsonPath("$.creditNote").value(nullValue()))
                .andExpect(jsonPath("$.explanation").value(containsString("not refunded")));
    }
}
