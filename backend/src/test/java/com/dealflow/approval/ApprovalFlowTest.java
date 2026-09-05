package com.dealflow.approval;

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
 * The approval chain is only worth having if the right person has to sign. These tests
 * exist because the endpoint once accepted a decision from anyone: a REP approved a
 * MANAGER step and the audit row recorded it as legitimate.
 *
 * <p>Seeded actors: 1 Rep One (REP), 2 Meera Manager (MANAGER), 3 Farid Finance (FINANCE).
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class ApprovalFlowTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    private static final long FINANCE = 3;

    @Autowired
    private WebApplicationContext context;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context).build();
        }
        return mvc;
    }

    /**
     * A confirmed quotation for Acme (GOLD, 15% ceiling) at the given discount, returning the
     * approval id. 25% overshoots by 10 and scores 100 (MANAGER + FINANCE); 18% overshoots by
     * 3 and scores 30 (MANAGER alone).
     */
    private long pendingApproval(long repId, int discountPct) throws Exception {
        String created = mvc().perform(post("/api/quotations").param("userId", String.valueOf(repId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":1}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + id + "/lines").param("userId", String.valueOf(repId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":1,\"quantity\":2,\"discountPct\":" + discountPct + "}"))
                .andExpect(status().isOk());

        String confirmed = mvc().perform(post("/api/quotations/" + id + "/confirm")
                        .param("userId", String.valueOf(repId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quotation.stage").value("PENDING_APPROVAL"))
                .andReturn().getResponse().getContentAsString();

        return ((Number) JsonPath.read(confirmed, "$.approvalId")).longValue();
    }

    private org.springframework.test.web.servlet.ResultActions decide(long approvalId, long userId,
                                                                      String decision) throws Exception {
        return mvc().perform(post("/api/approvals/" + approvalId + "/decide")
                .param("userId", String.valueOf(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"" + decision + "\",\"reason\":\"because\"}"));
    }

    @Test
    @DisplayName("A rep has no approval authority at all")
    void repCannotDecide() throws Exception {
        long approvalId = pendingApproval(REP, 25);

        decide(approvalId, REP, "APPROVE")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(containsString("MANAGER")));
    }

    @Test
    @DisplayName("Finance cannot sign the manager's step")
    void financeCannotJumpTheQueue() throws Exception {
        long approvalId = pendingApproval(REP, 25);

        decide(approvalId, FINANCE, "APPROVE")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(containsString("MANAGER")));

        // and nothing moved
        mvc().perform(get("/api/approvals/" + approvalId))
                .andExpect(jsonPath("$.state").value("OPEN"))
                .andExpect(jsonPath("$.steps[0].state").value("PENDING"))
                .andExpect(jsonPath("$.steps[0].decidedByName").value(nullValue()))
                .andExpect(jsonPath("$.steps[1].state").value("BLOCKED"));
    }

    @Test
    @DisplayName("The manager cannot also sign finance's step")
    void managerCannotSignBothSteps() throws Exception {
        long approvalId = pendingApproval(REP, 25);

        decide(approvalId, MANAGER, "APPROVE").andExpect(status().isOk());

        // step 2 is now PENDING, but it belongs to FINANCE
        decide(approvalId, MANAGER, "APPROVE")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(containsString("FINANCE")));
    }

    @Test
    @DisplayName("Manager then finance clears a risk-100 quotation")
    void bothStepsInOrder() throws Exception {
        long approvalId = pendingApproval(REP, 25);

        decide(approvalId, MANAGER, "APPROVE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("OPEN"))
                .andExpect(jsonPath("$.steps[0].state").value("APPROVED"))
                .andExpect(jsonPath("$.steps[0].decidedByName").value("Meera Manager"))
                .andExpect(jsonPath("$.steps[1].state").value("PENDING"));

        decide(approvalId, FINANCE, "APPROVE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("APPROVED"))
                .andExpect(jsonPath("$.steps[1].decidedByName").value("Farid Finance"))
                .andExpect(jsonPath("$.quotation.stage").value("APPROVED"));
    }

    @Test
    @DisplayName("Holding the right role is not enough -- you still cannot approve your own quotation")
    void ownQuotationIsStillRefused() throws Exception {
        // 18% scores 30, so the chain is MANAGER only and Meera holds that role.
        long approvalId = pendingApproval(MANAGER, 18);

        decide(approvalId, MANAGER, "APPROVE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("own quotation")));
    }

    @Test
    @DisplayName("Every decision needs a reason")
    void reasonIsMandatory() throws Exception {
        long approvalId = pendingApproval(REP, 25);

        mvc().perform(post("/api/approvals/" + approvalId + "/decide")
                        .param("userId", String.valueOf(MANAGER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"APPROVE\",\"reason\":\"  \"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("reason"));
    }
}
