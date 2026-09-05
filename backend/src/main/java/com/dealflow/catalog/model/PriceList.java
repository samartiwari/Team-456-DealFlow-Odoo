package com.dealflow.catalog.model;

import com.dealflow.crm.model.CustomerTier;

import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * What a tier is published at.
 *
 * <p>At most one list per tier may be active; the schema enforces it with a partial unique
 * index rather than leaving it to a service that could be bypassed. Two live lists for one
 * tier would make a price ambiguous, and an ambiguous price is a dispute.
 */
@Entity
@Table(name = "price_list")
@Getter
@Setter
@NoArgsConstructor
public class PriceList {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120, unique = true)
    private String name;

    /** Null would mean a list for everyone; every seeded list is tier-bound. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tier_id")
    private CustomerTier tier;

    @Column(nullable = false)
    private boolean active = true;

    /** Withdrawn. Kept because past quotations were priced off it. */
    @Column(nullable = false)
    private boolean archived = false;

    @OneToMany(mappedBy = "priceList", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id asc")
    private List<PriceListItem> items = new ArrayList<>();
}
