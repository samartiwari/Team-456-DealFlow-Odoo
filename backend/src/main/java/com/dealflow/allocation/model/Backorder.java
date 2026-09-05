package com.dealflow.allocation.model;

import com.dealflow.catalog.model.Product;

import java.time.LocalDate;


import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** What stock could not cover, with the date it is promised for. */
@Entity
@Table(name = "backorder")
@Getter
@Setter
@NoArgsConstructor
public class Backorder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "plan_id", nullable = false)
    private AllocationPlan plan;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "promised_date", nullable = false)
    private LocalDate promisedDate;

    public Backorder(Product product, int quantity, LocalDate promisedDate) {
        this.product = product;
        this.quantity = quantity;
        this.promisedDate = promisedDate;
    }
}
