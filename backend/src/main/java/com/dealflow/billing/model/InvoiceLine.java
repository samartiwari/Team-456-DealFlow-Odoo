package com.dealflow.billing.model;

import com.dealflow.catalog.model.Product;

import java.math.BigDecimal;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "invoice_line")
@Getter
@Setter
@NoArgsConstructor
public class InvoiceLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    /** Null for a line that is not about a catalog product, such as a rounding adjustment. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column(nullable = false, length = 200)
    private String description;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "discount_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountPct = BigDecimal.ZERO;

    @Column(name = "net_total", nullable = false, precision = 14, scale = 2)
    private BigDecimal netTotal;

    /** Added by a mid-period quantity increase rather than by the original order. */
    @Column(nullable = false)
    private boolean proration = false;

    public InvoiceLine(Product product, String description, int quantity,
                       BigDecimal unitPrice, BigDecimal discountPct, BigDecimal netTotal,
                       boolean proration) {
        this.product = product;
        this.description = description;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.discountPct = discountPct;
        this.netTotal = netTotal;
        this.proration = proration;
    }
}
