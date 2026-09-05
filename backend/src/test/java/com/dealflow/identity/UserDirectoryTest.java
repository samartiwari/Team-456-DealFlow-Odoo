package com.dealflow.identity;

import com.dealflow.TestTokens;
import com.dealflow.TestcontainersConfiguration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * The rep filter on the reporting screen has to get its names from somewhere.
 *
 * <p>Seeded staff: 1 Rep One, 2 Meera Manager, 3 Farid Finance, then 4 Priya Rao, 5 Arjun
 * Mehta and 6 Nina Desai, who are the reps the demo history is spread across.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class UserDirectoryTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    private static final long FINANCE = 3;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private TestTokens tokens;

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

    @Test
    @DisplayName("role=REP returns the reps the history is spread across, and only reps")
    void filtersByRole() throws Exception {
        // Counted loosely on purpose: signup creates reps, and another test in this run may
        // already have made one. What matters is that the filter holds and the seeded four
        // are all there for the report's dropdown.
        mvc().perform(get("/api/users").param("role", "REP"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].role", everyItem(is("REP"))))
                .andExpect(jsonPath("$[*].name", hasItems("Rep One", "Priya Rao",
                        "Arjun Mehta", "Nina Desai")))
                .andExpect(jsonPath("$[*].name", not(hasItem("Meera Manager"))));
    }

    @Test
    @DisplayName("no filter lists everybody, and never a password")
    void unfilteredListsEveryone() throws Exception {
        String body = mvc().perform(get("/api/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name", hasItems("Rep One", "Meera Manager",
                        "Farid Finance")))
                .andExpect(jsonPath("$[*].role", hasItems("REP", "MANAGER", "FINANCE")))
                .andReturn().getResponse().getContentAsString();

        // The response is built from a record with four components; this is the check that
        // nobody widens it later into something that carries a hash.
        org.assertj.core.api.Assertions.assertThat(body)
                .doesNotContain("passwordHash").doesNotContain("password");
    }

    @Test
    @DisplayName("finance may read it, a rep may not")
    void closedToReps() throws Exception {
        mvc().perform(get("/api/users").header("Authorization", tokens.bearer(FINANCE)))
                .andExpect(status().isOk());

        mvc().perform(get("/api/users").header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isForbidden());

        mvc().perform(get("/api/users"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unknown role is refused rather than quietly returning everybody")
    void unknownRoleIsRefused() throws Exception {
        mvc().perform(get("/api/users").param("role", "SUPERVISOR"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("role"));
    }

    @Test
    @DisplayName("all five roles are real, and each is separately addressable")
    void everyRoleIsItsOwn() throws Exception {
        for (String role : new String[]{"REP", "MANAGER", "FINANCE", "ADMIN", "OPERATIONS"}) {
            mvc().perform(get("/api/users").param("role", role))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$", not(empty())))
                    .andExpect(jsonPath("$[*].role", everyItem(is(role))));
        }
    }
}
