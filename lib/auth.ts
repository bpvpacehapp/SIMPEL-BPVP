import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifySsoToken, notifySsoSatelliteRefresh } from "@/lib/sso";
import { getSinglePegawaiFromSimpeg } from "@/lib/simpeg";
import { catatLogAktivitas } from "@/lib/audit";

const SESSION_DURATION_SECONDS = 3600; // 1 jam
const APP_SLUG = process.env.NEXT_PUBLIC_APP_ID || "simpel";
const USE_SECURE_COOKIES =
  process.env.NODE_ENV === "production" &&
  (process.env.NEXTAUTH_URL?.startsWith("https://") ?? false);

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: SESSION_DURATION_SECONDS,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  cookies: {
    sessionToken: {
      name: `${APP_SLUG}.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: USE_SECURE_COOKIES,
      },
    },
    callbackUrl: {
      name: `${APP_SLUG}.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: USE_SECURE_COOKIES,
      },
    },
    csrfToken: {
      name: `${APP_SLUG}.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: USE_SECURE_COOKIES,
      },
    },
  },
  providers: [
    CredentialsProvider({
      id: "sso-kemnaker",
      name: "SSO BPVP Banda Aceh",
      credentials: {
        ssoToken: { label: "SSO Token", type: "text" },
      },
      async authorize(credentials) {
        const ssoToken = credentials?.ssoToken?.trim();
        if (!ssoToken) {
          throw new Error("Token SSO tidak ditemukan.");
        }

        const payload = verifySsoToken(ssoToken);
        if (!payload) {
          throw new Error(
            "Token SSO tidak valid atau sudah kedaluwarsa. Silakan login kembali melalui SSO."
          );
        }

        const emailLower = payload.email?.trim().toLowerCase();
        const nipClean = payload.nip?.trim();

        const orConditions: Array<{ email?: string; nip?: string }> = [];
        if (emailLower) orConditions.push({ email: emailLower });
        if (nipClean) orConditions.push({ nip: nipClean });

        if (orConditions.length === 0) {
          throw new Error("Payload token SSO tidak memiliki identitas email atau NIP.");
        }

        const existingUser = await prisma.user.findFirst({
          where: { OR: orConditions },
        });

        // Whitelist-only ala SIMPRA
        if (!existingUser) {
          throw new Error(
            "Akses Ditolak: Pegawai belum didaftarkan sebagai pengguna aplikasi ini. Hubungi Administrator."
          );
        }

        if (existingUser.deletedAt !== null) {
          throw new Error(
            "Akses Ditolak: Akun Anda saat ini dinonaktifkan oleh Administrator."
          );
        }

        // Auto-Sync Profil dari SIMPEG (Opsi B — graceful fallback jika SIMPEG tidak terjangkau)
        let syncedData: {
          nama?: string;
          nip?: string | null;
          jabatan?: string | null;
          unitKerja?: string | null;
          subUnitKerja?: string | null;
          fotoUrl?: string | null;
          pegawaiId?: string | null;
        } = {};

        try {
          const pegawai = await getSinglePegawaiFromSimpeg({
            pegawaiId: existingUser.pegawaiId || payload.pegawaiId || null,
            nip: existingUser.nip || nipClean || null,
            email: existingUser.email || emailLower || null,
          });

          if (pegawai) {
            syncedData = {
              nama: pegawai.nama || existingUser.nama,
              nip: pegawai.nip ?? existingUser.nip,
              jabatan: pegawai.jabatan ?? existingUser.jabatan,
              unitKerja: pegawai.unitKerja ?? existingUser.unitKerja,
              subUnitKerja:
                pegawai.subUnitKerja ?? pegawai.bagian ?? existingUser.subUnitKerja,
              fotoUrl: pegawai.fotoUrl ?? existingUser.fotoUrl,
              pegawaiId: pegawai.id ?? existingUser.pegawaiId,
            };
          }
        } catch (simpegErr) {
          console.warn(
            "[AUTH] Auto-sync SIMPEG gagal saat login, lanjut menggunakan profil lokal:",
            simpegErr
          );
        }

        const now = new Date();
        const tokenExpiredAt = new Date(
          now.getTime() + SESSION_DURATION_SECONDS * 1000
        );

        const updatedUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            ...syncedData,
            sessionToken: ssoToken,
            tokenExpiredAt,
            lastLoginAt: now,
          },
        });

        await catatLogAktivitas({
          userId: updatedUser.id,
          userName: updatedUser.nama,
          aksi: "LOGIN_SSO",
          modul: "AUTENTIKASI",
          detail: `Login berhasil via Central SSO BPVP (${updatedUser.email})`,
        });

        return {
          id: updatedUser.id,
          nama: updatedUser.nama,
          email: updatedUser.email,
          role: updatedUser.role,
          nip: updatedUser.nip,
          jabatan: updatedUser.jabatan,
          unitKerja: updatedUser.unitKerja,
          subUnitKerja: updatedUser.subUnitKerja,
          fotoUrl: updatedUser.fotoUrl,
          ssoToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        const expiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000;
        token.id = user.id;
        token.nama = user.nama;
        token.email = user.email;
        token.role = user.role;
        token.nip = user.nip;
        token.jabatan = user.jabatan;
        token.unitKerja = user.unitKerja;
        token.subUnitKerja = user.subUnitKerja;
        token.fotoUrl = user.fotoUrl;
        token.ssoToken = user.ssoToken;
        token.expiresAt = expiresAt;
        token.exp = Math.floor(expiresAt / 1000);

        if (user.email && user.ssoToken) {
          void notifySsoSatelliteRefresh({
            email: user.email,
            token: user.ssoToken,
            tokenExpiredAt: new Date(expiresAt),
          });
        }
      }

      // Sliding Session (perpanjang sesi +1 jam)
      if (trigger === "update" && token.id) {
        const newExpiresAt = Date.now() + SESSION_DURATION_SECONDS * 1000;
        const newExpiredDate = new Date(newExpiresAt);
        token.expiresAt = newExpiresAt;
        token.exp = Math.floor(newExpiresAt / 1000);

        try {
          const updated = await prisma.user.update({
            where: { id: token.id },
            data: { tokenExpiredAt: newExpiredDate },
            select: { email: true, sessionToken: true },
          });

          if (updated.email && (token.ssoToken || updated.sessionToken)) {
            void notifySsoSatelliteRefresh({
              email: updated.email,
              token: (token.ssoToken || updated.sessionToken) as string,
              tokenExpiredAt: newExpiredDate,
            });
          }
        } catch (error) {
          console.error("[AUTH] Gagal memperbarui sliding session di DB:", error);
        }
      }

      return token;
    },

    async session({ session, token }) {
      const nowSeconds = Math.floor(Date.now() / 1000);

      if (!token.id || (typeof token.exp === "number" && nowSeconds >= token.exp)) {
        return { expires: new Date(0).toISOString() } as unknown as typeof session;
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: token.id },
        select: {
          id: true,
          nama: true,
          email: true,
          nip: true,
          jabatan: true,
          unitKerja: true,
          subUnitKerja: true,
          fotoUrl: true,
          role: true,
          deletedAt: true,
          sessionToken: true,
          tokenExpiredAt: true,
        },
      });

      // Validasi Real-time untuk Single Logout, Soft Delete & Expiry
      if (
        !dbUser ||
        dbUser.deletedAt !== null ||
        dbUser.sessionToken === null ||
        (dbUser.tokenExpiredAt && dbUser.tokenExpiredAt.getTime() <= Date.now())
      ) {
        return { expires: new Date(0).toISOString() } as unknown as typeof session;
      }

      // Sinkronkan profil & role dinamis dari DB
      session.user = {
        id: dbUser.id,
        name: dbUser.nama,
        nama: dbUser.nama,
        email: dbUser.email,
        role: dbUser.role,
        nip: dbUser.nip,
        jabatan: dbUser.jabatan,
        unitKerja: dbUser.unitKerja,
        subUnitKerja: dbUser.subUnitKerja,
        fotoUrl: dbUser.fotoUrl,
      };

      // Gunakan waktu kadaluarsa paling ketat antara token JWT dan DB
      const dbExpiryMs = dbUser.tokenExpiredAt?.getTime();
      const tokenExpiryMs = token.expiresAt;
      session.expiresAt =
        dbExpiryMs && tokenExpiryMs
          ? Math.min(dbExpiryMs, tokenExpiryMs)
          : dbExpiryMs || tokenExpiryMs;

      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.id) {
        try {
          await prisma.user.update({
            where: { id: token.id },
            data: {
              sessionToken: null,
              tokenExpiredAt: new Date(0),
            },
          });

          await catatLogAktivitas({
            userId: token.id,
            userName: token.nama || null,
            aksi: "LOGOUT",
            modul: "AUTENTIKASI",
            detail: `Logout dari aplikasi (${token.email || token.id})`,
          });
        } catch (error) {
          console.error("[AUTH] Gagal membersihkan sessionToken saat signOut:", error);
        }
      }
    },
  },
};
