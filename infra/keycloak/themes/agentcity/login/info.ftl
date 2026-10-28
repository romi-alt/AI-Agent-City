<#-- AgentCity: base info.ftl (Keycloak 26.8.1) with two demo behaviours, both limited to the agentcity-provisioner
     client (the demo's email check; its only redirect URI is /demo/verified*):
     1. the confirmation step before the email check runs keeps its deliberate click (so link scanners cannot
        confirm an address), worded "Confirm your email" with a gold button;
     2. the "Account updated" page that follows continues to /demo/verified by itself instead of waiting for
        "Back to application". Keycloak has already checked pageRedirectUri against the client's redirect URIs.
     Every other info page keeps upstream behaviour and wording; its proceed link is drawn as a button. -->
<#import "template.ftl" as layout>
<#assign acAutoContinue = (pageRedirectUri?has_content && !(skipLink??) && !(requiredActions??)
    && ((client.clientId)!'') == "agentcity-provisioner" && ((message.type)!'') == "success")>
<#-- The deliberate click before the demo's email check runs (link scanners must not trigger it): one wording,
     whichever Keycloak endpoint sent the email. -->
<#assign acDemoConfirm = (actionUri?has_content && !acAutoContinue && ((client.clientId)!'') == "agentcity-provisioner")>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if acAutoContinue>
            ${msg("acEmailConfirmedTitle")}
        <#elseif acDemoConfirm>
            ${msg("confirmEmailAddressVerificationHeader")}
        <#elseif messageHeader??>
            ${kcSanitize(msg("${messageHeader}"))?no_esc}
        <#else>
            ${message.summary}
        </#if>
    <#elseif section = "form">
    <div id="kc-info-message">
        <#if acAutoContinue>
            <p class="instruction" id="ac-auto-continue">${msg("acEmailConfirmedContinuing")}</p>
            <p><a id="ac-continue-link" class="ac-link" href="${pageRedirectUri}">${msg("acContinue")}</a></p>
            <script>
                <#outputformat "JavaScript">
                window.location.replace(${pageRedirectUri?c});
                </#outputformat>
            </script>
            <noscript><meta http-equiv="refresh" content="0;url=${pageRedirectUri}"></noscript>
        <#elseif acDemoConfirm>
            <p class="instruction" id="ac-demo-confirm">${msg("acDemoConfirmText")}</p>
            <p class="ac-actions"><a id="ac-proceed" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" href="${actionUri}">${msg("acConfirmMyEmail")}</a></p>
        <#else>
        <p class="instruction">${message.summary}<#if requiredActions??><#list requiredActions>: <b><#items as reqActionItem>${kcSanitize(msg("requiredAction.${reqActionItem}"))?no_esc}<#sep>, </#items></b></#list><#else></#if></p>
        <#if skipLink??>
        <#else>
            <#if pageRedirectUri?has_content>
                <p><a class="ac-link" href="${pageRedirectUri}">${msg("backToApplication")}</a></p>
            <#elseif actionUri?has_content>
                <#-- The deliberate click before an emailed action runs (link scanners must not trigger it), as a button. -->
                <p class="ac-actions"><a id="ac-proceed" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" href="${actionUri}">${msg("proceedWithAction")}</a></p>
            <#elseif (client.baseUrl)?has_content>
                <p><a class="ac-link" href="${client.baseUrl}">${msg("backToApplication")}</a></p>
            </#if>
        </#if>
        </#if>
    </div>
    </#if>
</@layout.registrationLayout>
