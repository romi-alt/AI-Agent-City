package city.agent.keycloak.emailcode;

import java.util.List;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.provider.ProviderConfigurationBuilder;

/**
 * Registers the email sign-in code authenticator under the fixed id {@value #PROVIDER_ID}.
 *
 * <p>Besides the properties below, every execution config also accepts Keycloak's common
 * {@code default.reference.value} / {@code default.reference.maxAge}; set them to {@code email-code} and the
 * session length so the {@code oidc-amr-mapper} reports this method in the {@code amr} claim (see README.md).
 */
public class EmailCodeAuthenticatorFactory implements AuthenticatorFactory {

    public static final String PROVIDER_ID = "agentcity-email-code";

    /** Reference category (also the conventional amr value). Not a Keycloak credential type. */
    public static final String REFERENCE_CATEGORY = "email-code";

    private static final AuthenticationExecutionModel.Requirement[] REQUIREMENTS = {
            AuthenticationExecutionModel.Requirement.REQUIRED,
            AuthenticationExecutionModel.Requirement.ALTERNATIVE,
            AuthenticationExecutionModel.Requirement.DISABLED };

    private static final List<ProviderConfigProperty> CONFIG = ProviderConfigurationBuilder.create()
            .property().name(EmailCodeSettings.CODE_LENGTH).label("Code length")
            .helpText("Digits in each code (6 to 10).")
            .type(ProviderConfigProperty.STRING_TYPE)
            .defaultValue(Integer.toString(EmailCodeSettings.DEFAULT_CODE_LENGTH)).add()
            .property().name(EmailCodeSettings.TTL_SECONDS).label("Code lifetime (seconds)")
            .helpText("How long a code can be used (60 to 3600).")
            .type(ProviderConfigProperty.STRING_TYPE)
            .defaultValue(Integer.toString(EmailCodeSettings.DEFAULT_TTL_SECONDS)).add()
            .property().name(EmailCodeSettings.MAX_ATTEMPTS).label("Attempts per code")
            .helpText("Wrong entries allowed before the code stops working (1 to 10).")
            .type(ProviderConfigProperty.STRING_TYPE)
            .defaultValue(Integer.toString(EmailCodeSettings.DEFAULT_MAX_ATTEMPTS)).add()
            .property().name(EmailCodeSettings.RESEND_COOLDOWN_SECONDS).label("Resend cooldown (seconds)")
            .helpText("Minimum wait between codes (0 to 3600). A new code replaces the previous one.")
            .type(ProviderConfigProperty.STRING_TYPE)
            .defaultValue(Integer.toString(EmailCodeSettings.DEFAULT_RESEND_COOLDOWN_SECONDS)).add()
            .property().name(EmailCodeSettings.MAX_SENDS).label("Codes per sign-in")
            .helpText("Codes that can be sent during one sign-in attempt (1 to 20).")
            .type(ProviderConfigProperty.STRING_TYPE)
            .defaultValue(Integer.toString(EmailCodeSettings.DEFAULT_MAX_SENDS)).add()
            .build();

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getDisplayType() {
        return "Email sign-in code";
    }

    @Override
    public String getHelpText() {
        return "Sends a one-time code to the user's verified email address and asks for it. Needs a user"
                + " identified earlier in the flow (for example by the Username Form).";
    }

    @Override
    public String getReferenceCategory() {
        return REFERENCE_CATEGORY;
    }

    @Override
    public boolean isConfigurable() {
        return true;
    }

    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return REQUIREMENTS;
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return CONFIG;
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return new EmailCodeAuthenticator();
    }

    @Override
    public void init(Config.Scope config) {
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
    }

    @Override
    public void close() {
    }
}
