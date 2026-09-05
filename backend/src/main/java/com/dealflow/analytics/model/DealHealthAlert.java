package com.dealflow.analytics.model;

import com.dealflow.quotation.model.Quotation;

import java.time.Instant;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One thing worth a manager's attention.
 *
 * <p>{@code (quotation_id, type)} is unique among unresolved rows, so a detector can be
 * re-run as often as the dashboard is opened without the same stalled deal accumulating an
 * alert per visit.
 */
@Entity
@Table(name = "deal_health_alert")
@Getter
@Setter
@NoArgsConstructor
public class DealHealthAlert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private AlertType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private AlertSeverity severity;

    /** Why this deal, in words -- not what the detector does in general. */
    @Column(nullable = false, length = 500)
    private String explanation;

    @Column(name = "payload_json", columnDefinition = "text")
    private String payloadJson;

    @Column(name = "opened_at", nullable = false)
    private Instant openedAt = Instant.now();

    /** A manager has seen it. */
    @Column(name = "acked_at")
    private Instant ackedAt;

    /** The condition no longer holds. Distinct from having been seen. */
    @Column(name = "resolved_at")
    private Instant resolvedAt;

    public DealHealthAlert(Quotation quotation, AlertType type, AlertSeverity severity,
                           String explanation, String payloadJson) {
        this.quotation = quotation;
        this.type = type;
        this.severity = severity;
        this.explanation = explanation;
        this.payloadJson = payloadJson;
    }
}
