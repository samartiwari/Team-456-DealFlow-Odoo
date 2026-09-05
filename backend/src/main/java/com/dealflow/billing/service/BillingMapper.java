package com.dealflow.billing.service;

import com.dealflow.billing.dto.*;
import com.dealflow.billing.model.*;
import com.dealflow.domain.billing.Period;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.service.QuotationMapper;

import java.util.List;

import org.springframework.stereotype.Component;

/** Entities to the shapes the billing screen renders. */
@Component
public class BillingMapper {

    public BillingViewResponse toView(Quotation quotation, Invoice invoice,
                                      List<Subscription> subscriptions) {
        return new BillingViewResponse(
                quotation.getId(),
                quotation.ref(),
                quotation.getCustomer().getName(),
                QuotationMapper.CURRENCY,
                invoice == null ? null : toInvoice(invoice),
                subscriptions.stream().map(BillingMapper::toSubscription).toList());
    }

    public InvoiceResponse toInvoice(Invoice invoice) {
        return new InvoiceResponse(
                invoice.getId(),
                invoice.ref(),
                invoice.getQuotation().getId(),
                invoice.getStatus().name(),
                QuotationMapper.iso(invoice.getIssuedAt()),
                invoice.getLines().stream()
                        .map(l -> new InvoiceLineResponse(l.getId(), l.getDescription(),
                                l.getQuantity(), l.getUnitPrice(), l.getDiscountPct(),
                                l.getNetTotal(), l.isProration()))
                        .toList(),
                invoice.total(),
                invoice.paid(),
                invoice.outstanding(),
                invoice.getPayments().stream()
                        .map(p -> new PaymentResponse(p.getId(), p.getAmount(), p.getReference(),
                                p.getRecordedBy().getName(), QuotationMapper.iso(p.getRecordedAt())))
                        .toList(),
                invoice.getCreditNotes().stream()
                        .map(BillingMapper::toCreditNote)
                        .toList());
    }

    public static CreditNoteResponse toCreditNote(CreditNote note) {
        return new CreditNoteResponse(note.getId(), note.ref(), note.getAmount(),
                note.getReason(), QuotationMapper.iso(note.getIssuedAt()));
    }

    private static SubscriptionResponse toSubscription(Subscription s) {
        return new SubscriptionResponse(
                s.getId(),
                s.getProduct().getId(),
                s.getProduct().getName(),
                s.getQuantity(),
                s.getUnitPrice(),
                s.periodAmount(),
                s.getStatus().name(),
                s.getStartDate().toString(),
                s.getCancelledAt() == null ? null : s.getCancelledAt().toString(),
                s.getPeriods().stream().map(BillingMapper::toPeriod).toList());
    }

    private static BillingPeriodResponse toPeriod(BillingPeriod p) {
        return new BillingPeriodResponse(
                p.getId(),
                p.getPeriodStart().toString(),
                p.getPeriodEnd().toString(),
                new Period(p.getPeriodStart(), p.getPeriodEnd()).days(),
                p.getAmount(),
                p.getStatus().name(),
                p.getInvoice() == null ? null : p.getInvoice().getId());
    }
}
