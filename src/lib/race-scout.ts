import { createHash } from "node:crypto";
import type { NewRaceDiscovery } from "@/db/schema";

const TARGET_DEPARTMENTS = new Set(["03", "15", "43", "63"]);
const CLERMONT_CENTER = { latitude: "45.7772", longitude: "3.0870" };
const SOURCE_USER_AGENT = "FouleeAuvergnateBot/1.0 (+https://foulee-auvergnate.fr; public-event-discovery)";
const MAX_SOURCE_BYTES = 5_000_000;
const MAX_GEOCODES = 70;

export type SourceScanResult = {
  name: string;
  url: string;
  status: "success" | "unavailable" | "not-configured";
  scanned: number;
  matched: number;
  message?: string;
};

export type ScoutScanResult = {
  discoveries: NewRaceDiscovery[];
  sources: SourceScanResult[];
};

type JsonObject = Record<string, unknown>;
type RowDetails = { distanceText: string; rowText: string };
type ParsedSourceEvent = {
  raw: JsonObject;
  sourceName: string;
  sourceUrl: string;
  discipline: "trail" | "route";
  rowDetails?: RowDetails;
};

type GeoResult = {
  features?: Array<{ properties?: { depcode?: string; postcode?: string; city?: string; name?: string; type?: string } }>;
};

const publicCalendars = [
  {
    name: "Sas de Départ · calendrier trail",
    url: "https://sasdepart.fr/calendrier-trail/",
    discipline: "trail" as const,
  },
  {
    name: "Sas de Départ · calendrier route",
    url: "https://sasdepart.fr/calendrier-route/",
    discipline: "route" as const,
  },
];

const departmentNames: Record<string, string> = {
  "03": "Allier",
  "15": "Cantal",
  "43": "Haute-Loire",
  "63": "Puy-de-Dôme",
};

