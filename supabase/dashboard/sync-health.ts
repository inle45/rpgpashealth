// =============================================================================
// Guild Quest — Edge Function « sync-health »
//
// Fichier GÉNÉRÉ à partir de supabase/functions/sync-health/ : ne le modifie pas
// à la main, tes changements seraient écrasés. Modifie la source, puis relance
// node scripts/build-dashboard-files.mjs
//
// Mode d'emploi : dans le dashboard Supabase, Edge Functions → Deploy a new
// function → nomme-la exactement « sync-health » → colle tout ce fichier.
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

// shared/game/rules.ts
var RULES = {
  /** Objectifs par défaut d'un nouveau joueur. */
  DEFAULT_STEPS_GOAL: 8e3,
  DEFAULT_ACTIVE_MINUTES_GOAL: 30,
  /**
   * Plafond du ratio d'objectif. Sans ce plafond, celui qui fait 40 000 pas
   * écrase la contribution de tout le monde et le jeu n'a plus d'intérêt.
   */
  MAX_GOAL_RATIO: 2,
  /** XP pour un objectif de pas atteint pile (ratio = 1). */
  XP_PER_GOAL: 100,
  /** XP par minute d'activité modérée/intense. */
  XP_PER_ACTIVE_MINUTE: 2,
  /** Seuil de "participation" : moitié de son objectif perso. */
  PARTICIPATION_RATIO: 0.5,
  /** Bonus d'XP par jour de série, plafonné. */
  STREAK_BONUS_PER_DAY: 0.01,
  MAX_STREAK_DAYS: 30,
  /** Poids des zones cardiaques dans les dégâts au boss. */
  DAMAGE_PER_FAT_BURN_MINUTE: 1,
  DAMAGE_PER_CARDIO_MINUTE: 3,
  DAMAGE_PER_PEAK_MINUTE: 6,
  /**
   * Une vraie séance (>= 20 min en cardio+peak sur la journée) déclenche
   * l'attaque spéciale : de quoi récompenser l'effort intense ponctuel
   * autant que le volume.
   */
  SPECIAL_ATTACK_MINUTES: 20,
  SPECIAL_ATTACK_MULTIPLIER: 1.5,
  /** Points de marche pour un objectif de pas atteint pile. */
  MARCH_PER_GOAL: 100,
  /**
   * PV du boss : on vise ~85 % de ce que la guilde a infligé en moyenne les
   * semaines précédentes. Le boss se recalibre donc tout seul sur la forme
   * réelle du groupe, au lieu d'être infaisable ou trivial.
   */
  BOSS_HP_TARGET_RATIO: 0.85,
  /** PV plancher par membre, pour la toute première semaine d'une guilde. */
  BOSS_HP_FLOOR_PER_MEMBER: 600,
  /** Nombre de semaines passées utilisées pour calibrer le boss. */
  BOSS_CALIBRATION_WEEKS: 4,
  /** Vitalité du compagnon. */
  COMPANION_START_VITALITY: 70,
  COMPANION_MAX_VITALITY: 100,
  /** Variation quotidienne selon le taux de participation de la guilde. */
  COMPANION_DELTAS: [
    { minParticipation: 0.75, delta: 8 },
    { minParticipation: 0.5, delta: 3 },
    { minParticipation: 0.25, delta: -2 },
    { minParticipation: 0, delta: -6 }
  ],
  /** Bonus de vitalité quand la guilde tombe un boss. */
  COMPANION_BOSS_WIN_BONUS: 10,
  /** Malus quand le boss survit à la semaine. */
  COMPANION_BOSS_FAIL_MALUS: -12
};
var CLASS_BONUSES = {
  ranger: {
    label: "R\xF4deur",
    xpMultiplier: 1,
    damageMultiplier: 0.9,
    marchMultiplier: 1.2,
    blurb: "Fait avancer la guilde plus vite sur la carte. Pour les gros marcheurs."
  },
  berserker: {
    label: "Berserker",
    xpMultiplier: 1,
    damageMultiplier: 1.25,
    marchMultiplier: 0.9,
    blurb: "Frappe plus fort au boss. Pour ceux qui vont chercher le cardio."
  },
  paladin: {
    label: "Paladin",
    xpMultiplier: 1.15,
    damageMultiplier: 1,
    marchMultiplier: 1,
    blurb: "Monte en niveau plus vite. Pour la r\xE9gularit\xE9 au long cours."
  }
};
var BOSSES = [
  {
    key: "stone_golem",
    name: "Golem de Pierre",
    sprite: "/sprites/boss-stone-golem.png",
    hpMultiplier: 1,
    taunt: "Vos pas r\xE9sonnent creux. Je suis fait de la montagne elle-m\xEAme."
  },
  {
    key: "frost_wyvern",
    name: "Wyverne de Givre",
    sprite: "/sprites/boss-frost-wyvern.png",
    hpMultiplier: 1.15,
    taunt: "Courez donc. Le froid court plus vite."
  }
];

