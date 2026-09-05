package com.dealflow.billing.service;

import com.dealflow.billing.dto.CreditNoteResponse;
import com.dealflow.billing.dto.InvoiceLineResponse;
import com.dealflow.billing.dto.InvoiceResponse;
import com.dealflow.billing.dto.PaymentResponse;
import com.dealflow.common.pdf.PdfDocument;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Component;

/**
 * The invoice, as a document the customer can keep.
 *
 * <p>Screen 13's Download Invoice. Built from the same {@link InvoiceResponse}
 * the screen rendered, for the same reason the report exports are built from
 * the report: a document that recomputes its own figures is a document that can
 * disagree with the page it came from.
 *
 * <p>It shows payments and credit notes as well as lines, because the number
 * that matters to whoever opens it is what is still owed, and that is only
 * explicable with the credits beside it.
 */
@Component
public class InvoicePdfWriter {

    private static final int DESCRIPTION = 46;

    public byte[] write(InvoiceResponse invoice, String customerName) {
        List<String> body = new ArrayList<>();

        body.add("DealFlow360");
        body.add("");
        body.add("INVOICE  " + invoice.ref());
        body.add("");
        body.add(pair("Customer", customerName));
        body.add(pair("Quotation", "Q-" + String.format("%04d", invoice.quotationId())));
        body.add(pair("Issued", invoice.issuedAt()));
        body.add(pair("Status", invoice.status()));
        body.add("");
        body.add(row("Description", "Qty", "Unit", "Disc %", "Net"));
        body.add("-".repeat(96));

        for (InvoiceLineResponse line : invoice.lines()) {
            // A proration line is the reason a period's figure is not the round
            // number the customer expects, so it says so rather than hiding.
            String description = PdfDocument.clip(
                    line.description() + (line.proration() ? "  (proration)" : ""), DESCRIPTION);
            body.add(row(description,
                    String.valueOf(line.quantity()),
                    money(line.unitPrice()),
                    money(line.discountPct()),
                    money(line.netTotal())));
        }

        body.add("-".repeat(96));
        body.add(total("Total", invoice.total()));

        if (!invoice.payments().isEmpty()) {
            body.add("");
            body.add("Payments");
            for (PaymentResponse p : invoice.payments()) {
                body.add("  " + PdfDocument.clip(p.recordedAt(), 24) + "   "
                        + PdfDocument.clip(p.reference(), 20) + "   " + money(p.amount()));
            }
            body.add(total("Paid", invoice.paid()));
        }

        if (!invoice.creditNotes().isEmpty()) {
            body.add("");
            body.add("Credit notes");
            for (CreditNoteResponse c : invoice.creditNotes()) {
                body.add("  " + PdfDocument.clip(c.reason(), 62) + "   " + money(c.amount()));
            }
        }

        body.add("");
        body.add(total("Outstanding", invoice.outstanding()));

        // Paginated the same way as the report: an invoice with a year of
        // subscription lines is not a one-page document.
        List<List<String>> pages = new ArrayList<>();
        for (int i = 0; i < body.size(); i += PdfDocument.ROWS_PER_PAGE) {
            pages.add(new ArrayList<>(body.subList(i,
                    Math.min(i + PdfDocument.ROWS_PER_PAGE, body.size()))));
        }
        if (pages.isEmpty()) {
            pages.add(List.of("INVOICE " + invoice.ref()));
        }
        return PdfDocument.render(pages);
    }

    private static String pair(String label, String value) {
        return String.format("%-12s %s", label + ":", value == null ? "-" : value);
    }

    private static String row(String description, String qty, String unit, String disc, String net) {
        return String.format("%-46s %6s %14s %8s %16s", PdfDocument.clip(description, DESCRIPTION),
                qty, unit, disc, net);
    }

    private static String total(String label, BigDecimal amount) {
        return String.format("%-46s %6s %14s %8s %16s", "", "", "", label, money(amount));
    }

    private static String money(BigDecimal value) {
        return value == null ? "-" : value.toPlainString();
    }
}
