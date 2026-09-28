import { useCallback, useEffect, useState } from "react";
import { AppState, ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack } from "expo-router";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useAuth } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { formatCurrency, formatShortDateTime } from "../src/lib/format";
import { colors, radius, spacing } from "../src/lib/theme";

const PROVIDERS = ["WAYFORPAY", "MONO", "MANUAL_IBAN"] as const;
type Provider = (typeof PROVIDERS)[number];

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: string;
  currency: string;
}
interface Order {
  id: string;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
  package: { name: string };
}
interface CreateOrderResult {
  checkout: { redirectUrl?: string; instructions?: string };
}

/**
 * §50/§51 — buy listing-credit packages (same flow as the web /credits page): pick a package + provider, the
 * provider's hosted payment page opens in the browser, and its webhook credits the account. The balance is
 * re-fetched whenever the app comes back to the foreground, which is when the payment has usually just finished.
 */
export default function CreditsScreen() {
  const { isLoading: authLoading } = useAuth();
  const { t } = useTranslations();

  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [buyingKey, setBuyingKey] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [instructions, setInstructions] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [b, p, o] = await Promise.all([
      fetch(`${API_URL}/api/v1/credits/balance`, { headers }),
      fetch(`${API_URL}/api/v1/credits/packages`),
      fetch(`${API_URL}/api/v1/payments/orders/mine`, { headers }),
    ]);
    if (b.ok) setBalance(((await b.json()) as { balance: number }).balance);
    if (p.ok) setPackages((await p.json()) as CreditPackage[]);
    if (o.ok) setOrders((await o.json()) as Order[]);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    void load();
  }, [authLoading, load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => sub.remove();
  }, [load]);

  async function buy(packageId: string, provider: Provider) {
    const token = getAccessToken();
    if (!token) return;
    setBuyingKey(`${packageId}:${provider}`);
    setError(false);
    setInstructions(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/payments/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, provider }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const { checkout } = (await res.json()) as CreateOrderResult;
      if (checkout.redirectUrl) {
        await Linking.openURL(checkout.redirectUrl);
        return;
      }
      if (checkout.instructions) setInstructions(checkout.instructions);
      await load();
    } catch {
      setError(true);
    } finally {
      setBuyingKey(null);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t("credits.title"), headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.foreground }} />

      {balance !== null && (
        <Text style={styles.balance}>
          {t("credits.balance")}: <Text style={styles.balanceValue}>{balance}</Text>
        </Text>
      )}
      {error && <Text style={styles.error}>{t("credits.error")}</Text>}
      {instructions && (
        <View style={styles.card}>
          <Text style={styles.name}>{t("credits.instructionsTitle")}</Text>
          <Text style={styles.muted}>{instructions}</Text>
        </View>
      )}

      {packages === null && <ActivityIndicator color={colors.accentFrom} />}
      {packages?.map((pkg) => (
        <View key={pkg.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{pkg.name}</Text>
              <Text style={styles.muted}>
                {pkg.credits} {t("credits.creditsUnit")}
              </Text>
            </View>
            <Text style={styles.price}>
              {pkg.price} {formatCurrency(pkg.currency)}
            </Text>
          </View>
          <View style={styles.providers}>
            {PROVIDERS.map((provider) => (
              <Button
                key={provider}
                title={t(`credits.payWith.${provider}`)}
                variant="secondary"
                loading={buyingKey === `${pkg.id}:${provider}`}
                disabled={buyingKey !== null}
                onPress={() => void buy(pkg.id, provider)}
                style={styles.provider}
              />
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.section}>{t("credits.history")}</Text>
      {orders !== null && orders.length === 0 && <Text style={styles.muted}>{t("credits.historyEmpty")}</Text>}
      {orders?.map((order) => (
        <View key={order.id} style={styles.orderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderName}>{order.package.name}</Text>
            <Text style={styles.muted}>{formatShortDateTime(order.createdAt)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.orderName}>
              {order.amount} {formatCurrency(order.currency)}
            </Text>
            <Text style={styles.muted}>{t(`credits.status.${order.status}`)}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  balance: { color: colors.muted, fontSize: 14 },
  balanceValue: { color: colors.foreground, fontWeight: "800", fontSize: 16 },
  error: { color: colors.danger, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  name: { color: colors.foreground, fontSize: 16, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  price: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  providers: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  provider: { flexGrow: 1, minHeight: 40 },
  section: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: spacing.md },
  orderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  orderName: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
});
