package com.dealflow.quotation.model;

import com.dealflow.catalog.model.Product;

import java.math.BigDecimal;


import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "quotation_line")
@Getter
@Setter
@NoArgsConstructor
public class QuotationLine {

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

    /** What the rep typed on this line. The order-level discount is added on top at pricing time. */
    @Column(name = "discount_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountPct = BigDecimal.ZERO;

    /**
     * What this line was agreed at, frozen when the quotation was confirmed.
     *
     * <p>Null while the quotation is still editable, and that is the whole rule: a draft
     * tracks the catalog, so an admin correcting a price updates the quotes still being
     * written; anything past DRAFT keeps the price it was signed off on. Without this a
     * catalog edit would reprice settled deals and the approvals taken against them.
     */
    @Column(name = "unit_price", precision = 14, scale = 2)
    private BigDecimal unitPrice;

    /** Frozen with the price. A price without its cost would report an infinite margin. */
    @Column(name = "unit_cost", precision = 14, scale = 2)
    private BigDecimal unitCost;

    /** True once this line's terms are settled and no longer follow the catalog. */
    public boolean isFrozen() {
        return unitPrice != null && unitCost != null;
    }

    public QuotationLine(Product product, int quantity, BigDecimal discountPct) {
        this.product = product;
        this.quantity = quantity;
        this.discountPct = discountPct;
    }
}