// shared/game/engine.ts
function goalRatio(steps, goals) {
  const target = Math.max(1, goals.stepsGoal);
  return Math.min(RULES.MAX_GOAL_RATIO, Math.max(0, steps) / target);
}
function streakMultiplier(streakDays) {
  const capped = Math.min(Math.max(0, streakDays), RULES.MAX_STREAK_DAYS);
  return 1 + capped * RULES.STREAK_BONUS_PER_DAY;
}
function computeContribution(activity, goals, characterClass, streakDays) {
  const bonuses = CLASS_BONUSES[characterClass];
  const ratio = goalRatio(activity.steps, goals);
  const multiplier = streakMultiplier(streakDays);
  const rawXp = ratio * RULES.XP_PER_GOAL + Math.max(0, activity.activeMinutes) * RULES.XP_PER_ACTIVE_MINUTE;
  const xp = Math.round(rawXp * multiplier * bonuses.xpMultiplier);
  const intenseMinutes = Math.max(0, activity.cardioMinutes) + Math.max(0, activity.peakMinutes);
  const specialAttack = intenseMinutes >= RULES.SPECIAL_ATTACK_MINUTES;
  const rawDamage = Math.max(0, activity.fatBurnMinutes) * RULES.DAMAGE_PER_FAT_BURN_MINUTE + Math.max(0, activity.cardioMinutes) * RULES.DAMAGE_PER_CARDIO_MINUTE + Math.max(0, activity.peakMinutes) * RULES.DAMAGE_PER_PEAK_MINUTE;
  const damage = Math.round(
    rawDamage * (specialAttack ? RULES.SPECIAL_ATTACK_MULTIPLIER : 1) * bonuses.damageMultiplier
  );
  const marchPoints = Math.round(ratio * RULES.MARCH_PER_GOAL * bonuses.marchMultiplier);
  return {
    date: activity.date,
    goalRatio: ratio,
    xp,
    damage,
    marchPoints,
    participated: ratio >= RULES.PARTICIPATION_RATIO,
    specialAttack,
    streakMultiplier: multiplier
  };
}
function computeStreak(history, today) {
  const byDate = new Map(history.map((entry) => [entry.date, entry.participated]));
  let streak = 0;
  let cursor = today;
  if (!byDate.get(cursor)) {
    cursor = shiftDate(cursor, -1);
  }
  while (byDate.get(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}
function computeBossHp(memberCount, pastWeeklyDamage, boss) {
  const members = Math.max(1, memberCount);
  const floor = members * RULES.BOSS_HP_FLOOR_PER_MEMBER;
  const sample = pastWeeklyDamage.slice(0, RULES.BOSS_CALIBRATION_WEEKS).filter((n) => n > 0);
  const calibrated = sample.length > 0 ? sample.reduce((sum, n) => sum + n, 0) / sample.length * RULES.BOSS_HP_TARGET_RATIO : floor;
  return Math.round(Math.max(floor, calibrated) * boss.hpMultiplier);
}
function pickBoss(weekIndex2) {
  const index = (weekIndex2 % BOSSES.length + BOSSES.length) % BOSSES.length;
  return BOSSES[index];
}
function applyCompanionDelta(vitality, delta) {
  return Math.min(RULES.COMPANION_MAX_VITALITY, Math.max(0, Math.round(vitality + delta)));
}
function shiftDate(date, days) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekStart(date) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}
function weekIndex(date) {
  const monday = /* @__PURE__ */ new Date(`${weekStart(date)}T00:00:00Z`);
  return Math.floor(monday.getTime() / (7 * 24 * 60 * 60 * 1e3));
}
function dateRange(from, to) {
  const dates = [];
  let cursor = from;
  for (let i = 0; i < 366 && cursor <= to; i += 1) {
    dates.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return dates;
}

// supabase/functions/_shared/activity.ts
var ZONE_THRESHOLDS = {
  fatBurn: 0.5,
  cardio: 0.7,
  peak: 0.85
};
function emptyActivity(date) {
  return {
    date,
    steps: 0,
    activeMinutes: 0,
    fatBurnMinutes: 0,
    cardioMinutes: 0,
    peakMinutes: 0,
    calories: 0,
    sleepMinutes: 0,
    restingHeartRate: 0
  };
}
function classifyHeartRateZones(samples, minutesPerSample, maxHeartRate) {
  const hrMax = Math.max(120, maxHeartRate);
  const zones = { fatBurn: 0, cardio: 0, peak: 0, restingEstimate: 0 };
  let lowest = Number.POSITIVE_INFINITY;
  for (const bpm of samples) {
    if (!Number.isFinite(bpm) || bpm <= 0) continue;
    lowest = Math.min(lowest, bpm);
    const fraction = bpm / hrMax;
    if (fraction >= ZONE_THRESHOLDS.peak) zones.peak += minutesPerSample;
    else if (fraction >= ZONE_THRESHOLDS.cardio) zones.cardio += minutesPerSample;
    else if (fraction >= ZONE_THRESHOLDS.fatBurn) zones.fatBurn += minutesPerSample;
  }
  zones.restingEstimate = Number.isFinite(lowest) ? Math.round(lowest) : 0;
  return zones;
}

// supabase/functions/_shared/google-fit.ts
var TOKEN_URL = "https://oauth2.googleapis.com/token";
var AGGREGATE_URL = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";
var DAY_MS = 24 * 60 * 60 * 1e3;
var HR_BUCKET_MINUTES = 5;
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
async function refreshTokens(refreshToken) {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token"
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google: rafra\xEEchissement impossible (${payload.error ?? response.status}). L'utilisateur doit probablement reconnecter son compte.`
    );
  }
  return toTokens(payload, refreshToken);
}
async function aggregate(accessToken, body) {
  const response = await fetch(AGGREGATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Fit: agr\xE9gation refus\xE9e (${response.status}) ${detail.slice(0, 300)}`);
  }
  const payload = await response.json();
  return payload.bucket ?? [];
}
function sumDataset(bucket, datasetIndex) {
  const points = bucket.dataset?.[datasetIndex]?.point ?? [];
  let total = 0;
  for (const point of points) {
    for (const value of point.value ?? []) {
      total += value.intVal ?? value.fpVal ?? 0;
    }
  }
  return total;
}
function averageDataset(bucket, datasetIndex) {
  const points = bucket.dataset?.[datasetIndex]?.point ?? [];
  const values = [];
  for (const point of points) {
    const first = point.value?.[0];
    const numeric = first?.fpVal ?? first?.intVal;
    if (typeof numeric === "number" && numeric > 0) values.push(numeric);
  }
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}
function dayBounds(date, timeZoneOffsetMinutes) {
  const startUtc = Date.parse(`${date}T00:00:00Z`);
  const start = startUtc + timeZoneOffsetMinutes * 60 * 1e3;
  return { start, end: start + DAY_MS };
}
async function fetchHeartRateZones(accessToken, date, offsetMinutes, maxHeartRate) {
  const { start, end } = dayBounds(date, offsetMinutes);
  const buckets = await aggregate(accessToken, {
    aggregateBy: [{ dataTypeName: "com.google.heart_rate.bpm" }],
    bucketByTime: { durationMillis: HR_BUCKET_MINUTES * 60 * 1e3 },
    startTimeMillis: start,
    endTimeMillis: end
  });
  const averages = [];
  for (const bucket of buckets) {
    const avg = averageDataset(bucket, 0);
    if (avg !== null) averages.push(avg);
  }
  return classifyHeartRateZones(averages, HR_BUCKET_MINUTES, maxHeartRate);
}
async function fetchActivity(accessToken, dates, offsetMinutes, maxHeartRate) {
  if (dates.length === 0) return [];
  const first = dayBounds(dates[0], offsetMinutes);
  const last = dayBounds(dates[dates.length - 1], offsetMinutes);
  const buckets = await aggregate(accessToken, {
    aggregateBy: [
      {
        dataTypeName: "com.google.step_count.delta",
        dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
      },
      { dataTypeName: "com.google.active_minutes" },
      { dataTypeName: "com.google.calories.expended" }
    ],
    bucketByTime: { durationMillis: DAY_MS },
    startTimeMillis: first.start,
    endTimeMillis: last.end
  });
  const byDate = /* @__PURE__ */ new Map();
  for (const date of dates) byDate.set(date, emptyActivity(date));
  for (const bucket of buckets) {
    const startMillis = Number(bucket.startTimeMillis ?? "0");
    if (!startMillis) continue;
    const localDate2 = new Date(startMillis - offsetMinutes * 60 * 1e3).toISOString().slice(0, 10);
    const entry = byDate.get(localDate2);
    if (!entry) continue;
    entry.steps = Math.round(sumDataset(bucket, 0));
    entry.activeMinutes = Math.round(sumDataset(bucket, 1));
    entry.calories = Math.round(sumDataset(bucket, 2));
  }
  for (const date of dates) {
    const entry = byDate.get(date);
    if (!entry) continue;
    try {
      const zones = await fetchHeartRateZones(accessToken, date, offsetMinutes, maxHeartRate);
      entry.fatBurnMinutes = zones.fatBurn;
      entry.cardioMinutes = zones.cardio;
      entry.peakMinutes = zones.peak;
      entry.restingHeartRate = zones.restingEstimate;
    } catch {
    }
  }
  return dates.map((date) => byDate.get(date));
}

// supabase/functions/_shared/fitbit.ts
var TOKEN_URL2 = "https://api.fitbit.com/oauth2/token";
var API_BASE = "https://api.fitbit.com";
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
async function refreshTokens2(refreshToken) {
  const response = await fetch(TOKEN_URL2, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    const message = payload.errors?.[0]?.message ?? `HTTP ${response.status}`;
    throw new Error(
      `Fitbit: rafra\xEEchissement impossible (${message}). L'utilisateur doit probablement reconnecter son compte.`
    );
  }
  return toTokens2(payload, refreshToken);
}
async function apiGet(accessToken, path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Accept-Language": "en_US"
      // force les unités métriques côté distances
    }
  });
  if (response.status === 429) {
    throw new Error("Fitbit: quota horaire d\xE9pass\xE9 (150 req/h). R\xE9essaie dans une heure.");
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Fitbit: ${path} a r\xE9pondu ${response.status} ${detail.slice(0, 200)}`);
  }
  return await response.json();
}
async function timeSeries(accessToken, resource, from, to, key) {
  const payload = await apiGet(
    accessToken,
    `/1/user/-/activities/${resource}/date/${from}/${to}.json`
  );
  const entries = payload[key] ?? [];
  return new Map(entries.map((entry) => [entry.dateTime, Number(entry.value) || 0]));
}
async function fetchActivity2(accessToken, dates) {
  if (dates.length === 0) return [];
  const from = dates[0];
  const to = dates[dates.length - 1];
  const [steps, fairlyActive, veryActive, calories] = await Promise.all([
    timeSeries(accessToken, "steps", from, to, "activities-steps"),
    timeSeries(accessToken, "minutesFairlyActive", from, to, "activities-minutesFairlyActive"),
    timeSeries(accessToken, "minutesVeryActive", from, to, "activities-minutesVeryActive"),
    timeSeries(accessToken, "calories", from, to, "activities-calories")
  ]);
  const heartByDate = /* @__PURE__ */ new Map();
  try {
    const payload = await apiGet(
      accessToken,
      `/1/user/-/activities/heart/date/${from}/${to}.json`
    );
    for (const entry of payload["activities-heart"] ?? []) {
      heartByDate.set(entry.dateTime, entry);
    }
  } catch {
  }
  const sleepByDate = /* @__PURE__ */ new Map();
  try {
    const payload = await apiGet(
      accessToken,
      `/1.2/user/-/sleep/date/${from}/${to}.json`
    );
    for (const entry of payload.sleep ?? []) {
      if (!entry.dateOfSleep) continue;
      const previous = sleepByDate.get(entry.dateOfSleep) ?? 0;
      sleepByDate.set(entry.dateOfSleep, previous + (entry.minutesAsleep ?? 0));
    }
  } catch {
  }
  return dates.map((date) => {
    const activity = emptyActivity(date);
    activity.steps = steps.get(date) ?? 0;
    activity.activeMinutes = (fairlyActive.get(date) ?? 0) + (veryActive.get(date) ?? 0);
    activity.calories = calories.get(date) ?? 0;
    activity.sleepMinutes = sleepByDate.get(date) ?? 0;
    const heart = heartByDate.get(date);
    for (const zone of heart?.value?.heartRateZones ?? []) {
      const minutes = Math.max(0, Math.round(zone.minutes ?? 0));
      switch (zone.name) {
        case "Fat Burn":
          activity.fatBurnMinutes = minutes;
          break;
        case "Cardio":
          activity.cardioMinutes = minutes;
          break;
        case "Peak":
          activity.peakMinutes = minutes;
          break;
        default:
          break;
      }
    }
    activity.restingHeartRate = Math.round(heart?.value?.restingHeartRate ?? 0);
    return activity;
  });
}

// supabase/functions/_shared/guild.ts
async function ensureWeeklyBoss(supabase, guildId, today) {
  const monday = weekStart(today);
  const { data: existing } = await supabase.from("boss_battles").select("id").eq("guild_id", guildId).eq("week_start", monday).maybeSingle();
  if (existing) return;
  const { data: members } = await supabase.from("guild_members").select("user_id").eq("guild_id", guildId);
  const memberIds = (members ?? []).map((m) => m.user_id);
  if (memberIds.length === 0) return;
  const pastWeeklyDamage = await weeklyDamageHistory(supabase, memberIds, monday, 4);
  const boss = pickBoss(weekIndex(today));
  const maxHp = computeBossHp(memberIds.length, pastWeeklyDamage, boss);
  await supabase.from("boss_battles").insert({
    guild_id: guildId,
    week_start: monday,
    boss_key: boss.key,
    boss_name: boss.name,
    sprite: boss.sprite,
    max_hp: maxHp,
    status: "active"
  });
}
async function weeklyDamageHistory(supabase, memberIds, beforeMonday, weeks) {
  const from = shiftDate(beforeMonday, -7 * weeks);
  const { data } = await supabase.from("daily_activity").select("activity_date, damage_dealt").in("user_id", memberIds).gte("activity_date", from).lt("activity_date", beforeMonday);
  const totals = /* @__PURE__ */ new Map();
  for (const row of data ?? []) {
    const monday = weekStart(row.activity_date);
    totals.set(monday, (totals.get(monday) ?? 0) + (row.damage_dealt ?? 0));
  }
  return [...totals.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1).map(([, total]) => total);
}
async function resolveFinishedBattles(supabase, guildId, today) {
  const currentMonday = weekStart(today);
  const { data: battles } = await supabase.from("boss_battle_state").select("id, week_start, max_hp, damage_dealt, status").eq("guild_id", guildId).eq("status", "active");
  for (const battle of battles ?? []) {
    const vanquished = battle.damage_dealt >= battle.max_hp;
    const weekOver = battle.week_start < currentMonday;
    if (!vanquished && !weekOver) continue;
    const { data: updated } = await supabase.from("boss_battles").update({
      status: vanquished ? "defeated" : "failed",
      resolved_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", battle.id).eq("status", "active").select("id");
    if (!updated || updated.length === 0) continue;
    await adjustCompanionVitality(
      supabase,
      guildId,
      vanquished ? RULES.COMPANION_BOSS_WIN_BONUS : RULES.COMPANION_BOSS_FAIL_MALUS
    );
  }
}
async function adjustCompanionVitality(supabase, guildId, delta) {
  const { data: guild } = await supabase.from("guilds").select("companion_vitality").eq("id", guildId).maybeSingle();
  if (!guild) return;
  await supabase.from("guilds").update({ companion_vitality: applyCompanionDelta(guild.companion_vitality, delta) }).eq("id", guildId);
}
function timezoneOffsetMinutes(timeZone, at) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    const parts = formatter.formatToParts(at);
    const value = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const asUtc = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour") === 24 ? 0 : value("hour"),
      value("minute"),
      value("second")
    );
    return Math.round((at.getTime() - asUtc) / 6e4);
  } catch {
    return 0;
  }
}
function localDate(timeZone, at = /* @__PURE__ */ new Date()) {
  const offset = timezoneOffsetMinutes(timeZone, at);
  return new Date(at.getTime() - offset * 6e4).toISOString().slice(0, 10);
}

// supabase/functions/_shared/sync.ts
var REFRESH_MARGIN_MS = 2 * 60 * 1e3;
var STREAK_LOOKBACK_DAYS = 60;
async function validAccessToken(supabase, connection) {
  const tokens = connection.health_tokens;
  if (!tokens) {
    throw new Error("aucun jeton enregistr\xE9 \u2014 reconnecte le compte");
  }
  const expiresAt = tokens.expires_at ? Date.parse(tokens.expires_at) : null;
  const stillValid = expiresAt === null || expiresAt - Date.now() > REFRESH_MARGIN_MS;
  if (stillValid) return tokens.access_token;
  if (!tokens.refresh_token) {
    throw new Error("jeton expir\xE9 et aucun refresh token \u2014 reconnecte le compte");
  }
  const refreshed = connection.provider === "google_fit" ? await refreshTokens(tokens.refresh_token) : await refreshTokens2(tokens.refresh_token);
  await supabase.from("health_tokens").update({
    access_token: refreshed.accessToken,
    refresh_token: refreshed.refreshToken,
    expires_at: refreshed.expiresAt,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("connection_id", connection.id);
  return refreshed.accessToken;
}
function mergeActivity(target, incoming) {
  return {
    date: target.date,
    steps: Math.max(target.steps, incoming.steps),
    activeMinutes: Math.max(target.activeMinutes, incoming.activeMinutes),
    fatBurnMinutes: Math.max(target.fatBurnMinutes, incoming.fatBurnMinutes),
    cardioMinutes: Math.max(target.cardioMinutes, incoming.cardioMinutes),
    peakMinutes: Math.max(target.peakMinutes, incoming.peakMinutes),
    calories: Math.max(target.calories, incoming.calories),
    sleepMinutes: Math.max(target.sleepMinutes, incoming.sleepMinutes),
    restingHeartRate: Math.max(target.restingHeartRate, incoming.restingHeartRate)
  };
}
async function syncUser(supabase, userId, days) {
  const errors = [];
  const usedProviders = [];
  const { data: profile, error: profileError } = await supabase.from("profiles").select("steps_goal, active_minutes_goal, max_heart_rate, timezone").eq("id", userId).single();
  if (profileError || !profile) {
    throw new Error(`profil introuvable: ${profileError?.message ?? "aucune ligne"}`);
  }
  const { data: character } = await supabase.from("characters").select("class").eq("user_id", userId).maybeSingle();
  const characterClass = character?.class ?? "ranger";
  const goals = {
    stepsGoal: profile.steps_goal,
    activeMinutesGoal: profile.active_minutes_goal
  };
  const timeZone = profile.timezone || "UTC";
  const today = localDate(timeZone);
  const from = shiftDate(today, -(Math.max(1, days) - 1));
  const dates = dateRange(from, today);
  const offsetMinutes = timezoneOffsetMinutes(timeZone, /* @__PURE__ */ new Date());
  const { data: connections } = await supabase.from("health_connections").select("id, provider, health_tokens(access_token, refresh_token, expires_at)").eq("user_id", userId);
  const rows = connections ?? [];
  if (rows.length === 0) {
    return { userId, daysSynced: 0, providers: [], errors: ["aucun compte sant\xE9 connect\xE9"] };
  }
  const merged = /* @__PURE__ */ new Map();
  for (const date of dates) merged.set(date, emptyActivity(date));
  const sourceByDate = /* @__PURE__ */ new Map();
  for (const connection of rows) {
    try {
      const accessToken = await validAccessToken(supabase, connection);
      const fetched = connection.provider === "google_fit" ? await fetchActivity(
        accessToken,
        dates,
        offsetMinutes,
        profile.max_heart_rate
      ) : await fetchActivity2(accessToken, dates);
      for (const activity of fetched) {
        const current = merged.get(activity.date);
        if (!current) continue;
        if (activity.steps > current.steps) sourceByDate.set(activity.date, connection.provider);
        merged.set(activity.date, mergeActivity(current, activity));
      }
      usedProviders.push(connection.provider);
      await supabase.from("health_connections").update({ last_sync_at: (/* @__PURE__ */ new Date()).toISOString(), last_sync_error: null }).eq("id", connection.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "erreur inconnue";
      errors.push(`${connection.provider}: ${message}`);
      await supabase.from("health_connections").update({ last_sync_error: message }).eq("id", connection.id);
    }
  }
  if (usedProviders.length === 0) {
    return { userId, daysSynced: 0, providers: [], errors };
  }
  const { data: history } = await supabase.from("daily_activity").select("activity_date, participated").eq("user_id", userId).gte("activity_date", shiftDate(from, -STREAK_LOOKBACK_DAYS)).lt("activity_date", from);
  const participation = (history ?? []).map(
    (row) => ({ date: row.activity_date, participated: row.participated })
  );
  const payload = dates.map((date) => {
    const activity = merged.get(date);
    const streak = computeStreak(participation, shiftDate(date, -1));
    const contribution = computeContribution(activity, goals, characterClass, streak);
    participation.push({ date, participated: contribution.participated });
    return {
      user_id: userId,
      activity_date: date,
      steps: activity.steps,
      active_minutes: activity.activeMinutes,
      fat_burn_minutes: activity.fatBurnMinutes,
      cardio_minutes: activity.cardioMinutes,
      peak_minutes: activity.peakMinutes,
      calories: activity.calories,
      sleep_minutes: activity.sleepMinutes,
      resting_heart_rate: activity.restingHeartRate,
      xp_awarded: contribution.xp,
      damage_dealt: contribution.damage,
      march_points: contribution.marchPoints,
      participated: contribution.participated,
      special_attack: contribution.specialAttack,
      source_provider: sourceByDate.get(date) ?? usedProviders[0],
      synced_at: (/* @__PURE__ */ new Date()).toISOString()
    };
  });
  const { error: upsertError } = await supabase.from("daily_activity").upsert(payload, { onConflict: "user_id,activity_date" });
  if (upsertError) {
    throw new Error(`\xE9criture de l'activit\xE9 impossible: ${upsertError.message}`);
  }
  const { data: memberships } = await supabase.from("guild_members").select("guild_id").eq("user_id", userId);
  for (const membership of memberships ?? []) {
    try {
      await ensureWeeklyBoss(supabase, membership.guild_id, today);
      await resolveFinishedBattles(supabase, membership.guild_id, today);
    } catch (error) {
      errors.push(
        `boss (guilde ${membership.guild_id}): ${error instanceof Error ? error.message : "erreur inconnue"}`
      );
    }
  }
  return { userId, daysSynced: payload.length, providers: usedProviders, errors };
}

// supabase/functions/sync-health/index.ts
var DEFAULT_DAYS = 7;
var MAX_DAYS = 30;
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
  let days = DEFAULT_DAYS;
  try {
    const body = await req.json();
    if (typeof body.days === "number" && Number.isFinite(body.days)) {
      days = Math.min(MAX_DAYS, Math.max(1, Math.round(body.days)));
    }
  } catch {
  }
  try {
    const result = await syncUser(adminClient(), userId, days);
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur inconnue";
    console.error("sync-health:", message);
    return jsonResponse({ error: message }, 500);
  }
});
