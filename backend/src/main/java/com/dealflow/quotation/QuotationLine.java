package com.dealflow.quotation;

import java.math.BigDecimal;

import com.dealflow.catalog.Product;

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

    public QuotationLine(Product product, int quantity, BigDecimal discountPct) {
        this.product = product;
        this.quantity = quantity;
        this.discountPct = discountPct;
    }
}
