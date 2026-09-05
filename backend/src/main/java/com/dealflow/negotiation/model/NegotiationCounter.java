package com.dealflow.negotiation.model;

import com.dealflow.quotation.model.Quotation;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * What the customer is asking for now.
 *
 * <p>One per quotation. A new counter replaces the last rather than queueing behind it --
 * what matters is the discount currently on the table, not the history of asks.
 */
@Entity
@Table(name = "negotiation_counter")
@Getter
@Setter
@NoArgsConstructor
public class NegotiationCounter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false, unique = true)
    private Quotation quotation;

    @Column(name = "discount_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountPct;

    @Column(length = 1000)
    private String note;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CounterState state = CounterState.PENDING;

    @Column(name = "proposed_at", nullable = false)
    private Instant proposedAt = Instant.now();

    public NegotiationCounter(Quotation quotation, BigDecimal discountPct, String note) {
        this.quotation = quotation;
        this.discountPct = discountPct;
        this.note = note;
    }
}
