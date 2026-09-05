package com.dealflow.approval;

import java.time.Instant;
import java.util.List;

import com.dealflow.api.*;
import com.dealflow.common.ApiException;
import com.dealflow.common.AuditEventRepository;
import com.dealflow.common.AuditService;
import com.dealflow.identity.AppUser;
import com.dealflow.identity.AppUserRepository;
import com.dealflow.quotation.PricingService;
import com.dealflow.quotation.Quotation;
import com.dealflow.quotation.QuotationService;
import com.dealflow.quotation.QuotationState;

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

    public ApprovalService(ApprovalRequestRepository approvals, AppUserRepository users,
                           AuditEventRepository auditEvents, QuotationService quotationService,
                           PricingService pricing, AuditService audit, QuotationMapper mapper) {
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

        // A rep can never approve their own quotation.
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
                    audit.record(quotation, actor, "APPROVED", from, QuotationState.APPROVED,
                            step.getRole() + ": " + request.reason());
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
