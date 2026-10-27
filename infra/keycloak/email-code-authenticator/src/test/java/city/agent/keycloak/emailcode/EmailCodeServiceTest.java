package city.agent.keycloak.emailcode;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import city.agent.keycloak.emailcode.EmailCodeService.Outcome;

class EmailCodeServiceTest {

    private static final String BINDING = "auth-session-1/tab-1";

    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);
    private final MapNotes notes = new MapNotes();
    private final TestKeys keys = new TestKeys();
    private EmailCodeService service;

    @BeforeEach
    void setUp() {
        service = new EmailCodeService(EmailCodeSettings.DEFAULTS, now::get, new SecureRandom());
    }

    private String issue() {
        EmailCodeService.IssueResult result = service.issue(notes, keys, BINDING, false);
        return assertInstanceOf(EmailCodeService.Issued.class, result).code();
    }

    private static String wrong(String code) {
        char last = code.charAt(code.length() - 1);
        return code.substring(0, code.length() - 1) + (last == '9' ? '0' : (char) (last + 1));
    }

    // --- generation -------------------------------------------------------------------------------------------

    @Test
    void generatesExactlySixDigitsByDefault() {
        SecureRandom random = new SecureRandom();
        for (int i = 0; i < 2000; i++) {
            String code = EmailCodes.generate(random, 6);
            assertTrue(code.matches("\\d{6}"), code);
        }
    }

    @Test
    void keepsLeadingZerosAndSupportsLongerCodes() {
        SecureRandom zero = new SecureRandom() {
            @Override
            public long nextLong(long bound) {
                return 42;
            }
        };
        assertEquals("000042", EmailCodes.generate(zero, 6));
        assertTrue(EmailCodes.generate(new SecureRandom(), 10).matches("\\d{10}"));
    }

    @Test
    void codesAreNotRepeatedOrPredictable() {
        SecureRandom random = new SecureRandom();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            seen.add(EmailCodes.generate(random, 6));
        }
        // 1000 draws from 10^6 values: a handful of collisions at most (expected about 0.5).
        assertTrue(seen.size() > 990, "unique codes: " + seen.size());
    }

    @Test
    void issuedCodeHasConfiguredLength() {
        service = new EmailCodeService(new EmailCodeSettings(8, 300, 5, 30, 5), now::get, new SecureRandom());
        assertTrue(issue().matches("\\d{8}"));
    }

    // --- storage: only a keyed hash -------------------------------------------------------------------------

    @Test
    void storesOnlyAKeyedSaltedHashNeverTheCode() {
        String code = issue();
        for (String value : notes.values.values()) {
            assertFalse(value.contains(code), "plain code stored: " + value);
        }
        assertNotNull(notes.get(EmailCodeService.HASH));
        assertNotNull(notes.get(EmailCodeService.SALT));
        assertEquals(keys.active().id(), notes.get(EmailCodeService.KEY_ID));
    }

    @Test
    void hashDependsOnKeySaltBindingAndCode() {
        byte[] key = "k".repeat(32).getBytes(StandardCharsets.UTF_8);
        byte[] otherKey = "j".repeat(32).getBytes(StandardCharsets.UTF_8);
        byte[] salt = new byte[16];
        byte[] otherSalt = new byte[16];
        otherSalt[0] = 1;
        byte[] base = EmailCodes.hash(key, salt, "b", "123456");
        assertEquals(32, base.length);
        assertArrayEquals(base, EmailCodes.hash(key, salt, "b", "123456"));
        assertFalse(EmailCodes.constantTimeEquals(base, EmailCodes.hash(otherKey, salt, "b", "123456")));
        assertFalse(EmailCodes.constantTimeEquals(base, EmailCodes.hash(key, otherSalt, "b", "123456")));
        assertFalse(EmailCodes.constantTimeEquals(base, EmailCodes.hash(key, salt, "c", "123456")));
        assertFalse(EmailCodes.constantTimeEquals(base, EmailCodes.hash(key, salt, "b", "123457")));
        // Length prefixes: moving a character between fields changes the hash.
        assertFalse(EmailCodes.constantTimeEquals(EmailCodes.hash(key, salt, "b1", "23456"),
                EmailCodes.hash(key, salt, "b", "123456")));
    }

    @Test
    void sameCodeHashesDifferentlyEachIssue() {
        issue();
        String first = notes.get(EmailCodeService.HASH);
        now.addAndGet(31_000);
        issue();
        assertNotEquals(first, notes.get(EmailCodeService.HASH));
    }

    // --- verification ----------------------------------------------------------------------------------------

    @Test
    void correctCodeSucceedsOnceAndClearsState() {
        String code = issue();
        assertEquals(Outcome.SUCCESS, service.verify(notes, code, keys, BINDING).outcome());
        assertTrue(notes.values.isEmpty(), "state left: " + notes.values);
        assertEquals(Outcome.NO_CODE, service.verify(notes, code, keys, BINDING).outcome());
    }

    @Test
    void acceptsSpacesAndHyphensInInput() {
        String code = issue();
        String typed = " " + code.substring(0, 3) + "-" + code.substring(3) + " ";
        assertEquals(Outcome.SUCCESS, service.verify(notes, typed, keys, BINDING).outcome());
    }

    @Test
    void codeIsBoundToItsAuthenticationSession() {
        String code = issue();
        assertEquals(Outcome.INVALID, service.verify(notes, code, keys, "another-session/tab").outcome());
    }

    @Test
    void wrongCodeCountsDown() {
        String code = issue();
        EmailCodeService.Verification v = service.verify(notes, wrong(code), keys, BINDING);
        assertEquals(Outcome.INVALID, v.outcome());
        assertEquals(4, v.attemptsLeft());
        assertEquals(3, service.verify(notes, "abc", keys, BINDING).attemptsLeft(), "malformed input counts");
        assertEquals(Outcome.SUCCESS, service.verify(notes, code, keys, BINDING).outcome());
    }

    @Test
    void codeExpiresAfterTtl() {
        String code = issue();
        now.addAndGet(300_000);
        assertEquals(Outcome.SUCCESS, service.verify(notes, code, keys, BINDING).outcome(), "valid at the limit");

        String second = issueAfterCooldown();
        now.addAndGet(300_001);
        assertEquals(Outcome.EXPIRED, service.verify(notes, second, keys, BINDING).outcome());
        assertNull(notes.get(EmailCodeService.HASH), "expired code is invalidated");
        assertEquals(Outcome.EXPIRED, service.verify(notes, second, keys, BINDING).outcome());
    }

    @Test
    void attemptLimitInvalidatesTheCode() {
        String code = issue();
        for (int i = 1; i <= 4; i++) {
            assertEquals(Outcome.INVALID, service.verify(notes, wrong(code), keys, BINDING).outcome());
        }
        EmailCodeService.Verification fifth = service.verify(notes, wrong(code), keys, BINDING);
        assertEquals(Outcome.LOCKED, fifth.outcome());
        assertEquals(0, fifth.attemptsLeft());
        // Even the right code no longer works.
        assertEquals(Outcome.LOCKED, service.verify(notes, code, keys, BINDING).outcome());
        assertFalse(service.hasLiveCode(notes));
    }

    @Test
    void configuredAttemptLimitIsHonoured() {
        service = new EmailCodeService(new EmailCodeSettings(6, 300, 2, 30, 5), now::get, new SecureRandom());
        String code = issue();
        assertEquals(Outcome.INVALID, service.verify(notes, wrong(code), keys, BINDING).outcome());
        assertEquals(Outcome.LOCKED, service.verify(notes, wrong(code), keys, BINDING).outcome());
    }

    // --- resend ----------------------------------------------------------------------------------------------

    private String issueAfterCooldown() {
        now.addAndGet(30_000);
        return issue();
    }

    @Test
    void resendIsRefusedDuringCooldown() {
        String code = issue();
        now.addAndGet(10_000);
        EmailCodeService.IssueResult refused = service.issue(notes, keys, BINDING, false);
        assertEquals(20, assertInstanceOf(EmailCodeService.Cooldown.class, refused).secondsLeft());
        assertEquals(20, service.resendWaitSeconds(notes));
        now.addAndGet(19_500);
        assertEquals(1, service.resendWaitSeconds(notes), "rounds up");
        // The first code still works while the cooldown runs.
        assertEquals(Outcome.SUCCESS, service.verify(notes, code, keys, BINDING).outcome());
    }

    @Test
    void resendInvalidatesTheOldCodeAndResetsAttempts() {
        String first = issue();
        service.verify(notes, wrong(first), keys, BINDING);
        service.verify(notes, wrong(first), keys, BINDING);
        String second = issueAfterCooldown();
        assertEquals("0", notes.get(EmailCodeService.ATTEMPTS));
        if (!first.equals(second)) {
            assertEquals(Outcome.INVALID, service.verify(notes, first, keys, BINDING).outcome());
        }
        assertEquals(Outcome.SUCCESS, service.verify(notes, second, keys, BINDING).outcome());
    }

    @Test
    void resendAfterLockGivesAFreshCode() {
        String first = issue();
        for (int i = 0; i < 5; i++) {
            service.verify(notes, wrong(first), keys, BINDING);
        }
        String second = issueAfterCooldown();
        assertEquals(Outcome.SUCCESS, service.verify(notes, second, keys, BINDING).outcome());
    }

    @Test
    void codesPerSignInAreCapped() {
        for (int i = 0; i < 5; i++) {
            assertInstanceOf(EmailCodeService.Issued.class, service.issue(notes, keys, BINDING, false));
            now.addAndGet(30_000);
        }
        assertInstanceOf(EmailCodeService.SendLimit.class, service.issue(notes, keys, BINDING, false));
    }

    @Test
    void zeroCooldownAllowsImmediateResend() {
        service = new EmailCodeService(new EmailCodeSettings(6, 300, 5, 0, 5), now::get, new SecureRandom());
        issue();
        assertEquals(0, service.resendWaitSeconds(notes));
        assertInstanceOf(EmailCodeService.Issued.class, service.issue(notes, keys, BINDING, false));
    }

    @Test
    void withdrawnCodeCannotBeUsedButStillCountsForCooldown() {
        String code = issue();
        service.withdraw(notes);
        assertEquals(Outcome.NO_CODE, service.verify(notes, code, keys, BINDING).outcome());
        assertInstanceOf(EmailCodeService.Cooldown.class, service.issue(notes, keys, BINDING, false));
    }

    // --- decoy (account without a verified email) ------------------------------------------------------------

    @Test
    void decoyLooksIssuedButNothingMatches() {
        EmailCodeService.IssueResult result = service.issue(notes, keys, BINDING, true);
        assertInstanceOf(EmailCodeService.Decoy.class, result);
        assertNull(notes.get(EmailCodeService.HASH));
        assertTrue(service.hasLiveCode(notes));
        assertTrue(service.resendWaitSeconds(notes) > 0, "same cooldown as a real code");
        for (int i = 0; i < 4; i++) {
            EmailCodeService.Verification v = service.verify(notes, String.format("%06d", i), keys, BINDING);
            assertEquals(Outcome.INVALID, v.outcome());
            assertEquals(4 - i, v.attemptsLeft());
        }
        assertEquals(Outcome.LOCKED, service.verify(notes, "000009", keys, BINDING).outcome());
    }

    // --- key rotation ----------------------------------------------------------------------------------------

    @Test
    void codeIssuedUnderAnEarlierKeyStillVerifiesAndUnknownKeyFailsClosed() {
        String code = issue();
        keys.rotate();
        assertEquals(Outcome.SUCCESS, service.verify(notes, code, keys, BINDING).outcome());

        String second = issueAfterCooldown();
        keys.forgetAll();
        assertEquals(Outcome.INVALID, service.verify(notes, second, keys, BINDING).outcome());
    }

    // --- constant-time comparison ----------------------------------------------------------------------------

    @Test
    void constantTimeEqualsIsCorrect() {
        byte[] a = { 1, 2, 3, 4 };
        assertTrue(EmailCodes.constantTimeEquals(a, new byte[] { 1, 2, 3, 4 }));
        assertFalse(EmailCodes.constantTimeEquals(a, new byte[] { 0, 2, 3, 4 }), "first byte differs");
        assertFalse(EmailCodes.constantTimeEquals(a, new byte[] { 1, 2, 3, 5 }), "last byte differs");
        assertFalse(EmailCodes.constantTimeEquals(a, new byte[] { 1, 2, 3 }), "shorter");
        assertFalse(EmailCodes.constantTimeEquals(a, new byte[] { 1, 2, 3, 4, 0 }), "longer with zero tail");
        assertFalse(EmailCodes.constantTimeEquals(a, null));
        assertTrue(EmailCodes.constantTimeEquals(new byte[0], new byte[0]));
    }

    @Test
    void constantTimeEqualsAgreesWithJdkConstantTimeCompare() {
        SecureRandom random = new SecureRandom();
        for (int i = 0; i < 5000; i++) {
            byte[] a = new byte[1 + random.nextInt(40)];
            random.nextBytes(a);
            byte[] b = random.nextBoolean() ? a.clone() : new byte[random.nextInt(41)];
            if (b.length > 0 && random.nextInt(4) == 0) {
                b[random.nextInt(b.length)] ^= 1;
            }
            assertEquals(java.security.MessageDigest.isEqual(a, b), EmailCodes.constantTimeEquals(a, b));
        }
    }

    @Test
    void constantTimeEqualsDoesNotExitEarly() {
        // Coarse timing check: a mismatch in the first byte must cost about as much as one in the last byte.
        // Rounds alternate and the medians are compared, so JIT warm-up and noise do not decide the result; an
        // early-exit comparison would be several times faster on the first-byte mismatch.
        byte[] secret = new byte[4096];
        new SecureRandom().nextBytes(secret);
        byte[] firstDiff = secret.clone();
        firstDiff[0] ^= 1;
        byte[] lastDiff = secret.clone();
        lastDiff[secret.length - 1] ^= 1;
        for (int i = 0; i < 20; i++) {
            time(secret, firstDiff);
            time(secret, lastDiff);
        }
        long[] first = new long[31];
        long[] last = new long[31];
        for (int i = 0; i < first.length; i++) {
            first[i] = time(secret, firstDiff);
            last[i] = time(secret, lastDiff);
        }
        java.util.Arrays.sort(first);
        java.util.Arrays.sort(last);
        double ratio = (double) last[15] / Math.max(1, first[15]);
        assertTrue(ratio < 2.0, "last-byte/first-byte median timing ratio " + ratio);
    }

    private static long time(byte[] a, byte[] b) {
        boolean sink = false;
        long start = System.nanoTime();
        for (int i = 0; i < 200; i++) {
            sink |= EmailCodes.constantTimeEquals(a, b);
        }
        long elapsed = System.nanoTime() - start;
        assertFalse(sink);
        return elapsed;
    }

    // --- helpers ---------------------------------------------------------------------------------------------

    @Test
    void wellFormedAndNormalize() {
        assertTrue(EmailCodes.wellFormed("012345", 6));
        assertFalse(EmailCodes.wellFormed("12345", 6));
        assertFalse(EmailCodes.wellFormed("12345a", 6));
        assertFalse(EmailCodes.wellFormed("１２３４５６", 6), "full-width digits are not accepted");
        assertEquals("123456", EmailCodes.normalize(" 123 - 456\t"));
        assertEquals("", EmailCodes.normalize(null));
    }

    @Test
    void masksEmailForDisplay() {
        assertEquals("j***@example.com", EmailCodes.mask("jane.doe@example.com"));
        assertEquals("a***@x.io", EmailCodes.mask("a@x.io"));
        assertEquals("***", EmailCodes.mask("not-an-address"));
        assertNull(EmailCodes.mask(null));
    }

    @Test
    void settingsUseDefaultsForMissingOrInvalidValues() {
        assertEquals(EmailCodeSettings.DEFAULTS, EmailCodeSettings.from(null));
        assertEquals(EmailCodeSettings.DEFAULTS, EmailCodeSettings.from(Map.of()));
        EmailCodeSettings s = EmailCodeSettings.from(Map.of(
                EmailCodeSettings.CODE_LENGTH, "4", // below the floor of 6
                EmailCodeSettings.TTL_SECONDS, "120",
                EmailCodeSettings.MAX_ATTEMPTS, "x",
                EmailCodeSettings.RESEND_COOLDOWN_SECONDS, " 45 ",
                EmailCodeSettings.MAX_SENDS, "999"));
        assertEquals(new EmailCodeSettings(6, 120, 5, 45, 5), s);
        assertThrows(IllegalArgumentException.class, () -> new EmailCodeSettings(5, 300, 5, 30, 5));
    }

    private static void assertNotNull(Object o) {
        assertTrue(o != null);
    }

    static final class MapNotes implements EmailCodeService.Notes {
        final Map<String, String> values = new HashMap<>();

        @Override
        public String get(String key) {
            return values.get(key);
        }

        @Override
        public void set(String key, String value) {
            values.put(key, value);
        }

        @Override
        public void remove(String key) {
            values.remove(key);
        }
    }

    static final class TestKeys implements EmailCodeService.Keys {
        private final Map<String, byte[]> all = new HashMap<>();
        private String activeId;
        private int counter;

        TestKeys() {
            rotate();
        }

        void rotate() {
            byte[] secret = new byte[64];
            new SecureRandom().nextBytes(secret);
            activeId = "kid-" + (++counter);
            all.put(activeId, secret);
        }

        void forgetAll() {
            all.clear();
        }

        @Override
        public EmailCodeService.Key active() {
            return new EmailCodeService.Key(activeId, all.get(activeId));
        }

        @Override
        public byte[] byId(String id) {
            return all.get(id);
        }
    }
}
