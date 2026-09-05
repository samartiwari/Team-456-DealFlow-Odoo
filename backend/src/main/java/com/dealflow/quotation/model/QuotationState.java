package com.dealflow.quotation.model;

/** Only what this slice needs. SENT/UNDER_NEGOTIATION/CONFIRMED arrive with the portal. */
public enum QuotationState {
    DRAFT,
    PENDING_APPROVAL,
    RETURNED,
    APPROVED,
    REJECTED;

    /** A quote can only be confirmed out of these two. */
    public boolean isConfirmable() {
        return this == DRAFT || this == RETURNED;
    }
}
