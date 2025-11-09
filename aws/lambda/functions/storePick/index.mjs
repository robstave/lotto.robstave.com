// index.mjs
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

// ====== ENV ==================================================================
const BUCKET = process.env.BUCKET_NAME;
const PREFIX = process.env.PREFIX || "entries/";
const ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN || "*";

// Single S3 object that holds ALL entries as a JSON array
const DATA_KEY = `${PREFIX}entries.json`;
const MAX_ENTRIES = parseInt(process.env.MAX_ENTRIES || "1000", 10); // cap; 300–1000 fine

const s3 = new S3Client({});

// ====== LAMBDA HANDLER =======================================================
export const handler = async (event) => {
  try {
    const { method, route, routeLower } = getMethodAndRoute(event);

    if (method === "OPTIONS") return cors(204, "");

    const isEntries = routeLower === "/api/entries" || routeLower === "/entries";

    // POST /api/entries
    if (method === "POST" && isEntries) return await handlePost(event);

    // GET /api/entries?limit=10 (newest-first limited list)
    if (method === "GET" && isEntries) return await handleGetEntries(event);

    // GET /api/endpoints (return ALL items newest-first)
    if (method === "GET" && routeLower === "/api/endpoints") {
      return await handleListEndpoints(event);
    }

    // GET /api/entries/{id}  (fetch one by id)
    if (method === "GET" && routeLower.startsWith("/api/entries/")) {
      const idRaw = route.slice("/api/entries/".length); // preserve case & dashes
      return await handleGetEndpointByKey(event, idRaw);
    }

    // PUT /api/entries/{id}/played/{true|false}
    if (method === "PUT" && route.startsWith("/api/entries/")) {
      const playedIdx = route.lastIndexOf("/played/");
      if (playedIdx > 0) {
        const idEnc = route.slice("/api/entries/".length, playedIdx);
        const valueStr = route.slice(playedIdx + "/played/".length);
        if (valueStr === "true" || valueStr === "false") {
          return await handlePutPlayed(event, idEnc, valueStr);
        }
      }
    }

    console.log("Unmatched", {
      method,
      route,
      v: event.version,
      path: event.path || event.rawPath,
      resource: event.resource,
      stage: event.requestContext?.stage
    });
    return cors(404, { error: "Not found", route });
  } catch (err) {
    console.error(err);
    return cors(500, { error: "Server error" });
  }
};

// ====== ROUTING HELPERS ======================================================
function getMethodAndRoute(evt) {
  // HTTP API v2 (preferred)
  if (evt?.version === "2.0" && evt?.requestContext?.http) {
    const method = (evt.requestContext.http.method || "").toUpperCase();
    let path = evt.rawPath || ""; // preserve case; do not lowercase
    const stage = evt.requestContext.stage || "";
    if (stage && path.startsWith("/" + stage)) path = path.slice(stage.length + 1);
    const trimmed = path.replace(/\/+$/, "") || "/";
    return { method, route: trimmed, routeLower: trimmed.toLowerCase() };
  }
  // REST API v1
  const method = (evt.httpMethod || "").toUpperCase();
  let path = (evt.path || evt.resource || "") || "/";
  const stage = evt.requestContext?.stage || "";
  if (stage && path.startsWith("/" + stage)) path = path.slice(stage.length + 1);
  const trimmed = path.replace(/\/+$/, "") || "/";
  return { method, route: trimmed, routeLower: trimmed.toLowerCase() };
}

// ====== SINGLE-FILE STORAGE (S3) =============================================
// File shape: JSON array of entry objects:
// [{ id, game, picks, played, pickedAt, playedAt?, meta }, ...]

async function loadAllEntries() {
  try {
    const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: DATA_KEY }));
    const text = await streamToString(got.Body);
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    // If not found, treat as empty
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NoSuchKey") return [];
    throw e;
  }
}

async function saveAllEntries(entries) {
  // newest-first and capped
  const sorted = [...entries].sort((a, b) => new Date(b.pickedAt) - new Date(a.pickedAt));
  const trimmed = sorted.slice(0, MAX_ENTRIES);

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: DATA_KEY,
    Body: JSON.stringify(trimmed) + "\n",
    ContentType: "application/json",
  }));
  return trimmed;
}

// ====== ENDPOINTS ============================================================
// POST /api/entries
// Body: { game: "fantasy5"|"superlotto", picks:[...], pickedAt?: ISO, played?: boolean }
async function handlePost(event) {
  if (!BUCKET) return cors(500, { error: "Missing BUCKET_NAME env" });

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return cors(400, { error: "Invalid JSON" }); }

  const validation = validatePicks(body);
  if (!validation.ok) return cors(400, { error: validation.error });

  const pickedAt = body.pickedAt || new Date().toISOString();
  const id = randomUUID(); // stable key for lookups

  const entry = {
    id,
    game: body.game,
    picks: body.picks,
    played: body.played === true ? true : false,
    pickedAt,
    meta: {
      sourceIp: getIp(event),
      userAgent: event.headers?.["user-agent"] || event.headers?.["User-Agent"] || undefined,
    }
  };

  const all = await loadAllEntries();
  all.unshift(entry);
  await saveAllEntries(all);

  // Backwards compat: return key (now = id)
  return cors(201, { ok: true, key: id, pickedAt });
}

