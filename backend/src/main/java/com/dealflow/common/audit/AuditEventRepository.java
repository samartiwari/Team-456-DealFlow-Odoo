package com.dealflow.common.audit;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AuditEventRepository extends JpaRepository<AuditEvent, Long> {

    @Query("""
            select e from AuditEvent e
              left join fetch e.actor
            where e.quotation.id = :quotationId
            order by e.id asc
            """)
    List<AuditEvent> findForQuotation(Long quotationId);

    /**
     * The activity feed: the same rows, across every quotation, newest first.
     *
     * <p>The quotation is fetched rather than lazy because the feed names the deal it
     * belongs to, and only a join gets that in one query instead of one per row. Both
     * joins are to-one, so {@code Pageable} still paginates in SQL -- the limitation that
     * forces a collection fetch join into memory does not apply here.
     */
    @Query("""
            select e from AuditEvent e
              join fetch e.quotation
              left join fetch e.actor
            order by e.id desc
            """)
    List<AuditEvent> findRecent(Pageable limit);
}
