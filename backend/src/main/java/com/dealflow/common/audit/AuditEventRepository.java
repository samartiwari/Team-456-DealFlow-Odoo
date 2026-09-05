package com.dealflow.common.audit;

import java.util.List;

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
}
