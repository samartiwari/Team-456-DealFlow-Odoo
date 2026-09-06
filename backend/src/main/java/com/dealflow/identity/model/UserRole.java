package com.dealflow.identity.model;

/**
 * The four internal roles from the brief.
 *
 * <p>What each may do is asked as a capability rather than compared as an identity. The
 * services used to test {@code role == REP} or {@code role != MANAGER}, which reads fine
 * while the roles happen to line up and answers the wrong question as soon as one is
 * added: a check spelled "not a rep" quietly grants every future role whatever it guards.
 *
 * <p>Approvals are deliberately absent from this list. A step names MANAGER or FINANCE and
 * only that role may sign it -- an Admin who could clear any step would make the routing
 * policy advisory.
 */
public enum UserRole {
    REP,
    MANAGER,
    FINANCE,
    /**
     * Runs the platform: configuration, and every number across it.
     *
     * The only role the brief names that no other one covers. Operations is not
     * here on purpose -- the brief's heading is "Finance / Operations User", one
     * role, and FINANCE already carries all three duties listed under it.
     */
    ADMIN;

    /** Sees the whole book of work -- the approvals queue, deal health, reporting. */
    public boolean canOversee() {
        return this == MANAGER || this == FINANCE || this == ADMIN;
    }

    /**
     * Sets the rules a deal is judged by: discount ceilings and approval chains.
     *
     * <p>The brief gives this to the Sales Manager by name -- "configures discount tiers
     * and approval chains" -- and it is the whole of what it gives them. A manager decides
     * how much discretion their reps have; that is their job and nobody else's.
     */
    public boolean canSetPolicy() {
        return this == MANAGER || this == ADMIN;
    }

    /**
     * Changes what the platform is made of: products, price lists, warehouses, plans.
     *
     * <p>Admin alone. The brief lists exactly these under Admin and stops the Sales
     * Manager's configuration at tiers and chains, so this is deliberately a narrower
     * question than {@link #canSetPolicy()} rather than the same one asked twice. Sharing
     * one predicate between them is what quietly handed a manager the catalog.
     */
    public boolean canConfigurePlatform() {
        return this == ADMIN;
    }

    /** Commits stock: accepting a split, receiving a delivery, clearing a backorder. */
    public boolean canFulfil() {
        return this == MANAGER || this == FINANCE || this == ADMIN;
    }

    /** Settles money: recording a payment, advancing the billing clock. */
    public boolean canSettle() {
        return this == FINANCE || this == ADMIN;
    }
}
