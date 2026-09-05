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

    /**
     * Still the rep's to change. The same two states -- a quotation is editable exactly
     * while it has not been handed to anyone else -- but named for the question being
     * asked, since the edit guard and the upsell panel both ask it.
     */
    public boolean isEditable() {
        return this == DRAFT || this == RETURNED;
    }
}
