package com.dealflow.portal;

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

import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The customer portal, end to end (B8), and the wall around it.
 *
 * <p>Seeded actors: 1 Rep One, 2 Meera Manager, 3 Farid Finance. Acme is GOLD with a 15%
 * ceiling, so Laptop Pro x6 scores 30 at an 18% order discount and 70 at 22%.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class PortalFlowTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    private static final long FINANCE = 3;
    private static final String HEADER = "X-Portal-Token";

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

    /** An approved quotation for Acme at the given order discount. */
    private long approvedQuote(int orderDiscountPct) throws Exception {
        String created = mvc().perform(post("/api/quotations").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + id + "/lines").header("Authorization", tokens.bearer(REP))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"productId\":1,\"quantity\":6,\"discountPct\":0}"));
        mvc().perform(patch("/api/quotations/" + id).header("Authorization", tokens.bearer(REP))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"orderDiscountPct\":" + orderDiscountPct + "}"));

        String confirmed = mvc().perform(post("/api/quotations/" + id + "/confirm")
                        .header("Authorization", tokens.bearer(REP)))
                .andReturn().getResponse().getContentAsString();
        Number approvalId = JsonPath.read(confirmed, "$.approvalId");

        decide(approvalId.longValue(), MANAGER);
        if ("PENDING_APPROVAL".equals(stageOf(id))) {
            decide(approvalId.longValue(), FINANCE);
        }
        assertThat(stageOf(id)).isEqualTo("APPROVED");
        return id;
    }

    private void decide(long approvalId, long userId) throws Exception {
        mvc().perform(post("/api/approvals/" + approvalId + "/decide")
                .header("Authorization", tokens.bearer(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"APPROVE\",\"reason\":\"agreed\"}"));
    }

    private String stageOf(long quotationId) throws Exception {
        return JsonPath.read(mvc().perform(get("/api/quotations/" + quotationId))
                .andReturn().getResponse().getContentAsString(), "$.stage");
    }

    /** Sends the quotation and returns the raw magic-link token. */
    private String send(long quotationId) throws Exception {
        String sent = mvc().perform(post("/api/quotations/" + quotationId + "/send")
                        .header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String url = JsonPath.read(sent, "$.portalUrl");
        return url.substring(url.indexOf("token=") + 6);
    }

    private String openPortal(long quotationId) throws Exception {
        String verified = mvc().perform(post("/api/portal/auth/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + send(quotationId) + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(verified, "$.portalToken");
    }

    @Test
    @DisplayName("The portal payload physically cannot carry cost, margin, risk or approvers")
    void thePortalPayloadHoldsNothingInternal() throws Exception {
        long id = approvedQuote(18);
        String session = openPortal(id);

        String body = mvc().perform(get("/api/portal/quotation").header(HEADER, session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Whole-document, not field-by-field: a nested leak is exactly the kind a
        // hand-written assertion list misses.
        String lowered = body.toLowerCase(Locale.ROOT);
        for (String forbidden : new String[] {
                "unitcost", "margin", "riskscore", "requiredchain", "approval", "internal" }) {
            assertThat(lowered)
                    .as("the customer's payload must not contain %s", forbidden)
                    .doesNotContain(forbidden);
        }

        // and no numeric quotation id anywhere -- theirs comes from the token
        assertThat(body).doesNotContain("\"quotationId\"");
        mvc().perform(get("/api/portal/quotation").header(HEADER, session))
                .andExpect(jsonPath("$.publicRef").value(matchesRegex(
                        "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")))
                .andExpect(jsonPath("$.lines[0].productName").value("Laptop Pro"))
                .andExpect(jsonPath("$.status").value("SENT"));
    }

    @Test
    @DisplayName("A magic link works once and only once")
    void theLinkIsSingleUse() throws Exception {
        long id = approvedQuote(18);
        String token = send(id);
        String verify = "{\"token\":\"" + token + "\"}";

        mvc().perform(post("/api/portal/auth/verify")
                        .contentType(MediaType.APPLICATION_JSON).content(verify))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.customerName").value("Acme Corp"))
                .andExpect(jsonPath("$.portalToken").isString());

        mvc().perform(post("/api/portal/auth/verify")
                        .contentType(MediaType.APPLICATION_JSON).content(verify))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("An unknown link and a spent one are indistinguishable")
    void anUnknownLinkLooksExactlyLikeASpentOne() throws Exception {
        long id = approvedQuote(18);
        String token = send(id);
        mvc().perform(post("/api/portal/auth/verify").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\"}"));

        String spent = mvc().perform(post("/api/portal/auth/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + token + "\"}"))
                .andReturn().getResponse().getContentAsString();
        String neverExisted = mvc().perform(post("/api/portal/auth/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"never-was-a-token\"}"))
                .andReturn().getResponse().getContentAsString();

        // Different messages would confirm to a stranger that a link once existed here.
        assertThat(JsonPath.<String>read(spent, "$.message"))
                .isEqualTo(JsonPath.read(neverExisted, "$.message"));
    }

    @Test
    @DisplayName("No session token, no quotation -- and a missing header is a 401, not a 400")
    void aSessionIsRequired() throws Exception {
        mvc().perform(get("/api/portal/quotation"))
                .andExpect(status().isUnauthorized());
        mvc().perform(get("/api/portal/quotation").header(HEADER, "not-a-session"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Only an approved quotation can be sent, and only once")
    void sendingIsGuarded() throws Exception {
        String created = mvc().perform(post("/api/quotations").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long draft = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + draft + "/send").header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isConflict());

        long approved = approvedQuote(18);
        mvc().perform(post("/api/quotations/" + approved + "/send").header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quotation.stage").value("SENT"));
        mvc().perform(post("/api/quotations/" + approved + "/send").header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("STEP 7: a counter above the approved baseline re-enters approval by itself")
    void aWorseCounterReRoutesWithNobodyPressingAnything() throws Exception {
        long id = approvedQuote(18);      // approved at score 30
        String session = openPortal(id);

        mvc().perform(get("/api/quotations/" + id + "/negotiation"))
                .andExpect(jsonPath("$.approvedBaselineScore").value(30))
                .andExpect(jsonPath("$.status").value("SENT"));

        mvc().perform(post("/api/portal/quotation/counter").header(HEADER, session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"discountPct\":22,\"note\":\"budget is tight\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counter.discountPct").value(22))
                // the customer is told they are waiting on sales, without being told why
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.canConfirm").value(false));

        // No rep touched anything between those two calls.
        mvc().perform(get("/api/quotations/" + id))
                .andExpect(jsonPath("$.stage").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.riskScore").value(70))
                .andExpect(jsonPath("$.requiredChain", contains("MANAGER", "FINANCE")));

        // and the rep's side shows what it did to the deal
        mvc().perform(get("/api/quotations/" + id + "/negotiation"))
                .andExpect(jsonPath("$.counter.riskScore").value(70))
                .andExpect(jsonPath("$.counter.requiredChain", contains("MANAGER", "FINANCE")))
                .andExpect(jsonPath("$.counter.state").value("PENDING"));
    }

    @Test
    @DisplayName("A counter better than the baseline leaves governance alone")
    void aBetterCounterDoesNotReRoute() throws Exception {
        long id = approvedQuote(22);      // approved at score 70
        String session = openPortal(id);

        mvc().perform(post("/api/portal/quotation/counter").header(HEADER, session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"discountPct\":18}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UNDER_NEGOTIATION"))
                .andExpect(jsonPath("$.canConfirm").value(true));

        // 30 is no worse than the 70 that was signed off, so nothing re-runs. Without the
        // baseline this would compare against zero and drag the chain through again.
        mvc().perform(get("/api/quotations/" + id))
                .andExpect(jsonPath("$.stage").value("UNDER_NEGOTIATION"))
                .andExpect(jsonPath("$.riskScore").value(30));
    }

    @Test
    @DisplayName("Line-level comments land in a thread both sides can read")
    void bothSidesShareOneThread() throws Exception {
        long id = approvedQuote(18);
        String session = openPortal(id);
        String view = mvc().perform(get("/api/portal/quotation").header(HEADER, session))
                .andReturn().getResponse().getContentAsString();
        int lineId = JsonPath.read(view, "$.lines[0].id");

        mvc().perform(post("/api/portal/quotation/messages").header(HEADER, session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lineId\":" + lineId + ",\"body\":\"Better price on these?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages", hasSize(1)))
                .andExpect(jsonPath("$.messages[0].author").value("CUSTOMER"))
                .andExpect(jsonPath("$.messages[0].lineId").value(lineId));

        mvc().perform(post("/api/quotations/" + id + "/negotiation/reply")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Let me check with my manager.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages", hasSize(2)))
                .andExpect(jsonPath("$.messages[1].author").value("SALES"))
                .andExpect(jsonPath("$.messages[1].authorName").value("Rep One"));

        mvc().perform(get("/api/portal/quotation").header(HEADER, session))
                .andExpect(jsonPath("$.messages", hasSize(2)));

        mvc().perform(post("/api/portal/quotation/messages").header(HEADER, session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"   \"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("The customer cannot confirm while the quote is back with sales")
    void confirmIsBlockedDuringReApproval() throws Exception {
        long id = approvedQuote(18);
        String session = openPortal(id);

        mvc().perform(post("/api/portal/quotation/counter").header(HEADER, session)
                .contentType(MediaType.APPLICATION_JSON).content("{\"discountPct\":22}"));

        mvc().perform(post("/api/portal/quotation/confirm").header(HEADER, session))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("sales team")));
    }

    @Test
    @DisplayName("Confirming settles the deal and accepts the counter on it")
    void confirmingSettlesTheDeal() throws Exception {
        long id = approvedQuote(22);
        String session = openPortal(id);

        mvc().perform(post("/api/portal/quotation/counter").header(HEADER, session)
                .contentType(MediaType.APPLICATION_JSON).content("{\"discountPct\":18}"));

        mvc().perform(post("/api/portal/quotation/confirm").header(HEADER, session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.counter.state").value("ACCEPTED"))
                .andExpect(jsonPath("$.canCounter").value(false));

        mvc().perform(get("/api/quotations/" + id))
                .andExpect(jsonPath("$.stage").value("CONFIRMED"));
    }

    @Test
    @DisplayName("A nonsense discount is refused before it touches the quotation")
    void counterIsValidated() throws Exception {
        long id = approvedQuote(18);
        String session = openPortal(id);

        mvc().perform(post("/api/portal/quotation/counter").header(HEADER, session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"discountPct\":150}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("discountPct"));

        mvc().perform(get("/api/quotations/" + id))
                .andExpect(jsonPath("$.stage").value("SENT"))
                .andExpect(jsonPath("$.orderDiscountPct").value(18));
    }

    @Test
    @DisplayName("A confirmed quotation is closed to further negotiation")
    void aConfirmedQuoteIsClosed() throws Exception {
        long id = approvedQuote(18);
        String session = openPortal(id);
        mvc().perform(post("/api/portal/quotation/confirm").header(HEADER, session))
                .andExpect(jsonPath("$.status").value("CONFIRMED"));

        mvc().perform(post("/api/portal/quotation/counter").header(HEADER, session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"discountPct\":20}"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("A sent or confirmed quotation can still be shipped and billed")
    void fulfilmentSurvivesGoingToTheCustomer() throws Exception {
        long id = approvedQuote(18);
        openPortal(id);   // now SENT

        mvc().perform(get("/api/quotations/" + id + "/allocation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lines").isArray());
        mvc().perform(get("/api/quotations/" + id + "/billing"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("A rep can take a countered quotation back and change the terms")
    void revisePullsItBackFromTheCustomer() throws Exception {
        long id = approvedQuote(18);
        String session = openPortal(id);

        mvc().perform(post("/api/portal/quotation/counter")
                        .header("X-Portal-Token", session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"discountPct\":28}"))
                .andExpect(status().isOk());

        // Visible on the list, without opening the quotation that received it.
        mvc().perform(get("/api/quotations").header("Authorization", tokens.bearer(REP)))
                .andExpect(jsonPath("$[?(@.id == " + id + ")].customerCountered",
                        contains(true)));

        // Frozen: the rep cannot simply edit their way out of the customer's number.
        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":4,\"quantity\":1}"))
                .andExpect(status().isConflict());

        mvc().perform(post("/api/quotations/" + id + "/revise")
                        .header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("DRAFT"))
                // nothing is signed off any more, so the baseline goes with it
                .andExpect(jsonPath("$.approvedBaselineScore").value(nullValue()));

        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":4,\"quantity\":1}"))
                .andExpect(status().isOk());

        // The customer's open session is dead rather than showing terms that are gone.
        mvc().perform(get("/api/portal/quotation").header("X-Portal-Token", session))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("A confirmed deal cannot be quietly rewritten")
    void confirmedCannotBeRevised() throws Exception {
        long id = approvedQuote(18);
        String session = openPortal(id);
        mvc().perform(post("/api/portal/quotation/confirm").header("X-Portal-Token", session))
                .andExpect(status().isOk());

        mvc().perform(post("/api/quotations/" + id + "/revise")
                        .header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("cannot be revised")));
    }

    @Test
    @DisplayName("A draft is already open, and another rep's quotation is not yours to pull")
    void reviseIsRefusedWhereItMakesNoSense() throws Exception {
        String created = mvc().perform(post("/api/quotations")
                        .header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long draft = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + draft + "/revise")
                        .header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("already open")));

        long mine = approvedQuote(18);
        mvc().perform(post("/api/quotations/" + mine + "/revise")
                        .header("Authorization", tokens.bearer(4)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Approving a counter hands the deal back to the customer, not to the rep")
    void anApprovedCounterReturnsToTheCustomer() throws Exception {
        long id = approvedQuote(18);
        String session = openPortal(id);

        mvc().perform(post("/api/portal/quotation/counter")
                        .header("X-Portal-Token", session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"discountPct\":30}"))
                .andExpect(status().isOk());
        assertThat(stageOf(id)).isEqualTo("PENDING_APPROVAL");

        // While it is with the team the customer waits rather than acts.
        mvc().perform(get("/api/portal/quotation").header("X-Portal-Token", session))
                .andExpect(jsonPath("$.status").value("PENDING_APPROVAL"))
                .andExpect(jsonPath("$.canConfirm").value(false));

        long approvalId = openApprovalOn(id);
        decide(approvalId, MANAGER);
        if ("PENDING_APPROVAL".equals(stageOf(id))) {
            decide(approvalId, FINANCE);
        }

        // Back to SENT, not APPROVED: they proposed these terms and are the only
        // person who can accept them. Landing on APPROVED stranded them -- the portal
        // had no screen for that status and confirm answered 409.
        assertThat(stageOf(id)).isEqualTo("SENT");
        mvc().perform(get("/api/portal/quotation").header("X-Portal-Token", session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SENT"))
                .andExpect(jsonPath("$.canConfirm").value(true));

        mvc().perform(post("/api/portal/quotation/confirm").header("X-Portal-Token", session))
                .andExpect(status().isOk());
        assertThat(stageOf(id)).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("A quotation never sent still lands on APPROVED, waiting for the rep")
    void anApprovalTheRepRaisedWaitsForTheRep() throws Exception {
        // approvedQuote confirms and clears the chain without ever sending it.
        long id = approvedQuote(18);
        assertThat(stageOf(id)).isEqualTo("APPROVED");
    }

    /** The open approval on a quotation, read the way the screen reads it. */
    private long openApprovalOn(long quotationId) throws Exception {
        String body = mvc().perform(get("/api/quotations/" + quotationId)
                        .header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.openApprovalId")).longValue();
    }
}
