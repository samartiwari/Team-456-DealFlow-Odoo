package com.dealflow.billing.model;

import java.math.BigDecimal;
import java.time.LocalDate;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One month of a schedule.
 *
 * <p>{@code (subscription_id, period_start)} is unique in the schema, which is what makes
 * the nightly close safe to re-run: a second pass over the same period cannot insert a
 * second bill for it.
 */
@Entity
@Table(name = "billing_period")
@Getter
@Setter
@NoArgsConstructor
public class BillingPeriod {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "subscription_id", nullable = false)
    private Subscription subscription;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PeriodStatus status = PeriodStatus.SCHEDULED;

    /** Set once billed; the invoice this period landed on. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id")
    private Invoice invoice;

    public BillingPeriod(LocalDate periodStart, LocalDate periodEnd, BigDecimal amount) {
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
        this.amount = amount;
    }
}
