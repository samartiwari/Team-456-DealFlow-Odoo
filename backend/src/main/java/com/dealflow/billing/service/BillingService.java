package com.dealflow.billing.service;

import com.dealflow.billing.dto.*;
import com.dealflow.billing.model.*;
import com.dealflow.billing.repository.CreditNoteRepository;
import com.dealflow.billing.repository.InvoiceRepository;
import com.dealflow.billing.repository.SubscriptionRepository;
import com.dealflow.common.config.SystemConfigService;
import com.dealflow.common.error.ApiException;
import com.dealflow.domain.billing.Period;
import com.dealflow.domain.billing.ProrationCalculator;
import com.dealflow.identity.model.AppUser;
import com.dealflow.identity.model.UserRole;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationLine;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.service.QuotationService;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * One order, billed two ways.
 *
 * <p>One-time lines raise an invoice the moment the quotation is approved. Recurring lines
 * raise a subscription with twelve scheduled periods. There is no second order anywhere in
 * here -- the fork is in how a line is billed, not in what the order is.
 */
@Service
public class BillingService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final int MONEY_SCALE = 2;
    private static final int PERIODS = 12;

    private final QuotationService quotations;
    private final InvoiceRepository invoices;
    private final CreditNoteRepository creditNotes;
    private final SubscriptionRepository subscriptions;
    private final SystemConfigService config;
    private final BillingMapper mapper;
    private final ProrationCalculator calculator = new ProrationCalculator();

    public BillingService(QuotationService quotations, InvoiceRepository invoices,
                          CreditNoteRepository creditNotes, SubscriptionRepository subscriptions,
                          SystemConfigService config, BillingMapper mapper) {
        this.quotations = quotations;
        this.invoices = invoices;
        this.creditNotes = creditNotes;
        this.subscriptions = subscriptions;
        this.config = config;
        this.mapper = mapper;
    }

    // ---------- the fork ----------

    /** Idempotent: a quotation that has already been billed is left exactly as it is. */
    @Transactional
    public void issueFor(long quotationId) {
        if (invoices.findOriginating(quotationId).isPresent()
                || subscriptions.existsByQuotationId(quotationId)) {
            return;
        }
        Quotation quotation = quotations.load(quotationId);
        LocalDate today = config.billingToday();

        Invoice invoice = null;
        for (QuotationLine line : quotation.getLines()) {
            BigDecimal effective = effectiveDiscount(quotation, line);
            BigDecimal unitNet = netOf(line.getProduct().getUnitPrice(), effective);

            if (line.getProduct().getCategory().isRecurring()) {
                subscriptions.save(scheduleFor(quotation, line, unitNet, today));
                continue;
            }
            if (invoice == null) {
                invoice = new Invoice(quotation);
            }
            invoice.addLine(new InvoiceLine(
                    line.getProduct(),
                    line.getProduct().getName() + " x" + line.getQuantity(),
                    line.getQuantity(),
                    line.getProduct().getUnitPrice(),
                    effective,
                    money(unitNet.multiply(BigDecimal.valueOf(line.getQuantity()))),
                    false));
        }

        if (invoice != null) {
            invoice.setStatus(statusOf(invoice));
            invoices.save(invoice);
        }
    }

    private Subscription scheduleFor(Quotation quotation, QuotationLine line,
                                     BigDecimal unitNet, LocalDate start) {
        Subscription subscription = new Subscription(
                quotation, line.getProduct(), line.getQuantity(), money(unitNet), start);

        // Calendar months. Two subscriptions started a week apart bill on the same dates,
        // which is what makes a schedule readable and the day counts checkable by hand.
        LocalDate firstOfMonth = start.withDayOfMonth(1);
        for (int n = 0; n < PERIODS; n++) {
            LocalDate periodStart = firstOfMonth.plusMonths(n);
            LocalDate periodEnd = periodStart.plusMonths(1).minusDays(1);
            subscription.addPeriod(
                    new BillingPeriod(periodStart, periodEnd, subscription.periodAmount()));
        }
        return subscription;
    }

    // ---------- reads ----------

    @Transactional(readOnly = true)
    public BillingViewResponse view(long quotationId) {
        Quotation quotation = quotations.load(quotationId);
        if (quotation.getState() != QuotationState.APPROVED) {
            throw ApiException.notFound("Billing for quotation", quotationId);
        }
        return mapper.toView(quotation,
                invoices.findOriginating(quotationId).orElse(null),
                subscriptions.findByQuotationId(quotationId));
    }

    @Transactional(readOnly = true)
    public List<InvoiceResponse> listInvoices() {
        return invoices.findAllNewestFirst().stream().map(mapper::toInvoice).toList();
    }

    @Transactional(readOnly = true)
    public InvoiceResponse invoice(long invoiceId) {
        return mapper.toInvoice(loadInvoice(invoiceId));
    }

    // ---------- payments ----------

    @Transactional
    public InvoiceResponse recordPayment(long invoiceId, RecordPaymentRequest request, long actorId) {
        AppUser actor = financeOnly(actorId, "record a payment");
        Invoice invoice = loadInvoice(invoiceId);

        if (request.amount() == null || request.amount().signum() <= 0) {
            throw ApiException.invalid("A payment must be for more than zero.", "amount");
        }
        if (invoice.getStatus() == InvoiceStatus.PAID) {
            throw ApiException.conflict("That invoice is already settled.");
        }
        if (request.amount().compareTo(invoice.outstanding()) > 0) {
            throw ApiException.invalid("That is more than the " + invoice.outstanding()
                    + " outstanding.", "amount");
        }

        invoice.addPayment(new Payment(money(request.amount()), request.reference(), actor));

        // Derived, every time, from what has actually been received. Never assigned.
        invoice.setStatus(statusOf(invoice));
        invoices.save(invoice);
        return mapper.toInvoice(invoice);
    }

    // ---------- change and cancel ----------

    @Transactional
    public ProrationResultResponse change(long subscriptionId, ChangeSubscriptionRequest request,
                                          long actorId) {
        financeOnly(actorId, "change a subscription");
        Subscription subscription = loadSubscription(subscriptionId);
        int next = request.quantity() == null ? subscription.getQuantity() : request.quantity();

        if (next == 0) {
            return applyCancellation(subscription, dateOrToday(request.effectiveDate()),
                    "Cancelled");
        }
        return applyChange(subscription, next, dateOrToday(request.effectiveDate()));
    }

    @Transactional
    public ProrationResultResponse cancel(long subscriptionId, CancelSubscriptionRequest request,
                                          long actorId) {
        financeOnly(actorId, "cancel a subscription");
        Subscription subscription = loadSubscription(subscriptionId);
        String reason = request == null || request.reason() == null || request.reason().isBlank()
                ? "Cancelled" : request.reason();
        return applyCancellation(subscription,
                dateOrToday(request == null ? null : request.effectiveDate()), reason);
    }

    private ProrationResultResponse applyChange(Subscription subscription, int next,
                                                LocalDate effective) {
        requireActive(subscription);
        int current = subscription.getQuantity();
        if (next == current) {
            // Nothing moved, so nothing is charged and nothing is written down.
            return result(subscription, BigDecimal.ZERO.setScale(MONEY_SCALE), null,
                    "No change -- the quantity is already " + current + ".");
        }

        BillingPeriod period = periodCovering(subscription, effective);
        Period window = new Period(period.getPeriodStart(), period.getPeriodEnd());
        BigDecimal delta = calculator.prorate(
                subscription.getUnitPrice(), current, next, window, effective);

        subscription.setQuantity(next);
        repriceFuturePeriods(subscription, period);

        String explanation = explain(window, effective, next - current, subscription.getUnitPrice());
        CreditNote note = settle(subscription, delta,
                subscription.getProduct().getName() + " qty " + current + " to " + next,
                explanation);

        subscriptions.save(subscription);
        return result(subscription, delta, note, explanation);
    }

    private ProrationResultResponse applyCancellation(Subscription subscription,
                                                      LocalDate effective, String reason) {
        requireActive(subscription);
        BillingPeriod period = periodCovering(subscription, effective);
        Period window = new Period(period.getPeriodStart(), period.getPeriodEnd());
        BigDecimal delta = calculator.prorate(
                subscription.getUnitPrice(), subscription.getQuantity(), 0, window, effective);

        String explanation = explain(window, effective, -subscription.getQuantity(),
                subscription.getUnitPrice());
        CreditNote note = settle(subscription, delta,
                subscription.getProduct().getName() + " cancelled: " + reason, explanation);

        subscription.setStatus(SubscriptionStatus.CANCELLED);
        subscription.setCancelledAt(effective);
        // The schedule is kept rather than deleted. The rows record what was agreed, the
        // status records that it stopped, and the close job simply skips anything starting
        // after the cancellation -- which keeps the history rather than erasing it.

        subscriptions.save(subscription);
        return result(subscription, delta, note, explanation);
    }

    /** A charge becomes an invoice line; a credit becomes a credit note. */
    private CreditNote settle(Subscription subscription, BigDecimal delta,
                              String description, String explanation) {
        if (delta.signum() == 0) {
            return null;
        }
        Invoice invoice = invoiceFor(subscription.getQuotation());

        if (delta.signum() > 0) {
            invoice.addLine(new InvoiceLine(subscription.getProduct(), description, 1,
                    delta, BigDecimal.ZERO, delta, true));
            invoice.setStatus(statusOf(invoice));
            invoices.save(invoice);
            return null;
        }

        CreditNote note = new CreditNote(delta.abs(), description + " -- " + explanation);
        invoice.addCreditNote(note);
        // Persisted directly rather than left to the cascade. Saving the parent merges it,
        // and a merge copies a transient child -- the copy gets the identity while the
        // instance we are holding keeps a null id, which the reference is built from.
        creditNotes.save(note);
        invoice.setStatus(statusOf(invoice));
        invoices.save(invoice);
        return note;
    }

    /**
     * Later periods bill the new quantity in full; the current one was settled by the
     * proration, so it is left alone.
     */
    private static void repriceFuturePeriods(Subscription subscription, BillingPeriod current) {
        for (BillingPeriod p : subscription.getPeriods()) {
            if (p.getStatus() == PeriodStatus.SCHEDULED
                    && p.getPeriodStart().isAfter(current.getPeriodStart())) {
                p.setAmount(subscription.periodAmount());
            }
        }
    }

    // ---------- the nightly close ----------

    /**
     * Bills every scheduled period that has come due.
     *
     * <p>Safe to run repeatedly: a period flips to BILLED the first time, and the unique
     * constraint on {@code (subscription_id, period_start)} means no second row for it can
     * exist even if two runs raced.
     */
    @Transactional
    public ClockAdvanceResponse closePeriodsUpTo(LocalDate asOf) {
        List<Long> raised = new ArrayList<>();
        int billed = 0;

        for (Subscription subscription : subscriptions.findAll()) {
            for (BillingPeriod period : subscription.getPeriods()) {
                if (period.getStatus() != PeriodStatus.SCHEDULED) {
                    continue;
                }
                // A period is billed once it has run its course, not when it opens.
                if (!period.getPeriodEnd().isBefore(asOf)) {
                    continue;
                }
                // A cancellation stops the schedule from its effective date; periods that
                // had already completed before then are still owed.
                if (subscription.getStatus() == SubscriptionStatus.CANCELLED
                        && subscription.getCancelledAt() != null
                        && period.getPeriodStart().isAfter(subscription.getCancelledAt())) {
                    continue;
                }

                // A cycle raises its own invoice. Adding it to the order's original one
                // would reopen an invoice the customer had already settled -- a paid
                // invoice must stay paid.
                Invoice invoice = invoices.save(new Invoice(subscription.getQuotation()));
                invoice.addLine(new InvoiceLine(
                        subscription.getProduct(),
                        subscription.getProduct().getName() + " " + period.getPeriodStart()
                                + " to " + period.getPeriodEnd(),
                        subscription.getQuantity(),
                        subscription.getUnitPrice(),
                        BigDecimal.ZERO,
                        period.getAmount(),
                        false));
                invoice.setStatus(statusOf(invoice));
                invoices.save(invoice);

                period.setStatus(PeriodStatus.BILLED);
                period.setInvoice(invoice);
                billed++;
                if (!raised.contains(invoice.getId())) {
                    raised.add(invoice.getId());
                }
            }
            subscriptions.save(subscription);
        }
        return new ClockAdvanceResponse(asOf.toString(), billed, raised);
    }

    /** Winds the clock to the next period boundary, then runs the very same job. */
    @Transactional
    public ClockAdvanceResponse advanceClock(long actorId) {
        financeOnly(actorId, "advance the billing clock");
        // One cycle per press. This is not idempotent and is not meant to be -- pressing
        // it twice bills two months. What is idempotent is the job below, for any given
        // date, which is the guarantee the nightly scheduler actually depends on.
        LocalDate next = config.billingToday().plusMonths(1);
        config.setBillingClock(next);
        return closePeriodsUpTo(next);
    }

    // ---------- helpers ----------

    private Invoice invoiceFor(Quotation quotation) {
        return invoices.findOriginating(quotation.getId())
                .orElseGet(() -> invoices.save(new Invoice(quotation)));
    }

    /** The push-down again: a line's own discount plus the order-level one. */
    private static BigDecimal effectiveDiscount(Quotation quotation, QuotationLine line) {
        return line.getDiscountPct().add(quotation.getOrderDiscountPct())
                .max(BigDecimal.ZERO).min(HUNDRED);
    }

    private static BigDecimal netOf(BigDecimal unitPrice, BigDecimal discountPct) {
        return unitPrice.multiply(HUNDRED.subtract(discountPct))
                .divide(HUNDRED, 8, RoundingMode.HALF_UP);
    }

    private static BigDecimal money(BigDecimal value) {
        return value.setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    }

    private static InvoiceStatus statusOf(Invoice invoice) {
        BigDecimal total = invoice.total();
        if (total.signum() == 0) {
            return InvoiceStatus.OPEN;
        }
        if (invoice.paid().compareTo(total) >= 0) {
            return InvoiceStatus.PAID;
        }
        if (invoice.paid().signum() > 0) {
            return InvoiceStatus.PARTIALLY_PAID;
        }
        if (invoice.credited().compareTo(total) >= 0) {
            return InvoiceStatus.CREDITED;
        }
        return InvoiceStatus.OPEN;
    }

    private static String explain(Period window, LocalDate effective, int qtyDelta,
                                  BigDecimal unitPrice) {
        int remaining = window.remainingDaysFrom(effective);
        BigDecimal daily = unitPrice.divide(BigDecimal.valueOf(window.days()), MONEY_SCALE,
                RoundingMode.HALF_UP);
        return remaining + " of " + window.days() + " days remaining, "
                + Math.abs(qtyDelta) + (Math.abs(qtyDelta) == 1 ? " unit" : " units")
                + " at " + daily + " per day.";
    }

    private BillingPeriod periodCovering(Subscription subscription, LocalDate date) {
        return subscription.getPeriods().stream()
                .filter(p -> !date.isBefore(p.getPeriodStart()) && !date.isAfter(p.getPeriodEnd()))
                .findFirst()
                .orElseThrow(() -> ApiException.invalid(
                        date + " falls outside this subscription's schedule.", "effectiveDate"));
    }

    private LocalDate dateOrToday(String iso) {
        if (iso == null || iso.isBlank()) {
            return config.billingToday();
        }
        try {
            return LocalDate.parse(iso);
        } catch (RuntimeException ex) {
            throw ApiException.invalid("Use an ISO date such as 2026-01-10.", "effectiveDate");
        }
    }

    private static void requireActive(Subscription subscription) {
        if (subscription.getStatus() != SubscriptionStatus.ACTIVE) {
            throw ApiException.conflict("That subscription has already been cancelled.");
        }
    }

    private ProrationResultResponse result(Subscription subscription, BigDecimal delta,
                                           CreditNote note, String explanation) {
        return new ProrationResultResponse(
                delta,
                explanation,
                note == null ? null : BillingMapper.toCreditNote(note),
                view(subscription.getQuotation().getId()));
    }

    private AppUser financeOnly(long actorId, String what) {
        AppUser actor = quotations.actor(actorId);
        if (actor.getRole() != UserRole.FINANCE) {
            throw ApiException.forbidden(actor.getName() + " is a "
                    + actor.getRole().name().toLowerCase() + ". Only finance can " + what + ".");
        }
        return actor;
    }

    private Invoice loadInvoice(long id) {
        return invoices.findById(id).orElseThrow(() -> ApiException.notFound("Invoice", id));
    }

    private Subscription loadSubscription(long id) {
        return subscriptions.findById(id)
                .orElseThrow(() -> ApiException.notFound("Subscription", id));
    }
}
