package com.dealflow.identity.model;

/**
 * The five roles from the brief.
 *
 * <p>What each may do is asked as a capability rather than compared as an identity. The
 * services used to test {@code role == REP} or {@code role != MANAGER}, which read fine
 * with three roles and answers the wrong question with five: adding Admin to a check
 * spelled "not a rep" would have silently handed Operations the discount policy too.
 *
 * <p>Approvals are deliberately absent from this list. A step names MANAGER or FINANCE and
 * only that role may sign it -- an Admin who could clear any step would make the routing
 * policy advisory.
 */
public enum UserRole {
    REP,
    MANAGER,
    FINANCE,
    /** Runs the platform: configuration, and every number across it. */
    ADMIN,
    /** Moves goods: splits, backorders, stock receipts. */
    OPERATIONS;

    /** Sees the whole book of work -- the approvals queue, deal health, reporting. */
    public boolean canOversee() {
        return this == MANAGER || this == FINANCE || this == ADMIN;
    }

    /** Changes how the platform behaves: the catalog, the policy, the plans. */
    public boolean canConfigure() {
        return this == MANAGER || this == ADMIN;
    }

    /** Commits stock: accepting a split, receiving a delivery, clearing a backorder. */
    public boolean canFulfil() {
        return this == MANAGER || this == FINANCE || this == ADMIN || this == OPERATIONS;
    }

    /** Settles money: recording a payment, advancing the billing clock. */
    public boolean canSettle() {
        return this == FINANCE || this == ADMIN;
    }
}
