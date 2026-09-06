package com.dealflow.crm;

import com.dealflow.TestTokens;
import com.dealflow.TestcontainersConfiguration;

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
 * A rep meets a new company mid-quote and has to be able to add it.
 *
 * <p>The interesting part is the id. V1 declared customer.id as a plain bigint primary
 * key, so before V20 there was nothing to hand out the next one and a customer could only
 * arrive through a seed file.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class CustomerCreateTest {

    private static final long REP = 1;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private TestTokens tokens;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            // No defaultRequest here on purpose: it would merge an Authorization header
            // into every call, including the one that has to arrive without one.
            mvc = MockMvcBuilders.webAppContextSetup(context)
                    .apply(springSecurity())
                    .build();
        }
        return mvc;
    }

    private static String body(String name, String tier, String phone) {
        return "{\"name\":\"" + name + "\",\"tier\":\"" + tier + "\",\"phone\":\"" + phone + "\"}";
    }

    @Test
    @DisplayName("a rep creates a customer, and the tier ceiling comes back joined")
    void createsWithCeiling() throws Exception {
        mvc().perform(post("/api/customers").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Vertex Systems", "SILVER", "9812345678")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Vertex Systems"))
                .andExpect(jsonPath("$.tier").value("SILVER"))
                .andExpect(jsonPath("$.phone").value("9812345678"))
                // Joined from customer_tier, never stored on the customer row.
                .andExpect(jsonPath("$.tierCeilingPct").value(comparesEqualTo(10.0)))
                // V20 starts the sequence at 100 so the seeded 1..3 stay put.
                .andExpect(jsonPath("$.id", greaterThanOrEqualTo(100)));
    }

    @Test
    @DisplayName("the new customer is in the list the quote builder reads")
    void appearsInTheList() throws Exception {
        mvc().perform(post("/api/customers").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Halcyon Foods", "GOLD", "9800000001")))
                .andExpect(status().isCreated());

        mvc().perform(get("/api/customers").header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", hasItem("Halcyon Foods")))
                // The seeded three are untouched, which is what starting at 100 buys.
                .andExpect(jsonPath("$[?(@.id == 1)].name", hasItem("Acme Corp")));
    }

    @Test
    @DisplayName("the three columns are all required, and each names its own field")
    void validatesEveryColumn() throws Exception {
        mvc().perform(post("/api/customers").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("   ", "BRONZE", "9812345678")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("name"));

        mvc().perform(post("/api/customers").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Nameless Tier", "PLATINUM", "9812345678")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("tier"));

        // Not a length rule: "n/a" fits the column and is still not a phone number.
        mvc().perform(post("/api/customers").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("No Phone Ltd", "BRONZE", "n/a")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("phone"));
    }

    @Test
    @DisplayName("a name longer than the column is refused rather than truncated")
    void refusesAnOversizeName() throws Exception {
        mvc().perform(post("/api/customers").header("Authorization", tokens.bearer(REP))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("N".repeat(161), "BRONZE", "9812345678")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("name"));
    }

    @Test
    @DisplayName("a stranger cannot add a customer")
    void refusesAnonymous() throws Exception {
        mvc().perform(post("/api/customers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Walk In", "BRONZE", "9812345678")))
                .andExpect(status().isUnauthorized());
    }
}
