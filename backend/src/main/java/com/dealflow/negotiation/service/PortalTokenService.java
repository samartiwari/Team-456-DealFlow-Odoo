package com.dealflow.negotiation.service;

import com.dealflow.common.error.ApiException;
import com.dealflow.crm.model.Customer;
import com.dealflow.negotiation.model.PortalToken;
import com.dealflow.negotiation.repository.PortalTokenRepository;
import com.dealflow.quotation.model.Quotation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Mints magic links and the sessions they become.
 *
 * <p>Two rules do the security work here, and both are about what is <em>not</em> stored:
 * the token exists in the customer's URL and nowhere else, and only its SHA-256 hash is
 * kept. A copy of the database grants access to nothing.
 *
 * <p>The link is single use. Opening it burns it and mints a session, so a link forwarded
 * to the wrong person after the customer has clicked it is already worthless.
 */
@Service
public class PortalTokenService {

    /** 256 bits, as the brief specifies. */
    private static final int TOKEN_BYTES = 32;

    private static final Duration LINK_TTL = Duration.ofDays(7);
    private static final Duration SESSION_TTL = Duration.ofHours(12);

    private final SecureRandom random = new SecureRandom();
    private final PortalTokenRepository tokens;

    public PortalTokenService(PortalTokenRepository tokens) {
        this.tokens = tokens;
    }

    /** @return the raw link token. It is never persisted and cannot be recovered later. */
    @Transactional
    public String issue(Quotation quotation, Customer customer) {
        String raw = randomToken();
        tokens.save(new PortalToken(hash(raw), customer, quotation,
                Instant.now().plus(LINK_TTL)));
        return raw;
    }

    /**
     * Kills every link and session this quotation ever handed out.
     *
     * <p>Called when the rep pulls the quotation back to revise it. The customer was
     * looking at terms that no longer exist, and leaving their tab working would let them
     * confirm a version the team has already withdrawn -- so the link stops rather than
     * showing something stale.
     */
    @Transactional
    public int revokeFor(long quotationId) {
        Instant now = Instant.now();
        List<PortalToken> issued = tokens.findByQuotationId(quotationId);
        for (PortalToken token : issued) {
            token.setExpiresAt(now);
            token.setSessionExpiresAt(now);
        }
        tokens.saveAll(issued);
        return issued.size();
    }

    /** Burns the link and returns the session token to be used from here on. */
    @Transactional
    public Session verify(String rawLinkToken) {
        if (rawLinkToken == null || rawLinkToken.isBlank()) {
            throw ApiException.unauthorized("This link is not valid.");
        }
        PortalToken token = tokens.findByTokenHash(hash(rawLinkToken))
                .orElseThrow(() -> ApiException.unauthorized(
                        "This link has expired or has already been used."));

        Instant now = Instant.now();
        if (token.isSpent(now)) {
            // Deliberately the same message as an unknown token: telling the difference
            // would confirm to a stranger that a link once existed.
            throw ApiException.unauthorized("This link has expired or has already been used.");
        }

        String session = randomToken();
        token.setUsedAt(now);
        token.setSessionHash(hash(session));
        token.setSessionExpiresAt(now.plus(SESSION_TTL));
        tokens.save(token);
        return new Session(session, token);
    }

    /** Resolves the one quotation a session token grants, or refuses. */
    @Transactional(readOnly = true)
    public PortalToken requireSession(String rawSessionToken) {
        if (rawSessionToken == null || rawSessionToken.isBlank()) {
            throw ApiException.unauthorized("A portal session is required.");
        }
        PortalToken token = tokens.findBySessionHash(hash(rawSessionToken))
                .orElseThrow(() -> ApiException.unauthorized("This portal session is not valid."));

        if (!token.sessionIsLive(Instant.now())) {
            throw ApiException.unauthorized("This portal session has expired.");
        }
        return token;
    }

    private String randomToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String hash(String raw) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(sha.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is required and always present.", ex);
        }
    }

    /** The raw session token, which the caller must return to the client and then forget. */
    public record Session(String rawSessionToken, PortalToken token) {}
}
