package com.dealflow.billing.repository;

import com.dealflow.billing.model.Subscription;
import com.dealflow.billing.model.SubscriptionStatus;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    @Query("""
            select distinct s from Subscription s
              join fetch s.product
              left join fetch s.periods
            where s.quotation.id = :quotationId
            order by s.id
            """)
    List<Subscription> findByQuotationId(Long quotationId);

    @Query("""
            select distinct s from Subscription s
              join fetch s.product
              join fetch s.quotation
              left join fetch s.periods
            where s.status = :status
            """)
    List<Subscription> findAllWithPeriods(SubscriptionStatus status);

    boolean existsByQuotationId(Long quotationId);
}
