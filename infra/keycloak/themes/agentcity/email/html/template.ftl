<#-- AgentCity email layout. Table-based with inline styles so it renders the same in mail clients; system fonts
     (web fonts are not reliably loaded by mail clients). Colours are the landing page's tokens. -->
<#macro emailLayout preheader="">
<!DOCTYPE html>
<html lang="${locale.language}" dir="${(ltr)?then('ltr','rtl')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>AgentCity</title>
</head>
<body style="margin:0;padding:0;background-color:#fafaf9;color:#0c0c0d;-webkit-text-size-adjust:100%;">
<#if preheader?has_content><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#fafaf9;">${preheader}</div></#if>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafaf9;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td style="padding:0 4px 20px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="bottom" style="padding-right:2px;"><div style="width:5px;height:10px;background-color:#0c0c0d;border-radius:1px;font-size:0;line-height:0;">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:2px;"><div style="width:5px;height:17px;background-color:#0c0c0d;border-radius:1px;font-size:0;line-height:0;">&nbsp;</div></td>
                <td valign="bottom" style="padding-right:9px;"><div style="width:5px;height:13px;background-color:#0c0c0d;border-radius:1px;font-size:0;line-height:0;">&nbsp;</div></td>
                <td valign="bottom" style="font-size:18px;line-height:18px;font-weight:600;letter-spacing:-0.02em;color:#0c0c0d;">AgentCity</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background-color:#ffffff;border:1px solid #e7e5e4;border-radius:16px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3f46;">
            <#nested>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#5f5f68;">
            ${msg("acEmailFooter")}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
</#macro>

<#-- Demo email checks are sent through the agentcity-provisioner client. The link carries the client only inside
     the action token, whose payload is base64url-encoded JSON: these are the three possible encodings (one per byte
     alignment) of '"azp":"agentcity-provisioner"', so finding one means the token was issued for that client. -->
<#function isDemoLink link>
  <#return link?contains("ImF6cCI6ImFnZW50Y2l0eS1wcm92aXNpb25lci") || link?contains("JhenAiOiJhZ2VudGNpdHktcHJvdmlzaW9uZXIi")
    || link?contains("iYXpwIjoiYWdlbnRjaXR5LXByb3Zpc2lvbmVyI")>
</#function>

<#-- A heading, paragraphs and a gold button, shared by our templates. -->
<#macro heading text><h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:#0c0c0d;">${text}</h1></#macro>
<#macro p><p style="margin:0 0 16px 0;"><#nested></p></#macro>
<#macro button href label>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
  <tr>
    <td align="center" bgcolor="#f5b335" style="border-radius:10px;">
      <a href="${href}" style="display:inline-block;padding:14px 24px;font-size:16px;line-height:20px;font-weight:600;color:#0c0c0d;text-decoration:none;border-radius:10px;">${label}</a>
    </td>
  </tr>
</table>
</#macro>
<#macro note><p style="margin:0 0 8px 0;font-size:13px;line-height:1.55;color:#5f5f68;"><#nested></p></#macro>
