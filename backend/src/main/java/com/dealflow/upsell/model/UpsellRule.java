package com.dealflow.upsell.model;

import com.dealflow.catalog.model.Product;

import java.math.BigDecimal;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * An admin-authored pairing: buy this, be offered that.
 *
 * <p>These enter the ranking at confidence 1.0, which is the ceiling a mined co-purchase
 * statistic could ever reach -- so a curated pairing always outranks a weak mined one.
 */
@Entity
@Table(name = "upsell_rule")
@Getter
@Setter
@NoArgsConstructor
public class UpsellRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trigger_product_id", nullable = false)
    private Product trigger;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "suggested_product_id", nullable = false)
    private Product suggested;

    /** Below this the candidate is dropped however well it pairs. */
    @Column(name = "min_margin_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal minMarginPct = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean promoted = false;
}
