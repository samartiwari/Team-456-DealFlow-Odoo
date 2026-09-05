package com.dealflow.quotation;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface QuotationRepository extends JpaRepository<Quotation, Long> {

    @Query("""
            select distinct q from Quotation q
              join fetch q.customer c
              join fetch c.tier
              join fetch q.rep
              left join fetch q.lines l
              left join fetch l.product p
              left join fetch p.category
            where q.id = :id
            """)
    Optional<Quotation> findByIdWithLines(Long id);

    @Query("""
            select distinct q from Quotation q
              join fetch q.customer c
              join fetch c.tier
              join fetch q.rep
              left join fetch q.lines l
              left join fetch l.product p
              left join fetch p.category
            order by q.id desc
            """)
    List<Quotation> findAllWithLines();
}
