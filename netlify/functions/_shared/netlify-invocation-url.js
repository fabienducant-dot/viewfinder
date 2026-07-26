"use strict";

function normalizeHttpOrigin(value){
  try{
    const url = new URL(String(value || ""));
    if(url.protocol !== "https:" && url.protocol !== "http:") return "";
    return `${url.protocol}//${url.host}`;
  }catch(_err){
    return "";
  }
}

function resolveInvocationBaseUrl(event, env = process.env){
  const configuredOrigin = normalizeHttpOrigin(env.URL || env.SITE_URL || "");
  const configuredHost = configuredOrigin ? new URL(configuredOrigin).hostname.toLowerCase() : "";
  const configuredSiteName = String(
    env.SITE_NAME ||
    (configuredHost.endsWith(".netlify.app") ? configuredHost.slice(0, -".netlify.app".length) : "")
  ).trim().toLowerCase();

  const headers = event && event.headers && typeof event.headers === "object" ? event.headers : {};
  const rawHost = String(headers["x-forwarded-host"] || headers.host || "")
    .split(",")[0].trim().toLowerCase();
  const hostIsSyntacticallySafe = /^[a-z0-9.-]+(?::\d{1,5})?$/.test(rawHost);
  const hostname = rawHost.split(":")[0];
  const isConfiguredProductionHost = !!configuredHost && hostname === configuredHost;
  const isMatchingNetlifyDeploy = !!configuredSiteName && (
    hostname === `${configuredSiteName}.netlify.app` ||
    hostname.endsWith(`--${configuredSiteName}.netlify.app`)
  );
  const isLocalDev = env.NETLIFY_DEV === "true" && (
    hostname === "localhost" || hostname === "127.0.0.1"
  );

  if(hostIsSyntacticallySafe && (isConfiguredProductionHost || isMatchingNetlifyDeploy)){
    return `https://${rawHost}`;
  }
  if(hostIsSyntacticallySafe && isLocalDev){
    return `http://${rawHost}`;
  }

  // DEPLOY_PRIME_URL désigne la Deploy Preview ou le branch deploy lorsqu'il est disponible
  // à l'exécution. URL/SITE_URL restent le dernier repli pour la production.
  return normalizeHttpOrigin(env.DEPLOY_PRIME_URL) || configuredOrigin;
}

module.exports = { normalizeHttpOrigin, resolveInvocationBaseUrl };
