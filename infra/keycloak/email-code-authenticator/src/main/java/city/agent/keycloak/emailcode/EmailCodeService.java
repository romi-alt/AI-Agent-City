package city.agent.keycloak.emailcode;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.function.LongSupplier;

/**
 * The code life cycle, kept free of Keycloak types so it can be unit-tested: issue (with resend cooldown and a cap
 * on codes per sign-in), verify (expiry, attempt limit, constant-time comparison) and invalidation.
 *
 * <p>State lives in {@link Notes}, which the authenticator backs with the authentication session's server-side
 * auth notes. Only a keyed hash of the code is stored, never the code. The HMAC key comes from {@link Keys} and is
 * the realm's own secret key, so a copy of the notes alone does not allow testing guesses offline.
 */
public final class EmailCodeService {

    /** Key/value storage for one sign-in attempt. */
    public interface Notes {
        String get(String key);

        void set(String key, String value);

        void remove(String key);
    }

    /** A secret HMAC key and the id it is stored under. */
    public record Key(String id, byte[] secret) {
    }

    /** Finds HMAC keys: the active one for new codes, and earlier ones by id for codes already issued. */
    public interface Keys {
        Key active();

        byte[] byId(String id);
    }

    public sealed interface IssueResult {
    }

    /** A code was created; the caller must email {@code code} and then forget it. */
    public record Issued(String code) implements IssueResult {
    }

    /** No email may go out (no verified address); state looks the same as {@link Issued}, but nothing can match. */
    public record Decoy() implements IssueResult {
    }

    /** A code was sent too recently; ask again in {@code secondsLeft}. Earlier code stays valid. */
    public record Cooldown(int secondsLeft) implements IssueResult {
    }

    /** This sign-in attempt has had its quota of codes; the person must start again. */
    public record SendLimit() implements IssueResult {
    }

    public enum Outcome {
        /** The code matched. All code state is cleared, so it cannot be replayed. */
        SUCCESS,
        /** Wrong code; {@link Verification#attemptsLeft()} more tries remain for this code. */
        INVALID,
        /** The code is past its expiry and has been invalidated. */
        EXPIRED,
        /** The attempt limit was reached; the code has been invalidated. */
        LOCKED,
        /** No code was issued in this session. */
        NO_CODE
    }

    public record Verification(Outcome outcome, int attemptsLeft) {
    }

    static final String PREFIX = "agentcity.emailCode.";
    static final String HASH = PREFIX + "hash";
    static final String SALT = PREFIX + "salt";
    static final String KEY_ID = PREFIX + "kid";
    static final String DECOY = PREFIX + "decoy";
    static final String EXPIRES_AT = PREFIX + "expiresAt";
    static final String ATTEMPTS = PREFIX + "attempts";
    static final String SENT_AT = PREFIX + "sentAt";
    static final String SENDS = PREFIX + "sends";

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    private final EmailCodeSettings settings;
    private final LongSupplier clock;
    private final SecureRandom random;

    public EmailCodeService(EmailCodeSettings settings, LongSupplier clockMillis, SecureRandom random) {
        this.settings = settings;
        this.clock = clockMillis;
        this.random = random;
    }

    public EmailCodeSettings settings() {
        return settings;
    }

    /**
     * Issues a new code, replacing (and so invalidating) any earlier one. Refused while the resend cooldown runs
     * or once {@code maxSends} codes were issued in this session.
     *
     * @param binding identifies the authentication session; mixed into the hash
     * @param decoy   true when the account must not receive a code (no verified email); the visible state is the
     *                same as a real issue so the response does not reveal which case applies
     */
    public IssueResult issue(Notes notes, Keys keys, String binding, boolean decoy) {
        long now = clock.getAsLong();
        int wait = resendWaitSeconds(notes);
        if (wait > 0) {
            return new Cooldown(wait);
        }
        int sends = readInt(notes, SENDS);
        if (sends >= settings.maxSends()) {
            return new SendLimit();
        }
        discardCode(notes);
        notes.set(SENDS, Integer.toString(sends + 1));
        notes.set(SENT_AT, Long.toString(now));
        notes.set(EXPIRES_AT, Long.toString(now + settings.ttlSeconds() * 1000L));
        notes.set(ATTEMPTS, "0");
        if (decoy) {
            notes.set(DECOY, "true");
            return new Decoy();
        }
        Key key = keys.active();
        String code = EmailCodes.generate(random, settings.codeLength());
        byte[] salt = EmailCodes.salt(random);
        notes.set(SALT, B64.encodeToString(salt));
        notes.set(KEY_ID, key.id());
        notes.set(HASH, B64.encodeToString(EmailCodes.hash(key.secret(), salt, binding, code)));
        return new Issued(code);
    }

