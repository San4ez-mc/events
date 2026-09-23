"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "@/lib/locale-context";
import { getAccessToken } from "@/lib/api-client";
import type { PlatformPaymentOrder } from "@/lib/payment-types";
import { Button } from "@/components/ui/button";

interface AdminOrder extends PlatformPaymentOrder {
  user: { id: string; name: string | null; nickname: string | null; email: string };
}

export default function AdminPaymentsPage() {
  const { t, locale } = useTranslations();
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const res = await fetch("/api/v1/admin/payments", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setOrders(await res.json());
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  async function confirm(orderId: string) {
    const token = getAccessToken();
    if (!token) return;
    setBusyId(orderId);
    try {
      await fetch(`/api/v1/payments/orders/${orderId}/confirm-manual`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">{t("admin.payments.title")}</h1>

      {orders === null && <p className="text-muted">{t("common.loading")}</p>}

      {orders !== null && (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{order.user.name ?? order.user.nickname ?? order.user.email}</p>
                <p className="text-xs text-muted">
                  {order.package.name} · {order.provider} ·{" "}
                  {new Date(order.createdAt).toLocaleString(locale === "uk" ? "uk-UA" : "en-US")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted">
                  {order.amount} {order.currency} · {order.status}
                </span>
                {order.provider === "MANUAL_IBAN" && order.status === "PENDING" && (
                  <Button className="!min-h-0 px-3 py-1.5 text-xs" loading={busyId === order.id} onClick={() => void confirm(order.id)}>
                    {t("admin.payments.confirmManual")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
