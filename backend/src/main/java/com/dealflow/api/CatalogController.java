package com.dealflow.api;

import com.dealflow.api.dto.*;

import java.util.List;

import com.dealflow.catalog.ProductRepository;
import com.dealflow.crm.CustomerRepository;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class CatalogController {

    private final ProductRepository products;
    private final CustomerRepository customers;

    public CatalogController(ProductRepository products, CustomerRepository customers) {
        this.products = products;
        this.customers = customers;
    }

    @GetMapping("/products")
    @Transactional(readOnly = true)
    public List<ProductResponse> products() {
        return products.findAll().stream()
                .map(p -> new ProductResponse(
                        p.getId(), p.getName(), p.getCategory().getName(),
                        p.getUnitPrice(), p.getCategory().getCeilingPct()))
                .toList();
    }

    @GetMapping("/customers")
    @Transactional(readOnly = true)
    public List<CustomerResponse> customers() {
        return customers.findAll().stream()
                .map(c -> new CustomerResponse(
                        c.getId(), c.getName(),
                        c.getTier().getName().toUpperCase(), c.getTier().getCeilingPct()))
                .toList();
    }
}
