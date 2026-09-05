package com.dealflow.policy.repository;

import com.dealflow.policy.model.PolicyChange;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PolicyChangeRepository extends JpaRepository<PolicyChange, Long> {

    /** Newest first, which is the order the screen renders. */
    @Query("select c from PolicyChange c left join fetch c.actor order by c.id desc")
    List<PolicyChange> findAllNewestFirst();
}
