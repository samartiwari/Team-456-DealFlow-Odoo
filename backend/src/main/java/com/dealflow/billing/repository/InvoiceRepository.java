package com.dealflow.billing.repository;

import com.dealflow.billing.model.Invoice;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {

    /**
     * Every invoice raised for an order, oldest first.
     *
     * <p>An order has more than one once its subscription starts billing: the original
     * covers the one-time lines, and each cycle raises its own.
     */
    @Query("""
            select distinct i from Invoice i
              join fetch i.quotation q
              join fetch q.customer
              left join fetch i.lines
            where i.quotation.id = :quotationId
            order by i.id asc
            """)
    List<Invoice> findAllByQuotationId(Long quotationId);

    /** The one the order started with -- what the billing screen shows and prorations join. */
    default Optional<Invoice> findOriginating(Long quotationId) {
        return findAllByQuotationId(quotationId).stream().findFirst();
    }

    @Query("""
            select distinct i from Invoice i
              join fetch i.quotation q
              join fetch q.customer
              left join fetch i.lines
            order by i.id desc
            """)
    List<Invoice> findAllNewestFirst();
}
