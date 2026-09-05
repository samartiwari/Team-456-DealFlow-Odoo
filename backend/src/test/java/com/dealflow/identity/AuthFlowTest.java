package com.dealflow.identity;

import com.dealflow.TestTokens;
import com.dealflow.TestcontainersConfiguration;
import com.dealflow.identity.security.JwtService;

import com.jayway.jsonpath.JsonPath;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A1, and the wall between the two realms.
 *
 * <p>Deliberately builds MockMvc without a default identity, unlike every other test class
 * here: this is the one place where being anonymous is the thing under test.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class AuthFlowTest {

    private static final String PASSWORD = "demo1234";

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private TestTokens tokens;

    @Autowired
    private JwtService jwt;

    private MockMvc mvc;

    private MockMvc mvc() {
        if (mvc == null) {
            mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        }
        return mvc;
    }

    private String login(String email) throws Exception {
        String body = mvc().perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.<String>read(body, "$.token");
    }

    @Test
    @DisplayName("GATE 3: every seeded account signs in and is told who it is")
    void allSeededAccountsSignIn() throws Exception {
        record Account(String email, String name, String role) {}
        List<Account> accounts = List.of(
                new Account("rep@dealflow.test", "Rep One", "REP"),
                new Account("manager@dealflow.test", "Meera Manager", "MANAGER"),
                new Account("finance@dealflow.test", "Farid Finance", "FINANCE"),
                new Account("priya@dealflow.test", "Priya Rao", "REP"),
                new Account("arjun@dealflow.test", "Arjun Mehta", "REP"),
                new Account("nina@dealflow.test", "Nina Desai", "REP"));

        for (Account a : accounts) {
            mvc().perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"" + a.email() + "\",\"password\":\"" + PASSWORD + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.token").isString())
                    .andExpect(jsonPath("$.expiresAt").isString())
                    .andExpect(jsonPath("$.user.name").value(a.name()))
                    .andExpect(jsonPath("$.user.role").value(a.role()))
                    .andExpect(jsonPath("$.user.email").value(a.email()))
                    // a password, or anything resembling one, must never come back
                    .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                    .andExpect(jsonPath("$.user.password").doesNotExist());
        }
    }

    @Test
    @DisplayName("A wrong password and an unknown email are indistinguishable")
    void loginDoesNotRevealWhoHasAnAccount() throws Exception {
        String wrongPassword = mvc().perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"rep@dealflow.test\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        String noSuchUser = mvc().perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ghost@dealflow.test\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getContentAsString();

        // Different wording here is how a login form leaks a list of its users.
        assertThat(JsonPath.<String>read(wrongPassword, "$.message"))
                .isEqualTo(JsonPath.read(noSuchUser, "$.message"));
    }

    @Test
    @DisplayName("Nothing else is reachable without a token")
    void everythingElseNeedsAToken() throws Exception {
        mvc().perform(get("/api/quotations")).andExpect(status().isUnauthorized());
        mvc().perform(get("/api/products")).andExpect(status().isUnauthorized());
        mvc().perform(get("/api/auth/me")).andExpect(status().isUnauthorized());

        mvc().perform(get("/api/quotations").header("Authorization", tokens.bearer(1)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("A tampered or forged token is refused")
    void signaturesAreChecked() throws Exception {
        String good = tokens.bearer(1);

        mvc().perform(get("/api/quotations").header("Authorization", "Bearer nonsense"))
                .andExpect(status().isUnauthorized());
        mvc().perform(get("/api/quotations").header("Authorization", "Bearer a.b.c"))
                .andExpect(status().isUnauthorized());
        // one character of the signature changed
        mvc().perform(get("/api/quotations")
                        .header("Authorization", good.substring(0, good.length() - 1)
                                + (good.endsWith("A") ? "B" : "A")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("A real portal token is refused on every internal path")
    void aPortalTokenCannotReachTheStaffRealm() throws Exception {
        // The brief asks for exactly this test, so it uses a genuine portal session rather
        // than a string that looks like one: send a quotation to a customer, open the link,
        // and try the resulting credential against the staff realm.
        String rep = login("rep@dealflow.test");
        String created = mvc().perform(post("/api/quotations").header("Authorization", rep)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + id + "/lines").header("Authorization", rep)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"productId\":1,\"quantity\":1,\"discountPct\":0}"));
        mvc().perform(post("/api/quotations/" + id + "/confirm").header("Authorization", rep))
                .andExpect(jsonPath("$.quotation.stage").value("APPROVED"));

        String sent = mvc().perform(post("/api/quotations/" + id + "/send")
                        .header("Authorization", rep))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String url = JsonPath.read(sent, "$.portalUrl");
        String link = url.substring(url.indexOf("token=") + 6);

        String verified = mvc().perform(post("/api/portal/auth/verify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + link + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String portalToken = JsonPath.read(verified, "$.portalToken");

        // It works where it belongs...
        mvc().perform(get("/api/portal/quotation").header("X-Portal-Token", portalToken))
                .andExpect(status().isOk());

        // ...and nowhere else, however it is presented.
        for (String path : List.of("/api/quotations", "/api/products", "/api/approvals",
                "/api/reports", "/api/dashboard/health", "/api/invoices")) {
            mvc().perform(get(path).header("Authorization", "Bearer " + portalToken))
                    .andExpect(status().isUnauthorized());
            mvc().perform(get(path).header("X-Portal-Token", portalToken))
                    .andExpect(status().isUnauthorized());
        }

        // and a staff token is equally useless to the customer
        mvc().perform(get("/api/portal/quotation").header("X-Portal-Token",
                        login("manager@dealflow.test").substring(7)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Identity comes from the token, and a query string cannot override it")
    void theQueryStringNoLongerGrantsAnything() throws Exception {
        String rep = login("rep@dealflow.test");

        // Reporting is manager-only. Asking to be user 2 in the URL is exactly what used
        // to work, and is exactly what this phase removes.
        mvc().perform(get("/api/reports?userId=2").header("Authorization", rep))
                .andExpect(status().isForbidden());
        mvc().perform(get("/api/dashboard/health?userId=2").header("Authorization", rep))
                .andExpect(status().isForbidden());

        mvc().perform(get("/api/reports").header("Authorization", login("manager@dealflow.test")))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("me answers from the token, which is how a client checks a session is live")
    void meReflectsTheToken() throws Exception {
        mvc().perform(get("/api/auth/me").header("Authorization", login("finance@dealflow.test")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Farid Finance"))
                .andExpect(jsonPath("$.role").value("FINANCE"));
    }

    @Test
    @DisplayName("Signing up creates a rep, and only a rep")
    void signupAlwaysCreatesARep() throws Exception {
        String email = "new-" + System.nanoTime() + "@dealflow.test";

        mvc().perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"New Joiner\",\"email\":\"" + email
                                + "\",\"password\":\"longenough1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("REP"))
                .andExpect(jsonPath("$.token").isString());

        mvc().perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Someone Else\",\"email\":\"" + email
                                + "\",\"password\":\"longenough1\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Signup validates before it creates anything")
    void signupIsValidated() throws Exception {
        mvc().perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"email\":\"short@dealflow.test\",\"password\":\"short\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("password"));

        mvc().perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"email\":\"not-an-email\",\"password\":\"longenough1\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("email"));
    }

    @Test
    @DisplayName("The portal still works, and does not want a bearer token")
    void theCustomerRealmIsUntouched() throws Exception {
        // No Authorization header anywhere here: the portal chain matches first and its
        // credential is the session token it mints for itself.
        mvc().perform(get("/api/portal/quotation"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message", containsStringIgnoringCase("portal session")));

        mvc().perform(post("/api/portal/auth/verify").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"not-a-real-link\"}"))
                .andExpect(status().isUnauthorized());
    }
}
