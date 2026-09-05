package com.dealflow.allocation;

import com.dealflow.TestTokens;
import com.dealflow.TestcontainersConfiguration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Walks the allocation endpoints against a real Postgres, so the split, the guards and the
 * stock reservation are covered by something other than a person running curl.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class AllocationFlowTest {

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

    /** Creates an approved quotation for the given number of laptops. */
    private long approvedLaptopQuote(int quantity) throws Exception {
        String created = mvc().perform(post("/api/quotations").header("Authorization", tokens.bearer(1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":1}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        long id = Long.parseLong(created.replaceAll("^\\{\"id\":(\\d+).*$", "$1"));

        mvc().perform(post("/api/quotations/" + id + "/lines").header("Authorization", tokens.bearer(1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":1,\"quantity\":" + quantity + ",\"discountPct\":12}"))
                .andExpect(status().isOk());

        // 12% is inside Hardware's 15% ceiling, so this auto-approves with no chain.
        mvc().perform(post("/api/quotations/" + id + "/confirm").header("Authorization", tokens.bearer(1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quotation.stage").value("APPROVED"));

        return id;
    }

    @Test
    @DisplayName("Six laptops split across both warehouses, cheapest first")
    void suggestsTheSplit() throws Exception {
        long id = approvedLaptopQuote(6);

        mvc().perform(get("/api/quotations/" + id + "/allocation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUGGESTED"))
                .andExpect(jsonPath("$.shipmentCount").value(2))
                .andExpect(jsonPath("$.lines", hasSize(2)))
                .andExpect(jsonPath("$.backorders", hasSize(0)));
    }

    @Test
    @DisplayName("A draft quotation cannot be allocated")
    void draftIsRejected() throws Exception {
        String created = mvc().perform(post("/api/quotations").header("Authorization", tokens.bearer(1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long id = Long.parseLong(created.replaceAll("^\\{\"id\":(\\d+).*$", "$1"));

        mvc().perform(get("/api/quotations/" + id + "/allocation"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("approved")));
    }

    @Test
    @DisplayName("Accepting reserves stock, so the same units cannot be promised twice")
    void acceptingReservesStock() throws Exception {
        long first = approvedLaptopQuote(6);
        mvc().perform(post("/api/quotations/" + first + "/allocation").header("Authorization", tokens.bearer(1))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"));

        // 8 laptops existed; 6 are now committed, so a second order for 6 cannot be filled.
        long second = approvedLaptopQuote(6);
        mvc().perform(get("/api/quotations/" + second + "/allocation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.backorders", hasSize(greaterThan(0))));
    }

    @Test
    @DisplayName("An override that does not add up is refused")
    void overrideMustAddUp() throws Exception {
        long id = approvedLaptopQuote(6);

        mvc().perform(post("/api/quotations/" + id + "/allocation").header("Authorization", tokens.bearer(1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lines\":[{\"productId\":1,\"warehouseId\":1,\"quantity\":2}]}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("lines"));
    }

    @Test
    @DisplayName("Services and subscriptions are never allocated to a warehouse")
    void onlyPhysicalGoodsAreAllocated() throws Exception {
        String created = mvc().perform(post("/api/quotations").header("Authorization", tokens.bearer(1))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"customerId\":1}"))
                .andReturn().getResponse().getContentAsString();
        long id = Long.parseLong(created.replaceAll("^\\{\"id\":(\\d+).*$", "$1"));

        // Laptop Pro is Hardware; Setup Service is Services; Support Plan is Subscriptions.
        for (String line : new String[] {
                "{\"productId\":1,\"quantity\":2,\"discountPct\":10}",
                "{\"productId\":2,\"quantity\":1,\"discountPct\":5}",
                "{\"productId\":3,\"quantity\":4,\"discountPct\":5}" }) {
            mvc().perform(post("/api/quotations/" + id + "/lines").header("Authorization", tokens.bearer(1))
                    .contentType(MediaType.APPLICATION_JSON).content(line)).andExpect(status().isOk());
        }
        mvc().perform(post("/api/quotations/" + id + "/confirm").header("Authorization", tokens.bearer(1)))
                .andExpect(jsonPath("$.quotation.stage").value("APPROVED"));

        mvc().perform(get("/api/quotations/" + id + "/allocation"))
                .andExpect(status().isOk())
                // only the laptops are shipped -- one row, not three
                .andExpect(jsonPath("$.lines", hasSize(1)))
                .andExpect(jsonPath("$.lines[0].productName").value("Laptop Pro"))
                .andExpect(jsonPath("$.lines[0].quantity").value(2))
                .andExpect(jsonPath("$.backorders", hasSize(0)))
                .andExpect(jsonPath("$.shipmentCount").value(1))
                // Cost counts 2 shipped units, not 7. Which warehouse serves depends on what
                // earlier tests consumed, so assert the band rather than an exact figure:
                // 2 units is at most 500 + 1.4x2 = 502.80, while 7 would be at least 507.
                .andExpect(jsonPath("$.estimatedCost").value(lessThan(505.0)));
    }

    @Test
    @DisplayName("Accepting the same allocation twice is refused")
    void cannotAcceptTwice() throws Exception {
        long id = approvedLaptopQuote(2);

        mvc().perform(post("/api/quotations/" + id + "/allocation").header("Authorization", tokens.bearer(1))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());

        mvc().perform(post("/api/quotations/" + id + "/allocation").header("Authorization", tokens.bearer(1))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict());
    }
}
