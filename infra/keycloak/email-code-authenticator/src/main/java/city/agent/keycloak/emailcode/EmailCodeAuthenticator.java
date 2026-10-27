package city.agent.keycloak.emailcode;

import java.security.SecureRandom;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;

import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.authenticators.util.AuthenticatorUtils;
import org.keycloak.common.util.Time;
import org.keycloak.crypto.Algorithm;
import org.keycloak.crypto.KeyUse;
import org.keycloak.crypto.KeyWrapper;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailTemplateProvider;
import org.keycloak.events.Errors;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;
import org.keycloak.services.messages.Messages;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Passwordless sign-in with a one-time code sent by email. Runs after an authenticator that identified the user
 * (for example the Username Form). See README.md for the security design.
 */
public class EmailCodeAuthenticator implements Authenticator {

    private static final Logger LOG = Logger.getLogger(EmailCodeAuthenticator.class);

    static final String TEMPLATE = "login-agentcity-email-code.ftl";
    static final String EMAIL_TEMPLATE = "agentcity-email-code.ftl";
    static final String FIELD_CODE = "code";
    static final String PARAM_RESEND = "resend";

    private static final SecureRandom RANDOM = new SecureRandom();

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        if (user == null) {
            context.failure(AuthenticationFlowError.UNKNOWN_USER);
            return;
        }
        EmailCodeService service = service(context);
        if (blocked(context, service, user)) {
            return;
        }
        AuthNotes notes = new AuthNotes(context.getAuthenticationSession());
        if (service.hasLiveCode(notes)) {
            // A page reload re-enters authenticate(); keep the code already sent instead of mailing another.
            show(context, service, null, null, null);
            return;
        }
        EmailCodeService.IssueResult result = service.issue(notes, keys(context), binding(context), !canReceive(user));
        switch (result) {
            case EmailCodeService.Issued issued -> sendAndShow(context, service, notes, user, issued.code(), null);
            case EmailCodeService.Decoy decoy -> {
                LOG.debugf("Email code not sent: user %s has no verified email address", user.getId());
                show(context, service, null, null, null);
            }
            case EmailCodeService.Cooldown cooldown ->
                show(context, service, "agentcityEmailCodeCooldown", cooldown.secondsLeft(), null);
            case EmailCodeService.SendLimit limit ->
                show(context, service, "agentcityEmailCodeSendLimit", null, null);
        }
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        if (user == null) {
            context.failure(AuthenticationFlowError.UNKNOWN_USER);
            return;
        }
        EmailCodeService service = service(context);
        if (blocked(context, service, user)) {
            return;
        }
        AuthNotes notes = new AuthNotes(context.getAuthenticationSession());
        MultivaluedMap<String, String> form = context.getHttpRequest().getDecodedFormParameters();

        if (form.containsKey(PARAM_RESEND)) {
            resend(context, service, notes, user);
            return;
        }

        String input = form.getFirst(FIELD_CODE);
        if (input == null || EmailCodes.normalize(input).isEmpty()) {
            show(context, service, "agentcityEmailCodeMissing", null, null);
            return;
        }

