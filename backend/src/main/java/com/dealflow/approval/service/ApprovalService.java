package com.dealflow.approval.service;

import com.dealflow.approval.dto.ApprovalDetailResponse;
import com.dealflow.approval.dto.ApprovalSummaryResponse;
import com.dealflow.approval.dto.AuditResponse;
import com.dealflow.approval.dto.DecideRequest;
import com.dealflow.approval.dto.StepResponse;
import com.dealflow.approval.model.ApprovalRequest;
import com.dealflow.approval.model.ApprovalStep;
import com.dealflow.approval.model.ApproverRole;
import com.dealflow.approval.model.RequestState;
import com.dealflow.approval.model.StepState;
import com.dealflow.approval.repository.ApprovalRequestRepository;
import com.dealflow.common.audit.AuditEventRepository;
import com.dealflow.common.audit.AuditService;
import com.dealflow.billing.service.QuotationApprovedEvent;
import com.dealflow.common.error.ApiException;
import com.dealflow.identity.model.AppUser;
import com.dealflow.identity.repository.AppUserRepository;
import com.dealflow.quotation.model.Quotation;
import com.dealflow.quotation.model.QuotationState;
import com.dealflow.quotation.service.PricingService;
import com.dealflow.quotation.service.QuotationMapper;
import com.dealflow.quotation.service.QuotationService;

import java.time.Instant;
import java.util.List;


