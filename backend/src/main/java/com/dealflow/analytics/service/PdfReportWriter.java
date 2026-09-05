package com.dealflow.analytics.service;

import com.dealflow.analytics.dto.ReportQuery;
import com.dealflow.analytics.dto.ReportResultResponse;
import com.dealflow.analytics.dto.ReportRowResponse;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

/**
 * Writes the report as a PDF, by hand.
 *
 * <p>No library, deliberately. A report of monospaced text needs a page tree, a font
 * resource and a content stream, which is perhaps eighty lines -- against a dependency
 * whose transitive weight and CVE surface both exceed the feature. The trade is that the
 * byte layout has to be right: the cross-reference table records the offset of every
 * object, so it is built from the actual stream position rather than a running guess.
 *
 * <p>Landscape A4, because the table has ten columns.
 */
@Component
public class PdfReportWriter {

    private static final int PAGE_WIDTH = 842;
    private static final int PAGE_HEIGHT = 595;
    private static final int MARGIN = 36;
    private static final int LINE_HEIGHT = 13;
    private static final int ROWS_PER_PAGE = 32;

    public byte[] write(ReportResultResponse report) {
        List<List<String>> pages = paginate(report);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        List<Integer> offsets = new ArrayList<>();

        // 1 catalog, 2 page tree, 3 font, then a content stream and a page per chunk.
        int firstPageObject = 4;
        int objectCount = 3 + pages.size() * 2;

        append(out, "%PDF-1.4\n");

        // 1 -- catalog
        offsets.add(out.size());
        append(out, "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

        // 2 -- page tree
        StringBuilder kids = new StringBuilder();
        for (int i = 0; i < pages.size(); i++) {
            kids.append(firstPageObject + i * 2 + 1).append(" 0 R ");
        }
        offsets.add(out.size());
        append(out, "2 0 obj\n<< /Type /Pages /Kids [" + kids.toString().trim()
                + "] /Count " + pages.size() + " >>\nendobj\n");

        // 3 -- the one font
        offsets.add(out.size());
        append(out, "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n");

        for (int i = 0; i < pages.size(); i++) {
            int contentObj = firstPageObject + i * 2;
            int pageObj = contentObj + 1;

            byte[] stream = contentStream(pages.get(i)).getBytes(StandardCharsets.ISO_8859_1);
            offsets.add(out.size());
            append(out, contentObj + " 0 obj\n<< /Length " + stream.length + " >>\nstream\n");
            out.writeBytes(stream);
            append(out, "endstream\nendobj\n");

            offsets.add(out.size());
            append(out, pageObj + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "
                    + PAGE_WIDTH + " " + PAGE_HEIGHT + "]"
                    + " /Resources << /Font << /F1 3 0 R >> >>"
                    + " /Contents " + contentObj + " 0 R >>\nendobj\n");
        }

        int xrefAt = out.size();
        StringBuilder xref = new StringBuilder("xref\n0 " + (objectCount + 1) + "\n");
        xref.append("0000000000 65535 f \n");
        for (int offset : offsets) {
            xref.append(String.format("%010d 00000 n %n", offset).replace(System.lineSeparator(), "\n"));
        }
        append(out, xref.toString());
        append(out, "trailer\n<< /Size " + (objectCount + 1) + " /Root 1 0 R >>\nstartxref\n"
                + xrefAt + "\n%%EOF\n");

        return out.toByteArray();
    }

    /** Every line of the document, split into pages. */
    private List<List<String>> paginate(ReportResultResponse report) {
        List<String> header = new ArrayList<>();
        header.add("DealFlow360 -- quotation report");
        header.add(describe(report.query()));
        header.add("");
        header.add(String.format("%-9s %-18s %-14s %-18s %12s %8s %8s %6s",
                "REF", "CUSTOMER", "REP", "STAGE", "SUBTOTAL", "DISC%", "MARGIN%", "RISK"));
        header.add("-".repeat(104));

        List<List<String>> pages = new ArrayList<>();
        List<String> current = new ArrayList<>(header);

        for (ReportRowResponse r : report.rows()) {
            if (current.size() - header.size() >= ROWS_PER_PAGE) {
                pages.add(current);
                current = new ArrayList<>(header);
            }
            current.add(String.format("%-9s %-18s %-14s %-18s %12s %8s %8s %6d",
                    r.ref(), clip(r.customerName(), 18), clip(r.repName(), 14),
                    clip(r.stage(), 18), r.subtotal().toPlainString(),
                    r.orderDiscountPct().toPlainString(), r.marginPct().toPlainString(),
                    r.riskScore()));
        }

        current.add("-".repeat(104));
        current.add(String.format("%d quotations   revenue %s   average discount %s%%   average margin %s%%",
                report.totals().count(), report.totals().revenue().toPlainString(),
                report.totals().averageDiscountPct().toPlainString(),
                report.totals().averageMarginPct().toPlainString()));
        pages.add(current);
        return pages;
    }

    /** The filters, in the same words the screen shows above the table. */
    private static String describe(ReportQuery q) {
        if (q == null || q.hasNoFilters()) {
            return "All quotations";
        }
        List<String> parts = new ArrayList<>();
        if (q.from() != null || q.to() != null) {
            parts.add((q.from() == null ? "up to" : q.from())
                    + (q.to() == null ? " onwards" : " to " + q.to()));
        }
        if (q.repId() != null) {
            parts.add("rep " + q.repId());
        }
        if (q.status() != null) {
            parts.add("stage " + q.status());
        }
        if (q.categoryId() != null) {
            parts.add("category " + q.categoryId());
        }
        return String.join("  ·  ", parts);
    }

    private static String contentStream(List<String> lines) {
        StringBuilder sb = new StringBuilder("BT\n/F1 8 Tf\n");
        sb.append(LINE_HEIGHT).append(" TL\n");
        sb.append("1 0 0 1 ").append(MARGIN).append(' ').append(PAGE_HEIGHT - MARGIN).append(" Tm\n");
        for (String line : lines) {
            sb.append('(').append(escape(line)).append(") Tj T*\n");
        }
        sb.append("ET\n");
        return sb.toString();
    }

    /** Parentheses and backslashes end a PDF string early if they are not escaped. */
    private static String escape(String text) {
        StringBuilder sb = new StringBuilder(text.length());
        for (char c : text.toCharArray()) {
            if (c == '(' || c == ')' || c == '\\') {
                sb.append('\\');
            }
            sb.append(c < 128 ? c : '?');
        }
        return sb.toString();
    }

    private static String clip(String value, int width) {
        if (value == null) {
            return "";
        }
        return value.length() <= width ? value : value.substring(0, width - 1) + "…";
    }

    private static void append(ByteArrayOutputStream out, String text) {
        out.writeBytes(text.getBytes(StandardCharsets.ISO_8859_1));
    }
}
