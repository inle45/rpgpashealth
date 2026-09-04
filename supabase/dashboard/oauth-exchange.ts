// =============================================================================
// Guild Quest — Edge Function « oauth-exchange »
//
// Fichier GÉNÉRÉ à partir de supabase/functions/oauth-exchange/ : ne le modifie pas
// à la main, tes changements seraient écrasés. Modifie la source, puis relance
// node scripts/build-dashboard-files.mjs
//
// Mode d'emploi : dans le dashboard Supabase, Edge Functions → Deploy a new
// function → nomme-la exactement « oauth-exchange » → colle tout ce fichier.
// =============================================================================

// supabase/functions/_shared/cors.ts
var allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
var corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
function handlePreflight(req) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

// supabase/functions/_shared/supabase.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent \xEAtre d\xE9finis");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
async function getCallerId(req) {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// supabase/functions/_shared/google-fit.ts
var TOKEN_URL = "https://oauth2.googleapis.com/token";
var DAY_MS = 24 * 60 * 60 * 1e3;
function credentials() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants c\xF4t\xE9 Edge Functions");
  }
  return { clientId, clientSecret };
}
function subjectFromIdToken(idToken) {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(padded));
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}
function toTokens(payload, fallbackRefresh) {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? fallbackRefresh ?? null,
    expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1e3).toISOString() : null,
    providerUserId: subjectFromIdToken(payload.id_token),
    scopes: payload.scope ?? null
  };
}
async function exchangeCode(code, redirectUri, codeVerifier) {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google: \xE9change du code impossible (${payload.error ?? response.status}: ${payload.error_description ?? "erreur inconnue"})`
    );
  }
  return toTokens(payload);
}

// supabase/functions/_shared/fitbit.ts
var TOKEN_URL2 = "https://api.fitbit.com/oauth2/token";
function credentials2() {
  const clientId = Deno.env.get("FITBIT_CLIENT_ID");
  const clientSecret = Deno.env.get("FITBIT_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET manquants c\xF4t\xE9 Edge Functions");
  }
  return { clientId, clientSecret };
}
function basicAuthHeader() {
  const { clientId, clientSecret } = credentials2();
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}
function toTokens2(payload, fallbackRefresh) {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? fallbackRefresh ?? null,
    expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1e3).toISOString() : null,
    providerUserId: payload.user_id ?? null,
    scopes: payload.scope ?? null
  };
}
async function exchangeCode2(code, redirectUri, codeVerifier) {
  const { clientId } = credentials2();
  const response = await fetch(TOKEN_URL2, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    const message = payload.errors?.[0]?.message ?? `HTTP ${response.status}`;
    throw new Error(`Fitbit: \xE9change du code impossible (${message})`);
  }
  return toTokens2(payload);
}

// supabase/functions/oauth-exchange/index.ts
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return jsonResponse({ error: "m\xE9thode non autoris\xE9e" }, 405);
  }
  const userId = await getCallerId(req);
  if (!userId) {
    return jsonResponse({ error: "authentification requise" }, 401);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "corps de requ\xEAte invalide" }, 400);
  }
  const { provider, code, codeVerifier, redirectUri } = body;
  if (!code || !codeVerifier || !redirectUri) {
    return jsonResponse({ error: "code, codeVerifier et redirectUri sont requis" }, 400);
  }
  if (provider !== "google_fit" && provider !== "fitbit") {
    return jsonResponse({ error: "provider inconnu" }, 400);
  }
  try {
    const tokens = provider === "google_fit" ? await exchangeCode(code, redirectUri, codeVerifier) : await exchangeCode2(code, redirectUri, codeVerifier);
    const supabase = adminClient();
    const { data: connection, error: connectionError } = await supabase.from("health_connections").upsert(
      {
        user_id: userId,
        provider,
        provider_user_id: tokens.providerUserId,
        scopes: tokens.scopes,
        connected_at: (/* @__PURE__ */ new Date()).toISOString(),
        last_sync_error: null
      },
      { onConflict: "user_id,provider" }
    ).select("id").single();
    if (connectionError || !connection) {
      throw new Error(`enregistrement de la connexion impossible: ${connectionError?.message}`);
    }
    const { error: tokenError } = await supabase.from("health_tokens").upsert(
      {
        connection_id: connection.id,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "connection_id" }
    );
    if (tokenError) {
      throw new Error(`enregistrement des jetons impossible: ${tokenError.message}`);
    }
    const warning = provider === "google_fit" && !tokens.refreshToken ? "Google n'a pas fourni de refresh token. R\xE9voque l'acc\xE8s dans ton compte Google puis reconnecte-toi pour activer la synchro automatique." : null;
    return jsonResponse({ ok: true, provider, warning });
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur inconnue";
    console.error("oauth-exchange:", message);
    return jsonResponse({ error: message }, 502);
  }
});
