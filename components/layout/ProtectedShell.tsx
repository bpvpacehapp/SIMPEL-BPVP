"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { performAppSignOut } from "@/lib/auth-sync";
import { useTheme, type ThemeMode } from "@/components/providers/ThemeProvider";
import {
  IconShieldFill,
  IconDashboardFill,
  IconFolderAdminFill,
  IconDocumentFill,
  IconUsersFill,
  IconLogoutFill,
  IconPanelToggleFill,
  IconChevronDownFill,
  IconSunFill,
  IconMoonFill,
  IconMonitorFill,
  IconHistoryFill,
} from "@/components/icons/FilledIcons";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "SIMPEL BPVP";
const COLLAPSE_STORAGE_KEY = "simpel_sidebar_collapsed";

interface ProtectedShellProps {
  user: {
    id: string;
    nama: string;
    email: string;
    role: Role;
    jabatan?: string | null;
    unitKerja?: string | null;
  };
  children: ReactNode;
}

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Administrator",
  ADMIN: "Administrator",
  USER: "Pengguna",
};

const THEME_OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  icon: typeof IconSunFill;
}> = [
  { mode: "light", label: "Terang", icon: IconSunFill },
  { mode: "dark", label: "Gelap", icon: IconMoonFill },
  { mode: "system", label: "Perangkat", icon: IconMonitorFill },
];

