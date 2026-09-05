package com.dealflow.catalog.repository;

import com.dealflow.catalog.model.ProductCategory;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductCategoryRepository extends JpaRepository<ProductCategory, Long> {}
