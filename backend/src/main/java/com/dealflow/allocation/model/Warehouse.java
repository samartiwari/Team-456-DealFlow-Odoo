package com.dealflow.allocation.model;

import java.math.BigDecimal;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "warehouse")
@Getter
@Setter
@NoArgsConstructor
public class Warehouse {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    /** Fixed cost of despatching anything at all from here. */
    @Column(name = "shipment_fee", nullable = false, precision = 14, scale = 2)
    private BigDecimal shipmentFee;

    /** Per-unit cost. Lower is cheaper, and cheaper warehouses are drained first. */
    @Column(name = "shipping_weight", nullable = false, precision = 6, scale = 2)
    private BigDecimal shippingWeight;

    @Column(name = "replenishment_days", nullable = false)
    private int replenishmentDays;

    /** Closed. Refused while it still holds stock or has open allocations. */
    @Column(nullable = false)
    private boolean archived = false;
}
