package com.dealflow.approval;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import com.dealflow.quotation.Quotation;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "approval_request")
@Getter
@Setter
@NoArgsConstructor
public class ApprovalRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "quotation_id", nullable = false)
    private Quotation quotation;

    @Column(name = "risk_score", nullable = false)
    private int riskScore;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RequestState state = RequestState.OPEN;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @OneToMany(mappedBy = "request", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("stepOrder ASC")
    private List<ApprovalStep> steps = new ArrayList<>();

    public ApprovalRequest(Quotation quotation, int riskScore) {
        this.quotation = quotation;
        this.riskScore = riskScore;
    }

    public void addStep(ApprovalStep step) {
        step.setRequest(this);
        steps.add(step);
    }

    /** The step that is actionable right now, if any. */
    public Optional<ApprovalStep> currentStep() {
        return steps.stream().filter(s -> s.getState() == StepState.PENDING).findFirst();
    }

    /** The next blocked step, which becomes actionable once the current one is approved. */
    public Optional<ApprovalStep> nextBlockedStep() {
        return steps.stream().filter(s -> s.getState() == StepState.BLOCKED).findFirst();
    }
}