export function ProtectedShell({ user, children }: ProtectedShellProps) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const roleLabel = ROLE_LABEL[user.role] || "Pengguna";

  const [collapsed, setCollapsed] = useState(false);
  const [adminGroupOpen, setAdminGroupOpen] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      // Abaikan
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Abaikan
      }
      return next;
    });
  };

  const isDashboardActive = pathname === "/dashboard";
  const isSkkniActive = pathname.startsWith("/administrasi/skkni");
  const isUsersActive = pathname.startsWith("/admin/users");
  const isLogsActive = pathname.startsWith("/admin/logs");
  const isAdministrasiActive = isSkkniActive || isUsersActive || isLogsActive;

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#f4f6f9] dark:bg-[#0b1120] text-black dark:text-slate-100">
      {/* Collapsible Fixed-Height Sidebar (Menu scrollable, Header & Footer tetap menempel) */}
      <aside
        className={`hidden md:flex md:flex-col shrink-0 h-full overflow-hidden bg-white dark:bg-slate-900 text-black dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 transition-all duration-200 ${
          collapsed ? "w-[74px]" : "w-60"
        }`}
      >
        {/* Brand + 1 Tombol Collapse Tunggal */}
        <div
          className={`flex items-center border-b border-slate-200 dark:border-slate-800 h-16 px-3.5 shrink-0 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1">
                <img
                  src="/logo-kemnaker.png"
                  alt="Logo SIMPEL BPVP"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight text-black dark:text-white truncate">
                  {APP_NAME}
                </p>
                <p className="text-[11px] text-black/70 dark:text-slate-400 truncate">
                  BPVP Banda Aceh
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleCollapse}
            title={collapsed ? "Perluas Sidebar" : "Ciutkan Sidebar"}
            aria-label={collapsed ? "Perluas Sidebar" : "Ciutkan Sidebar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-black dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <IconPanelToggleFill
              className={`h-4 w-4 transition-transform duration-200 ${
                collapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        {/* Navigation (Font lebih ringkas + Icon Fill) */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3.5 space-y-1">
          {/* Dashboard */}
          <Link
            href="/dashboard"
            title="Dashboard"
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors ${
              collapsed ? "justify-center px-0" : ""
            } ${
              isDashboardActive
                ? "bg-blue-600 text-white"
                : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <IconDashboardFill className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </Link>

          {/* Sub-Menu: Administrasi */}
          <div className="pt-1">
            {collapsed ? (
              <div className="space-y-1 border-t border-slate-200 dark:border-slate-800 pt-2">
                <Link
                  href="/administrasi/skkni"
                  title="Administrasi — SKKNI"
                  className={`flex items-center justify-center rounded-xl py-2 transition-colors ${
                    isSkkniActive
                      ? "bg-blue-600 text-white"
                      : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <IconDocumentFill className="h-4 w-4" />
                </Link>
                {isAdmin && (
                  <>
                    <Link
                      href="/admin/users"
                      title="Administrasi — Manajemen User"
                      className={`flex items-center justify-center rounded-xl py-2 transition-colors ${
                        isUsersActive
                          ? "bg-blue-600 text-white"
                          : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <IconUsersFill className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/admin/logs"
                      title="Administrasi — Log Aktivitas"
                      className={`flex items-center justify-center rounded-xl py-2 transition-colors ${
                        isLogsActive
                          ? "bg-blue-600 text-white"
                          : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <IconHistoryFill className="h-4 w-4" />
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setAdminGroupOpen((o) => !o)}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-[14px] font-semibold transition-colors cursor-pointer ${
                    isAdministrasiActive
                      ? "bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-white"
                      : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <IconFolderAdminFill className="h-4 w-4 shrink-0" />
                    <span className="truncate">Administrasi</span>
                  </span>
                  <IconChevronDownFill
                    className={`h-3.5 w-3.5 shrink-0 text-black/60 dark:text-slate-400 transition-transform duration-200 ${
                      adminGroupOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {adminGroupOpen && (
                  <div className="mt-1 ml-3 pl-2.5 border-l-2 border-slate-400 dark:border-slate-500 space-y-1">
                    <Link
                      href="/administrasi/skkni"
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors ${
                        isSkkniActive
                          ? "bg-blue-600 text-white"
                          : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <IconDocumentFill className="h-4 w-4 shrink-0" />
                      <span className="truncate">SKKNI</span>
                    </Link>

                    {isAdmin && (
                      <>
                        <Link
                          href="/admin/users"
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors ${
                            isUsersActive
                              ? "bg-blue-600 text-white"
                              : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <IconUsersFill className="h-4 w-4 shrink-0" />
                          <span className="truncate">Manajemen User</span>
                        </Link>
                        <Link
                          href="/admin/logs"
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors ${
                            isLogsActive
                              ? "bg-blue-600 text-white"
                              : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <IconHistoryFill className="h-4 w-4 shrink-0" />
                          <span className="truncate">Log Aktivitas</span>
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </nav>

        {/* Kotak Role + Tombol Logout di Akhir Sidebar (menempel di bawah tanpa celah) */}
        <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shrink-0">
          {collapsed ? (
            <div
              title={`Role: ${roleLabel}`}
              className="flex h-9 w-full items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
            >
              <IconShieldFill className="h-4 w-4" />
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-2.5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                <IconShieldFill className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-black/65 dark:text-slate-400 leading-tight">
                  Hak Akses
                </p>
                <p className="text-[14px] font-semibold text-black dark:text-white truncate leading-snug">
                  {roleLabel}
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            title="Keluar Aplikasi"
            onClick={() => void performAppSignOut("/login")}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[14px] font-semibold text-black dark:text-slate-200 hover:bg-rose-600 hover:border-rose-600 hover:text-white transition-colors cursor-pointer ${
              collapsed ? "px-0" : ""
            }`}
          >
            <IconLogoutFill className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Keluar</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area — Header tetap diam, hanya isi <main> yang scroll */}
      <div className="flex-1 flex flex-col h-full min-w-0 w-full overflow-hidden">
        <header className="shrink-0 z-30 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 md:hidden">
              <img
                src="/logo-kemnaker.png"
                alt="Logo SIMPEL BPVP"
                className="h-6 w-6 object-contain"
              />
              <span className="font-bold text-sm text-black dark:text-white">
                {APP_NAME}
              </span>
            </div>
            <span className="hidden md:inline text-[13.5px] font-semibold text-black dark:text-slate-200 truncate">
              Sistem Informasi Manajemen Pelatihan — BPVP Banda Aceh
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Theme Toggle: Icon Only (Light / Dark / Device) */}
            <div
              className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1"
              role="group"
              aria-label="Pilih Tema Aplikasi"
            >
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setTheme(opt.mode)}
                    title={`Tema ${opt.label}`}
                    aria-label={`Tema ${opt.label}`}
                    aria-pressed={active}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                      active
                        ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                        : "text-black/70 dark:text-slate-400 hover:text-black dark:hover:text-slate-200"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center justify-between gap-2 px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                isDashboardActive
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-black dark:text-slate-200"
              }`}
            >
              <IconDashboardFill className="h-3.5 w-3.5" />
              Dashboard
            </Link>
            <Link
              href="/administrasi/skkni"
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                isSkkniActive
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-black dark:text-slate-200"
              }`}
            >
              <IconDocumentFill className="h-3.5 w-3.5" />
              SKKNI
            </Link>
            {isAdmin && (
              <>
                <Link
                  href="/admin/users"
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                    isUsersActive
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-black dark:text-slate-200"
                  }`}
                >
                  <IconUsersFill className="h-3.5 w-3.5" />
                  Manajemen User
                </Link>
                <Link
                  href="/admin/logs"
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                    isLogsActive
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-black dark:text-slate-200"
                  }`}
                >
                  <IconHistoryFill className="h-3.5 w-3.5" />
                  Log Aktivitas
                </Link>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => void performAppSignOut("/login")}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-black dark:text-slate-200 shrink-0 cursor-pointer"
          >
            <IconLogoutFill className="h-3.5 w-3.5" />
            Keluar
          </button>
        </div>

        <main className="flex-1 overflow-y-auto w-full px-4 md:px-7 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
