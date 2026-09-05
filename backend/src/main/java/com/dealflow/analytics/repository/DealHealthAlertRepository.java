package com.dealflow.analytics.repository;

import com.dealflow.analytics.model.AlertType;
import com.dealflow.analytics.model.DealHealthAlert;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DealHealthAlertRepository extends JpaRepository<DealHealthAlert, Long> {

    @Query("""
            select distinct a from DealHealthAlert a
              join fetch a.quotation q
              join fetch q.customer
              join fetch q.rep
            where a.resolvedAt is null
            order by a.severity, a.openedAt desc
            """)
    List<DealHealthAlert> findOpen();

    @Query("""
            select a from DealHealthAlert a
            where a.resolvedAt is null and a.quotation.id = :quotationId and a.type = :type
            """)
    Optional<DealHealthAlert> findOpenFor(Long quotationId, AlertType type);
}
