"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  IconCheckCircleFill,
  IconCancelCircleFill,
  IconCloseFill,
  IconDocumentFill,
} from "@/components/icons/FilledIcons";

export type ToastType = "success" | "error" | "info";

export interface ToastInput {
  type?: ToastType;
  title: string;
  message: string; // Mendukung *teks penting* untuk auto-highlight
  durationMs?: number;
}

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
}

interface ToastContextValue {
  showToast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  dismissToast: () => {},
});

function renderHighlightedMessage(text: string) {
  const parts = text.split(/(\*[^*]+\*)/g);

  return parts.map((part, idx) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <strong key={idx} className="font-bold text-black dark:text-white">
          {part.slice(1, -1)}
        </strong>
      );
    }
    return (
      <span key={idx} className="font-normal">
        {part}
      </span>
    );
  });
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ToastItem = {
        id,
        type: input.type || "success",
        title: input.title,
        message: input.message,
      };

      setToasts((prev) => [...prev.slice(-3), item]);

      const duration = input.durationMs ?? 5500;
      if (duration > 0) {
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    []
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}

      {/* Toast Container (Pojok Kanan Atas) */}
      <div
        className="fixed top-5 right-5 z-[100] flex flex-col gap-3 w-[380px] max-w-[calc(100vw-2rem)] pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";

          const outerTheme = isError
            ? "bg-rose-700 dark:bg-rose-800 border-rose-800 dark:border-rose-700"
            : isSuccess
              ? "bg-emerald-700 dark:bg-emerald-800 border-emerald-800 dark:border-emerald-700"
              : "bg-blue-700 dark:bg-blue-800 border-blue-800 dark:border-blue-700";

          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto rounded-2xl border ${outerTheme} shadow-2xl p-3 space-y-2.5`}
            >
              {/* Header Toast (Kontras tinggi teks putih di atas warna solid) */}
              <div className="flex items-center justify-between gap-2.5 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/20 text-white">
                    {isError ? (
                      <IconCancelCircleFill className="h-4 w-4" />
                    ) : isSuccess ? (
                      <IconCheckCircleFill className="h-4 w-4" />
                    ) : (
                      <IconDocumentFill className="h-4 w-4" />
                    )}
                  </div>
                  <p className="text-sm font-bold text-white truncate">
                    {toast.title}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  aria-label="Tutup notifikasi"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/85 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
                >
                  <IconCloseFill className="h-4 w-4" />
                </button>
              </div>

              {/* Inner Div Pembungkus Message (Putih bersih di Light / Gelap pekat di Dark) */}
              <div className="rounded-xl bg-white dark:bg-slate-950 px-3.5 py-2.5 text-[14px] font-normal leading-relaxed text-black dark:text-slate-100">
                {renderHighlightedMessage(toast.message)}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
