/**
 * App analytics → PostHog (what the admin traffic dashboard reads) and, optionally, Google Analytics 4.
 *
 * Deliberately plain HTTP, no native SDKs: PostHog's `/batch/` endpoint and GA4's Measurement Protocol are both just
 * POSTs, so this needs no new native module (and therefore no risk to the Play build). The trade-off is no automatic
 * app-lifecycle/crash/autocapture events — we send screens and the few named product events ourselves.
 *
 * Fully inert unless the EXPO_PUBLIC_* keys below are set at build time. Never throws, never blocks the UI.
 */
import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com").replace(/\/$/, "");
const GA_ID = process.env.EXPO_PUBLIC_GA_ID;
const GA_SECRET = process.env.EXPO_PUBLIC_GA_API_SECRET;

const ANON_ID_KEY = "kiro-analytics-anon-id";
const FLUSH_MS = 5000;
const MAX_BATCH = 20;

interface QueuedEvent {
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

/** A session ends after 30 min without activity (same rule as PostHog/GA), so "average session time" means real visits. */
const SESSION_GAP_MS = 30 * 60 * 1000;
/** Ignore absurd per-screen durations (phone left on a table with the app open). */
const MAX_SCREEN_SECONDS = 30 * 60;

let sessionId: string | null = null;
let lastActivity = 0;
let currentScreen: string | null = null;
let screenStartedAt: number | null = null;

let anonId: string | null = null;
let userId: string | null = null;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const enabled = Boolean(POSTHOG_KEY || (GA_ID && GA_SECRET));

async function getAnonId(): Promise<string> {
  if (anonId) return anonId;
  try {
    const stored = await SecureStore.getItemAsync(ANON_ID_KEY);
    if (stored) {
      anonId = stored;
      return stored;
    }
  } catch {
    // Fall through to a fresh id.
  }
  anonId = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  void SecureStore.setItemAsync(ANON_ID_KEY, anonId).catch(() => {});
  return anonId;
}

async function flush(): Promise<void> {
  timer = null;
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  const anon = await getAnonId();
  const distinctId = userId ?? anon;

  if (POSTHOG_KEY) {
    void fetch(`${POSTHOG_HOST}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        batch: batch.map((e) => ({
          event: e.event,
          distinct_id: distinctId,
          timestamp: e.timestamp,
          // Anonymous visitors stay personless (cheaper, and avoids a profile per device); identified users get a profile.
          properties: { ...e.properties, platform: Platform.OS, $lib: "kiro-mobile", $process_person_profile: userId !== null },
        })),
      }),
    }).catch(() => {});
  }

  if (GA_ID && GA_SECRET) {
    void fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA_ID}&api_secret=${GA_SECRET}`, {
      method: "POST",
      body: JSON.stringify({
        client_id: anon,
        ...(userId ? { user_id: userId } : {}),
        events: batch.slice(0, 25).map((e) => ({
          name: e.event === "$screen" ? "screen_view" : e.event,
          params: { engagement_time_msec: 1, platform: Platform.OS, ...(e.properties.$screen_name ? { screen_name: e.properties.$screen_name } : e.properties) },
        })),
      }),
    }).catch(() => {});
  }
}

/** Starts a new session when there's been no activity for 30 min; returns true if it did. */
function touchSession(): boolean {
  const now = Date.now();
  const isNew = !sessionId || now - lastActivity > SESSION_GAP_MS;
  if (isNew) sessionId = `s-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  lastActivity = now;
  return isNew;
}

function enqueue(event: string, properties: Record<string, unknown> = {}): void {
  if (!enabled) return;
  try {
    touchSession();
    queue.push({ event, properties: { ...properties, $session_id: sessionId }, timestamp: new Date().toISOString() });
    if (queue.length >= MAX_BATCH) void flush();
    else if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
  } catch {
    // Analytics must never affect the app.
  }
}

/** A screen was shown. `name` should be the route pattern (e.g. "/event/[slug]"), not a concrete URL, so pages group together. */
export function captureScreen(name: string): void {
  endScreen();
  currentScreen = name;
  screenStartedAt = Date.now();
  enqueue("$screen", { $screen_name: name });
}

/** Reports how long the previous screen was actually on display (app in the foreground), for the "time per page" report. */
function endScreen(): void {
  if (!currentScreen || screenStartedAt === null) return;
  const seconds = Math.min(MAX_SCREEN_SECONDS, Math.round((Date.now() - screenStartedAt) / 1000));
  screenStartedAt = null;
  if (seconds < 1) return;
  enqueue("screen_leave", { $screen_name: currentScreen, duration_seconds: seconds, engagement_time_msec: seconds * 1000 });
}

if (enabled) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      if (touchSession()) enqueue("app_open");
      if (currentScreen) screenStartedAt = Date.now();
    } else {
      endScreen();
      void flush();
    }
  });
}

/** A named product event (sign-up, registration, publish...). Never put emails or other personal data in `props`. */
export function captureEvent(name: string, props?: Record<string, unknown>): void {
  enqueue(name, props);
}

/** Tie future events to the signed-in user id (not email); `null` on logout goes back to the anonymous device id. */
export function identifyUser(id: string | null): void {
  if (!enabled || id === userId) return;
  userId = id;
  if (id && POSTHOG_KEY) {
    // Merge the anonymous device history into the user so one person isn't counted twice.
    void getAnonId().then((anon) =>
      fetch(`${POSTHOG_HOST}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: POSTHOG_KEY, event: "$identify", distinct_id: id, properties: { $anon_distinct_id: anon, platform: Platform.OS } }),
      }).catch(() => {}),
    );
  }
}
