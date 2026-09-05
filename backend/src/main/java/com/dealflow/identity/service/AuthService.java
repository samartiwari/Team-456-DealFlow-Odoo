package com.dealflow.identity.service;

import com.dealflow.common.error.ApiException;
import com.dealflow.identity.dto.*;
import com.dealflow.identity.model.AppUser;
import com.dealflow.identity.model.UserRole;
import com.dealflow.identity.repository.AppUserRepository;
import com.dealflow.identity.security.JwtService;

import java.time.format.DateTimeFormatter;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Signing in, signing up, and saying who is signed in. */
@Service
public class AuthService {

    private static final int MIN_PASSWORD = 8;

    private final AppUserRepository users;
    private final PasswordEncoder passwords;
    private final JwtService jwt;

    public AuthService(AppUserRepository users, PasswordEncoder passwords, JwtService jwt) {
        this.users = users;
        this.passwords = passwords;
        this.jwt = jwt;
    }

    @Transactional(readOnly = true)
    public AuthSessionResponse login(LoginRequest request) {
        String email = request == null ? null : request.email();
        String password = request == null ? null : request.password();

        AppUser user = users.findByEmail(email == null ? "" : email.trim()).orElse(null);

        // Verified even when the account does not exist, and the message is the same
        // either way. Skipping the hash for an unknown email makes the response faster,
        // and that timing difference is enough to enumerate who has an account here.
        boolean valid = passwords.matches(
                password == null ? "" : password,
                user == null ? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv"
                        : user.getPasswordHash());

        if (user == null || !valid) {
            throw ApiException.unauthorized("Those credentials are not valid.");
        }
        return session(user);
    }

    @Transactional
    public AuthSessionResponse signup(SignupRequest request) {
        String name = require(request == null ? null : request.name(), "A name is required.", "name");
        String email = require(request == null ? null : request.email(),
                "An email is required.", "email").trim();
        String password = request == null ? null : request.password();

        if (password == null || password.length() < MIN_PASSWORD) {
            throw ApiException.invalid(
                    "A password needs at least " + MIN_PASSWORD + " characters.", "password");
        }
        if (!email.contains("@")) {
            throw ApiException.invalid("That does not look like an email address.", "email");
        }
        if (users.emailTaken(email)) {
            throw ApiException.conflict("An account with that email already exists.");
        }

        AppUser user = new AppUser();
        user.setId(nextId());
        user.setName(name.trim());
        user.setEmail(email);
        user.setPasswordHash(passwords.encode(password));
        // Always a rep. A signup form that lets a stranger choose to be Finance is not an
        // access-control system, and there is nobody to approve an elevation request.
        user.setRole(UserRole.REP);

        return session(users.save(user));
    }

    @Transactional(readOnly = true)
    public AuthUserResponse me(long userId) {
        return toUser(users.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("That account no longer exists.")));
    }

    private AuthSessionResponse session(AppUser user) {
        JwtService.Issued issued = jwt.issueInternal(user);
        return new AuthSessionResponse(
                issued.token(),
                DateTimeFormatter.ISO_INSTANT.format(issued.expiresAt()),
                toUser(user));
    }

    /** app_user ids are assigned rather than generated, because the seed names them. */
    private long nextId() {
        return users.findAll().stream().mapToLong(AppUser::getId).max().orElse(0L) + 1;
    }

    private static AuthUserResponse toUser(AppUser user) {
        return new AuthUserResponse(user.getId(), user.getName(), user.getEmail(),
                user.getRole().name());
    }

    private static String require(String value, String message, String field) {
        if (value == null || value.isBlank()) {
            throw ApiException.invalid(message, field);
        }
        return value;
    }
}