const monthNames: Record<string, number> = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function textOnly(value: string) {
  return decodeHtml(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function readCappedText(response: Response, limit = MAX_SOURCE_BYTES) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("La page source dépasse la taille maximale autorisée.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(joined);
}

function parseJsonLd(html: string) {
  const parsed: unknown[] = [];
  const scriptPattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    try {
      parsed.push(JSON.parse(match[1].trim()) as unknown);
    } catch {
      // Une balise de données mal formée ne doit pas faire échouer tout le scan.
    }
  }
  return parsed;
}

function collectEvents(value: unknown, output: JsonObject[], seen = new Set<object>()) {
  if (Array.isArray(value)) {
    for (const child of value) collectEvents(child, output, seen);
    return;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  const object = value as JsonObject;
  const type = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
  const hasEventType = type.some((item) => typeof item === "string" && /^(Event|SportsEvent|Race)$/i.test(item));

  if (hasEventType && typeof object.name === "string" && typeof object.startDate === "string") {
    output.push(object);
  }

  for (const child of Object.values(object)) collectEvents(child, output, seen);
}

function rowDetailsById(html: string) {
  const rows = new Map<string, RowDetails>();
  const rowPattern = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  for (const match of html.matchAll(rowPattern)) {
    const idMatch = match[1].match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (!idMatch) continue;
    const cells = [...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textOnly(cell[1]));
    if (cells.length === 0) continue;
    rows.set(idMatch[1], {
      distanceText: cells[1] ?? "",
      rowText: cells.slice(0, 3).join(" · ").slice(0, 520),
    });
  }
  return rows;
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const direct = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) {
    const date = new Date(`${direct[1]}-${direct[2]}-${direct[3]}T12:00:00Z`);
    if (date.getUTCFullYear() === Number(direct[1]) && date.getUTCMonth() + 1 === Number(direct[2]) && date.getUTCDate() === Number(direct[3])) {
      return `${direct[1]}-${direct[2]}-${direct[3]}`;
    }
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function eventLocation(event: JsonObject) {
  const rawLocation = event.location;
  if (typeof rawLocation === "string") {
    return { city: rawLocation, postalCode: "", region: "", country: "", fullText: rawLocation };
  }
  if (typeof rawLocation !== "object" || rawLocation === null) {
    return { city: "", postalCode: "", region: "", country: "", fullText: "" };
  }

  const location = rawLocation as JsonObject;
  const rawAddress = location.address;
  const address = typeof rawAddress === "object" && rawAddress !== null ? rawAddress as JsonObject : {};
  const city = typeof address.addressLocality === "string"
    ? address.addressLocality
    : typeof location.name === "string"
      ? location.name.split(/[,(—–]/, 1)[0].trim()
      : "";
  const postalCode = typeof address.postalCode === "string" ? address.postalCode : "";
  const region = typeof address.addressRegion === "string" ? address.addressRegion : "";
  const country = typeof address.addressCountry === "string" ? address.addressCountry : "";
  const fullText = [location.name, address.addressLocality, address.postalCode, address.addressRegion, address.addressCountry]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return { city: city.trim(), postalCode, region, country, fullText };
}

function departmentFromText(value: string) {
  const normalized = value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const postalCode = normalized.match(/\b(03|15|43|63)\d{3}\b/);
  if (postalCode) return postalCode[1];
  if (/\b(?:allier|bourbonnais)\b/.test(normalized)) return "03";
  if (/\b(?:cantal|aurillac|saint[- ]flour|mauriac)\b/.test(normalized)) return "15";
  if (/\b(?:haute[- ]loire|velay|le puy[- ]en[- ]velay)\b/.test(normalized)) return "43";
  if (/\b(?:puy[- ]de[- ]dome|puy de dome|livradois|clermont[- ]ferrand|sancy|chaine des puys)\b/.test(normalized)) return "63";
  const explicitCode = normalized.match(/(?:\(|\b)(03|15|43|63)(?:\)|\b)/);
  return explicitCode?.[1] ?? null;
}

function departmentFromPostalCode(postalCode: string) {
  const match = postalCode.match(/^(03|15|43|63)\d{3}$/);
  return match?.[1] ?? null;
}

function eventDistanceText(value: string) {
  const source = decodeHtml(value).replace(/\s+/g, " ").trim();
  if (!source) return [];
  const range = source.match(/\b\d+(?:[.,]\d+)?\s*[–-]\s*\d+(?:[.,]\d+)?\s*(?:km|kms|kilom[eè]tres?)\b/gi);
  const values = range?.length
    ? range
    : source.match(/\b(?:\d+(?:[.,]\d+)?\s*(?:km|kms|kilom[eè]tres?)|marathon|semi[- ]?marathon|ultra[- ]?trail)\b/gi);
  return [...new Set((values ?? []).map((item) => item.replace(/\s+/g, " ").trim()))].slice(0, 8);
}

function dateIsInWindow(date: string) {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 10);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 730);
  const timestamp = new Date(`${date}T12:00:00Z`).getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function safeEventUrl(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

async function readCalendarPage(source: typeof publicCalendars[number]) {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": SOURCE_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Réponse HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) throw new Error("La source ne renvoie pas une page HTML.");
  const html = await readCappedText(response);
  const events: JsonObject[] = [];
  for (const data of parseJsonLd(html)) collectEvents(data, events);
  const rows = rowDetailsById(html);
  const unique = new Map<string, ParsedSourceEvent>();

  for (const raw of events) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const raceDate = parseDate(raw.startDate);
    if (!name || !raceDate || !dateIsInWindow(raceDate)) continue;
    if (typeof raw.eventStatus === "string" && /cancelled|postponed/i.test(raw.eventStatus)) continue;

    const eventUrl = typeof raw.url === "string" ? raw.url : "";
    let details: RowDetails | undefined;
    try {
      const fragment = new URL(eventUrl).hash.slice(1);
      if (fragment) details = rows.get(fragment);
    } catch {
      // Une URL sans ancre reste tout de même une piste de découverte.
    }

    const fingerprintKey = `${name}|${raceDate}|${source.discipline}`.toLocaleLowerCase("fr-FR");
    unique.set(fingerprintKey, {
      raw,
      sourceName: source.name,
      sourceUrl: source.url,
      discipline: source.discipline,
      rowDetails: details,
    });
  }

  return { events: [...unique.values()], total: events.length };
}

async function geocodeDepartment(city: string) {
  if (!city || city.length > 100) return null;
  const url = new URL("https://data.geopf.fr/geocodage/search");
  url.searchParams.set("q", city);
  url.searchParams.set("type", "municipality");
  url.searchParams.set("limit", "10");
  url.searchParams.set("lat", CLERMONT_CENTER.latitude);
  url.searchParams.set("lon", CLERMONT_CENTER.longitude);
  url.searchParams.set("autocomplete", "0");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": SOURCE_USER_AGENT, Accept: "application/json" },
      cache: "force-cache",
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as GeoResult;
    const firstProperties = data.features?.[0]?.properties;
    if (!firstProperties) return null;
    const expectedName = city.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const returnedName = (firstProperties.name ?? firstProperties.city ?? "").toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    if (!returnedName || (!returnedName.includes(expectedName) && !expectedName.includes(returnedName))) return null;
    const department = firstProperties.depcode ?? departmentFromPostalCode(firstProperties.postcode ?? "");
    return department && TARGET_DEPARTMENTS.has(department) ? department : null;
  } catch {
    return null;
  }
}

async function withConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

function eventConfidence(input: {
  raceDate: string | null;
  city: string;
  department: string | null;
  eventUrl: string | null;
  distances: string[];
}) {
  let score = 42;
  if (input.raceDate) score += 22;
  if (input.city) score += 12;
  if (input.department) score += 12;
  if (input.eventUrl) score += 6;
  if (input.distances.length) score += 6;
  return Math.min(score, 96);
}

function stableFingerprint(name: string, date: string | null, city: string, department: string | null) {
  const normalized = [name, date ?? "", city, department ?? ""]
    .map((value) => value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim())
    .join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

function toDiscovery(event: ParsedSourceEvent, department: string): Omit<NewRaceDiscovery, "fingerprint"> | null {
  const rawName = typeof event.raw.name === "string" ? event.raw.name.trim() : "";
  const raceDate = parseDate(event.raw.startDate);
  if (!rawName || !raceDate) return null;

  const location = eventLocation(event.raw);
  const city = location.city || "Lieu à préciser";
  const distances = eventDistanceText(event.rowDetails?.distanceText ?? "");
  const descriptionValue = typeof event.raw.description === "string" ? textOnly(event.raw.description).slice(0, 400) : "";
  const eventUrl = safeEventUrl(event.raw.url, event.sourceUrl);
  const description = descriptionValue || `Repérée par la veille publique. Informations à confirmer auprès de l’organisateur.`;
  const excerpt = [event.rowDetails?.rowText, descriptionValue].filter(Boolean).join(" — ").slice(0, 500);

  return {
    name: rawName.slice(0, 160),
    type: event.discipline,
    raceDate,
    endDate: parseDate(event.raw.endDate),
    city: city.slice(0, 120),
    department,
    distances,
    description,
    sourceName: event.sourceName,
    sourceUrl: event.sourceUrl,
    eventUrl,
    excerpt,
    confidence: eventConfidence({ raceDate, city, department, eventUrl, distances }),
    status: "pending",
  };
}

function parseFrenchDateFromText(text: string) {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const numeric = text.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](20\d{2})\b/);
  if (numeric) {
    return `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  }

  const month = text.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const named = month.match(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(20\d{2})\b/);
  if (!named) return null;
  const monthNumber = monthNames[named[2]];
  if (!monthNumber) return null;
  return `${named[3]}-${String(monthNumber).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
}

function socialCandidateFromText(input: {
  text: string;
  sourceName: string;
  sourceUrl: string;
  permalink: string | null;
  fallbackType: "trail" | "route";
}) {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text || text.length < 25 || !/course|trail|foul[ée]es|running|dossard|inscriptions|marathon|semi[- ]?marathon/i.test(text)) return null;

  const raceDate = parseFrenchDateFromText(text);
  const normalized = text.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const department = departmentFromText(text);
  const hasAuvergneRegion = /auvergne|puy[- ]de[- ]dome|haute[- ]loire|cantal|allier|bourbonnais|velay/i.test(normalized);
  if (!department && !hasAuvergneRegion) return null;

  const lines = input.text.split(/\r?\n/).map((line) => line.replace(/^\s*[@#\W]+/, "").trim()).filter(Boolean);
  const title = lines.find((line) => /course|trail|foul[ée]es|running|marathon|semi/i.test(line) && line.length <= 120)
    ?? lines.find((line) => line.length >= 4 && line.length <= 100)
    ?? "Course annoncée sur les réseaux";
  const cityMatch = text.match(/(?:à|au départ de|départ à|rendez-vous à)\s+([A-ZÀ-Ÿ][\p{L}'’.-]+(?:[ -][\p{L}'’.-]+){0,4})/u);
  const city = cityMatch?.[1]?.trim() || "Lieu à préciser";
  const type = /trail|sentier|montagne|d\+|nature/i.test(text) ? "trail" : input.fallbackType;
  const distances = eventDistanceText(text).slice(0, 8);
  const confidence = eventConfidence({ raceDate, city: city === "Lieu à préciser" ? "" : city, department, eventUrl: input.permalink, distances });
  const description = "Piste repérée sur un compte social autorisé. Vérifie la date et le lieu dans la publication originale.";

  return {
    fingerprint: stableFingerprint(title, raceDate, city, department),
    name: title.slice(0, 160),
    type,
    raceDate,
    endDate: null,
    city,
    department,
    distances,
    description,
    sourceName: input.sourceName,
    sourceUrl: input.sourceUrl,
    eventUrl: input.permalink ?? input.sourceUrl,
    excerpt: text.slice(0, 500),
    confidence,
    status: "pending",
  } satisfies NewRaceDiscovery;
}

async function scanMetaSources() {
  const results: SourceScanResult[] = [];
  const candidates: NewRaceDiscovery[] = [];
  const token = process.env.META_ACCESS_TOKEN;
  const pageIds = (process.env.META_FACEBOOK_PAGE_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const instagramIds = (process.env.META_INSTAGRAM_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);

  if (!token || (pageIds.length === 0 && instagramIds.length === 0)) {
    results.push({
      name: "Facebook & Instagram · API Meta",
      url: "https://developers.facebook.com/docs/instagram-platform/overview/",
      status: "not-configured",
      scanned: 0,
      matched: 0,
      message: "Connecteurs à activer avec les autorisations Meta officielles.",
    });
    return { results, candidates };
  }

  const version = (process.env.META_GRAPH_API_VERSION ?? "v26.0").replace(/[^a-zA-Z0-9.]/g, "");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const sources: Array<{ id: string; platform: "facebook" | "instagram" }> = [
    ...pageIds.map((id) => ({ id, platform: "facebook" as const })),
    ...instagramIds.map((id) => ({ id, platform: "instagram" as const })),
  ];

  for (const source of sources) {
    const baseName = source.platform === "facebook" ? "Facebook · Page connectée" : "Instagram · compte professionnel";
    const sourceUrl = source.platform === "facebook" ? "https://www.facebook.com/" : "https://www.instagram.com/";
    const fields = source.platform === "facebook"
      ? "id,message,permalink_url,created_time"
      : "id,caption,permalink,timestamp,media_type";
    const endpoint = `https://graph.facebook.com/${version}/${encodeURIComponent(source.id)}/${source.platform === "facebook" ? "feed" : "media"}`;
    const url = new URL(endpoint);
    url.searchParams.set("fields", fields);
    url.searchParams.set("limit", "100");

    try {
      const response = await fetch(url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(9_000),
      });
      const data = await response.json() as { data?: Array<Record<string, unknown>>; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || `Réponse HTTP ${response.status}`);
      const posts = data.data ?? [];
      let matched = 0;
      for (const post of posts) {
        const text = typeof post.message === "string" ? post.message : typeof post.caption === "string" ? post.caption : "";
        const permalink = typeof post.permalink_url === "string" ? post.permalink_url : typeof post.permalink === "string" ? post.permalink : null;
        const candidate = socialCandidateFromText({ text, sourceName: baseName, sourceUrl, permalink, fallbackType: "trail" });
        if (candidate) {
          candidates.push(candidate);
          matched += 1;
        }
      }
      results.push({ name: baseName, url: sourceUrl, status: "success", scanned: posts.length, matched });
    } catch (error) {
      results.push({
        name: baseName,
        url: sourceUrl,
        status: "unavailable",
        scanned: 0,
        matched: 0,
        message: error instanceof Error ? error.message.slice(0, 180) : "La source Meta n’a pas répondu.",
      });
    }
  }

  return { results, candidates };
}

export async function scanPublicRaceSources(): Promise<ScoutScanResult> {
  const sources: SourceScanResult[] = [];
  const parsedEvents: ParsedSourceEvent[] = [];

  const calendarResults = await Promise.all(publicCalendars.map(async (source) => {
    try {
      const result = await readCalendarPage(source);
      return { source, result };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 180) : "La page source n’a pas répondu.";
      return { source, error: reason };
    }
  }));

  for (const item of calendarResults) {
    if ("error" in item) {
      sources.push({ name: item.source.name, url: item.source.url, status: "unavailable", scanned: 0, matched: 0, message: item.error });
      continue;
    }
    parsedEvents.push(...item.result.events);
    sources.push({ name: item.source.name, url: item.source.url, status: "success", scanned: item.result.total, matched: 0 });
  }

  const social = await scanMetaSources();
  sources.push(...social.results);

  const locationCache = new Map<string, Promise<string | null>>();
  let geocodeCount = 0;
  const discoveries = await withConcurrency(parsedEvents, 8, async (event) => {
    const location = eventLocation(event.raw);
    const directDepartment = departmentFromPostalCode(location.postalCode)
      ?? departmentFromText(`${location.fullText} ${location.region}`);
    let department = directDepartment;

    if (!department && /auvergne|ara/i.test(`${location.region} ${location.fullText}`) && location.city && geocodeCount < MAX_GEOCODES) {
      const key = location.city.toLocaleLowerCase("fr-FR");
      let lookup = locationCache.get(key);
      if (!lookup) {
        geocodeCount += 1;
        lookup = geocodeDepartment(location.city);
        locationCache.set(key, lookup);
      }
      department = await lookup;
    }

    if (!department || !TARGET_DEPARTMENTS.has(department)) return null;
    const candidate = toDiscovery(event, department);
    if (!candidate) return null;
    const fingerprint = stableFingerprint(candidate.name, candidate.raceDate ?? null, candidate.city ?? "", department);
    return { ...candidate, department, fingerprint } satisfies NewRaceDiscovery;
  });

  const unique = new Map<string, NewRaceDiscovery>();
  for (const discovery of discoveries) {
    if (discovery) unique.set(discovery.fingerprint, discovery);
  }
  for (const discovery of social.candidates) {
    unique.set(discovery.fingerprint, discovery);
  }

  for (const source of sources) {
    if (source.status === "success" && source.name.startsWith("Sas de Départ")) {
      source.matched = [...unique.values()].filter((candidate) => candidate.sourceName === source.name).length;
    }
  }
  for (const source of social.results) {
    if (source.status === "success") {
      source.matched = [...unique.values()].filter((candidate) => candidate.sourceName === source.name).length;
    }
  }

  return { discoveries: [...unique.values()], sources };
}
