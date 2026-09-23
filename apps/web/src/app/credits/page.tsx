"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { CreateOrderResult, CreditPackage, PlatformPaymentOrder } from "@/lib/payment-types";
import { Button } from "@/components/ui/button";

const PROVIDERS = ["WAYFORPAY", "MONO", "MANUAL_IBAN"] as const;

/** §50/§51 — buy listing-credit packages through WayForPay, Mono, or a manual bank transfer. */
export default function CreditsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, locale } = useTranslations();
  const router = useRouter();

  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [orders, setOrders] = useState<PlatformPaymentOrder[] | null>(null);
  const [buyingKey, setBuyingKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const [balanceRes, packagesRes, ordersRes] = await Promise.all([
      fetch("/api/v1/credits/balance", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/v1/credits/packages"),
      fetch("/api/v1/payments/orders/mine", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (balanceRes.ok) setBalance((await balanceRes.json()).balance);
    if (packagesRes.ok) setPackages(await packagesRes.json());
    if (ordersRes.ok) setOrders(await ordersRes.json());
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?next=/credits");
      return;
    }
    queueMicrotask(() => void load());
  }, [authLoading, user, router, load]);

  async function buy(packageId: string, provider: (typeof PROVIDERS)[number]) {
    const token = getAccessToken();
    if (!token) return;
    const key = `${packageId}:${provider}`;
    setBuyingKey(key);
    setError(false);
    setInstructions(null);
    try {
      const res = await fetch("/api/v1/payments/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, provider }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as CreateOrderResult;
      if (body.checkout.redirectUrl) {
        window.location.href = body.checkout.redirectUrl;
        return;
      }
      if (body.checkout.instructions) {
        setInstructions(body.checkout.instructions);
      }
      await load();
    } finally {
      setBuyingKey(null);
    }
  }

  if (authLoading || (!user && !error)) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold">{t("credits.title")}</h1>
      {balance !== null && (
        <p className="mb-6 text-sm text-muted">
          {t("credits.balance")}: <strong className="text-foreground">{balance}</strong>
        </p>
      )}

      {error && <p className="mb-4 text-sm text-danger">{t("credits.error")}</p>}
      {instructions && (
        <div className="mb-6 rounded-lg border border-border p-4">
          <p className="mb-1 text-sm font-semibold">{t("credits.instructionsTitle")}</p>
          <p className="text-sm text-muted">{instructions}</p>
        </div>
      )}

      {packages === null && <p className="text-muted">{t("common.loading")}</p>}

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
                {PROVIDERS.map((provider) => (
                  <Button
                    key={provider}
                    variant="secondary"
                    className="!min-h-0 px-3 py-1.5 text-xs"
                    loading={buyingKey === `${pkg.id}:${provider}`}
                    onClick={() => void buy(pkg.id, provider)}
                  >
                    {t(`credits.payWith.${provider}`)}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold">{t("credits.history")}</h2>
      {orders !== null && orders.length === 0 && <p className="text-sm text-muted">{t("credits.historyEmpty")}</p>}
      {orders !== null && orders.length > 0 && (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <div>
                <p>{order.package.name}</p>
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
    </div>
  );
}
