package com.dealflow.identity.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Two chains, and the order between them is the security boundary.
 *
 * <p>The portal chain matches first. A request to {@code /api/portal/**} is therefore
 * settled before the internal chain is ever consulted, so a customer's request cannot fall
 * through into the staff realm by accident -- and the audience claim means it would still
 * be refused if it did.
 *
 * <p>The brief's phrase for this is "structurally separate, not filtered". The portal's
 * responses already have no cost, margin or approver fields to leak; this is the same idea
 * applied to the request side.
 */
@Configuration
public class SecurityConfig {

    /**
     * The customer realm. Its credential is a single-use magic link exchanged for a
     * session token, checked in {@code PortalTokenService} against a hash -- not a JWT and
     * not a password, so no authentication mechanism is installed here at all.
     */
    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    SecurityFilterChain portalChain(HttpSecurity http) throws Exception {
        return http
                .securityMatcher("/api/portal/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .build();
    }

    /** The staff realm. Everything needs a token except getting one. */
    @Bean
    SecurityFilterChain internalChain(HttpSecurity http, JwtAuthFilter jwtFilter) throws Exception {
        return http
                .securityMatcher("/api/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/signup")
                        .permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                // Answer 401 as JSON rather than redirecting to a login page that does not
                // exist on this side -- the client is a bundle, not a browser form.
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> write(res, 401,
                                "You are not signed in."))
                        .accessDeniedHandler((req, res, ex) -> write(res, 403,
                                "You are not allowed to do that.")))
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /** The same body shape every other error in this API uses. */
    private static void write(jakarta.servlet.http.HttpServletResponse response, int status,
                              String message) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"status\":" + status + ",\"message\":\"" + message + "\",\"field\":null}");
    }
}
