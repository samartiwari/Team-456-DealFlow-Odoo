package com.dealflow;

import com.dealflow.identity.repository.AppUserRepository;
import com.dealflow.identity.security.JwtService;

/**
 * Mints a bearer token for a seeded user.
 *
 * <p>Tests used to pass {@code ?userId=1}. Now that identity comes from a signed token,
 * they sign one rather than logging in over HTTP for every request -- the login path has
 * its own tests, and repeating it in a hundred places would only make every other test
 * slower and no more truthful.
 */
public class TestTokens {

    private final JwtService jwt;
    private final AppUserRepository users;

    public TestTokens(JwtService jwt, AppUserRepository users) {
        this.jwt = jwt;
        this.users = users;
    }

    /** Ready to hand straight to {@code header("Authorization", ...)}. */
    public String bearer(long userId) {
        return "Bearer " + jwt.issueInternal(
                users.findById(userId).orElseThrow(
                        () -> new IllegalArgumentException("No seeded user " + userId))).token();
    }
}
