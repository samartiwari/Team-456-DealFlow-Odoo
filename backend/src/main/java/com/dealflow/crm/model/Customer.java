package com.dealflow.crm.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "customer")
@Getter
@Setter
@NoArgsConstructor
public class Customer {

    // V20 gave the column an identity sequence, the way V16 did for product and
    // warehouse. Before that nothing handed out the next id, so a customer could only be
    // seeded by hand.
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tier_id", nullable = false)
    private CustomerTier tier;

    @Column(nullable = false, length = 20)
    private String phone;
}
