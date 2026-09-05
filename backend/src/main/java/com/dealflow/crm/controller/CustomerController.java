package com.dealflow.crm.controller;

import com.dealflow.crm.dto.CustomerResponse;
import com.dealflow.crm.repository.CustomerRepository;

import java.util.List;


import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {

    private final CustomerRepository customers;

    public CustomerController(CustomerRepository customers) {
        this.customers = customers;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<CustomerResponse> list() {
        return customers.findAll().stream()
                .map(c -> new CustomerResponse(
                        c.getId(),
                        c.getName(),
                        c.getTier().getName().toUpperCase(),
                        c.getTier().getCeilingPct(),
                        c.getPhone()))
                .toList();
    }
}
