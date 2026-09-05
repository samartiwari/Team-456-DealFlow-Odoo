package com.dealflow.catalog.model;

import java.math.BigDecimal;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "product_category")
@Getter
@Setter
@NoArgsConstructor
public class ProductCategory {

    @Id
    private Long id;

    @Column(nullable = false)
    private String name;

    /** Nullable on purpose: a category with no ceiling falls back to the tier ceiling. */
    @Column(name = "ceiling_pct", precision = 5, scale = 2)
    private BigDecimal ceilingPct;
}
