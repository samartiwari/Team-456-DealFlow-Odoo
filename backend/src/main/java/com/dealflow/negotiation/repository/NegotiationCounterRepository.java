package com.dealflow.negotiation.repository;

import com.dealflow.negotiation.model.NegotiationCounter;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface NegotiationCounterRepository extends JpaRepository<NegotiationCounter, Long> {

    Optional<NegotiationCounter> findByQuotationId(Long quotationId);
}
