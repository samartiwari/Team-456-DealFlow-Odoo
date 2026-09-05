package com.dealflow.policy.model;

import com.dealflow.identity.model.AppUser;

import java.time.Instant;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One entry in the discount policy's change log, required by A3.
 *
 * <p>The summary is generated from the diff rather than typed, so it always describes what
 * actually changed. Append-only: an edit is never amended, a later edit is a new row.
 */
@Entity
@Table(name = "policy_change")
@Getter
@Setter
@NoArgsConstructor
public class PolicyChange {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Null only if the acting user was later removed; the entry itself survives. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private AppUser actor;

    @Column(nullable = false, length = 1000)
    private String summary;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public PolicyChange(AppUser actor, String summary) {
        this.actor = actor;
        this.summary = summary;
    }
}
