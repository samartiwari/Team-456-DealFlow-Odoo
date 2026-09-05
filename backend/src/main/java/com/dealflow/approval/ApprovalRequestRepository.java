package com.dealflow.approval;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ApprovalRequestRepository extends JpaRepository<ApprovalRequest, Long> {

    @Query("""
            select distinct r from ApprovalRequest r
              join fetch r.quotation q
              join fetch q.customer c
              join fetch c.tier
              left join fetch r.steps s
              left join fetch s.decidedBy
            where r.id = :id
            """)
    Optional<ApprovalRequest> findByIdWithSteps(Long id);

    @Query("""
            select distinct r from ApprovalRequest r
              join fetch r.quotation q
              join fetch q.customer c
              join fetch c.tier
              left join fetch r.steps s
              left join fetch s.decidedBy
            where r.state = :state
            order by r.id desc
            """)
    List<ApprovalRequest> findAllByStateWithSteps(RequestState state);

    Optional<ApprovalRequest> findFirstByQuotationIdAndStateOrderByIdDesc(Long quotationId, RequestState state);
}
