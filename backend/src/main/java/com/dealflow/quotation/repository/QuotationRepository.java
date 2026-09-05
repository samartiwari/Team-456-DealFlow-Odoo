package com.dealflow.quotation.repository;

import com.dealflow.quotation.model.Quotation;

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

    /**
     * What repricing this product would move, and what it would not.
     *
     * <p>A line with no stored price still follows the catalog; a line with one was frozen
     * when the deal was agreed. Counting quotations rather than lines, because that is the
     * unit the admin is being warned about.
     */
    @Query("""
            select count(distinct case when l.unitPrice is null then l.quotation.id end)
                       as openDrafts,
                   count(distinct case when l.unitPrice is not null then l.quotation.id end)
                       as frozenQuotations
            from QuotationLine l
            where l.product.id = :productId
            """)
    PriceChangeImpact impactOfRepricing(long productId);

    /** Projection for {@link #impactOfRepricing}. */
    interface PriceChangeImpact {
        long getOpenDrafts();

        long getFrozenQuotations();
    }
}
