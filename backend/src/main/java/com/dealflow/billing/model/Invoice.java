package com.dealflow.billing.model;

import com.dealflow.quotation.model.Quotation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** The one-time half of an order, plus anything a mid-period increase added later. */
@Entity
@Table(name = "invoice")
@Getter
@Setter
@NoArgsConstructor
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InvoiceStatus status = InvoiceStatus.OPEN;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt = Instant.now();

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<InvoiceLine> lines = new ArrayList<>();

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Payment> payments = new ArrayList<>();

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<CreditNote> creditNotes = new ArrayList<>();

    public Invoice(Quotation quotation) {
        this.quotation = quotation;
    }

    public String ref() {
        return String.format("INV-%04d", id);
    }

    public void addLine(InvoiceLine line) {
        line.setInvoice(this);
        lines.add(line);
    }

    public void addPayment(Payment payment) {
        payment.setInvoice(this);
        payments.add(payment);
    }

    public void addCreditNote(CreditNote note) {
        note.setInvoice(this);
        creditNotes.add(note);
    }

    public BigDecimal total() {
        return sum(lines.stream().map(InvoiceLine::getNetTotal).toList());
    }

    public BigDecimal paid() {
        return sum(payments.stream().map(Payment::getAmount).toList());
    }

    public BigDecimal credited() {
        return sum(creditNotes.stream().map(CreditNote::getAmount).toList());
    }

    /** What is still owed. Never negative -- an over-credit settles the invoice, it does not
     *  turn it into a debt owed back through this field. */
    public BigDecimal outstanding() {
        return total().subtract(paid()).subtract(credited()).max(BigDecimal.ZERO);
    }

    private static BigDecimal sum(List<BigDecimal> values) {
        return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
