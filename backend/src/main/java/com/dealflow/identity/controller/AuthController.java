package com.dealflow.identity.controller;

import com.dealflow.identity.dto.*;
import com.dealflow.identity.security.CurrentUser;
import com.dealflow.identity.service.AuthService;

import org.springframework.web.bind.annotation.*;

/** A1. The only two routes on the internal chain that do not need a token. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService service;
    private final CurrentUser currentUser;

    public AuthController(AuthService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    @PostMapping("/login")
    public AuthSessionResponse login(@RequestBody LoginRequest request) {
        return service.login(request);
    }

    @PostMapping("/signup")
    public AuthSessionResponse signup(@RequestBody SignupRequest request) {
        return service.signup(request);
    }

    /**
     * Who the caller is, according to their token.
     *
     * <p>The client calls this on boot: an expired token is indistinguishable from a good
     * one until it is used, so this is the only way to find out before rendering.
     */
    @GetMapping("/me")
    public AuthUserResponse me() {
        return service.me(currentUser.id());
    }
}
