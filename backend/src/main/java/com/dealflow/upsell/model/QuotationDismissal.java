package com.dealflow.upsell.model;

import com.dealflow.catalog.model.Product;
import com.dealflow.quotation.model.Quotation;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** A card the rep waved away. Scoped to one quotation, never to the product everywhere. */
@Entity
@Table(name = "quotation_dismissal")
@Getter
@Setter
@NoArgsConstructor
public class QuotationDismissal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    public QuotationDismissal(Quotation quotation, Product product) {
        this.quotation = quotation;
        this.product = product;
    }
}
