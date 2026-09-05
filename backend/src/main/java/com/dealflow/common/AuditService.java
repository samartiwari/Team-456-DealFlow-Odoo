package com.dealflow.common;

import com.dealflow.identity.AppUser;
import com.dealflow.quotation.Quotation;
import com.dealflow.quotation.QuotationState;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The single writer of {@code audit_event}. Called inside every state-changing method,
 * and nothing else appends to the trail.
 */
@Service
public class AuditService {

    private final AuditEventRepository repository;

    public AuditService(AuditEventRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void record(Quotation quotation, AppUser actor, String action,
                       QuotationState from, QuotationState to, String reason) {
        AuditEvent event = new AuditEvent();
        event.setQuotation(quotation);
        event.setActor(actor);
        event.setAction(action);
        event.setFromState(from == null ? null : from.name());
        event.setToState(to == null ? null : to.name());
        event.setReason(reason);
        repository.save(event);

        // The stalled-deal detector reads this; keeping it here means it can never drift.
        quotation.setLastActivityAt(event.getCreatedAt());
    }

    /** An edit that changes no state -- adding a line, changing a discount. */
    @Transactional
    public void record(Quotation quotation, AppUser actor, String action, String reason) {
        record(quotation, actor, action, null, null, reason);
    }
}
