"use client";

/**
 * Website analytics: PostHog (visitors, pages, funnels — what the admin traffic dashboard reads) and Google Analytics 4.
 * Both are opt-in via env (NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_GA_ID) — with neither set this module does nothing.
 *
 * Consent: until a visitor accepts, PostHog runs in memory-only mode (no cookies/localStorage, nothing persisted) and
 * Google Analytics isn't even loaded. Accepting stores the choice and turns on persistence + GA.
 */
import type { PostHog } from "posthog-js";

export type ConsentChoice = "granted" | "denied";
const CONSENT_KEY = "kiro-analytics-consent";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const analyticsConfigured = Boolean(POSTHOG_KEY || GA_ID);

type Gtag = (...args: unknown[]) => void;

let posthog: PostHog | null = null;
let initPromise: Promise<void> | null = null;
let gaLoaded = false;

export function getStoredConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function loadGoogleAnalytics(): void {
  if (!GA_ID || gaLoaded) return;
  gaLoaded = true;
  const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() {
    // gtag.js requires the real `arguments` object, not a rest array.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  w.gtag("js", new Date());
  w.gtag("config", GA_ID, { send_page_view: false, anonymize_ip: true });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
}

export function storeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Private mode etc. — the choice just won't persist.
  }
  if (choice === "granted") {
    loadGoogleAnalytics();
    posthog?.set_config({ persistence: "localStorage+cookie" });
  } else {
    posthog?.set_config({ persistence: "memory" });
  }
}

function initPosthog(): Promise<void> {
  if (!POSTHOG_KEY) return Promise.resolve();
  if (!initPromise) {
    initPromise = import("posthog-js").then(({ default: ph }) => {
      ph.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: false, // we send $pageview ourselves on every client-side route change
        capture_pageleave: true, // sends $pageleave with $prev_pageview_duration = time spent on the page
        persistence: getStoredConsent() === "granted" ? "localStorage+cookie" : "memory",
        person_profiles: "identified_only",
      });
      ph.register({ platform: "web" });
      posthog = ph;
    });
  }
  return initPromise;
}

export async function startAnalytics(): Promise<void> {
  await initPosthog();
  if (getStoredConsent() === "granted") loadGoogleAnalytics();
}

export function capturePageview(url: string): void {
  posthog?.capture("$pageview", { $current_url: url });
  if (gaLoaded) (window as unknown as { gtag: Gtag }).gtag("event", "page_view", { page_location: url });
}

/** Named product events (sign-up, registration, publish...). Never include emails or other personal data in `props`. */
export function captureEvent(name: string, props?: Record<string, unknown>): void {
  posthog?.capture(name, props);
  if (gaLoaded) (window as unknown as { gtag: Gtag }).gtag("event", name, props);
}

export function identifyUser(userId: string | null): void {
  // Without consent PostHog runs memory-only and mints a new anonymous id on every page load — identifying then would
  // merge a fresh id into the person each time. Stay anonymous until the visitor accepts.
  if (!posthog || getStoredConsent() !== "granted") return;
  if (userId) posthog.identify(userId);
  else posthog.reset();
}
