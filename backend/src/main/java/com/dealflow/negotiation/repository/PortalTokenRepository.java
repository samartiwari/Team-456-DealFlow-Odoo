package com.dealflow.negotiation.repository;

import com.dealflow.negotiation.model.PortalToken;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PortalTokenRepository extends JpaRepository<PortalToken, Long> {

    /** Lookup is by hash: the token itself is never stored, so it cannot be searched for. */
    @Query("""
            select t from PortalToken t
              join fetch t.quotation q
              join fetch q.customer
            where t.tokenHash = :tokenHash
            """)
    Optional<PortalToken> findByTokenHash(String tokenHash);

    @Query("""
            select t from PortalToken t
              join fetch t.quotation q
              join fetch q.customer
            where t.sessionHash = :sessionHash
            """)
    Optional<PortalToken> findBySessionHash(String sessionHash);
}
