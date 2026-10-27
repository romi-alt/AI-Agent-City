package city.agent.keycloak.emailcode;

import java.util.Map;

/**
 * Limits for one execution of the authenticator, read from its {@code AuthenticatorConfigModel}.
 * Missing or out-of-range values fall back to the defaults, so a typo in the realm can never weaken the limits
 * below the bounds checked here.
 */
public record EmailCodeSettings(int codeLength, int ttlSeconds, int maxAttempts, int resendCooldownSeconds,
        int maxSends) {

    public static final String CODE_LENGTH = "codeLength";
    public static final String TTL_SECONDS = "codeTtlSeconds";
    public static final String MAX_ATTEMPTS = "maxAttempts";
    public static final String RESEND_COOLDOWN_SECONDS = "resendCooldownSeconds";
    public static final String MAX_SENDS = "maxSends";

    public static final int DEFAULT_CODE_LENGTH = 6;
    public static final int DEFAULT_TTL_SECONDS = 300;
    public static final int DEFAULT_MAX_ATTEMPTS = 5;
    public static final int DEFAULT_RESEND_COOLDOWN_SECONDS = 30;
    public static final int DEFAULT_MAX_SENDS = 5;

    public static final EmailCodeSettings DEFAULTS = new EmailCodeSettings(DEFAULT_CODE_LENGTH, DEFAULT_TTL_SECONDS,
            DEFAULT_MAX_ATTEMPTS, DEFAULT_RESEND_COOLDOWN_SECONDS, DEFAULT_MAX_SENDS);

    public EmailCodeSettings {
        // Six digits is the floor: shorter codes make online guessing too cheap even with the attempt limit.
        requireRange(CODE_LENGTH, codeLength, 6, 10);
        requireRange(TTL_SECONDS, ttlSeconds, 60, 3600);
        requireRange(MAX_ATTEMPTS, maxAttempts, 1, 10);
        requireRange(RESEND_COOLDOWN_SECONDS, resendCooldownSeconds, 0, 3600);
        requireRange(MAX_SENDS, maxSends, 1, 20);
    }

    /** Reads settings from an execution's config map (may be null). Invalid entries use the default. */
    public static EmailCodeSettings from(Map<String, String> config) {
        if (config == null) {
            return DEFAULTS;
        }
        return new EmailCodeSettings(
                read(config, CODE_LENGTH, DEFAULT_CODE_LENGTH, 6, 10),
                read(config, TTL_SECONDS, DEFAULT_TTL_SECONDS, 60, 3600),
                read(config, MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 1, 10),
                read(config, RESEND_COOLDOWN_SECONDS, DEFAULT_RESEND_COOLDOWN_SECONDS, 0, 3600),
                read(config, MAX_SENDS, DEFAULT_MAX_SENDS, 1, 20));
    }

    private static int read(Map<String, String> config, String key, int fallback, int min, int max) {
        String raw = config.get(key);
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            int value = Integer.parseInt(raw.trim());
            return value < min || value > max ? fallback : value;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static void requireRange(String name, int value, int min, int max) {
        if (value < min || value > max) {
            throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
        }
    }
}
