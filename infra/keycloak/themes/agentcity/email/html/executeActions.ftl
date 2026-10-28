<#-- Admin-issued actions (execute-actions email): passkey enrolment, and the demo email check from API builds
     before the dedicated verify-email endpoint was used. A demo email check gets the demo wording. -->
<#import "template.ftl" as layout>
<#assign actions = requiredActions![]>
<#assign demo = layout.isDemoLink(link) && actions?size == 1 && actions[0] == "VERIFY_EMAIL">
<#assign expiry = linkExpirationFormatter(linkExpiration)>
<#if demo>
<@layout.emailLayout preheader=msg("acVerifyDemoPreheader")>
<@layout.heading text=msg("acVerifyHeading")/>
<@layout.p>${msg("acVerifyDemoIntro")}</@layout.p>
<@layout.button href=link label=msg("acVerifyButton")/>
<@layout.note>${msg("acVerifyExpiry", expiry)}</@layout.note>
<@layout.note>${msg("acVerifyDemoIgnore")}</@layout.note>
<p style="margin:16px 0 0 0;font-size:11px;line-height:1.5;color:#8a8a93;">${msg("acLinkFallback")}<br><a href="${link}" style="color:#8a8a93;text-decoration:none;word-break:break-all;">${link}</a></p>
</@layout.emailLayout>
<#else>
<#assign actionsText><#list actions as a>${msg("requiredAction.${a}")}<#sep>, </#sep></#list></#assign>
<@layout.emailLayout preheader=msg("acActionsHeading")>
<@layout.heading text=msg("acActionsHeading")/>
<@layout.p>${msg("acActionsIntro", actionsText)}</@layout.p>
<@layout.button href=link label=msg("acActionsButton")/>
<@layout.note>${msg("acActionsExpiry", expiry)}</@layout.note>
<@layout.note>${msg("acActionsIgnore")}</@layout.note>
<p style="margin:16px 0 0 0;font-size:11px;line-height:1.5;color:#8a8a93;">${msg("acLinkFallback")}<br><a href="${link}" style="color:#8a8a93;text-decoration:none;word-break:break-all;">${link}</a></p>
</@layout.emailLayout>
</#if>
