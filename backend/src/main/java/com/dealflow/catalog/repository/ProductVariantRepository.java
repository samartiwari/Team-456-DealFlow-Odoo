package com.dealflow.catalog.repository;

import com.dealflow.catalog.model.ProductVariant;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {

    List<ProductVariant> findByProductIdOrderById(Long productId);
}
