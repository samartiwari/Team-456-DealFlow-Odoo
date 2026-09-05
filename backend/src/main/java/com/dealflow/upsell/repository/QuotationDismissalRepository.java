package com.dealflow.upsell.repository;

import com.dealflow.upsell.model.QuotationDismissal;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface QuotationDismissalRepository extends JpaRepository<QuotationDismissal, Long> {

    @Query("select d.product.id from QuotationDismissal d where d.quotation.id = :quotationId")
    List<Long> findProductIdsFor(Long quotationId);

    Optional<QuotationDismissal> findByQuotationIdAndProductId(Long quotationId, Long productId);
}
