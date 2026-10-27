<#ftl output_format="plainText">
${msg("agentcityEmailCodeBodyIntro", realmName)}

${code}

${msg("agentcityEmailCodeBodyExpiry", (ttlMinutes == 1)?then(msg("agentcityEmailCodeOneMinute"), msg("agentcityEmailCodeMinutes", ttlMinutes?c)))}

${msg("agentcityEmailCodeBodyIgnore")}
