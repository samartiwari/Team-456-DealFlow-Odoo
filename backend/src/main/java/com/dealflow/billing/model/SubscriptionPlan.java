package com.dealflow.billing.model;

import com.dealflow.catalog.model.Product;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The three billing decisions, made explicit.
 *
 * <p>Before this they were constants inside {@code BillingService}: calendar months,
 * prorate on a change, credit note on cancel. That is a defensible default and a poor
 * product -- an operator cannot see what the system will do, let alone change it. Every
 * recurring product is seeded with a plan holding exactly those three defaults, so nothing
 * moves until somebody deliberately moves it.
 */
@Entity
@Table(name = "subscription_plan")
@Getter
@Setter
@NoArgsConstructor
public class SubscriptionPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Enumerated(EnumType.STRING)
    @Column(name = "interval_unit", nullable = false, length = 20)
    private BillingInterval interval = BillingInterval.MONTHLY;

    @Enumerated(EnumType.STRING)
    @Column(name = "proration_policy", nullable = false, length = 30)
    private ProrationPolicy prorationPolicy = ProrationPolicy.PRORATE;

    @Enumerated(EnumType.STRING)
    @Column(name = "cancellation_policy", nullable = false, length = 30)
    private CancellationPolicy cancellationPolicy = CancellationPolicy.IMMEDIATE_WITH_CREDIT;

    /** A product prices one way at a time; the database allows one active plan per product. */
    @Column(nullable = false)
    private boolean active = true;
}
