package com.dealflow.allocation.repository;

import com.dealflow.allocation.model.AllocationPlan;

import java.util.List;
import java.util.Optional;


import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AllocationPlanRepository extends JpaRepository<AllocationPlan, Long> {

    @Query("""
            select distinct p from AllocationPlan p
              join fetch p.quotation
              left join fetch p.lines l
              left join fetch l.product
              left join fetch l.warehouse
            where p.quotation.id = :quotationId
            """)
    Optional<AllocationPlan> findByQuotationId(Long quotationId);

    boolean existsByQuotationId(Long quotationId);

    /** Every accepted plan, with what it committed -- the fulfilment board reads all of them. */
    @Query("""
            select distinct p from AllocationPlan p
              join fetch p.quotation
              left join fetch p.lines l
              left join fetch l.product
              left join fetch l.warehouse
            """)
    List<AllocationPlan> findAllWithLines();

    /** Backorders separately: fetching two collections in one query multiplies the rows. */
    @Query("""
            select distinct p from AllocationPlan p
              left join fetch p.backorders b
              left join fetch b.product
            """)
    List<AllocationPlan> findAllWithBackorders();

    /** Plans still waiting on stock for a given product. */
    @Query("""
            select distinct p from AllocationPlan p
              join p.backorders b
            where b.product.id = :productId
              and p.consolidatable = false
            """)
    List<AllocationPlan> findAwaitingStockFor(Long productId);
}
