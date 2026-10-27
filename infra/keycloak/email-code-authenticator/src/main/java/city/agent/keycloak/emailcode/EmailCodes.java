package city.agent.keycloak.emailcode;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Small, dependency-free helpers for codes: generation, keyed hashing, comparison and display. */
public final class EmailCodes {

    private static final String HMAC = "HmacSHA256";
    private static final byte[] DOMAIN = "agentcity-email-code/v1".getBytes(StandardCharsets.UTF_8);

    private EmailCodes() {
    }

    /** A uniformly random code of exactly {@code length} decimal digits (leading zeros kept). */
    public static String generate(SecureRandom random, int length) {
        if (length < 1 || length > 18) {
            throw new IllegalArgumentException("length must be between 1 and 18");
        }
        long bound = 1;
        for (int i = 0; i < length; i++) {
            bound *= 10;
        }
        // nextLong(bound) is rejection-sampled, so every code is equally likely (no modulo bias).
        long value = random.nextLong(bound);
        return String.format(Locale.ROOT, "%0" + length + "d", value);
    }

    /** Fresh random salt for one issued code. */
    public static byte[] salt(SecureRandom random) {
        byte[] salt = new byte[16];
        random.nextBytes(salt);
        return salt;
    }

    /**
     * HMAC-SHA256 of the code under a server-side key that is never stored next to the hash. The salt makes
     * every issued code hash differently; the binding ties the hash to one authentication session. Fields are
     * length-prefixed so different splits of the same bytes cannot collide.
     */
    public static byte[] hash(byte[] key, byte[] salt, String binding, String code) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(new SecretKeySpec(key, HMAC));
            update(mac, DOMAIN);
            update(mac, salt);
            update(mac, binding.getBytes(StandardCharsets.UTF_8));
            update(mac, code.getBytes(StandardCharsets.UTF_8));
            return mac.doFinal();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    private static void update(Mac mac, byte[] field) {
        int n = field.length;
        mac.update(new byte[] { (byte) (n >>> 24), (byte) (n >>> 16), (byte) (n >>> 8), (byte) n });
        mac.update(field);
    }

    /**
     * Compares two byte arrays in time that depends only on their lengths, never on where they differ.
     * Hashes compared here always have the same length (32 bytes).
     */
    public static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a == null || b == null) {
            return false;
        }
        int diff = a.length ^ b.length;
        int n = Math.max(a.length, b.length);
        for (int i = 0; i < n; i++) {
            byte x = i < a.length ? a[i] : 0;
            byte y = i < b.length ? b[i] : 0;
            diff |= x ^ y;
        }
        return diff == 0;
    }

    /** Removes spaces and hyphens people type or paste ("123 456", "123-456"). */
    public static String normalize(String input) {
        if (input == null) {
            return "";
        }
        StringBuilder out = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (!Character.isWhitespace(c) && c != '-') {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** True when {@code code} is exactly {@code length} ASCII digits. */
    public static boolean wellFormed(String code, int length) {
        if (code == null || code.length() != length) {
            return false;
        }
        for (int i = 0; i < code.length(); i++) {
            char c = code.charAt(i);
            if (c < '0' || c > '9') {
                return false;
            }
        }
        return true;
    }

    /**
     * Masks an address for display ("jane@example.com" becomes "j***@example.com"), so the sign-in page confirms
     * where the code went without disclosing the full address to whoever typed the username.
     */
    public static String mask(String email) {
        if (email == null) {
            return null;
        }
        int at = email.lastIndexOf('@');
        if (at <= 0 || at == email.length() - 1) {
            return "***";
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}