import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ApprovalService {

    private final ApprovalRequestRepository approvals;
    private final AppUserRepository users;
    private final AuditEventRepository auditEvents;
    private final QuotationService quotationService;
    private final PricingService pricing;
    private final AuditService audit;
    private final QuotationMapper mapper;
    private final ApplicationEventPublisher events;

    public ApprovalService(ApprovalRequestRepository approvals, AppUserRepository users,
                           AuditEventRepository auditEvents, QuotationService quotationService,
                           PricingService pricing, AuditService audit, QuotationMapper mapper,
                           ApplicationEventPublisher events) {
        this.events = events;
        this.approvals = approvals;
        this.users = users;
        this.auditEvents = auditEvents;
        this.quotationService = quotationService;
        this.pricing = pricing;
        this.audit = audit;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<ApprovalSummaryResponse> queue() {
        return approvals.findAllByStateWithSteps(RequestState.OPEN).stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional(readOnly = true)
    public ApprovalDetailResponse detail(long approvalId) {
        return toDetail(load(approvalId));
    }

    /**
     * approve / reject / return. A reason is mandatory on all three -- the audit trail is
     * worthless without one.
     */
    @Transactional
    public ApprovalDetailResponse decide(long approvalId, DecideRequest request, long actorId) {
        ApprovalRequest approval = load(approvalId);
        AppUser actor = users.findById(actorId)
                .orElseThrow(() -> ApiException.notFound("User", actorId));

        if (request.reason() == null || request.reason().isBlank()) {
            throw ApiException.invalid("A reason is required for every decision.", "reason");
        }
        if (approval.getState() != RequestState.OPEN) {
            throw ApiException.conflict("This approval has already been decided.");
        }

        Decision decision = Decision.parse(request.decision());
        ApprovalStep step = approval.currentStep()
                .orElseThrow(() -> ApiException.conflict("This step is not actionable yet."));

        Quotation quotation = approval.getQuotation();

        // Whoever the step is addressed to must be the one who signs it. Without this the
        // chain is decorative: any user can clear any step, so a risk-100 deal needing both
        // Manager and Finance falls to one person pressing approve twice -- and the audit
        // row records it as legitimate. UserRole and ApproverRole are deliberately separate
        // types (a REP is never an approver), so they are compared by name.
        if (!step.getRole().name().equals(actor.getRole().name())) {
            throw ApiException.forbidden("This step requires " + step.getRole() + "; "
                    + actor.getName() + " is " + actor.getRole() + ".");
        }

        // Holding the role is still not enough -- a rep can never approve their own quotation.
        if (quotation.getRep().getId().equals(actor.getId())) {
            throw ApiException.conflict("A rep cannot approve their own quotation.");
        }

        step.setDecidedBy(actor);
        step.setReason(request.reason());
        step.setDecidedAt(Instant.now());

        QuotationState from = quotation.getState();

        switch (decision) {
            case APPROVE -> {
                step.setState(StepState.APPROVED);
                var next = approval.nextBlockedStep();
                if (next.isPresent()) {
                    // Unblock the following step; the quotation stays PENDING_APPROVAL.
                    next.get().setState(StepState.PENDING);
                    audit.record(quotation, actor, "STEP_APPROVED", from, from,
                            step.getRole() + ": " + request.reason());
                } else {
                    approval.setState(RequestState.APPROVED);
                    quotation.setState(QuotationState.APPROVED);
                    quotation.setApprovedBaselineScore(quotation.getRiskScore());
                    audit.record(quotation, actor, "APPROVED", from, QuotationState.APPROVED,
                            step.getRole() + ": " + request.reason());
                    events.publishEvent(new QuotationApprovedEvent(quotation.getId()));
                }
            }
            case REJECT -> {
                step.setState(StepState.REJECTED);
                approval.setState(RequestState.REJECTED);
                quotation.setState(QuotationState.REJECTED);
                audit.record(quotation, actor, "REJECTED", from, QuotationState.REJECTED,
                        step.getRole() + ": " + request.reason());
            }
            case RETURN -> {
                step.setState(StepState.RETURNED);
                approval.setState(RequestState.RETURNED);
                quotation.setState(QuotationState.RETURNED);
                audit.record(quotation, actor, "RETURNED", from, QuotationState.RETURNED,
                        step.getRole() + ": " + request.reason());
            }
        }

        approvals.save(approval);
        return toDetail(approval);
    }

    /**
     * Adds a Finance signature to a chain that is already running.
     *
     * <p>Raised from the deal health dashboard, and audited exactly like a decision: an
     * escalation changes who has to sign, so it belongs in the trail beside the signatures
     * themselves rather than in a dashboard log nobody reads.
     *
     * <p>Appended as BLOCKED so the sequence still holds -- Finance signs after whoever is
     * already in front of them, not instead of them.
     */
    @Transactional
    public ApprovalDetailResponse escalateToFinance(long quotationId, AppUser actor) {
        ApprovalRequest approval = approvals
                .findFirstByQuotationIdAndStateOrderByIdDesc(quotationId, RequestState.OPEN)
                .orElseThrow(() -> ApiException.conflict(
                        "That quotation has no approval in progress, so there is nothing to "
                                + "escalate."));

        boolean financeAlreadyOn = approval.getSteps().stream()
                .anyMatch(s -> s.getRole() == ApproverRole.FINANCE);
        if (financeAlreadyOn) {
            throw ApiException.conflict("Finance is already on that approval.");
        }

        Quotation quotation = approval.getQuotation();
        approval.addStep(new ApprovalStep(approval.getSteps().size() + 1,
                ApproverRole.FINANCE, StepState.BLOCKED));
        approvals.save(approval);

        audit.record(quotation, actor, "ESCALATED",
                "Finance added to the approval chain by " + actor.getName());
        return toDetail(approval);
    }

    // ---------- mapping ----------

    private ApprovalRequest load(long id) {
        return approvals.findByIdWithSteps(id)
                .orElseThrow(() -> ApiException.notFound("Approval", id));
    }

    private ApprovalSummaryResponse toSummary(ApprovalRequest approval) {
        Quotation quotation = quotationService.load(approval.getQuotation().getId());
        var priced = pricing.price(quotation);
        return new ApprovalSummaryResponse(
                approval.getId(),
                quotation.getId(),
                quotation.ref(),
                quotation.getCustomer().getName(),
                approval.getRiskScore(),
                approval.getSteps().stream().map(s -> s.getRole().name()).toList(),
                approval.currentStep().map(s -> s.getRole().name()).orElse(null),
                priced.subtotal(),
                QuotationMapper.CURRENCY,
                QuotationMapper.iso(approval.getCreatedAt()));
    }

    private ApprovalDetailResponse toDetail(ApprovalRequest approval) {
        Quotation quotation = quotationService.load(approval.getQuotation().getId());

        List<StepResponse> steps = approval.getSteps().stream()
                .map(s -> new StepResponse(
                        s.getId(),
                        s.getStepOrder(),
                        s.getRole().name(),
                        s.getState().name(),
                        s.getDecidedBy() == null ? null : s.getDecidedBy().getName(),
                        s.getReason(),
                        QuotationMapper.iso(s.getDecidedAt())))
                .toList();

        List<AuditResponse> trail = auditEvents.findForQuotation(quotation.getId()).stream()
                .map(mapper::toAudit)
                .toList();

        return new ApprovalDetailResponse(
                approval.getId(),
                approval.getRiskScore(),
                approval.getState().name(),
                mapper.toRecompute(pricing.price(quotation)),
                steps,
                trail);
    }

    private enum Decision {
        APPROVE, REJECT, RETURN;

        static Decision parse(String raw) {
            if (raw == null) {
                throw ApiException.invalid("A decision is required.", "decision");
            }
            try {
                return valueOf(raw.trim().toUpperCase());
            } catch (IllegalArgumentException ex) {
                throw ApiException.invalid(
                        "Decision must be APPROVE, REJECT or RETURN.", "decision");
            }
        }
    }
}
