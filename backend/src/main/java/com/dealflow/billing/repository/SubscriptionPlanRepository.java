package com.dealflow.billing.repository;

import com.dealflow.billing.model.SubscriptionPlan;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SubscriptionPlanRepository extends JpaRepository<SubscriptionPlan, Long> {

    /** The plan billing should follow for this product, if it has one. */
    Optional<SubscriptionPlan> findByProductIdAndActiveTrue(Long productId);

    @Query("""
            select p from SubscriptionPlan p
              join fetch p.product
            order by p.id
            """)
    List<SubscriptionPlan> findAllForEditing();
}
