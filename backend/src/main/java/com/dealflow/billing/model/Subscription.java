package com.dealflow.billing.model;

import com.dealflow.catalog.model.Product;
import com.dealflow.quotation.model.Quotation;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The recurring half of an order: one schedule per recurring line.
 *
 * <p>One per line rather than one per order, so the same product appearing twice stays two
 * schedules that can be changed and cancelled independently.
 */
@Entity
@Table(name = "subscription")
@Getter
@Setter
@NoArgsConstructor
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false)
    private int quantity;

    /** Per unit, per period, after the line's discount. The proration divides this. */
    @Column(name = "unit_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SubscriptionStatus status = SubscriptionStatus.ACTIVE;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "cancelled_at")
    private LocalDate cancelledAt;

    @OneToMany(mappedBy = "subscription", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("periodStart asc")
    private List<BillingPeriod> periods = new ArrayList<>();

    public Subscription(Quotation quotation, Product product, int quantity,
                        BigDecimal unitPrice, LocalDate startDate) {
        this.quotation = quotation;
        this.product = product;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.startDate = startDate;
    }

    public void addPeriod(BillingPeriod period) {
        period.setSubscription(this);
        periods.add(period);
    }

    /** What a whole period bills at the current quantity. */
    public BigDecimal periodAmount() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}
