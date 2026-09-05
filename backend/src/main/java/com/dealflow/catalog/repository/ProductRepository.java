package com.dealflow.catalog.repository;

import com.dealflow.catalog.model.Product;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {

    /** The live catalog. What a rep can put on a line. */
    List<Product> findByArchivedFalseOrderById();

    /** Everything, archived included -- the admin list, which has to offer a restore. */
    List<Product> findAllByOrderById();
}
