package com.dealflow.quotation;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The customer is picked inside the builder, so it can change after the quotation exists.
 *
 * <p>It is not just a label: the tier ceiling every line is measured against comes from the
 * customer, so the same discount can be clean for one and over the ceiling for the next.
 * Seeded ceilings are Gold 15, Silver 10, Bronze 5.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class CustomerSwitchTest {

    private static final long REP = 1;

    @Autowired
    private WebApplicationContext context;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context).build();
        }
        return mvc;
    }

    /** Acme (GOLD) with one 12%-discounted Hardware line -- inside Gold's ceiling, score 0. */
    private long goldQuote() throws Exception {
        String created = mvc().perform(post("/api/quotations").param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customerId").value(1))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + id + "/lines").param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":1,\"quantity\":2,\"discountPct\":12}"))
                .andExpect(jsonPath("$.riskScore").value(0))
                .andExpect(jsonPath("$.requiredChain", empty()));
        return id;
    }

    @Test
    @DisplayName("The payload carries the customer's id, so the picker can show the selection")
    void payloadCarriesCustomerId() throws Exception {
        long id = goldQuote();

        mvc().perform(get("/api/quotations/" + id))
                .andExpect(jsonPath("$.customerId").value(1))
                .andExpect(jsonPath("$.customerName").value("Acme Corp"))
                .andExpect(jsonPath("$.tier").value("GOLD"));
    }

    @Test
    @DisplayName("Switching Gold to Bronze re-scores the same lines from 0 to needing both signatures")
    void switchingCustomerRescoresTheQuotation() throws Exception {
        long id = goldQuote();

        mvc().perform(patch("/api/quotations/" + id).param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customerId").value(3))
                .andExpect(jsonPath("$.customerName").value("Corex Ltd"))
                .andExpect(jsonPath("$.tier").value("BRONZE"))
                // 12% against Bronze's 5% ceiling is 7 points over: 6x7 + 4x7 = 70
                .andExpect(jsonPath("$.riskScore").value(70))
                .andExpect(jsonPath("$.requiredChain", contains("MANAGER", "FINANCE")))
                .andExpect(jsonPath("$.lines[0].allowedDiscountPct").value(5));
    }

    @Test
    @DisplayName("The switch is audited, because it changes what the quotation is measured against")
    void switchIsAudited() throws Exception {
        long id = goldQuote();

        mvc().perform(patch("/api/quotations/" + id).param("userId", String.valueOf(REP))
                .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":2}"))
                .andExpect(status().isOk());

        // The audit trail rides on the approval detail, so confirm to raise one.
        String confirmed = mvc().perform(post("/api/quotations/" + id + "/confirm")
                        .param("userId", String.valueOf(REP)))
                .andReturn().getResponse().getContentAsString();
        Number approvalId = JsonPath.read(confirmed, "$.approvalId");

        mvc().perform(get("/api/approvals/" + approvalId.longValue()))
                .andExpect(jsonPath("$.audit[*].action", hasItem("CUSTOMER_CHANGED")))
                .andExpect(jsonPath("$.audit[?(@.action == 'CUSTOMER_CHANGED')].reason")
                        .value(contains("Acme Corp to Beta Industries")));
    }

    @Test
    @DisplayName("Order discount alone still works, and an empty body is refused")
    void discountOnlyStillWorks() throws Exception {
        long id = goldQuote();

        mvc().perform(patch("/api/quotations/" + id).param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderDiscountPct\":5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderDiscountPct").value(5))
                .andExpect(jsonPath("$.customerId").value(1));

        mvc().perform(patch("/api/quotations/" + id).param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("The customer cannot change once the quotation has left the rep's hands")
    void cannotSwitchAfterItLeavesDraft() throws Exception {
        long id = goldQuote();
        mvc().perform(post("/api/quotations/" + id + "/confirm").param("userId", String.valueOf(REP)))
                .andExpect(jsonPath("$.quotation.stage").value("APPROVED"));

        // Approval was granted against one customer's ceilings; swapping them afterwards
        // would silently invalidate it.
        mvc().perform(patch("/api/quotations/" + id).param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":3}"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("An unknown customer is refused rather than silently ignored")
    void unknownCustomerIsRefused() throws Exception {
        long id = goldQuote();

        mvc().perform(patch("/api/quotations/" + id).param("userId", String.valueOf(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":999}"))
                .andExpect(status().isNotFound());
    }
}
