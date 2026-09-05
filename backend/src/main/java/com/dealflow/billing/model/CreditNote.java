package com.dealflow.billing.model;

import java.math.BigDecimal;
import java.time.Instant;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Money owed back. Always a positive amount -- it is a credit by nature, not by sign. */
@Entity
@Table(name = "credit_note")
@Getter
@Setter
@NoArgsConstructor
public class CreditNote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 300)
    private String reason;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt = Instant.now();

    public CreditNote(BigDecimal amount, String reason) {
        this.amount = amount;
        this.reason = reason;
    }

    public String ref() {
        return String.format("CN-%04d", id);
    }
}
