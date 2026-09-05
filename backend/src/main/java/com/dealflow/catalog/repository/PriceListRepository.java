package com.dealflow.catalog.repository;

import com.dealflow.catalog.model.PriceList;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PriceListRepository extends JpaRepository<PriceList, Long> {

    @Query("""
            select distinct p from PriceList p
              left join fetch p.tier
              left join fetch p.items i
              left join fetch i.product
            where p.archived = false
            order by p.id
            """)
    List<PriceList> findAllWithItems();

    /** Every list including archived ones, for the admin screen that can restore them. */
    @Query("""
            select distinct p from PriceList p
              left join fetch p.tier
              left join fetch p.items i
              left join fetch i.product
            order by p.id
            """)
    List<PriceList> findAllWithItemsIncludingArchived();

    /** The one live list for a tier, if the tier has one at all. */
    @Query("""
            select distinct p from PriceList p
              left join fetch p.items i
              left join fetch i.product
            where p.active = true and p.archived = false and p.tier.id = :tierId
            """)
    Optional<PriceList> findActiveForTier(Long tierId);
}
