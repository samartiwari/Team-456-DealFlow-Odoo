package com.dealflow.billing.repository;

import com.dealflow.billing.model.Invoice;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {

    @Query("""
            select distinct i from Invoice i
              join fetch i.quotation q
              join fetch q.customer
              left join fetch i.lines
            where i.quotation.id = :quotationId
            """)
    Optional<Invoice> findByQuotationId(Long quotationId);

    @Query("""
            select distinct i from Invoice i
              join fetch i.quotation q
              join fetch q.customer
              left join fetch i.lines
            order by i.id desc
            """)
    List<Invoice> findAllNewestFirst();
}
