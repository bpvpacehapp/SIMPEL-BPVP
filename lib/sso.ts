import crypto from "crypto";

export interface SsoTokenPayload {
  tokenId: string;
  userId: string;
  pegawaiId?: string;
  nik: string;
  nip: string;
  nama: string;
  email: string;
  role: string;
  unitKerja?: string;
  bagian?: string;
  subUnitKerja?: string;
  statusPegawai?: string;
  iat: number; // Unix timestamp (detik)
  exp: number; // Unix timestamp (detik), default iat + 3600
}

export function getServerSsoUrl(): string {
  return (
    process.env.SSO_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_SSO_URL ||
    "http://localhost:8081"
  ).replace(/\/+$/, "");
}

export function getAppId(): string {
  return process.env.NEXT_PUBLIC_APP_ID || "simpel";
}

/**
 * Memverifikasi sso_token format `{payloadBase64Url}.{signatureBase64Url}`
 * menggunakan HMAC-SHA256 + timingSafeEqual dan memeriksa masa berlaku (`exp`).
 */
export function verifySsoToken(tokenString: string): SsoTokenPayload | null {
  try {
    const secret = process.env.SSO_SECRET;
    if (!secret || !tokenString) {
      return null;
    }

    const parts = tokenString.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const [payloadBase64, signature] = parts;
    if (!payloadBase64 || !signature) {
      return null;
    }

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payloadBase64)
      .digest("base64url");

    const sigBuf = Buffer.from(signature, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");

    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }

    const decodedJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(decodedJson) as SsoTokenPayload;

    if (!payload || typeof payload.exp !== "number") {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSeconds) {
      return null;
    }

    return payload;
  } catch (error) {
    console.error("[SSO] Gagal memverifikasi token SSO:", error);
    return null;
  }
}

/**
 * Sinkronisasi sesi aktif / Sliding Session ke server Central SSO BPVP (non-blocking).
 */
export async function notifySsoSatelliteRefresh(params: {
  email: string;
  token: string;
  tokenExpiredAt: Date;
}): Promise<void> {
  const ssoUrl = getServerSsoUrl();
  const appId = getAppId();

  try {
    await fetch(`${ssoUrl}/api/satellite/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appId,
        email: params.email,
        token: params.token,
        tokenExpiredAt: params.tokenExpiredAt.toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.warn("[SSO] Gagal sinkronisasi satellite/refresh ke SSO:", error);
  }
}
