package com.dealflow.crm.model;

import java.math.BigDecimal;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "customer_tier")
@Getter
@Setter
@NoArgsConstructor
public class CustomerTier {

    @Id
    private Long id;

    @Column(nullable = false)
    private String name;

    /** Bronze 5, Silver 10, Gold 15 -- a seeded row, never a Java literal. */
    @Column(name = "ceiling_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal ceilingPct;
}
