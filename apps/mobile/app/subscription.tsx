import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useIAP, type Purchase } from "react-native-iap";
import { API_URL, getAccessToken } from "../src/lib/api-client";
import { useAuth } from "../src/lib/auth-context";
import { useTranslations } from "../src/lib/locale-context";
import { Button } from "../src/components/ui/Button";
import { ReferralBanner } from "../src/components/ReferralBanner";
import { formatShortDate } from "../src/lib/format";
import { radius, spacing, type Palette, useThemedStyles } from "../src/lib/theme";

type Tier = "STARTER" | "PRO";

const PRODUCT_ID_BY_TIER: Record<Tier, string> = {
  STARTER: "organizer_starter_monthly",
  PRO: "organizer_pro_monthly",
};

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

/**
 * §36/Phase 11 — Starter/Pro subscription via Google Play Billing. The web app sells the same two
 * tiers through WayForPay/Mono instead (see PlatformSubscriptionsService.activateFromWebPayment);
 * this screen is Android/Google-Play-only, matching how GooglePlayVerifier is the only server-side
 * verifier wired up so far.
 */
export default function SubscriptionScreen() {
  const { colors, styles } = useThemedStyles(makeStyles);
  const { isLoading: authLoading } = useAuth();
  const { t } = useTranslations();

  const [tiers, setTiers] = useState<TierInfo[] | null>(null);
  const [mySub, setMySub] = useState<MySubscription | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [purchasingTier, setPurchasingTier] = useState<Tier | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(false);

  const loadServerState = useCallback(async () => {
    const token = getAccessToken();
    const [tiersRes, mineRes, balanceRes] = await Promise.all([
      fetch(`${API_URL}/api/v1/platform-subscriptions/tiers`),
      token ? fetch(`${API_URL}/api/v1/platform-subscriptions/mine`, { headers: { Authorization: `Bearer ${token}` } }) : null,
      token ? fetch(`${API_URL}/api/v1/credits/balance`, { headers: { Authorization: `Bearer ${token}` } }) : null,
    ]);
    if (tiersRes.ok) setTiers((await tiersRes.json()) as TierInfo[]);
    if (mineRes?.ok) setMySub((await mineRes.json()) as MySubscription);
    if (balanceRes?.ok) setBalance((await balanceRes.json()).balance);
  }, []);

  const verifyOnServer = useCallback(async (purchase: Purchase): Promise<boolean> => {
    const token = getAccessToken();
    if (!token || !purchase.purchaseToken) return false;
    setVerifying(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/platform-subscriptions/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseToken: purchase.purchaseToken, productId: purchase.productId }),
      });
      if (res.ok) setMySub((await res.json()) as MySubscription);
      return res.ok;
    } catch {
      return false;
    } finally {
      setVerifying(false);
    }
  }, []);

  const { connected, subscriptions, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void verifyOnServer(purchase)
        .then((ok) => {
          if (!ok) setError(true);
        })
        .finally(() => {
          void finishTransaction({ purchase, isConsumable: false });
          setPurchasingTier(null);
        });
    },
    onPurchaseError: (err) => {
      setPurchasingTier(null);
      if (err.code !== "user-cancelled") setError(true);
    },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    void loadServerState();
  }, [authLoading, loadServerState]);

  useEffect(() => {
    if (!connected) return;
    void fetchProducts({ skus: Object.values(PRODUCT_ID_BY_TIER), type: "subs" }).catch(() => setError(true));
  }, [connected, fetchProducts]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadServerState();
    });
    return () => sub.remove();
  }, [loadServerState]);

  function subscribe(tier: Tier) {
    const productId = PRODUCT_ID_BY_TIER[tier];
    const product = subscriptions.find((p) => p.id === productId);
    const offerToken = product && "subscriptionOffers" in product ? product.subscriptionOffers?.[0]?.offerTokenAndroid : null;
    if (!offerToken) {
      setError(true);
      return;
    }
    setError(false);
    setPurchasingTier(tier);
    void requestPurchase({
      type: "subs",
      request: { google: { skus: [productId], subscriptionOffers: [{ sku: productId, offerToken }] } },
    }).catch(() => setPurchasingTier(null));
  }

  const busy = purchasingTier !== null || verifying;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t("pricing.subscriptionTitle"), headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.foreground }} />

      <Text style={styles.heroTitle}>{t("pricing.heroTitle")}</Text>
      <Text style={styles.heroSubtitle}>{t("pricing.subscriptionSubtitle")}</Text>
      <ReferralBanner />
      {balance !== null && (
        <Text style={styles.muted}>
          {t("credits.balance")}: <Text style={{ fontWeight: "800", color: colors.foreground }}>{balance}</Text>
        </Text>
      )}

      {error && <Text style={styles.error}>{t("credits.error")}</Text>}
      {!connected && <Text style={styles.muted}>{t("common.loading")}</Text>}

      {tiers === null && <ActivityIndicator color={colors.accentFrom} />}

      {tiers !== null && (
        <View style={styles.card}>
          {!mySub?.status && <Text style={styles.badgeFree}>{t("pricing.youAreHere")}</Text>}
          <Text style={styles.tierName}>{t("pricing.tierName.FREE")}</Text>
          <Text style={styles.muted}>{t("pricing.tierTagline.FREE")}</Text>
          <Text style={styles.price}>
            0 {t("pricing.perMonth")}
          </Text>
        </View>
      )}

      {tiers?.map((info) => {
        const isPro = info.tier === "PRO";
        const isMine = mySub?.tier === info.tier && !!mySub.status;
        return (
          <View key={info.tier} style={[styles.card, isPro && styles.cardPro]}>
            {isPro && <Text style={styles.badge}>{t("pricing.mostPopular")}</Text>}
            <Text style={styles.tierName}>{t(`pricing.tierName.${info.tier}`)}</Text>
            <Text style={styles.muted}>{t(`pricing.tierTagline.${info.tier}`)}</Text>

            <Text style={styles.price}>
              {info.price} {info.currency} {t("pricing.perMonth")}
            </Text>

            <View style={styles.features}>
              <FeatureRow icon="pricetag" text={`${info.monthlyCredits} ${t("pricing.feature.monthlyCredits")}`} colors={colors} />
              {isPro && (
                <>
                  <FeatureRow icon="people" text={t("pricing.feature.coOrganizers")} colors={colors} />
                  <FeatureRow icon="repeat" text={t("pricing.feature.recurring")} colors={colors} />
                  <FeatureRow icon="trending-up" text={t("pricing.feature.priority")} colors={colors} />
                  <FeatureRow icon="checkmark-circle" text={t("pricing.feature.badge")} colors={colors} />
                </>
              )}
            </View>

            {isMine && mySub?.expiresAt && (
              <Text style={styles.muted}>
                {t("pricing.currentPlanExpires")}: {formatShortDate(mySub.expiresAt)}
              </Text>
            )}

            <Button
              title={isMine ? t("pricing.renewEarly") : t("pricing.switchTo")}
              variant={isPro ? "primary" : "secondary"}
              loading={purchasingTier === info.tier}
              disabled={busy || !connected}
              onPress={() => subscribe(info.tier)}
            />
            {/* Unlike the web checkout (WayForPay/Mono, no recurring API integrated), a Google Play
                "subs" purchase genuinely auto-renews — Google handles it natively, and our backend
                just re-syncs status via subscription-recheck.scheduler.ts. Saying otherwise here
                would be flatly wrong, not just over-cautious. */}
            <Text style={styles.footnote}>{t("pricing.autoRenewingGooglePlay")}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function FeatureRow({ icon, text, colors }: { icon: keyof typeof Ionicons.glyphMap; text: string; colors: Palette }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
      <Ionicons name={icon} size={16} color={colors.accentFrom} />
      <Text style={{ color: colors.foreground, fontSize: 13, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  heroTitle: { color: colors.foreground, fontSize: 20, fontWeight: "800" },
  heroSubtitle: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  muted: { color: colors.muted, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  cardPro: { borderColor: colors.accentFrom, borderWidth: 2 },
  badge: { alignSelf: "flex-start", backgroundColor: colors.accentFrom, color: colors.white, fontSize: 11, fontWeight: "700", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  badgeFree: { alignSelf: "flex-start", backgroundColor: colors.surface, color: colors.foreground, fontSize: 11, fontWeight: "700", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  tierName: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  price: { color: colors.foreground, fontSize: 24, fontWeight: "800", marginTop: spacing.xs },
  features: { gap: spacing.xs, marginVertical: spacing.sm },
  footnote: { color: colors.muted, fontSize: 11, textAlign: "center" },
});
