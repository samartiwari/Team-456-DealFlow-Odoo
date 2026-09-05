package com.dealflow.analytics;

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

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * A7, over the seeded ninety days.
 *
 * <p>The claim worth testing is not that a filter narrows a list -- it is that the PDF and
 * the table cannot disagree. Both are built from one {@code ReportQuery} handed to one
 * service, and the tests below check the two outputs against each other rather than each
 * against a fixed expectation, so the assertion survives the seed changing.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class ReportFlowTest {

    private static final long REP = 1;
    private static final long MANAGER = 2;
    private static final long FINANCE = 3;
    private static final long PRIYA = 4;

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

    /**
     * The filter strings begin with "&" because they used to follow a userId parameter.
     * Normalised here rather than at a dozen call sites.
     */
    private String report(String query) throws Exception {
        String q = query.isEmpty() ? "" : "?" + query.substring(1);
        return mvc().perform(get("/api/reports" + q)
                        .header("Authorization", tokens.bearer(MANAGER)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private byte[] pdf(String query) throws Exception {
        return mvc().perform(get("/api/reports/export?format=pdf" + query)
                        .header("Authorization", tokens.bearer(MANAGER)))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andReturn().getResponse().getContentAsByteArray();
    }

    private byte[] xlsx(String query) throws Exception {
        return mvc().perform(get("/api/reports/export?format=xlsx" + query)
                        .header("Authorization", tokens.bearer(MANAGER)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        containsString("dealflow-report.xlsx")))
                .andReturn().getResponse().getContentAsByteArray();
    }

    @Test
    @DisplayName("An unfiltered report covers the whole seeded history")
    void everythingByDefault() throws Exception {
        mvc().perform(get("/api/reports").header("Authorization", tokens.bearer(MANAGER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows", hasSize(greaterThan(40))))
                .andExpect(jsonPath("$.totals.count", greaterThan(40)))
                .andExpect(jsonPath("$.totals.revenue", greaterThan(0.0)))
                .andExpect(jsonPath("$.rows[0].ref").value(startsWith("Q-")))
                .andExpect(jsonPath("$.rows[0].repName").isString())
                // the filters come back so the screen can show what it asked for
                .andExpect(jsonPath("$.query.repId").doesNotExist())
                // and nothing the client's type does not declare
                .andExpect(jsonPath("$.query.empty").doesNotExist());
    }

    @Test
    @DisplayName("The four filters narrow, and combine")
    void filtersCombine() throws Exception {
        int all = JsonPath.read(report(""), "$.totals.count");
        int byRep = JsonPath.read(report("&repId=" + PRIYA), "$.totals.count");
        int confirmed = JsonPath.read(report("&status=CONFIRMED"), "$.totals.count");
        int both = JsonPath.read(report("&repId=" + PRIYA + "&status=CONFIRMED"), "$.totals.count");

        assertThat(byRep).isPositive().isLessThan(all);
        assertThat(confirmed).isPositive().isLessThan(all);
        assertThat(both)
                .as("combining filters is an AND, so it cannot exceed either alone")
                .isLessThanOrEqualTo(Math.min(byRep, confirmed))
                .isPositive();

        mvc().perform(get("/api/reports?repId=" + PRIYA)
                        .header("Authorization", tokens.bearer(MANAGER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[*].repName", everyItem(is("Priya Rao"))))
                .andExpect(jsonPath("$.query.repId").value((int) PRIYA));
    }

    @Test
    @DisplayName("A period includes the day it ends on")
    void theEndOfThePeriodIsInclusive() throws Exception {
        // A report "to the 6th" that quietly excluded the 6th is the kind of bug nobody
        // notices until a month-end total comes up short.
        String today = java.time.LocalDate.now().toString();
        int upToToday = JsonPath.read(report("&to=" + today), "$.totals.count");
        int all = JsonPath.read(report(""), "$.totals.count");

        assertThat(upToToday).isEqualTo(all);
    }

    @Test
    @DisplayName("The PDF is a real PDF, and says the same as the table")
    void theExportCannotDisagreeWithTheScreen() throws Exception {
        for (String query : List.of("", "&repId=" + PRIYA, "&status=CONFIRMED",
                "&repId=" + PRIYA + "&status=CONFIRMED")) {

            String json = report(query);
            int count = JsonPath.read(json, "$.totals.count");
            double revenue = ((Number) JsonPath.read(json, "$.totals.revenue")).doubleValue();

            byte[] bytes = pdf(query);
            String text = new String(bytes, StandardCharsets.ISO_8859_1);

            assertThat(text).startsWith("%PDF-1.4");
            assertThat(text).endsWith("%%EOF\n");
            // xref offsets are written from the real stream position; a reader needs the
            // table and the trailer to find anything at all.
            assertThat(text).contains("xref").contains("trailer").contains("startxref");

            assertThat(text)
                    .as("the PDF for %s must carry the same count as the table", query)
                    .contains(count + " quotations");
            assertThat(text)
                    .as("and the same revenue")
                    .contains(String.format("revenue %.2f", revenue));
        }
    }

    @Test
    @DisplayName("Long reports run to more than one page")
    void thePdfPaginates() throws Exception {
        String text = new String(pdf(""), StandardCharsets.ISO_8859_1);

        int pages = text.split("/Type /Page[^s]", -1).length - 1;
        assertThat(pages)
                .as("forty-odd rows do not fit on one page, and a single overflowing page "
                        + "would silently lose the rows past the bottom")
                .isGreaterThan(1);
        assertThat(text).contains("/Count " + pages);
    }

    @Test
    @DisplayName("Reporting is for managers and finance, not reps")
    void reportingIsRoleGated() throws Exception {
        mvc().perform(get("/api/reports").header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isForbidden());
        mvc().perform(get("/api/reports/export").param("format", "pdf")
                        .header("Authorization", tokens.bearer(REP)))
                .andExpect(status().isForbidden());
        mvc().perform(get("/api/reports").header("Authorization", tokens.bearer(FINANCE)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("The spreadsheet is a real xlsx, and says the same as the table")
    void theSpreadsheetAlsoCannotDisagree() throws Exception {
        for (String query : List.of("", "&repId=" + PRIYA, "&status=CONFIRMED")) {
            String json = report(query);
            int count = JsonPath.read(json, "$.totals.count");
            double revenue = ((Number) JsonPath.read(json, "$.totals.revenue")).doubleValue();

            byte[] bytes = xlsx(query);

            // A zip, by its local file header -- so a spreadsheet application will open it
            // rather than being handed XML with an optimistic file extension.
            assertThat(bytes[0]).isEqualTo((byte) 'P');
            assertThat(bytes[1]).isEqualTo((byte) 'K');

            Map<String, String> parts = unzip(bytes);
            assertThat(parts).containsKeys("[Content_Types].xml", "_rels/.rels",
                    "xl/workbook.xml", "xl/_rels/workbook.xml.rels",
                    "xl/worksheets/sheet1.xml");

            String sheet = parts.get("xl/worksheets/sheet1.xml");
            assertThat(sheet)
                    .as("the sheet for %s carries the same count as the table", query)
                    .contains(">" + count + " quotations<");
            assertThat(sheet)
                    .as("and the same revenue, as a number rather than text")
                    .contains("<v>" + BigDecimal.valueOf(revenue).setScale(2).toPlainString() + "</v>");

            // One row per quotation, plus the title, filter line, header and totals.
            assertThat(sheet.split("<row ").length - 1).isEqualTo(count + 4);
        }
    }

    /** Reads the parts back out, which is also the check that the zip is well-formed. */
    private static Map<String, String> unzip(byte[] bytes) throws Exception {
        Map<String, String> parts = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry e = zip.getNextEntry(); e != null; e = zip.getNextEntry()) {
                parts.put(e.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        return parts;
    }

    @Test
    @DisplayName("Bad input is refused rather than quietly ignored")
    void inputIsValidated() throws Exception {
        mvc().perform(get("/api/reports").header("Authorization", tokens.bearer(MANAGER))
                        .param("from", "2026-09-01").param("to", "2026-08-01"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("from"));

        mvc().perform(get("/api/reports").header("Authorization", tokens.bearer(MANAGER))
                        .param("status", "NOT_A_STAGE"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("status"));

        mvc().perform(get("/api/reports").header("Authorization", tokens.bearer(MANAGER))
                        .param("from", "yesterday"))
                .andExpect(status().isUnprocessableEntity());

        // An unknown format is refused rather than silently served as a PDF.
        mvc().perform(get("/api/reports/export").param("format", "csv")
                        .header("Authorization", tokens.bearer(MANAGER)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.field").value("format"));
    }

    @Test
    @DisplayName("A filter that matches nothing is an empty report, not an error")
    void nothingMatchingIsStillAReport() throws Exception {
        mvc().perform(get("/api/reports").header("Authorization", tokens.bearer(MANAGER))
                        .param("from", "2000-01-01").param("to", "2000-01-02"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows", hasSize(0)))
                .andExpect(jsonPath("$.totals.count").value(0))
                .andExpect(jsonPath("$.totals.averageMarginPct").value(0));
    }
}
