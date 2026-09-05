package com.dealflow.analytics.service;

import com.dealflow.analytics.dto.ReportResultResponse;
import com.dealflow.analytics.dto.ReportRowResponse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.stereotype.Component;

/**
 * The same report, as a spreadsheet.
 *
 * <p>Hand-written for the same reason the PDF is: an xlsx is a zip of a handful of XML
 * parts, and writing them costs less than carrying a spreadsheet library for one endpoint.
 *
 * <p>The important property is not the format. It is that this takes the identical
 * {@link ReportResultResponse} the screen rendered, so an export cannot disagree with what
 * it was exported from -- which is the whole reason the spec puts one query object behind
 * the table and both exports.
 *
 * <p>Numbers are written as numbers, not text. A spreadsheet whose figures arrive as
 * strings cannot be summed, which defeats the point of choosing this format over the PDF.
 */
@Component
public class XlsxReportWriter {

    private static final String[] HEADERS = {
            "Reference", "Customer", "Rep", "Stage", "Discount %", "Subtotal",
            "Margin %", "Risk", "Created"
    };

    public byte[] write(ReportResultResponse report) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            put(zip, "[Content_Types].xml", contentTypes());
            put(zip, "_rels/.rels", rootRels());
            put(zip, "xl/workbook.xml", workbook());
            put(zip, "xl/_rels/workbook.xml.rels", workbookRels());
            put(zip, "xl/worksheets/sheet1.xml", sheet(report));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write the spreadsheet.", e);
        }
        return out.toByteArray();
    }

    private static void put(ZipOutputStream zip, String name, String body) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(body.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static String contentTypes() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                </Types>
                """;
    }

    private static String rootRels() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                </Relationships>
                """;
    }

    private static String workbook() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
                          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                  <sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>
                </workbook>
                """;
    }

    private static String workbookRels() {
        return """
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                </Relationships>
                """;
    }

    private static String sheet(ReportResultResponse report) {
        StringBuilder xml = new StringBuilder();
        xml.append("""
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                  <sheetData>
                """);

        int row = 1;

        // The filters that produced this, so a saved file still says what it is.
        xml.append(textRow(row++, List.of("DealFlow360 report")));
        xml.append(textRow(row++, List.of(describe(report))));
        row++;

        xml.append(textRow(row++, List.of(HEADERS)));

        for (ReportRowResponse r : report.rows()) {
            xml.append("<row r=\"").append(row).append("\">");
            xml.append(text(row, 1, r.ref()));
            xml.append(text(row, 2, r.customerName()));
            xml.append(text(row, 3, r.repName()));
            xml.append(text(row, 4, r.stage()));
            xml.append(number(row, 5, r.orderDiscountPct()));
            xml.append(number(row, 6, r.subtotal()));
            xml.append(number(row, 7, r.marginPct()));
            xml.append(number(row, 8, BigDecimal.valueOf(r.riskScore())));
            xml.append(text(row, 9, r.createdAt()));
            xml.append("</row>");
            row++;
        }

        row++;
        ReportResultResponse.Totals t = report.totals();
        xml.append("<row r=\"").append(row).append("\">");
        xml.append(text(row, 1, "Totals"));
        xml.append(text(row, 2, t.count() + " quotations"));
        xml.append(number(row, 5, t.averageDiscountPct()));
        xml.append(number(row, 6, t.revenue()));
        xml.append(number(row, 7, t.averageMarginPct()));
        xml.append("</row>");

        xml.append("</sheetData></worksheet>");
        return xml.toString();
    }

    private static String describe(ReportResultResponse report) {
        var q = report.query();
        if (q.hasNoFilters()) {
            return "All quotations";
        }
        StringBuilder said = new StringBuilder();
        if (q.from() != null) {
            said.append("from ").append(q.from()).append(' ');
        }
        if (q.to() != null) {
            said.append("to ").append(q.to()).append(' ');
        }
        if (q.repId() != null) {
            said.append("rep ").append(q.repId()).append(' ');
        }
        if (q.status() != null) {
            said.append("status ").append(q.status()).append(' ');
        }
        if (q.categoryId() != null) {
            said.append("category ").append(q.categoryId());
        }
        return said.toString().trim();
    }

    private static String textRow(int row, List<String> values) {
        StringBuilder xml = new StringBuilder("<row r=\"" + row + "\">");
        for (int i = 0; i < values.size(); i++) {
            xml.append(text(row, i + 1, values.get(i)));
        }
        return xml.append("</row>").toString();
    }

    /** Inline strings, so the file needs no shared-strings part. */
    private static String text(int row, int column, String value) {
        if (value == null) {
            return "";
        }
        return "<c r=\"" + ref(row, column) + "\" t=\"inlineStr\"><is><t>"
                + escape(value) + "</t></is></c>";
    }

    private static String number(int row, int column, BigDecimal value) {
        if (value == null) {
            return "";
        }
        return "<c r=\"" + ref(row, column) + "\"><v>" + value.toPlainString() + "</v></c>";
    }

    /** A1, B1, ... Z1, AA1. Nine columns today, but the carry is cheap to get right. */
    private static String ref(int row, int column) {
        StringBuilder name = new StringBuilder();
        int n = column;
        while (n > 0) {
            int remainder = (n - 1) % 26;
            name.insert(0, (char) ('A' + remainder));
            n = (n - 1) / 26;
        }
        return name + Integer.toString(row);
    }

    private static String escape(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
