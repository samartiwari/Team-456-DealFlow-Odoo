package com.dealflow.catalog.dto;

/**
 * What saving a price change would actually move.
 *
 * <p>Shown next to the price field before the save lands, because "this updates 3 open
 * drafts and leaves 41 agreed deals alone" is the difference between an admin editing
 * confidently and an admin not touching the screen at all.
 */
public record ProductImpactResponse(long openDrafts, long frozenQuotations) {}
