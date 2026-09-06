package com.dealflow.approval.model;

/**
 * OPEN until somebody acts. APPROVED, REJECTED and RETURNED are an approver's decision;
 * WITHDRAWN is the rep taking their own quotation back before one is made, which is not a
 * decision and should not read like one in the audit trail.
 */
public enum RequestState { OPEN, APPROVED, REJECTED, RETURNED, WITHDRAWN }
