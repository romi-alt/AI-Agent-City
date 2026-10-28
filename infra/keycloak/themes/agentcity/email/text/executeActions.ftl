<#ftl output_format="plainText">
<#-- Demo email checks are sent through the agentcity-provisioner client. The link carries the client only inside
     the action token, whose payload is base64url-encoded JSON: these are the three possible encodings (one per byte
     alignment) of '"azp":"agentcity-provisioner"', so finding one means the token was issued for that client. -->
<#assign actions = requiredActions![]>
<#assign demo = (link?contains("ImF6cCI6ImFnZW50Y2l0eS1wcm92aXNpb25lci") || link?contains("JhenAiOiJhZ2VudGNpdHktcHJvdmlzaW9uZXIi")
    || link?contains("iYXpwIjoiYWdlbnRjaXR5LXByb3Zpc2lvbmVyI")) && actions?size == 1 && actions[0] == "VERIFY_EMAIL">
<#assign expiry = linkExpirationFormatter(linkExpiration)>
<#if demo>
${msg("acVerifyHeading")}

${msg("acVerifyDemoIntro")}

${msg("acVerifyButton")}:
${link}

${msg("acVerifyExpiry", expiry)}

${msg("acVerifyDemoIgnore")}
<#else>
<#assign actionsText><#list actions as a>${msg("requiredAction.${a}")}<#sep>, </#sep></#list></#assign>
${msg("acActionsHeading")}

${msg("acActionsIntro", actionsText)}

${msg("acActionsButton")}:
${link}

${msg("acActionsExpiry", expiry)}

${msg("acActionsIgnore")}
</#if>

--
${msg("acEmailFooter")}
