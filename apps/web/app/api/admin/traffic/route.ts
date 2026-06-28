import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LINE_LIMIT = 30000;
const MAX_LINE_LIMIT = 80000;
const LOG_PATHS = [
  process.env.TRAFFIC_ACCESS_LOG || "/usr/local/apache/domlogs/repertorio.net.log",
  "/usr/local/apache/domlogs/app.repertorio.net.log",
].filter(Boolean);
const API_INTERNAL_BASE_URL = String(process.env.API_INTERNAL_BASE_URL || "").trim().replace(/\/$/, "");
const INTERNAL_API_KEY = String(process.env.INTERNAL_API_KEY || "").trim();

type TrafficCache = {
  expiresAt: number;
  payload: TrafficStatsResponse;
};

type TrafficStatsResponse = {
  ok: true;
  generatedAt: string;
  cachedUntil: string;
  source: {
    files: string[];
    lineLimit: number;
    parsedLines: number;
    windowStart: string | null;
    windowEnd: string | null;
  };
  totals: {
    requests: number;
    pageViews: number;
    uniqueVisitors: number;
    rawUniqueIps: number;
    botRequests: number;
    internalRequests: number;
    scannerRequests: number;
    suspiciousRequests: number;
    errorRequests: number;
    errorRate: number;
  };
  topPages: Array<{ path: string; views: number }>;
  statusCodes: Array<{ status: string; count: number }>;
  devices: Array<{ type: string; count: number }>;
  browsers: Array<{ name: string; count: number }>;
  referrers: Array<{ host: string; count: number }>;
  dailyTraffic: DailyTrafficRow[];
  userStats: UserTrafficStats | null;
};

type DailyTrafficRow = {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  requests: number;
  botRequests: number;
  internalRequests: number;
  scannerRequests: number;
  errorRequests: number;
};

type UserTrafficStats = {
  ok: true;
  generatedAt: string;
  window: {
    onlineMinutes: number;
    activeTodayHours: number;
    activeWeekDays: number;
  };
  totals: {
    knownUsers: number;
    onlineUsers: number;
    activeToday: number;
    activeWeek: number;
  };
  recentUsers: UserActivityRow[];
  frequentUsers: UserActivityRow[];
};

type UserActivityRow = {
  id: number;
  label: string;
  username: string | null;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSessionAt: string;
  sessionCount: number;
  activeMinutes: number;
  secondsAgo: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __repertorioTrafficCache: TrafficCache | undefined;
}

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function clampLineLimit(value: string | null): number {
  const n = Math.trunc(Number(value || DEFAULT_LINE_LIMIT));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LINE_LIMIT;
  return Math.min(MAX_LINE_LIMIT, Math.max(1000, n));
}

function parseNginxDate(value: string): Date | null {
  const m = value.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month === undefined) return null;

  const utc = Date.UTC(
    Number(m[3]),
    month,
    Number(m[1]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  const offsetMinutes = Number(m[8]) * 60 + Number(m[9]);
  const signedOffset = m[7] === "+" ? offsetMinutes : -offsetMinutes;
  return new Date(utc - signedOffset * 60 * 1000);
}

function stripQuery(path: string): string {
  const clean = String(path || "/").split("#")[0].split("?")[0] || "/";
  if (clean.length > 1) return clean.replace(/\/$/, "");
  return "/";
}

function isStaticOrApiPath(path: string): boolean {
  const p = stripQuery(path);
  return (
    p.startsWith("/_next/") ||
    p.startsWith("/api/") ||
    p.startsWith("/rooms-api/") ||
    p.startsWith("/uploads/") ||
    p.startsWith("/icons/") ||
    p.startsWith("/images/") ||
    p === "/favicon.ico" ||
    p === "/manifest.webmanifest" ||
    p === "/manifest.dev.webmanifest" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    /\.(?:css|js|map|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|mp3|pdf|xml|txt)$/i.test(p)
  );
}

function isBot(userAgent: string): boolean {
  return /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|python|curl|wget|headless|monitor|mj12|semrush|ahrefs|baidu|yandex|claudebot|gptbot|bytespider|petalbot|dotbot|siteaudit|scan|scrapy|go-http-client|java|okhttp|httpclient/i.test(
    userAgent || "",
  );
}

function isInternalRequestPath(path: string): boolean {
  const p = stripQuery(path);
  return (
    p.startsWith("/api/") ||
    p.startsWith("/rooms-api/") ||
    p.startsWith("/_next/") ||
    p === "/manifest.webmanifest" ||
    p === "/manifest.dev.webmanifest" ||
    p === "/favicon.ico" ||
    /\.(?:css|js|map|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|mp3|pdf|xml|txt)$/i.test(p)
  );
}

function isScannerPath(path: string): boolean {
  const p = stripQuery(path).toLowerCase();
  return (
    p.includes("wp-") ||
    p.includes("wordpress") ||
    p.includes("xmlrpc") ||
    p.includes("phpmyadmin") ||
    p.includes("administrator") ||
    p.includes("/.env") ||
    p.includes("/.git") ||
    p.includes("actuator") ||
    p.includes("cgi-bin") ||
    p.endsWith(".php") ||
    p.endsWith(".asp") ||
    p.endsWith(".aspx")
  );
}

function deviceType(userAgent: string): string {
  const ua = userAgent || "";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobile|android|iphone|ipod/i.test(ua)) return "Mobile";
  return "Desktop";
}

