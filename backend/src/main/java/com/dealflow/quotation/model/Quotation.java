package com.dealflow.quotation.model;

import com.dealflow.common.audit.AuditService;
import com.dealflow.crm.model.Customer;
import com.dealflow.identity.model.AppUser;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;


import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "quotation")
@Getter
@Setter
@NoArgsConstructor
public class Quotation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "rep_id", nullable = false)
    private AppUser rep;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private QuotationState state = QuotationState.DRAFT;

    /** Last computed score. Recomputed on confirm -- the client's copy is never trusted. */
    @Column(name = "risk_score", nullable = false)
    private int riskScore = 0;

    @Column(name = "order_discount_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal orderDiscountPct = BigDecimal.ZERO;

    /** Stamped by AuditService on every state change; the stalled-deal detector reads it. */
    @Column(name = "last_activity_at", nullable = false)
    private Instant lastActivityAt = Instant.now();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @OneToMany(mappedBy = "quotation", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<QuotationLine> lines = new ArrayList<>();

    public Quotation(Customer customer, AppUser rep) {
        this.customer = customer;
        this.rep = rep;
    }

    public void addLine(QuotationLine line) {
        line.setQuotation(this);
        lines.add(line);
    }

    public void removeLine(QuotationLine line) {
        lines.remove(line);
        line.setQuotation(null);
    }

    /** Q-0001, Q-0002 ... the human-facing reference. */
    public String ref() {
        return String.format("Q-%04d", id);
    }
}
