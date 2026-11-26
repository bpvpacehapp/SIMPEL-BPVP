const APP_ID = process.env.NEXT_PUBLIC_APP_ID || "simpel";
const CONFIGURED_SSO_URL = (
  process.env.NEXT_PUBLIC_SSO_URL || "http://localhost:8081"
).replace(/\/+$/, "");

/**
 * Mengembalikan URL server SSO secara dinamis untuk lingkungan localhost, IP LAN, atau domain BPVP.
 * - Jika `NEXT_PUBLIC_SSO_URL` sudah diset eksplisit (misal https://sso.bpvpaceh.id atau http://172.16.12.48:8081),
 *   gunakan nilai tersebut.
 * - Jika aplikasi diakses lewat IP LAN berbeda sementara env masih mengarah ke localhost,
 *   otomatis menyesuaikan hostname ke host saat ini dengan port 8081.
 */
export function getClientSsoUrl(): string {
  if (typeof window === "undefined") {
    return CONFIGURED_SSO_URL;
  }

  try {
    const parsed = new URL(CONFIGURED_SSO_URL);
    const currentHost = window.location.hostname;
    const isConfiguredLocalhost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isCurrentLocalhost =
      currentHost === "localhost" || currentHost === "127.0.0.1";

    if (isConfiguredLocalhost && !isCurrentLocalhost) {
      if (currentHost.endsWith("bpvpaceh.id")) {
        return "https://sso.bpvpaceh.id";
      }
      return `${window.location.protocol}//${currentHost}:${parsed.port || "8081"}`;
    }

    return CONFIGURED_SSO_URL;
  } catch {
    return CONFIGURED_SSO_URL;
  }
}

export function getAppId(): string {
  return APP_ID;
}

/**
 * Membentuk URL redirect login ke Central SSO BPVP sesuai kontrak protokol:
 * {SSO_URL}?service={APP_ID}&callbackUrl={...}&redirect={...}&app={APP_ID}
 */
export function buildSsoLoginUrl(origin?: string): string {
  const ssoUrl = getClientSsoUrl();
  const baseOrigin =
    origin || (typeof window !== "undefined" ? window.location.origin : "");
  const callback = `${baseOrigin}/auth/sso-callback`;
  const encodedCallback = encodeURIComponent(callback);

  return `${ssoUrl}?service=${encodeURIComponent(APP_ID)}&callbackUrl=${encodedCallback}&redirect=${encodedCallback}&app=${encodeURIComponent(APP_ID)}`;
}
