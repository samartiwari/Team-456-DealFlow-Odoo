package com.dealflow.quotation.model;

public enum QuotationState {
    DRAFT,
    PENDING_APPROVAL,
    RETURNED,
    APPROVED,
    REJECTED,
    /** Approved, and a portal link is out with the customer. */
    SENT,
    /** The customer has countered; the terms are in flux. */
    UNDER_NEGOTIATION,
    /** The customer accepted. The deal is agreed. */
    CONFIRMED;

    /**
     * Terms are settled enough to ship and bill against.
     *
     * <p>Not UNDER_NEGOTIATION: a quotation whose price the customer is actively disputing
     * should not have stock reserved against it.
     */
    public boolean isFulfillable() {
        return this == APPROVED || this == SENT || this == CONFIRMED;
    }

    /** Open to the customer in the portal. */
    public boolean isWithCustomer() {
        return this == SENT || this == UNDER_NEGOTIATION;
    }

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
