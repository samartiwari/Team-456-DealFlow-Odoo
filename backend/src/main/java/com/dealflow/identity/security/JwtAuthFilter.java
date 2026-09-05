package com.dealflow.identity.security;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Turns a bearer token into an authenticated request, or leaves it anonymous.
 *
 * <p>Deliberately does not reject anything itself. A request that arrives with no token, or
 * a bad one, simply stays unauthenticated and the authorisation rules decide what that
 * means -- which is what lets login and signup live on the same chain as everything else
 * without a special case.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwt;

    public JwtAuthFilter(JwtService jwt) {
        this.jwt = jwt;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            // INTERNAL, always. A portal token presented here fails the audience check and
            // the request continues as anonymous -- so it is refused by the rules below
            // rather than quietly accepted with the wrong identity.
            jwt.read(header.substring(7), JwtService.INTERNAL).ifPresent(principal -> {
                var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + principal.role()));
                var authentication = new UsernamePasswordAuthenticationToken(
                        principal, null, authorities);
                SecurityContextHolder.getContext().setAuthentication(authentication);
            });
        }
        chain.doFilter(request, response);
    }
}
