package com.dealflow.identity.dto;

/**
 * @param token     send as {@code Authorization: Bearer <token>} on every call
 * @param expiresAt twelve hours out. There is no refresh token; sign in again
 */
public record AuthSessionResponse(String token, String expiresAt, AuthUserResponse user) {}
