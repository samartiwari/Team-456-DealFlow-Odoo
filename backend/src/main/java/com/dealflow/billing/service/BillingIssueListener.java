package com.dealflow.billing.service;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Forks an approved order into its one-time invoice and its recurring schedules. */
@Component
public class BillingIssueListener {

    private final BillingService billing;

    public BillingIssueListener(BillingService billing) {
        this.billing = billing;
    }

    @EventListener
    @Transactional
    public void onApproved(QuotationApprovedEvent event) {
        billing.issueFor(event.quotationId());
    }
}
