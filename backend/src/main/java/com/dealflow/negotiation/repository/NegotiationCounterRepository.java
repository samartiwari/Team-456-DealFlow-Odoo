package com.dealflow.negotiation.repository;

import com.dealflow.negotiation.model.CounterState;
import com.dealflow.negotiation.model.NegotiationCounter;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface NegotiationCounterRepository extends JpaRepository<NegotiationCounter, Long> {

    Optional<NegotiationCounter> findByQuotationId(Long quotationId);

    /** Quotation ids with a counter nobody has settled yet. */
    @Query("select c.quotation.id from NegotiationCounter c where c.state = :state")
    List<Long> quotationIdsInState(CounterState state);
}
