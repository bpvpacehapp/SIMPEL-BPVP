"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, LogIn, AlertTriangle, Clock, Info } from "lucide-react";
import { buildSsoLoginUrl } from "@/lib/sso-client";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "SIMPEL BPVP";

function LoginContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const errorParam = searchParams.get("error");

  const banner = useMemo(() => {
    if (reason === "expired") {
      return {
        tone: "amber" as const,
        icon: Clock,
        title: "Sesi Anda Telah Berakhir",
        message:
          "Masa aktif sesi (1 jam) telah habis karena tidak ada aktivitas. Silakan masuk kembali melalui Central SSO BPVP.",
      };
    }
    if (reason === "logged_out_elsewhere") {
      return {
        tone: "blue" as const,
        icon: Info,
        title: "Sesi Diakhiri dari Tab atau Aplikasi Lain",
        message:
          "Anda telah keluar dari sesi di tab lain atau melalui Single Logout Central SSO. Silakan login kembali untuk melanjutkan.",
      };
    }
    if (errorParam) {
      return {
        tone: "red" as const,
        icon: AlertTriangle,
        title: "Autentikasi Gagal",
        message: decodeURIComponent(errorParam),
      };
    }
    return null;
  }, [reason, errorParam]);

  const handleSsoLogin = () => {
    window.location.href = buildSsoLoginUrl();
  };

  const bannerStyles = {
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    blue: "bg-sky-50 border-sky-200 text-sky-900",
    red: "bg-red-50 border-red-200 text-red-900",
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 px-8 py-7 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-sm">
            <img
              src="/logo-kemnaker.png"
              alt="Logo SIMPEL BPVP"
              className="h-full w-full object-contain"
            />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            {APP_NAME}
          </h1>
          <p className="mt-1 text-xs text-slate-300">
            Sistem Informasi Manajemen Pelatihan — BPVP Banda Aceh
          </p>
        </div>

        <div className="p-8 space-y-6">
          {banner && (
            <div
              className={`rounded-xl border p-4 text-sm flex gap-3 items-start ${bannerStyles[banner.tone]}`}
              role="alert"
            >
              <banner.icon className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{banner.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed opacity-90">
                  {banner.message}
                </p>
              </div>
            </div>
          )}

          <div className="text-center space-y-2">
            <h2 className="text-base font-semibold text-slate-900">
              Masuk ke Aplikasi
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Autentikasi menggunakan akun pegawai terpusat pada Ekosistem
              Digital BPVP Banda Aceh. Pastikan akun Anda sudah didaftarkan oleh
              Administrator.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSsoLogin}
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            Masuk dengan SSO BPVP Banda Aceh
          </button>

          <p className="text-center text-[11px] text-slate-400">
            Terintegrasi dengan Central SSO &amp; SIMPEG BPVP Banda Aceh
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-200 text-sm">
          Memuat halaman login...
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
