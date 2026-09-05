package com.dealflow.upsell.repository;

import com.dealflow.upsell.model.UpsellRule;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UpsellRuleRepository extends JpaRepository<UpsellRule, Long> {

    /** Rules triggered by anything already on the quotation, with the candidate joined in. */
    @Query("""
            select r from UpsellRule r
              join fetch r.suggested s
              join fetch s.category
            where r.trigger.id in :productIds
            """)
    List<UpsellRule> findTriggeredBy(Collection<Long> productIds);
}