function browserName(userAgent: string): string {
  const ua = userAgent || "";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/bot|crawl|spider/i.test(ua)) return "Bot";
  return "Other";
}

function referrerHost(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return null;
  try {
    const host = new URL(raw).host.replace(/^www\./, "");
    if (!host || host.includes("repertorio.net")) return null;
    return host;
  } catch {
    return null;
  }
}

function increment(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function top(map: Map<string, number>, limit: number, label: string) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ [label]: key, count }));
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function ensureDailyBucket(
  map: Map<
    string,
    {
      pageViews: number;
      uniqueVisitors: Set<string>;
      requests: number;
      botRequests: number;
      internalRequests: number;
      scannerRequests: number;
      errorRequests: number;
    }
  >,
  key: string,
) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = {
      pageViews: 0,
      uniqueVisitors: new Set<string>(),
      requests: 0,
      botRequests: 0,
      internalRequests: 0,
      scannerRequests: 0,
      errorRequests: 0,
    };
    map.set(key, bucket);
  }
  return bucket;
}

function parseAccessLogs(logText: string, files: string[], lineLimit: number): TrafficStatsResponse {
  const linePattern =
    /^(\S+) \S+ \S+ \[([^\]]+)\] "([A-Z]+) ([^" ]+)(?: HTTP\/[^"]+)?" (\d{3}) (\S+) "([^"]*)" "([^"]*)"$/;

  const rawUniqueIps = new Set<string>();
  const visitorIps = new Set<string>();
  const topPagesMap = new Map<string, number>();
  const statusMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();
  const browserMap = new Map<string, number>();
  const referrerMap = new Map<string, number>();
  const dailyMap = new Map<
    string,
    {
      pageViews: number;
      uniqueVisitors: Set<string>;
      requests: number;
      botRequests: number;
      internalRequests: number;
      scannerRequests: number;
      errorRequests: number;
    }
  >();

  let requests = 0;
  let pageViews = 0;
  let botRequests = 0;
  let internalRequests = 0;
  let scannerRequests = 0;
  let errorRequests = 0;
  let parsedLines = 0;
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;

  for (const line of logText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(linePattern);
    if (!m) continue;

    parsedLines += 1;
    requests += 1;

    const ip = m[1];
    const date = parseNginxDate(m[2]);
    const method = m[3];
    const path = m[4];
    const status = m[5];
    const referrer = m[7];
    const userAgent = m[8];
    const bot = isBot(userAgent);
    const internalRequest = isInternalRequestPath(path);
    const scannerRequest = isScannerPath(path);

    if (date) {
      if (!windowStart || date < windowStart) windowStart = date;
      if (!windowEnd || date > windowEnd) windowEnd = date;
    }

    rawUniqueIps.add(ip);
    increment(statusMap, status);
    if (Number(status) >= 400) errorRequests += 1;
    if (bot) botRequests += 1;
    if (internalRequest) internalRequests += 1;
    if (scannerRequest) scannerRequests += 1;

    const dayBucket = date ? ensureDailyBucket(dailyMap, dayKey(date)) : null;
    if (dayBucket) {
      dayBucket.requests += 1;
      if (Number(status) >= 400) dayBucket.errorRequests += 1;
      if (bot) dayBucket.botRequests += 1;
      if (internalRequest) dayBucket.internalRequests += 1;
      if (scannerRequest) dayBucket.scannerRequests += 1;
    }

    const pagePath = stripQuery(path);
    const isPageView =
      !bot &&
      (method === "GET" || method === "HEAD") &&
      Number(status) >= 200 &&
      Number(status) < 400 &&
      !isStaticOrApiPath(pagePath);

    if (isPageView) {
      pageViews += 1;
      visitorIps.add(ip);
      increment(topPagesMap, pagePath);
      increment(deviceMap, deviceType(userAgent));
      increment(browserMap, browserName(userAgent));
      if (dayBucket) {
        dayBucket.pageViews += 1;
        dayBucket.uniqueVisitors.add(ip);
      }

      const host = referrerHost(referrer);
      if (host) increment(referrerMap, host);
    }
  }

  const now = new Date();
  return {
    ok: true,
    generatedAt: now.toISOString(),
    cachedUntil: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
    source: {
      files,
      lineLimit,
      parsedLines,
      windowStart: windowStart?.toISOString() ?? null,
      windowEnd: windowEnd?.toISOString() ?? null,
    },
    totals: {
      requests,
      pageViews,
      uniqueVisitors: visitorIps.size,
      rawUniqueIps: rawUniqueIps.size,
      botRequests,
      internalRequests,
      scannerRequests,
      suspiciousRequests: botRequests + scannerRequests,
      errorRequests,
      errorRate: requests ? Number(((errorRequests / requests) * 100).toFixed(2)) : 0,
    },
    topPages: [...topPagesMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([path, views]) => ({ path, views })),
    statusCodes: top(statusMap, 10, "status") as Array<{ status: string; count: number }>,
    devices: top(deviceMap, 6, "type") as Array<{ type: string; count: number }>,
    browsers: top(browserMap, 8, "name") as Array<{ name: string; count: number }>,
    referrers: top(referrerMap, 8, "host") as Array<{ host: string; count: number }>,
    dailyTraffic: [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30)
      .map(([date, bucket]) => ({
        date,
        pageViews: bucket.pageViews,
        uniqueVisitors: bucket.uniqueVisitors.size,
        requests: bucket.requests,
        botRequests: bucket.botRequests,
        internalRequests: bucket.internalRequests,
        scannerRequests: bucket.scannerRequests,
        errorRequests: bucket.errorRequests,
      })),
    userStats: null,
  };
}

async function readUserStats(): Promise<UserTrafficStats | null> {
  if (!API_INTERNAL_BASE_URL || !INTERNAL_API_KEY) return null;

  try {
    const res = await fetch(`${API_INTERNAL_BASE_URL}/presence/admin-stats`, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "x-internal-key": INTERNAL_API_KEY,
      },
    });

    if (!res.ok) return null;
    const json = (await res.json()) as UserTrafficStats;
    return json?.ok ? json : null;
  } catch {
    return null;
  }
}

async function readTail(file: string, lineLimit: number): Promise<string> {
  try {
    const result = await execFileAsync("tail", ["-n", String(lineLimit), file], {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 6000,
    });
    return result.stdout || "";
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const cached = globalThis.__repertorioTrafficCache;
  if (!force && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ ...cached.payload, cached: true });
  }

  const lineLimit = clampLineLimit(req.nextUrl.searchParams.get("lines"));
  const [chunks, userStats] = await Promise.all([
    Promise.all(LOG_PATHS.map((file) => readTail(file, lineLimit))),
    readUserStats(),
  ]);
  const payload = parseAccessLogs(chunks.join("\n"), LOG_PATHS, lineLimit);
  payload.userStats = userStats;

  globalThis.__repertorioTrafficCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  };

  return NextResponse.json({ ...payload, cached: false });
}
