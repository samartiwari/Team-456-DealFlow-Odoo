package com.dealflow.billing.model;

/** What a mid-period quantity change does to the money. */
public enum ProrationPolicy {
    /** Bill or credit the unused remainder of the period, by the day. */
    PRORATE,
    /** The new quantity starts next period. This one is left exactly as it was. */
    FULL_PERIOD,
    /** The new quantity applies to this period in full, with no day-count adjustment. */
    NONE
}
