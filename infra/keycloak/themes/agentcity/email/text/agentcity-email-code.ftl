<#ftl output_format="plainText">
<#assign duration = (ttlMinutes == 1)?then(msg("acOneMinute"), msg("acMinutes", ttlMinutes?c))>
${msg("acCodeHeading")}

${msg("acCodeIntro")}

${code}

${msg("acCodeExpiry", duration)}

${msg("acCodeIgnore")}

--
${msg("acEmailFooter")}
