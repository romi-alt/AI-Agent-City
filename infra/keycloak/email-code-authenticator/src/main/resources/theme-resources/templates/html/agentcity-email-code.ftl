<#import "template.ftl" as layout>
<@layout.emailLayout>
<p>${msg("agentcityEmailCodeBodyIntro", realmName)}</p>
<p style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
<p>${msg("agentcityEmailCodeBodyExpiry", (ttlMinutes == 1)?then(msg("agentcityEmailCodeOneMinute"), msg("agentcityEmailCodeMinutes", ttlMinutes?c)))}</p>
<p>${msg("agentcityEmailCodeBodyIgnore")}</p>
</@layout.emailLayout>
