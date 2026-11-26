"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { clearLogoutSignal } from "@/lib/auth-sync";

function SsoCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ssoToken = searchParams.get("sso_token");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    async function processSso() {
      if (!ssoToken) {
        setErrorMessage(
          "Token SSO tidak ditemukan pada URL callback. Silakan ulangi proses login."
        );
        return;
      }

      clearLogoutSignal();

      const result = await signIn("sso-kemnaker", {
        ssoToken,
        redirect: false,
      });

      if (!result || result.error) {
        setErrorMessage(
          result?.error ||
            "Gagal memverifikasi autentikasi SSO. Silakan coba lagi atau hubungi Administrator."
        );
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    }

    void processSso();
  }, [ssoToken, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-slate-200 text-center space-y-5">
        {!errorMessage ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-slate-900">
                Memverifikasi Sesi SSO
              </h1>
              <p className="text-xs text-slate-500">
                Mohon tunggu, sistem sedang memvalidasi token SSO dan
                menyelaraskan profil pegawai Anda...
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-slate-900">
                Akses Tidak Diizinkan
              </h1>
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Halaman Login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function SsoCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 text-sm">
          Memproses callback SSO...
        </main>
      }
    >
      <SsoCallbackContent />
    </Suspense>
  );
}
