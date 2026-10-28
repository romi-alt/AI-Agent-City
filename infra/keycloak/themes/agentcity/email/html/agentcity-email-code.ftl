<#-- The sign-in code (provider agentcity-email-code). Attributes: code, ttlMinutes, realmName. -->
<#import "template.ftl" as layout>
<#assign duration = (ttlMinutes == 1)?then(msg("acOneMinute"), msg("acMinutes", ttlMinutes?c))>
<@layout.emailLayout preheader=msg("acCodePreheader")>
<@layout.heading text=msg("acCodeHeading")/>
<@layout.p>${msg("acCodeIntro")}</@layout.p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;">
  <tr>
    <td style="background-color:#f4f4f2;border:1px solid #e7e5e4;border-radius:10px;padding:14px 22px;font-family:'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;font-size:30px;line-height:36px;font-weight:600;letter-spacing:8px;color:#0c0c0d;">${code}</td>
  </tr>
</table>
<@layout.note>${msg("acCodeExpiry", duration)}</@layout.note>
<@layout.note>${msg("acCodeIgnore")}</@layout.note>
</@layout.emailLayout>
