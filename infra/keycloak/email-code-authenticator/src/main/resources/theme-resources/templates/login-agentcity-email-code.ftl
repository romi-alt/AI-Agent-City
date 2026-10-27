<#-- AgentCity email sign-in code page (provider agentcity-email-code). Works with the keycloak.v2 and keycloak login themes. -->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('code') displayInfo=true; section>
    <#if section = "header">
        ${msg("agentcityEmailCodeTitle")}
    <#elseif section = "form">
        <#assign duration = (emailCode.ttlMinutes == 1)?then(msg("agentcityEmailCodeOneMinute"), msg("agentcityEmailCodeMinutes", emailCode.ttlMinutes?c))>
        <#if emailCode.sent>
            <p id="agentcity-email-code-sent" class="${properties.kcFormGroupClass!}">
                <#if emailCode.maskedEmail?has_content>
                    ${msg("agentcityEmailCodeSent", emailCode.codeLength?c, emailCode.maskedEmail, duration)}
                <#else>
                    ${msg("agentcityEmailCodeSentNoAddress", emailCode.codeLength?c, "", duration)}
                </#if>
            </p>
        </#if>
        <form id="kc-email-code-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <div class="${properties.kcFormGroupClass!}">
                <div class="${properties.kcLabelWrapperClass!}">
                    <label for="code" class="${properties.kcLabelClass!} ${properties.kcFormLabelClass!}">${msg("agentcityEmailCodeLabel")}</label>
                </div>
                <span class="${properties.kcInputClass!}<#if messagesPerField.existsError('code')> ${properties.kcError!}</#if>">
                    <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
                           maxlength="${(emailCode.codeLength + 4)?c}" dir="ltr" autofocus
                           <#if emailCode.sent>aria-describedby="agentcity-email-code-sent"</#if>
                           aria-invalid="<#if messagesPerField.existsError('code')>true<#else>false</#if>"/>
                </span>
                <#if messagesPerField.existsError('code')>
                    <div id="input-error-code" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('code'))?no_esc}
                    </div>
                </#if>
            </div>
            <div class="${properties.kcFormGroupClass!}">
                <input id="kc-login" name="login" type="submit" value="${msg("agentcityEmailCodeSubmit")}"
                       class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"/>
            </div>
        </form>
        <form id="kc-email-code-resend-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <input type="hidden" name="resend" value="true"/>
            <div class="${properties.kcFormGroupClass!}">
                <input id="kc-email-code-resend" type="submit" value="${msg("agentcityEmailCodeResend")}"
                       class="${properties.kcButtonClass!} ${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}"/>
            </div>
        </form>
    <#elseif section = "info">
        <p id="agentcity-email-code-help">${msg("agentcityEmailCodeHelp")}</p>
    </#if>
</@layout.registrationLayout>