// GET /api/entries?limit=10&game=fantasy5  (newest-first limited; optional game filter)
// game may be "fantasy5" or "superlotto" (case-insensitive). If invalid/absent, no filtering.
async function handleGetEntries(event) {
  if (!BUCKET) return cors(500, { error: "Missing BUCKET_NAME env" });

  const qs = event.queryStringParameters || {};
  const limit = clamp(parseInt(qs.limit ?? "10", 10), 1, 100);
  const rawGame = (qs.game || qs.Game || "").trim().toLowerCase();
  const allowedGames = new Set(["fantasy5", "superlotto"]);
  const gameFilter = allowedGames.has(rawGame) ? rawGame : null;

  const all = await loadAllEntries(); // stored newest-first
  const filtered = gameFilter ? all.filter(e => (e.game || "").toLowerCase() === gameFilter) : all;
  const items = filtered.slice(0, limit).map(e => ({ ...e, key: e.id }));
  return cors(200, { items, count: items.length, gameFilter: gameFilter || null });
}

// GET /api/endpoints  (return ALL items newest-first)
async function handleListEndpoints(event) {
  if (!BUCKET) return cors(500, { error: "Missing BUCKET_NAME env" });

  const all = await loadAllEntries();
  const items = all.map(e => ({ ...e, key: e.id, Key: e.id }));
  return cors(200, { items, count: items.length });
}

// GET /api/entries/{id}
async function handleGetEndpointByKey(event, idRaw) {
  if (!BUCKET) return cors(500, { error: "Missing BUCKET_NAME env" });

  let id;
  try { id = decodeURIComponent(idRaw.replace(/\/+$/, "")); }
  catch { return cors(400, { error: "Invalid entry id" }); }

  const all = await loadAllEntries();
  const found = all.find(e => e.id === id);
  if (!found) return cors(404, { error: "Not found", Key: id });

  return cors(200, { item: { ...found, key: found.id, Key: found.id } });
}

// PUT /api/entries/{id}/played/{true|false}
async function handlePutPlayed(event, idEnc, valueStr) {
  if (!BUCKET) return cors(500, { error: "Missing BUCKET_NAME env" });

  const id = decodeURIComponent(idEnc);
  const value = String(valueStr).toLowerCase() === "true";

  const all = await loadAllEntries();
  const idx = all.findIndex(e => e.id === id);
  if (idx === -1) return cors(404, { error: "entry not found", key: id });

  const current = { ...all[idx] };
  current.played = value;
  if (value) current.playedAt = new Date().toISOString();
  else delete current.playedAt;

  all[idx] = current;
  await saveAllEntries(all);

  return cors(200, { ok: true, key: id, played: current.played, playedAt: current.playedAt });
}

// ====== HELPERS ==============================================================
function getIp(evt) {
  const xf = evt.headers?.["X-Forwarded-For"] || evt.headers?.["x-forwarded-for"];
  return xf?.split(",")[0]?.trim();
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, isNaN(n) ? lo : n)); }

function cors(statusCode, body) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOW_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Cache-Control": "no-store"
    },
    body: payload
  };
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of /** @type {Readable} */(stream)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

// ====== VALIDATION ===========================================================
function validatePicks(body) {
  console.log("validatePicks,", body);

  if (!body || !Array.isArray(body.picks)) {
    return { ok: false, error: "Missing 'picks' array" };
  }

  switch (body.game?.toLowerCase()) {
    case "fantasy5":
      return validateFantasy5(body);
    case "superlotto":
      return validateCaSuperlotto(body);
    default:
      return { ok: false, error: "Unsupported or missing game type" };
  }
}

function validateFantasy5(body) {
  const picks = body.picks;
  if (picks.length !== 5) {
    return { ok: false, error: "Exactly 5 picks required for Fantasy 5" };
  }
  const seen = new Set();
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (typeof p.Number !== "number") return { ok: false, error: `picks[${i}].Number must be a number` };
    if (p.Number < 1 || p.Number > 39) return { ok: false, error: "number out of range (1..39)" };
    if (seen.has(p.Number)) return { ok: false, error: "numbers must be unique" };
    if (p.IsSpecial) return { ok: false, error: "Fantasy 5 does not have special numbers" };
    seen.add(p.Number);
  }
  return { ok: true };
}

function validateCaSuperlotto(body) {
  const picks = body.picks;
  if (picks.length !== 6) {
    return { ok: false, error: "Exactly 6 picks required (5 numbers + 1 Mega)" };
  }
  let specialCount = 0;
  const seen = new Set();
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (typeof p.Number !== "number") return { ok: false, error: `picks[${i}].Number must be a number` };
    if (p.IsSpecial) {
      specialCount++;
      if (p.Number < 1 || p.Number > 27) return { ok: false, error: "Mega number out of range (1..27)" };
    } else {
      if (p.Number < 1 || p.Number > 47) return { ok: false, error: "regular number out of range (1..47)" };
      if (seen.has(p.Number)) return { ok: false, error: "regular numbers must be unique" };
      seen.add(p.Number);
    }
  }
  if (specialCount !== 1) return { ok: false, error: "Exactly one pick must have IsSpecial=true" };
  return { ok: true };
}
sav