        EmailCodeService.Verification v = service.verify(notes, input, keys(context), binding(context));
        switch (v.outcome()) {
            case SUCCESS -> {
                context.success();
            }
            case INVALID -> {
                recordFailure(context, user);
                context.getEvent().user(user).error(Errors.INVALID_USER_CREDENTIALS);
                context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS,
                        form(context, service, "agentcityEmailCodeInvalid", v.attemptsLeft(), null));
            }
            case LOCKED -> {
                recordFailure(context, user);
                context.getEvent().user(user).error(Errors.INVALID_USER_CREDENTIALS);
                context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS,
                        form(context, service, "agentcityEmailCodeTooManyAttempts", null, null));
            }
            case EXPIRED -> {
                context.getEvent().user(user).error(Errors.EXPIRED_CODE);
                context.challenge(form(context, service, "agentcityEmailCodeExpired", null, null));
            }
            case NO_CODE -> show(context, service, "agentcityEmailCodeNoCode", null, null);
        }
    }

    private void resend(AuthenticationFlowContext context, EmailCodeService service, AuthNotes notes, UserModel user) {
        EmailCodeService.IssueResult result = service.issue(notes, keys(context), binding(context), !canReceive(user));
        switch (result) {
            case EmailCodeService.Issued issued ->
                sendAndShow(context, service, notes, user, issued.code(), "agentcityEmailCodeResent");
            case EmailCodeService.Decoy decoy -> show(context, service, null, null, "agentcityEmailCodeResent");
            case EmailCodeService.Cooldown cooldown ->
                show(context, service, "agentcityEmailCodeCooldown", cooldown.secondsLeft(), null);
            case EmailCodeService.SendLimit limit ->
                show(context, service, "agentcityEmailCodeSendLimit", null, null);
        }
    }

    private void sendAndShow(AuthenticationFlowContext context, EmailCodeService service, AuthNotes notes,
            UserModel user, String code, String info) {
        try {
            sendEmail(context, user, code, service.settings());
        } catch (EmailException e) {
            LOG.warnf(e, "Could not send an email sign-in code to user %s", user.getId());
            service.withdraw(notes);
            context.getEvent().user(user).error(Errors.EMAIL_SEND_FAILED);
            context.challenge(form(context, service, "agentcityEmailCodeSendFailed", null, null));
            return;
        }
        show(context, service, null, null, info);
    }

    private void sendEmail(AuthenticationFlowContext context, UserModel user, String code, EmailCodeSettings s)
            throws EmailException {
        RealmModel realm = context.getRealm();
        String realmName = realm.getDisplayName() != null && !realm.getDisplayName().isBlank()
                ? realm.getDisplayName()
                : realm.getName();
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("code", code);
        attributes.put("ttlMinutes", ttlMinutes(s));
        attributes.put("realmName", realmName);
        context.getSession().getProvider(EmailTemplateProvider.class)
                .setRealm(realm)
                .setUser(user)
                .setAuthenticationSession(context.getAuthenticationSession())
                .send("agentcityEmailCodeSubject", List.of(realmName), EMAIL_TEMPLATE, attributes);
    }

    /** Renders the code page as a plain challenge (no failure recorded). */
    private void show(AuthenticationFlowContext context, EmailCodeService service, String error, Object errorArg,
            String info) {
        context.challenge(form(context, service, error, errorArg, info));
    }

    private Response form(AuthenticationFlowContext context, EmailCodeService service, String error, Object errorArg,
            String info) {
        EmailCodeSettings s = service.settings();
        UserModel user = context.getUser();
        LoginFormsProvider form = context.form().setExecution(context.getExecution().getId());
        Map<String, Object> page = new HashMap<>();
        page.put("maskedEmail", user == null ? null : EmailCodes.mask(user.getEmail()));
        page.put("codeLength", s.codeLength());
        page.put("ttlMinutes", ttlMinutes(s));
        AuthNotes notes = new AuthNotes(context.getAuthenticationSession());
        page.put("sent", service.hasIssued(notes));
        page.put("resendWaitSeconds", service.resendWaitSeconds(notes));
        form.setAttribute("emailCode", page);
        if (error != null) {
            form.addError(errorArg == null ? new FormMessage(FIELD_CODE, error)
                    : new FormMessage(FIELD_CODE, error, errorArg));
        }
        if (info != null) {
            form.setInfo(info);
        }
        return form.createForm(TEMPLATE);
    }

    /**
     * Stops here when the account is disabled or locked by brute-force protection, using Keycloak's own (generic)
     * messages. No code is sent and none is checked while locked, so the lock also stops mailbox flooding.
     */
    private boolean blocked(AuthenticationFlowContext context, EmailCodeService service, UserModel user) {
        String bruteForce = AuthenticatorUtils.getDisabledByBruteForceEventError(context, user);
        String message = null;
        if (bruteForce != null) {
            context.getEvent().user(user).error(bruteForce);
            // Generic wording, like Keycloak's own lockout messages: it does not confirm a lockout to a guesser.
            message = "agentcityEmailCodeUnavailable";
        } else if (!user.isEnabled()) {
            context.getEvent().user(user).error(Errors.USER_DISABLED);
            message = Messages.ACCOUNT_DISABLED;
        }
        if (message == null) {
            return false;
        }
        context.forceChallenge(form(context, service, message, null, null));
        return true;
    }

    /**
     * Records a wrong code against the user in Keycloak's brute-force protection. Keycloak's own automatic
     * logging only counts the password/otp/recovery-code categories, so this authenticator (category
     * {@code email-code}) records the failure itself, as a primary-factor failure.
     */
    private void recordFailure(AuthenticationFlowContext context, UserModel user) {
        RealmModel realm = context.getRealm();
        if (realm.isBruteForceProtected()) {
            context.getProtector().failedLogin(realm, user, context.getConnection(),
                    context.getSession().getContext().getHttpRequest().getUri(), null);
        }
    }

    static boolean canReceive(UserModel user) {
        String email = user.getEmail();
        return user.isEmailVerified() && email != null && !email.isBlank();
    }

    private static int ttlMinutes(EmailCodeSettings s) {
        return Math.max(1, s.ttlSeconds() / 60);
    }

    private static EmailCodeService service(AuthenticationFlowContext context) {
        AuthenticatorConfigModel config = context.getAuthenticatorConfig();
        EmailCodeSettings settings = EmailCodeSettings.from(config == null ? null : config.getConfig());
        return new EmailCodeService(settings, Time::currentTimeMillis, RANDOM);
    }

    /** Ties stored hashes to this browser tab's authentication session. */
    private static String binding(AuthenticationFlowContext context) {
        AuthenticationSessionModel auth = context.getAuthenticationSession();
        return auth.getParentSession().getId() + "/" + auth.getTabId();
    }

    /** HMAC keys: the realm's own HS512 secret key, never stored with the hash. */
    private static EmailCodeService.Keys keys(AuthenticationFlowContext context) {
        KeycloakSession session = context.getSession();
        RealmModel realm = context.getRealm();
        return new EmailCodeService.Keys() {
            @Override
            public EmailCodeService.Key active() {
                KeyWrapper key = session.keys().getActiveKey(realm, KeyUse.SIG, Algorithm.HS512);
                if (key == null || key.getSecretKey() == null) {
                    throw new IllegalStateException("Realm " + realm.getName() + " has no active HS512 key");
                }
                return new EmailCodeService.Key(key.getKid(), key.getSecretKey().getEncoded());
            }

            @Override
            public byte[] byId(String id) {
                KeyWrapper key = session.keys().getKey(realm, id, KeyUse.SIG, Algorithm.HS512);
                return key == null || key.getSecretKey() == null ? null : key.getSecretKey().getEncoded();
            }
        };
    }

    @Override
    public boolean requiresUser() {
        return true;
    }

    /**
     * Always true: whether the account can actually receive a code is decided inside the step, so the flow (and
     * any "try another way" list) looks the same for every account.
     */
    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
    }

    @Override
    public void close() {
    }

    /** {@link EmailCodeService.Notes} backed by server-side auth notes (never sent to the browser). */
    private record AuthNotes(AuthenticationSessionModel auth) implements EmailCodeService.Notes {
        @Override
        public String get(String key) {
            return auth.getAuthNote(key);
        }

        @Override
        public void set(String key, String value) {
            auth.setAuthNote(key, value);
        }

        @Override
        public void remove(String key) {
            auth.removeAuthNote(key);
        }
    }
}
