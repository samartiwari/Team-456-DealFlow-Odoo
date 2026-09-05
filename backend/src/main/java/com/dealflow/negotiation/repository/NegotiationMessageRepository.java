package com.dealflow.negotiation.repository;

import com.dealflow.negotiation.model.NegotiationMessage;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface NegotiationMessageRepository extends JpaRepository<NegotiationMessage, Long> {

    @Query("""
            select m from NegotiationMessage m
              left join fetch m.line
            where m.quotation.id = :quotationId
            order by m.id asc
            """)
    List<NegotiationMessage> findThread(Long quotationId);
}
