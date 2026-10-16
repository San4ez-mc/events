import { getAccessToken } from "@/lib/api-client";

export type WebPushOutcome = "ok" | "denied" | "unsupported" | "unconfigured" | "error";

export function webPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandaloneApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** iPhones only deliver web push to a site that was added to the Home Screen. */
export function needsInstallForPush(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !isStandaloneApp();
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function publicKey(): Promise<string | null> {
  const res = await fetch("/api/v1/notifications/web-push/public-key").catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { key: string | null }).key;
}

/** Subscribes this browser (asking for permission if needed) and registers it with the API as a WEB device. */
export async function enableWebPush(): Promise<WebPushOutcome> {
  if (!webPushSupported()) return "unsupported";
  const key = await publicKey();
  if (!key) return "unconfigured";
  try {
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") return "denied";
    return (await registerSubscription(key)) ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** For people who already allowed notifications: re-registers (a new sign-in, or a rotated subscription) without asking. */
export async function refreshWebPushRegistration(): Promise<void> {
  if (!webPushSupported() || Notification.permission !== "granted") return;
  const key = await publicKey();
  if (key) await registerSubscription(key).catch(() => false);
}

async function registerSubscription(key: string): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const res = await fetch("/api/v1/notifications/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pushToken: JSON.stringify(subscription.toJSON()), platform: "WEB" }),
  });
  return res.ok;
}
