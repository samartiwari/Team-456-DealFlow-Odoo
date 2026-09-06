package com.dealflow.crm.dto;

/**
 * POST /api/customers.
 *
 * <p>The whole customer table: V1 gave it a name and a tier, V6 added the phone and made
 * it not null. There is deliberately nothing else -- a field the column list does not have
 * is a field the server would accept and drop in silence.
 *
 * <p>The tier arrives as its name rather than its id, because that is what the list
 * endpoint returns for it. A client that reads "GOLD" should be able to write "GOLD"
 * without a second request to find out that Gold is tier 3.
 *
 * <p>No id: V20 gave the column an identity sequence, so the server assigns it.
 */
public record CustomerBody(String name, String tier, String phone) {}
