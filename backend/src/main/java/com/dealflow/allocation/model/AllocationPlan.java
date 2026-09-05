package com.dealflow.allocation.model;

import com.dealflow.quotation.model.Quotation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;


import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Only an accepted plan is stored. A suggestion is computed on demand and thrown away. */
@Entity
@Table(name = "allocation_plan")
@Getter
@Setter
@NoArgsConstructor
public class AllocationPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false, unique = true)
    private Quotation quotation;

    @Column(name = "shipment_count", nullable = false)
    private int shipmentCount;

    @Column(name = "estimated_cost", nullable = false, precision = 14, scale = 2)
    private BigDecimal estimatedCost;

    /** True when a human changed the suggested split. */
    @Column(nullable = false)
    private boolean overridden = false;

    /** Flipped when stock arrives that could fill an open backorder. */
    @Column(nullable = false)
    private boolean consolidatable = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @OneToMany(mappedBy = "plan", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<AllocationLine> lines = new ArrayList<>();

    @OneToMany(mappedBy = "plan", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<Backorder> backorders = new ArrayList<>();

    public AllocationPlan(Quotation quotation) {
        this.quotation = quotation;
    }

    public void addLine(AllocationLine line) {
        line.setPlan(this);
        lines.add(line);
    }

    public void addBackorder(Backorder backorder) {
        backorder.setPlan(this);
        backorders.add(backorder);
    }
}
