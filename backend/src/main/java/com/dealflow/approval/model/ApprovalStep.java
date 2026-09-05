package com.dealflow.approval.model;

import com.dealflow.identity.model.AppUser;

import java.time.Instant;


import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "approval_step")
@Getter
@Setter
@NoArgsConstructor
public class ApprovalStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "request_id", nullable = false)
    private ApprovalRequest request;

    @Column(name = "step_order", nullable = false)
    private int stepOrder;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApproverRole role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StepState state;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by")
    private AppUser decidedBy;

    @Column(length = 500)
    private String reason;

    @Column(name = "decided_at")
    private Instant decidedAt;

    public ApprovalStep(int stepOrder, ApproverRole role, StepState state) {
        this.stepOrder = stepOrder;
        this.role = role;
        this.state = state;
    }
}
