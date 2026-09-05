package com.dealflow.analytics.service;

import com.dealflow.analytics.dto.ReportQuery;
import com.dealflow.common.pdf.PdfDocument;
import com.dealflow.analytics.dto.ReportResultResponse;
import com.dealflow.analytics.dto.ReportRowResponse;

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


    public byte[] write(ReportResultResponse report) {
        return PdfDocument.render(paginate(report));
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
            if (current.size() - header.size() >= PdfDocument.ROWS_PER_PAGE) {
                pages.add(current);
                current = new ArrayList<>(header);
            }
            current.add(String.format("%-9s %-18s %-14s %-18s %12s %8s %8s %6d",
                    r.ref(), PdfDocument.clip(r.customerName(), 18), PdfDocument.clip(r.repName(), 14),
                    PdfDocument.clip(r.stage(), 18), r.subtotal().toPlainString(),
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




}
