/**
 * Android App Links verification (§ deep links). The release signing
 * certificate fingerprint(s) come from ANDROID_SHA256_CERTS (comma-separated,
 * from `eas credentials` / Play Console → App integrity). Empty until set.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_CERTS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  return Response.json(
    fingerprints.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: { namespace: "android_app", package_name: "space.fineko.kiro", sha256_cert_fingerprints: fingerprints },
          },
        ],
  );
}
