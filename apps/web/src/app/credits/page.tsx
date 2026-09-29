"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CreateOrderResult, CreditPackage, PlatformPaymentOrder } from "@/lib/payment-types";
import { Button } from "@/components/ui/button";

const CREDIT_PROVIDERS = ["WAYFORPAY", "MONO", "MANUAL_IBAN"] as const;
const SUBSCRIPTION_PROVIDERS = ["WAYFORPAY", "MONO"] as const;
const TIER_ORDER = ["STARTER", "PRO"] as const;
type Tier = (typeof TIER_ORDER)[number];

interface TierInfo {
  tier: Tier;
  price: number;
  monthlyCredits: number;
  currency: string;
}

interface MySubscription {
  tier: Tier | null;
  status: "ACTIVE" | "GRACE_PERIOD" | null;
  expiresAt: string | null;
  autoRenewing: boolean;
}

/** §50/§51/Phase 11 — the public pricing page: subscription tiers (Starter/Pro, via WayForPay/Mono) and one-off credit packages. */
export default function CreditsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();
  const router = useRouter();

  const [tiers, setTiers] = useState<TierInfo[] | null>(null);
  const [mySub, setMySub] = useState<MySubscription | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [orders, setOrders] = useState<PlatformPaymentOrder[] | null>(null);
  const [buyingKey, setBuyingKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    const authed = (path: string) => (token ? fetch(path, { headers: { Authorization: `Bearer ${token}` } }) : null);
    const [tiersRes, packagesRes, subRes, balanceRes, ordersRes] = await Promise.all([
      fetch("/api/v1/platform-subscriptions/tiers"),
      fetch("/api/v1/credits/packages"),
      authed("/api/v1/platform-subscriptions/mine"),
      authed("/api/v1/credits/balance"),
      authed("/api/v1/payments/orders/mine"),
    ]);
    if (tiersRes.ok) setTiers(await tiersRes.json());
    if (packagesRes.ok) setPackages(await packagesRes.json());
    if (subRes?.ok) setMySub(await subRes.json());
    if (balanceRes?.ok) setBalance((await balanceRes.json()).balance);
    if (ordersRes?.ok) setOrders(await ordersRes.json());
  }, []);

  useEffect(() => {
    if (authLoading) return;
    queueMicrotask(() => void load());
  }, [authLoading, load]);

  async function startOrder(key: string, body: Record<string, string>) {
    const token = getAccessToken();
    if (!token) {
      router.push("/login?next=/credits");
      return;
    }
    setBuyingKey(key);
    setError(false);
    setInstructions(null);
    try {
      const res = await fetch("/api/v1/payments/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const result = (await res.json()) as CreateOrderResult;
      if (result.checkout.redirectUrl) {
        window.location.href = result.checkout.redirectUrl;
        return;
      }
      if (result.checkout.instructions) {
        setInstructions(result.checkout.instructions);
      }
      await load();
    } finally {
      setBuyingKey(null);
    }
  }

  function featuresFor(tier: Tier, monthlyCredits: number): string[] {
    const features = [`${monthlyCredits} ${t("pricing.feature.monthlyCredits")}`];
    if (tier === "PRO") {
      features.push(
        t("pricing.feature.coOrganizers"),
        t("pricing.feature.recurring"),
        t("pricing.feature.priority"),
        t("pricing.feature.badge"),
      );
    }
    return features;
  }

  if (authLoading) return null;

  const hasActiveSub = mySub?.tier && mySub.status;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-10 text-center">
        <h1 className="mb-2 text-3xl font-bold">{t("pricing.heroTitle")}</h1>
        <p className="mx-auto max-w-xl text-sm text-muted">{t("pricing.heroSubtitle")}</p>
      </div>

      {error && <p className="mb-4 text-center text-sm text-danger">{t("credits.error")}</p>}
      {instructions && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <p className="mb-1 text-sm font-semibold">{t("credits.instructionsTitle")}</p>
          <p className="text-sm text-muted">{instructions}</p>
        </div>
      )}

      <section className="mb-14">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold">{t("pricing.subscriptionTitle")}</h2>
          <p className="text-sm text-muted">{t("pricing.subscriptionSubtitle")}</p>
        </div>

        {tiers === null && <p className="text-center text-muted">{t("common.loading")}</p>}

        {tiers !== null && (
          <div className="grid gap-5 sm:grid-cols-2">
            {TIER_ORDER.map((tier) => {
              const info = tiers.find((x) => x.tier === tier);
              if (!info) return null;
              const isPro = tier === "PRO";
              const isMine = hasActiveSub && mySub!.tier === tier;
              return (
                <div
                  key={tier}
                  className={`relative flex flex-col rounded-2xl border p-6 ${isPro ? "border-accent shadow-lg" : "border-border"}`}
                >
                  {isPro && (
                    <span className="absolute -top-3 left-6 rounded-full accent-gradient px-3 py-1 text-xs font-semibold text-white">
                      {t("pricing.mostPopular")}
                    </span>
                  )}
                  {isMine && (
                    <span className="absolute -top-3 right-6 rounded-full bg-surface px-3 py-1 text-xs font-semibold">
                      {t("pricing.currentPlanBadge")}
                    </span>
                  )}

                  <h3 className="text-lg font-bold">{t(`pricing.tierName.${tier}`)}</h3>
                  <p className="mb-4 text-xs text-muted">{t(`pricing.tierTagline.${tier}`)}</p>

                  <p className="mb-5">
                    <span className="text-3xl font-extrabold">{info.price}</span>{" "}
                    <span className="text-sm text-muted">
                      {info.currency} {t("pricing.perMonth")}
                    </span>
                  </p>

                  <ul className="mb-6 flex flex-1 flex-col gap-2 text-sm">
                    {featuresFor(tier, info.monthlyCredits).map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isMine && mySub!.expiresAt && (
                    <p className="mb-3 text-xs text-muted">
                      {t("pricing.currentPlanExpires")}: {new Date(mySub!.expiresAt).toLocaleDateString(locale === "uk" ? "uk-UA" : "en-US")}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!user ? (
                      <Button variant={isPro ? "primary" : "secondary"} className="w-full" onClick={() => router.push("/login?next=/credits")}>
                        {t("pricing.signInToSubscribe")}
                      </Button>
                    ) : (
                      SUBSCRIPTION_PROVIDERS.map((provider) => (
                        <Button
                          key={provider}
                          variant={isPro ? "primary" : "secondary"}
                          className="!min-h-0 flex-1 px-3 py-2 text-xs"
                          loading={buyingKey === `sub:${tier}:${provider}`}
                          onClick={() => void startOrder(`sub:${tier}:${provider}`, { subscriptionTier: tier, provider })}
                        >
                          {isMine ? t("pricing.renewEarly") : t("pricing.switchTo")} · {t(`pricing.subscribeWith.${provider}`)}
                        </Button>
                      ))
                    )}
                  </div>
                  <p className="mt-3 text-center text-[11px] text-muted">{t("pricing.notAutoRenewing")}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold">{t("pricing.creditsSectionTitle")}</h2>
          <p className="text-sm text-muted">{t("pricing.creditsSectionSubtitle")}</p>
        </div>

        {balance !== null && (
          <p className="mb-4 text-center text-sm text-muted">
            {t("credits.balance")}: <strong className="text-foreground">{balance}</strong>
          </p>
        )}

        {packages === null && <p className="text-center text-muted">{t("common.loading")}</p>}

        {packages !== null && (
          <div className="mb-10 flex flex-col gap-3">
            {packages.map((pkg) => (
              <div key={pkg.id} className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{pkg.name}</p>
                    <p className="text-xs text-muted">
                      {pkg.credits} {t("credits.creditsUnit")}
                    </p>
                  </div>
                  <p className="text-lg font-bold">
                    {pkg.price} {pkg.currency}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user ? (
                    CREDIT_PROVIDERS.map((provider) => (
                      <Button
                        key={provider}
                        variant="secondary"
                        className="!min-h-0 px-3 py-1.5 text-xs"
                        loading={buyingKey === `pkg:${pkg.id}:${provider}`}
                        onClick={() => void startOrder(`pkg:${pkg.id}:${provider}`, { packageId: pkg.id, provider })}
                      >
                        {t(`credits.payWith.${provider}`)}
                      </Button>
                    ))
                  ) : (
                    <Button variant="secondary" className="!min-h-0 px-3 py-1.5 text-xs" onClick={() => router.push("/login?next=/credits")}>
                      {t("credits.signInToBuy")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {user && (
        <>
          <h2 className="mb-3 text-sm font-semibold">{t("credits.history")}</h2>
          {orders !== null && orders.length === 0 && <p className="text-sm text-muted">{t("credits.historyEmpty")}</p>}
          {orders !== null && orders.length > 0 && (
            <ul className="flex flex-col gap-2">
              {orders.map((order) => (
                <li key={order.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p>{order.package?.name ?? `${t(`pricing.tierName.${order.subscriptionTier}`)} — ${t("pricing.subscriptionTitle")}`}</p>
                    <p className="text-xs text-muted">
                      {new Date(order.createdAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>
                      {order.amount} {order.currency}
                    </p>
                    <p className="text-xs text-muted">{t(`credits.status.${order.status}`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
