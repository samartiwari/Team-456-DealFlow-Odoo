package com.dealflow.catalog.model;

import java.math.BigDecimal;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "product")
@Getter
@Setter
@NoArgsConstructor
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private ProductCategory category;

    @Column(name = "unit_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    /** Margin is impossible without it, so it is mandatory. Never leaves the internal realm. */
    @Column(name = "unit_cost", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitCost;

    /**
     * Out of the catalog, but not gone.
     *
     * <p>Quotation lines, invoice lines and stock rows all point here, so a real delete
     * would orphan history. An archived product cannot be put on a new line and still
     * resolves for every line that already has it.
     */
    @Column(nullable = false)
    private boolean archived = false;
}
