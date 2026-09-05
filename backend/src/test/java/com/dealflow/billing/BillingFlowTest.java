package com.dealflow.billing;

import com.dealflow.TestcontainersConfiguration;
import com.dealflow.billing.dto.ClockAdvanceResponse;
import com.dealflow.billing.service.BillingService;

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

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * One order, billed two ways (A5/B7), end to end.
 *
 * <p>The money itself is pinned in ProrationCalculatorTest, which needs no database. What is
 * worth an integration test is the fork -- that a quotation carrying both kinds of line
 * produces one invoice and one schedule rather than two orders -- and that an invoice's
 * status is genuinely derived rather than stored.
 *
 * <p>Seeded catalog: Laptop Pro 80,000 (Hardware, one-time), Support Plan 2,000
 * (Subscriptions, recurring).
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class BillingFlowTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    private static final long FINANCE = 3;
    private static final long LAPTOP = 1;
    private static final long SUPPORT_PLAN = 3;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private BillingService billing;

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
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(created, "$.id")).longValue();
    }

    private void addLine(long id, long productId, int quantity) throws Exception {
        mvc().perform(post("/api/quotations/" + id + "/lines").param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + productId + ",\"quantity\":" + quantity
                                + ",\"discountPct\":0}"))
                .andExpect(status().isOk());
    }

    /** A quotation carrying both kinds of line, approved so billing exists. */
    private long hybridOrder() throws Exception {
        long id = quotation();
        addLine(id, LAPTOP, 2);
        addLine(id, SUPPORT_PLAN, 1);
        mvc().perform(post("/api/quotations/" + id + "/confirm").param("userId", String.valueOf(REP)))
                .andExpect(jsonPath("$.quotation.stage").value("APPROVED"));
        return id;
    }

    private String billingOf(long quotationId) throws Exception {
        return mvc().perform(get("/api/quotations/" + quotationId + "/billing"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("STEP 6: one order carries an immediate invoice and a monthly schedule")
    void oneOrderBillsBothWays() throws Exception {
        long id = hybridOrder();

        mvc().perform(get("/api/quotations/" + id + "/billing"))
                .andExpect(status().isOk())
                // one order, named once
                .andExpect(jsonPath("$.quotationId").value((int) id))
                .andExpect(jsonPath("$.customerName").value("Acme Corp"))
                // the one-time half: hardware only
                .andExpect(jsonPath("$.invoice.lines", hasSize(1)))
                .andExpect(jsonPath("$.invoice.lines[0].description").value("Laptop Pro x2"))
                .andExpect(jsonPath("$.invoice.total").value(160000))
                .andExpect(jsonPath("$.invoice.status").value("OPEN"))
                // the recurring half: twelve periods, none billed yet
                .andExpect(jsonPath("$.subscriptions", hasSize(1)))
                .andExpect(jsonPath("$.subscriptions[0].productName").value("Support Plan"))
                .andExpect(jsonPath("$.subscriptions[0].periodAmount").value(2000))
                .andExpect(jsonPath("$.subscriptions[0].periods", hasSize(12)))
                .andExpect(jsonPath("$.subscriptions[0].periods[0].status").value("SCHEDULED"))
                .andExpect(jsonPath("$.subscriptions[0].periods[*].status",
                        everyItem(is("SCHEDULED"))));
    }

    @Test
    @DisplayName("A subscription-only order has a schedule and no invoice until a period falls due")
    void recurringOnlyOrderHasNoInvoiceYet() throws Exception {
        long id = quotation();
        addLine(id, SUPPORT_PLAN, 2);
        mvc().perform(post("/api/quotations/" + id + "/confirm").param("userId", String.valueOf(REP)));

        mvc().perform(get("/api/quotations/" + id + "/billing"))
                .andExpect(jsonPath("$.invoice").doesNotExist())
                .andExpect(jsonPath("$.subscriptions[0].quantity").value(2))
                .andExpect(jsonPath("$.subscriptions[0].periodAmount").value(4000));
    }

    @Test
    @DisplayName("Billing does not exist before the quotation is approved")
    void noBillingBeforeApproval() throws Exception {
        long id = quotation();
        addLine(id, LAPTOP, 1);

        mvc().perform(get("/api/quotations/" + id + "/billing"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("STEP 8: recording a payment moves the status by itself")
    void paymentDerivesTheStatus() throws Exception {
        long id = hybridOrder();
        int invoiceId = JsonPath.read(billingOf(id), "$.invoice.id");

        // part of it
        mvc().perform(post("/api/invoices/" + invoiceId + "/payments")
                        .param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":50000,\"reference\":\"NEFT-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PARTIALLY_PAID"))
                .andExpect(jsonPath("$.paid").value(50000))
                .andExpect(jsonPath("$.outstanding").value(110000))
                .andExpect(jsonPath("$.payments[0].recordedByName").value("Farid Finance"));

        // the rest of it
        mvc().perform(post("/api/invoices/" + invoiceId + "/payments")
                        .param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":110000}"))
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.outstanding").value(0));
    }

    @Test
    @DisplayName("Payments are guarded: not a rep, not more than is owed, not twice over")
    void paymentGuards() throws Exception {
        long id = hybridOrder();
        int invoiceId = JsonPath.read(billingOf(id), "$.invoice.id");
        String path = "/api/invoices/" + invoiceId + "/payments";

        mvc().perform(post(path).param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":100}"))
                .andExpect(status().isForbidden());

        mvc().perform(post(path).param("userId", String.valueOf(MANAGER))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":100}"))
                .andExpect(status().isForbidden());

        mvc().perform(post(path).param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":0}"))
                .andExpect(status().isUnprocessableEntity());

        mvc().perform(post(path).param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":999999}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value(containsString("outstanding")));

        mvc().perform(post(path).param("userId", String.valueOf(FINANCE))
                .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":160000}"))
                .andExpect(jsonPath("$.status").value("PAID"));

        mvc().perform(post(path).param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":1}"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Raising quantity mid-period charges a proration line and reprices later periods")
    void increaseChargesAProration() throws Exception {
        long id = hybridOrder();
        String view = billingOf(id);
        int subscriptionId = JsonPath.read(view, "$.subscriptions[0].id");
        String periodStart = JsonPath.read(view, "$.subscriptions[0].periods[0].periodStart");
        String day10 = periodStart.substring(0, 8) + "10";

        mvc().perform(post("/api/subscriptions/" + subscriptionId + "/change")
                        .param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":3,\"effectiveDate\":\"" + day10 + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deltaAmount").value(greaterThan(0.0)))
                .andExpect(jsonPath("$.creditNote").doesNotExist())
                .andExpect(jsonPath("$.explanation").value(containsString("days remaining")))
                // charged onto the same invoice -- one order, one invoice
                .andExpect(jsonPath("$.billing.invoice.lines[?(@.proration == true)]", hasSize(1)))
                // later periods now bill three units
                .andExpect(jsonPath("$.billing.subscriptions[0].quantity").value(3))
                .andExpect(jsonPath("$.billing.subscriptions[0].periods[1].amount").value(6000));
    }

    @Test
    @DisplayName("Dropping quantity mid-period issues a credit note, not a negative invoice line")
    void decreaseIssuesACreditNote() throws Exception {
        long id = hybridOrder();
        String view = billingOf(id);
        int subscriptionId = JsonPath.read(view, "$.subscriptions[0].id");
        String periodStart = JsonPath.read(view, "$.subscriptions[0].periods[0].periodStart");
        String day10 = periodStart.substring(0, 8) + "10";
        String change = "/api/subscriptions/" + subscriptionId + "/change";

        mvc().perform(post(change).param("userId", String.valueOf(FINANCE))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"quantity\":3,\"effectiveDate\":\"" + day10 + "\"}"));

        mvc().perform(post(change).param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":1,\"effectiveDate\":\"" + day10 + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deltaAmount").value(lessThan(0.0)))
                .andExpect(jsonPath("$.creditNote.ref").value(startsWith("CN-")))
                .andExpect(jsonPath("$.creditNote.amount").value(greaterThan(0.0)));
    }

    @Test
    @DisplayName("Changing to the quantity it already has costs nothing and writes nothing")
    void noOpChangeIsFree() throws Exception {
        long id = hybridOrder();
        String view = billingOf(id);
        int subscriptionId = JsonPath.read(view, "$.subscriptions[0].id");

        mvc().perform(post("/api/subscriptions/" + subscriptionId + "/change")
                        .param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"quantity\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deltaAmount").value(0))
                .andExpect(jsonPath("$.creditNote").doesNotExist())
                .andExpect(jsonPath("$.billing.invoice.lines", hasSize(1)));
    }

    @Test
    @DisplayName("Cancelling credits the unused days and clears what would never be billed")
    void cancellationCreditsAndStopsTheSchedule() throws Exception {
        long id = hybridOrder();
        String view = billingOf(id);
        int subscriptionId = JsonPath.read(view, "$.subscriptions[0].id");
        String periodStart = JsonPath.read(view, "$.subscriptions[0].periods[0].periodStart");
        String day10 = periodStart.substring(0, 8) + "10";

        mvc().perform(post("/api/subscriptions/" + subscriptionId + "/cancel")
                        .param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"effectiveDate\":\"" + day10 + "\",\"reason\":\"downsized\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deltaAmount").value(lessThan(0.0)))
                .andExpect(jsonPath("$.creditNote.reason").value(containsString("downsized")))
                .andExpect(jsonPath("$.billing.subscriptions[0].status").value("CANCELLED"))
                .andExpect(jsonPath("$.billing.subscriptions[0].cancelledAt").value(day10))
                // the schedule is kept: the rows record what was agreed and the status
                // records that it stopped. The close job skips anything after that date.
                .andExpect(jsonPath("$.billing.subscriptions[0].periods", hasSize(12)));

        mvc().perform(post("/api/subscriptions/" + subscriptionId + "/cancel")
                        .param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("The nightly close bills a due period once, however many times it runs")
    void closingIsIdempotentForAGivenDate() throws Exception {
        long id = quotation();
        addLine(id, SUPPORT_PLAN, 1);
        mvc().perform(post("/api/quotations/" + id + "/confirm").param("userId", String.valueOf(REP)));

        String view = billingOf(id);
        String firstEnd = JsonPath.read(view, "$.subscriptions[0].periods[0].periodEnd");
        // A period is billed once it has run its course, so the cut-off is the day after.
        LocalDate asOf = LocalDate.parse(firstEnd).plusDays(1);

        // This is the guarantee the unique constraint on (subscription_id, period_start)
        // exists for: the scheduler fires every night and must not bill a period twice.
        ClockAdvanceResponse first = billing.closePeriodsUpTo(asOf);
        ClockAdvanceResponse second = billing.closePeriodsUpTo(asOf);

        assertThat(first.periodsBilled()).isGreaterThanOrEqualTo(1);
        assertThat(second.periodsBilled())
                .as("a second run over the same date must bill nothing further")
                .isZero();

        mvc().perform(get("/api/quotations/" + id + "/billing"))
                .andExpect(jsonPath("$.subscriptions[0].periods[0].status").value("BILLED"))
                .andExpect(jsonPath("$.subscriptions[0].periods[0].invoiceId").isNumber())
                // a subscription-only order has no originating invoice, so the cycle's own
                // invoice is the first one there is
                .andExpect(jsonPath("$.invoice.lines", hasSize(1)))
                .andExpect(jsonPath("$.invoice.total").value(2000));
    }

    @Test
    @DisplayName("A settled invoice is never reopened by the next cycle")
    void billingACycleDoesNotReopenASettledInvoice() throws Exception {
        long id = hybridOrder();
        String view = billingOf(id);
        int invoiceId = JsonPath.read(view, "$.invoice.id");
        double total = ((Number) JsonPath.read(view, "$.invoice.total")).doubleValue();

        mvc().perform(post("/api/invoices/" + invoiceId + "/payments")
                        .param("userId", String.valueOf(FINANCE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":" + total + "}"))
                .andExpect(jsonPath("$.status").value("PAID"));

        // Run the schedule far enough forward that a period falls due.
        String firstEnd = JsonPath.read(view, "$.subscriptions[0].periods[0].periodEnd");
        billing.closePeriodsUpTo(LocalDate.parse(firstEnd).plusDays(1));

        // The cycle raises its own invoice. Adding it to the settled one would drag a
        // customer's paid invoice back to PARTIALLY_PAID, which is how a real billing
        // system loses trust.
        mvc().perform(get("/api/invoices/" + invoiceId))
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.total").value(total))
                .andExpect(jsonPath("$.outstanding").value(0));

        mvc().perform(get("/api/invoices"))
                .andExpect(jsonPath("$[?(@.quotationId == " + id + ")]", hasSize(2)));
    }

    @Test
    @DisplayName("Only finance may wind the clock forward")
    void advanceClockIsFinanceWork() throws Exception {
        mvc().perform(post("/api/billing/advance-clock").param("userId", String.valueOf(REP)))
                .andExpect(status().isForbidden());
        mvc().perform(post("/api/billing/advance-clock").param("userId", String.valueOf(FINANCE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.billingDate").isString())
                .andExpect(jsonPath("$.periodsBilled").isNumber());
    }

    @Test
    @DisplayName("Invoices are listable and fetchable on their own")
    void invoicesListAndDetail() throws Exception {
        long id = hybridOrder();
        int invoiceId = JsonPath.read(billingOf(id), "$.invoice.id");

        mvc().perform(get("/api/invoices"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThan(0))));

        mvc().perform(get("/api/invoices/" + invoiceId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(invoiceId))
                .andExpect(jsonPath("$.ref").value(startsWith("INV-")));

        mvc().perform(get("/api/invoices/999999")).andExpect(status().isNotFound());
    }
}
