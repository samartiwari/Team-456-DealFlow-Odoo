package com.dealflow.identity.security;

import com.dealflow.common.error.ApiException;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Who is making this request.
 *
 * <p>Replaces the {@code ?userId=} parameter every endpoint used to take. That parameter
 * was a stand-in for identity and anyone could set it to anything -- the role checks
 * throughout the services were real, but they were checking a claim the caller made about
 * themselves. This reads the same id out of a signed token instead, so those checks now
 * mean what they always looked like they meant.
 */
@Component
public class CurrentUser {

    public long id() {
        return principal().userId();
    }

    public String role() {
        return principal().role();
    }

    private JwtService.Principal principal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !(authentication.getPrincipal() instanceof JwtService.Principal p)) {
            throw ApiException.unauthorized("You are not signed in.");
        }
        return p;
    }
}
