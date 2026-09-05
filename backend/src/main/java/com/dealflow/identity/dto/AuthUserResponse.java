package com.dealflow.identity.dto;

/** Who is signed in. There is deliberately no password field of any kind here. */
public record AuthUserResponse(long id, String name, String email, String role) {}
