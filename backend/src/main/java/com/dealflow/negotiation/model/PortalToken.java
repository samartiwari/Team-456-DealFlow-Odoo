package com.dealflow.negotiation.model;

import com.dealflow.crm.model.Customer;
import com.dealflow.quotation.model.Quotation;

import java.time.Instant;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A magic link, and the session it becomes.
 *
 * <p>Only hashes are stored. The link itself is 256 bits of randomness that exists in the
 * URL and nowhere else, so a copy of this table grants nothing. Verifying burns the link
 * and mints a session on the same row: a link that has been opened is worth nothing, which
 * is what makes forwarding one to the wrong person survivable.
 */
@Entity
@Table(name = "portal_token")
@Getter
@Setter
@NoArgsConstructor
public class PortalToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "token_hash", nullable = false, length = 64, updatable = false)
    private String tokenHash;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    /** Set the moment the link is exchanged. A second attempt finds it already stamped. */
    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "session_hash", length = 64)
    private String sessionHash;

    @Column(name = "session_expires_at")
    private Instant sessionExpiresAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public PortalToken(String tokenHash, Customer customer, Quotation quotation, Instant expiresAt) {
        this.tokenHash = tokenHash;
        this.customer = customer;
        this.quotation = quotation;
        this.expiresAt = expiresAt;
    }

    public boolean isSpent(Instant now) {
        return usedAt != null || expiresAt.isBefore(now);
    }

    public boolean sessionIsLive(Instant now) {
        return sessionHash != null && sessionExpiresAt != null && sessionExpiresAt.isAfter(now);
    }
}
