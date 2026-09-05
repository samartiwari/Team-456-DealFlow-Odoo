package com.dealflow.identity.security;

import com.dealflow.identity.model.AppUser;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Signs and verifies the tokens for both realms.
 *
 * <p>HS256, written directly. A JWT is three base64url segments and an HMAC, which is about
 * sixty lines here -- against a library plus its Jackson binding, for an algorithm whose
 * whole security rests on one comparison being constant-time and one claim being checked.
 * Both are visible below rather than three jars away.
 *
 * <p>The {@code aud} claim is the wall between the realms. A token minted for the customer
 * portal carries {@code portal} and is refused by the internal chain even if a matcher were
 * misconfigured, and the reverse holds too -- so the separation survives a routing mistake
 * rather than depending on there never being one.
 */
@Service
public class JwtService {

    public static final String INTERNAL = "internal";
    public static final String PORTAL = "portal";

    private static final Duration LIFETIME = Duration.ofHours(12);
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    private final byte[] secret;

    public JwtService(@Value("${dealflow.jwt-secret:"
            + "dev-only-secret-change-me-in-production-0123456789}") String secret) {
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            // HS256 with a key shorter than its digest is a real weakness, not a warning.
            throw new IllegalStateException("dealflow.jwt-secret must be at least 32 bytes.");
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public Issued issueInternal(AppUser user) {
        Instant expires = Instant.now().plus(LIFETIME);
        String claims = "{"
                + "\"sub\":\"" + user.getId() + "\","
                + "\"name\":\"" + escape(user.getName()) + "\","
                + "\"role\":\"" + user.getRole().name() + "\","
                + "\"aud\":\"" + INTERNAL + "\","
                + "\"iat\":" + Instant.now().getEpochSecond() + ","
                + "\"exp\":" + expires.getEpochSecond()
                + "}";
        return new Issued(sign(claims), expires);
    }

    /**
     * Reads a token, or returns empty.
     *
     * <p>Every failure -- a bad signature, the wrong audience, an expired token, something
     * that is not a token at all -- returns the same empty result. The caller cannot
     * accidentally tell an attacker which of those it was.
     */
    public Optional<Principal> read(String token, String expectedAudience) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return Optional.empty();
        }

        String signingInput = parts[0] + "." + parts[1];
        if (!constantTimeEquals(parts[2], hmac(signingInput))) {
            return Optional.empty();
        }

        String claims = new String(B64D.decode(parts[1]), StandardCharsets.UTF_8);
        if (!expectedAudience.equals(string(claims, "aud"))) {
            return Optional.empty();
        }
        long exp = number(claims, "exp");
        if (exp <= Instant.now().getEpochSecond()) {
            return Optional.empty();
        }

        try {
            return Optional.of(new Principal(
                    Long.parseLong(string(claims, "sub")),
                    string(claims, "name"),
                    string(claims, "role")));
        } catch (RuntimeException malformed) {
            return Optional.empty();
        }
    }

    // ---------- the algorithm ----------

    private String sign(String claims) {
        // Only HS256 is ever issued, so the header is a constant rather than something a
        // caller could influence -- which is how the "alg: none" family of attacks starts.
        String header = B64.encodeToString(
                "{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String payload = B64.encodeToString(claims.getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + payload;
        return signingInput + "." + hmac(signingInput);
    }

    private String hmac(String signingInput) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return B64.encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("HmacSHA256 is required and always present.", ex);
        }
    }

    /** Compares every character, so the time taken says nothing about where they differ. */
    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) {
            return false;
        }
        int difference = 0;
        for (int i = 0; i < a.length(); i++) {
            difference |= a.charAt(i) ^ b.charAt(i);
        }
        return difference == 0;
    }

    // ---------- claims ----------

    private static String string(String json, String field) {
        int at = json.indexOf('"' + field + "\":\"");
        if (at < 0) {
            return null;
        }
        int from = at + field.length() + 4;
        int to = json.indexOf('"', from);
        return to < 0 ? null : json.substring(from, to);
    }

    private static long number(String json, String field) {
        int at = json.indexOf('"' + field + "\":");
        if (at < 0) {
            return 0;
        }
        int from = at + field.length() + 3;
        int to = from;
        while (to < json.length() && Character.isDigit(json.charAt(to))) {
            to++;
        }
        return to == from ? 0 : Long.parseLong(json.substring(from, to));
    }

    private static String escape(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    public record Issued(String token, Instant expiresAt) {}

    public record Principal(long userId, String name, String role) {}
}
