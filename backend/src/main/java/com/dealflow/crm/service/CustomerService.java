package com.dealflow.crm.service;

import com.dealflow.common.error.ApiException;
import com.dealflow.crm.dto.CustomerBody;
import com.dealflow.crm.dto.CustomerResponse;
import com.dealflow.crm.model.Customer;
import com.dealflow.crm.model.CustomerTier;
import com.dealflow.crm.repository.CustomerRepository;
import com.dealflow.crm.repository.CustomerTierRepository;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Customers, read and written.
 *
 * <p>Not under {@code /api/admin/**}, and that is a decision rather than an oversight. The
 * configuration area is Admin's because those rows set prices, ceilings and policy; a
 * customer sets none of them. It carries a name, a phone number and a pointer at a tier
 * whose ceiling an admin already owns, so the strictest thing a rep can do here is name a
 * discount cap that already exists. Making them stop mid-quote and find an admin is how a
 * deal gets typed into a spreadsheet instead.
 *
 * <p>The lengths below are the column widths from V1 and V6 rather than house style. A
 * name this accepts and Postgres truncates is a bug that only appears in production.
 */
@Service
public class CustomerService {

    /** varchar(160) in V1. */
    private static final int NAME_MAX = 160;

    /** varchar(20) in V6. */
    private static final int PHONE_MAX = 20;

    private final CustomerRepository customers;
    private final CustomerTierRepository tiers;

    public CustomerService(CustomerRepository customers, CustomerTierRepository tiers) {
        this.customers = customers;
        this.tiers = tiers;
    }

    @Transactional(readOnly = true)
    public List<CustomerResponse> list() {
        return customers.findAll().stream().map(CustomerService::toResponse).toList();
    }

    @Transactional
    public CustomerResponse create(CustomerBody body) {
        Customer customer = new Customer();
        customer.setName(name(body));
        customer.setTier(tier(body));
        customer.setPhone(phone(body));
        return toResponse(customers.save(customer));
    }

    private static String name(CustomerBody body) {
        String name = body == null || body.name() == null ? "" : body.name().trim();
        if (name.isEmpty()) {
            throw ApiException.invalid("A customer needs a name.", "name");
        }
        if (name.length() > NAME_MAX) {
            throw ApiException.invalid(
                    "That name is longer than the " + NAME_MAX + " characters the column holds.",
                    "name");
        }
        return name;
    }

    /**
     * Matched on the name the list endpoint prints, case-insensitively, and read from the
     * table rather than an enum -- the ceiling behind each tier is a seeded row an admin
     * can move, so the set of legal tiers is a query, not a constant in Java.
     */
    private CustomerTier tier(CustomerBody body) {
        String wanted = body == null || body.tier() == null ? "" : body.tier().trim();
        if (wanted.isEmpty()) {
            throw ApiException.invalid("Pick a tier.", "tier");
        }
        return tiers.findAll().stream()
                .filter(t -> t.getName().equalsIgnoreCase(wanted))
                .findFirst()
                .orElseThrow(() -> ApiException.invalid("Pick a tier that exists.", "tier"));
    }

    private static String phone(CustomerBody body) {
        String phone = body == null || body.phone() == null ? "" : body.phone().trim();
        if (phone.isEmpty()) {
            throw ApiException.invalid("A phone number is required.", "phone");
        }
        if (phone.length() > PHONE_MAX) {
            throw ApiException.invalid(
                    "That number is longer than the " + PHONE_MAX + " characters the column holds.",
                    "phone");
        }
        // The column carries no format constraint, so this stays deliberately loose. It
        // rejects a placeholder like "n/a" without ruling out an extension, a country code
        // or the spacing someone legitimately types.
        if (phone.chars().noneMatch(Character::isDigit)) {
            throw ApiException.invalid("That does not look like a phone number.", "phone");
        }
        return phone;
    }

    private static CustomerResponse toResponse(Customer customer) {
        return new CustomerResponse(
                customer.getId(),
                customer.getName(),
                customer.getTier().getName().toUpperCase(),
                customer.getTier().getCeilingPct(),
                customer.getPhone());
    }
}
