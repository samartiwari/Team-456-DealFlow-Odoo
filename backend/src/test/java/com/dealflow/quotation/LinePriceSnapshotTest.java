package com.dealflow.quotation;

import com.dealflow.TestTokens;
import com.dealflow.TestcontainersConfiguration;

import com.jayway.jsonpath.JsonPath;

import java.math.BigDecimal;

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

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * What a catalog edit is allowed to move.
 *
 * <p>A quotation line stores no price of its own until it is confirmed, so every read
 * re-resolves it from the catalog. That is exactly right while a rep is still writing the
 * quote, and exactly wrong afterwards: once an admin can edit a price, repricing a settled
 * order would rewrite the number the customer agreed to, the margin the deal was judged on,
 * and the risk score an approval decision was taken against.
 *
 * <p>So the line is frozen at confirm, and handed back to the catalog if a manager returns
 * it for changes. The rule is one line -- editable means it follows the catalog -- and
 * these three tests are the three sides of it.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class LinePriceSnapshotTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;

    /** Laptop Pro: Hardware, base 80,000. Acme is GOLD, which has no price list. */
    private static final long LAPTOP = 1;
    private static final BigDecimal LAPTOP_BASE = new BigDecimal("80000.00");

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
                    .defaultRequest(get("/").header("Authorization", tokens.bearer(REP)))
                    .build();
        }
        return mvc;
    }

    /**
     * The catalog is shared by every test in the run, so whatever a test does to it is put
     * back before the next one reads it.
     */
    @AfterEach
    void restoreCatalog() {
        jdbc.update("update product set unit_price = ? where id = ?", LAPTOP_BASE, LAPTOP);
    }

    private void repriceLaptop(String to) {
        jdbc.update("update product set unit_price = ? where id = ?", new BigDecimal(to), LAPTOP);
    }

    /** Acme (GOLD, ceiling 15) with one Laptop Pro line at the given discount. */
    private long quote(int discountPct) throws Exception {
        String created = mvc().perform(post("/api/quotations")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"customerId\":1}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        mvc().perform(post("/api/quotations/" + id + "/lines")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":" + LAPTOP + ",\"quantity\":2,\"discountPct\":"
                                + discountPct + "}"))
                .andExpect(status().isOk());
        return id;
    }

    private double unitPriceOf(long quotationId) throws Exception {
        String body = mvc().perform(get("/api/quotations/" + quotationId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.lines[0].unitPrice")).doubleValue();
    }

    @Test
    @DisplayName("a draft follows the catalog: repricing a product moves the open quote")
    void draftTracksTheCatalog() throws Exception {
        long id = quote(12);
        org.assertj.core.api.Assertions.assertThat(unitPriceOf(id)).isEqualTo(80000.0);

        repriceLaptop("90000.00");

        // Still a draft, still the rep's to change -- so it picks up the correction. This
        // is the half of the rule that makes an admin price fix useful rather than merely
        // safe.
        org.assertj.core.api.Assertions.assertThat(unitPriceOf(id)).isEqualTo(90000.0);
    }

    @Test
    @DisplayName("a confirmed quote is frozen: repricing a product does not move it")
    void confirmFreezesThePrice() throws Exception {
        // 12% is inside Gold's 15 ceiling, so this auto-approves and needs no signature.
        long id = quote(12);
        mvc().perform(post("/api/quotations/" + id + "/confirm"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quotation.stage").value("APPROVED"));

        repriceLaptop("90000.00");

        // The deal was agreed at 80,000 and stays there. A new draft would see 90,000.
        org.assertj.core.api.Assertions.assertThat(unitPriceOf(id)).isEqualTo(80000.0);

        long fresh = quote(12);
        org.assertj.core.api.Assertions.assertThat(unitPriceOf(fresh)).isEqualTo(90000.0);
    }

    @Test
    @DisplayName("a returned quote follows the catalog again")
    void returningHandsItBackToTheCatalog() throws Exception {
        // 18% overshoots Gold's ceiling by 3, so it routes to a MANAGER rather than
        // auto-approving -- which is what gives us something to return.
        long id = quote(18);
        String confirmed = mvc().perform(post("/api/quotations/" + id + "/confirm"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quotation.stage").value("PENDING_APPROVAL"))
                .andReturn().getResponse().getContentAsString();
        long approvalId = ((Number) JsonPath.read(confirmed, "$.approvalId")).longValue();

        repriceLaptop("90000.00");

        // Frozen while it sits in front of the manager: they are judging a specific number.
        org.assertj.core.api.Assertions.assertThat(unitPriceOf(id)).isEqualTo(80000.0);

        mvc().perform(post("/api/approvals/" + approvalId + "/decide")
                        .header("Authorization", tokens.bearer(MANAGER))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"RETURN\",\"reason\":\"rework the discount\"}"))
                .andExpect(status().isOk());

        // Back in the rep's hands, so back on the catalog -- otherwise a line added now
        // would price off today's catalog while the lines beside it kept last week's.
        org.assertj.core.api.Assertions.assertThat(unitPriceOf(id)).isEqualTo(90000.0);
    }
}
