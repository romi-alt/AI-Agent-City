<#-- The email check. Demo requests get the demo wording; anything else (e.g. a first sign-in through agency SSO)
     gets the general wording. -->
<#import "template.ftl" as layout>
<#assign demo = layout.isDemoLink(link)>
<#assign expiry = linkExpirationFormatter(linkExpiration)>
<@layout.emailLayout preheader=msg(demo?then("acVerifyDemoPreheader", "acVerifyPreheader"))>
<@layout.heading text=msg("acVerifyHeading")/>
<@layout.p>${msg(demo?then("acVerifyDemoIntro", "acVerifyIntro"))}</@layout.p>
<@layout.button href=link label=msg("acVerifyButton")/>
<@layout.note>${msg("acVerifyExpiry", expiry)}</@layout.note>
<@layout.note>${msg(demo?then("acVerifyDemoIgnore", "acVerifyIgnore"))}</@layout.note>
<p style="margin:16px 0 0 0;font-size:11px;line-height:1.5;color:#8a8a93;">${msg("acLinkFallback")}<br><a href="${link}" style="color:#8a8a93;text-decoration:none;word-break:break-all;">${link}</a></p>
</@layout.emailLayout>
