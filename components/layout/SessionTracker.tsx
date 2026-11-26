"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSession, signOut, useSession } from "next-auth/react";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import {
  AUTH_CHANNEL,
  LOGOUT_EVENT,
  broadcastLogout,
  performAppSignOut,
} from "@/lib/auth-sync";

const WARNING_THRESHOLD_SECONDS = 300; // 5 menit
const AUTO_SLIDING_THRESHOLD_SECONDS = 900; // 15 menit
const AUTO_SLIDING_COOLDOWN_MS = 120_000; // 2 menit
const ACTIVITY_THROTTLE_MS = 2000; // 2 detik

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function SessionTracker() {
  const { data: session, status, update } = useSession();
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isExtending, setIsExtending] = useState(false);

  const expiryTimestampRef = useRef<number | null>(null);
  const lastActivityCheckRef = useRef<number>(0);
  const lastSlidingRefreshRef = useRef<number>(0);
  const isLoggingOutRef = useRef<boolean>(false);
  const mountTimeRef = useRef<number>(Date.now());

  // Sinkronkan expiryTimestampRef dari session.expiresAt
  useEffect(() => {
    if (session?.expiresAt) {
      expiryTimestampRef.current = session.expiresAt;
      const diff = Math.floor((session.expiresAt - Date.now()) / 1000);
      setRemainingSeconds(diff);
    }
  }, [session?.expiresAt]);

  const forceLogout = useCallback(async (reason: "expired" | "logged_out_elsewhere") => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    if (reason === "expired") {
      broadcastLogout();
    }

    await signOut({
      callbackUrl: `/login?reason=${reason}`,
    });
  }, []);

  const handleExtendSession = useCallback(async () => {
    if (isExtending || isLoggingOutRef.current) return;
    setIsExtending(true);
    try {
      lastSlidingRefreshRef.current = Date.now();
      const updated = await update();
      if (!updated || !updated.user?.id) {
        await forceLogout("logged_out_elsewhere");
      } else if (updated.expiresAt) {
        expiryTimestampRef.current = updated.expiresAt;
        setRemainingSeconds(Math.floor((updated.expiresAt - Date.now()) / 1000));
      }
    } catch (error) {
      console.error("[SessionTracker] Gagal memperpanjang sesi:", error);
    } finally {
      setIsExtending(false);
    }
  }, [isExtending, update, forceLogout]);

  // 1. Countdown 1 detik + Auto Logout saat habis
  useEffect(() => {
    if (status !== "authenticated") return;

    const timer = window.setInterval(() => {
      const expiry = expiryTimestampRef.current;
      if (!expiry) return;

      const secs = Math.floor((expiry - Date.now()) / 1000);
      setRemainingSeconds(secs);

      if (secs <= 0) {
        void forceLogout("expired");
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status, forceLogout]);

  // 2. Auto Sliding Session saat pengguna aktif
  useEffect(() => {
    if (status !== "authenticated") return;

    const onUserActivity = () => {
      const now = Date.now();
      if (now - lastActivityCheckRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityCheckRef.current = now;

      const expiry = expiryTimestampRef.current;
      if (!expiry) return;

      const secsLeft = Math.floor((expiry - now) / 1000);
      const cooldownPassed =
        now - lastSlidingRefreshRef.current >= AUTO_SLIDING_COOLDOWN_MS;

      if (
        secsLeft > 0 &&
        secsLeft <= AUTO_SLIDING_THRESHOLD_SECONDS &&
        cooldownPassed
      ) {
        void handleExtendSession();
      }
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((ev) =>
      window.addEventListener(ev, onUserActivity, { passive: true })
    );

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onUserActivity));
    };
  }, [status, handleExtendSession]);

  // 3. Cross-Tab Logout Sync (BroadcastChannel + localStorage storage event)
  useEffect(() => {
    if (status !== "authenticated") return;

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data?.type === "LOGOUT") {
          void forceLogout("logged_out_elsewhere");
        }
      };
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === LOGOUT_EVENT && event.newValue) {
        void forceLogout("logged_out_elsewhere");
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [status, forceLogout]);

  // 4. Deteksi Tab Kembali Aktif / Bangun dari Sleep (visibilitychange & focus)
  useEffect(() => {
    if (status !== "authenticated") return;

    const verifySessionOnReturn = async () => {
      if (isLoggingOutRef.current) return;

      const now = Date.now();
      if (expiryTimestampRef.current && now >= expiryTimestampRef.current) {
        await forceLogout("expired");
        return;
      }

      try {
        const logoutSignal = window.localStorage.getItem(LOGOUT_EVENT);
        if (logoutSignal && Number(logoutSignal) > mountTimeRef.current) {
          await forceLogout("logged_out_elsewhere");
          return;
        }
      } catch {
        // Abaikan jika localStorage diblokir
      }

      const freshSession = await getSession();
      if (!freshSession || !freshSession.user?.id) {
        await forceLogout("logged_out_elsewhere");
        return;
      }

      if (freshSession.expiresAt) {
        expiryTimestampRef.current = freshSession.expiresAt;
        setRemainingSeconds(
          Math.floor((freshSession.expiresAt - Date.now()) / 1000)
        );
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void verifySessionOnReturn();
      }
    };

    const onFocus = () => {
      void verifySessionOnReturn();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [status, forceLogout]);

  const showWarning =
    status === "authenticated" &&
    remainingSeconds !== null &&
    remainingSeconds > 0 &&
    remainingSeconds <= WARNING_THRESHOLD_SECONDS;

  if (!showWarning) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-amber-200 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="session-warning-title"
              className="text-base font-semibold text-slate-900"
            >
              Sesi Anda Akan Segera Berakhir
            </h2>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Demi keamanan akun, sesi akan otomatis berakhir apabila tidak ada
              aktivitas. Klik <strong>Perpanjang Sesi</strong> untuk melanjutkan
              pekerjaan Anda.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 py-4 text-center">
          <p className="text-xs font-medium text-amber-800">Sisa Waktu Sesi</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-900">
            {formatCountdown(remainingSeconds)}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => void performAppSignOut("/login")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Keluar
          </button>
          <button
            type="button"
            disabled={isExtending}
            onClick={() => void handleExtendSession()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 ${isExtending ? "animate-spin" : ""}`}
            />
            {isExtending ? "Memperpanjang..." : "Perpanjang Sesi"}
          </button>
        </div>
      </div>
    </div>
  );
}
