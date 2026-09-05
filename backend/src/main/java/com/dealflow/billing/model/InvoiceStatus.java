package com.dealflow.billing.model;

/**
 * Derived from what has been paid and credited, never assigned by a client.
 *
 * <p>DRAFT and VOID exist because the brief lists them; nothing in this slice produces
 * either, and a status nobody can reach is better than one set by hand.
 */
public enum InvoiceStatus { DRAFT, OPEN, PARTIALLY_PAID, PAID, CREDITED, VOID }