    /** Seconds until another code may be requested (0 when allowed now). */
    public int resendWaitSeconds(Notes notes) {
        String sentAt = notes.get(SENT_AT);
        if (sentAt == null) {
            return 0;
        }
        long elapsed = clock.getAsLong() - Long.parseLong(sentAt);
        long left = settings.resendCooldownSeconds() * 1000L - elapsed;
        return left <= 0 ? 0 : (int) ((left + 999) / 1000);
    }

    /** True when this session already has a code (live, expired or used up) so the form can be shown again. */
    public boolean hasIssued(Notes notes) {
        return notes.get(EXPIRES_AT) != null;
    }

    /** True while the current code (or decoy) can still be entered: not used up, not expired, attempts left. */
    public boolean hasLiveCode(Notes notes) {
        String expiresAt = notes.get(EXPIRES_AT);
        boolean present = notes.get(HASH) != null || "true".equals(notes.get(DECOY));
        return present && expiresAt != null && clock.getAsLong() <= Long.parseLong(expiresAt)
                && readInt(notes, ATTEMPTS) < settings.maxAttempts();
    }

    /** Checks {@code input} against the stored code. Every non-matching input counts as an attempt. */
    public Verification verify(Notes notes, String input, Keys keys, String binding) {
        String expiresAt = notes.get(EXPIRES_AT);
        if (expiresAt == null) {
            return new Verification(Outcome.NO_CODE, 0);
        }
        int attempts = readInt(notes, ATTEMPTS);
        if (attempts >= settings.maxAttempts()) {
            discardCode(notes);
            return new Verification(Outcome.LOCKED, 0);
        }
        if (clock.getAsLong() > Long.parseLong(expiresAt)) {
            discardCode(notes);
            return new Verification(Outcome.EXPIRED, 0);
        }

        String code = EmailCodes.normalize(input);
        boolean match = matches(notes, code, keys, binding);
        if (match) {
            clear(notes);
            return new Verification(Outcome.SUCCESS, 0);
        }
        attempts++;
        notes.set(ATTEMPTS, Integer.toString(attempts));
        if (attempts >= settings.maxAttempts()) {
            discardCode(notes);
            return new Verification(Outcome.LOCKED, 0);
        }
        return new Verification(Outcome.INVALID, settings.maxAttempts() - attempts);
    }

    private boolean matches(Notes notes, String code, Keys keys, String binding) {
        String hash = notes.get(HASH);
        String salt = notes.get(SALT);
        String keyId = notes.get(KEY_ID);
        byte[] secret = keyId == null ? null : keys.byId(keyId);
        boolean usable = hash != null && salt != null && secret != null && !"true".equals(notes.get(DECOY))
                && EmailCodes.wellFormed(code, settings.codeLength());
        if (!usable) {
            // Spend the same HMAC work as a real check so decoy and malformed inputs are not faster.
            EmailCodes.hash(new byte[32], new byte[16], binding, code);
            return false;
        }
        byte[] actual = EmailCodes.hash(secret, B64D.decode(salt), binding, code);
        return EmailCodes.constantTimeEquals(actual, B64D.decode(hash));
    }

    /** Invalidates the current code but keeps the expiry, cooldown and send count. */
    public void discardCode(Notes notes) {
        notes.remove(HASH);
        notes.remove(SALT);
        notes.remove(KEY_ID);
        notes.remove(DECOY);
    }

    /**
     * Withdraws a code whose email could not be sent. The send still counts against the cooldown and the
     * per-session cap, so a failing mail server cannot be used to bypass them.
     */
    public void withdraw(Notes notes) {
        discardCode(notes);
        notes.remove(EXPIRES_AT);
        notes.remove(ATTEMPTS);
    }

    /** Removes all state (after success). */
    public void clear(Notes notes) {
        discardCode(notes);
        notes.remove(EXPIRES_AT);
        notes.remove(ATTEMPTS);
        notes.remove(SENT_AT);
        notes.remove(SENDS);
    }

    private static int readInt(Notes notes, String key) {
        String raw = notes.get(key);
        return raw == null ? 0 : Integer.parseInt(raw);
    }
}
