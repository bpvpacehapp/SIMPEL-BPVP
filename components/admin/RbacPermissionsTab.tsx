"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "@prisma/client";
import { useToast } from "@/components/providers/ToastProvider";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  IconSearchFill,
  IconShieldFill,
  IconUsersFill,
} from "@/components/icons/FilledIcons";

interface RbacMenu {
  key: string;
  label: string;
  group: string;
  description: string;
}

interface RbacUserRow {
  id: string;
  nama: string;
  email: string;
  nip: string | null;
  jabatan: string | null;
  subUnitKerja: string | null;
  role: Role;
  hasCustomOverride: boolean;
  customOverrides: Record<string, boolean>;
  effectivePermissions: Record<string, boolean>;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN_SUB_UNIT: "Admin Sub Unit",
  USER: "Pengguna",
};

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:opacity-50 cursor-pointer ${
        checked
          ? "bg-blue-600 dark:bg-blue-500"
          : "bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function RbacPermissionsTab() {
  const { showToast } = useToast();

  const [menus, setMenus] = useState<RbacMenu[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [users, setUsers] = useState<RbacUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");

  const fetchRbac = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rbac", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal memuat pengaturan RBAC.");
      }
      setMenus(json.menus || []);
      setRoleDefaults(json.roleDefaults || {});
      setUsers(json.users || []);
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memuat Hak Akses",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat memuat pengaturan RBAC.",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchRbac();
  }, [fetchRbac]);

  const handleToggleRoleDefault = async (
    role: "ADMIN_SUB_UNIT" | "USER",
    menu: RbacMenu,
    nextAllowed: boolean
  ) => {
    const key = `role:${role}:${menu.key}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/rbac", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "role",
          role,
          menuKey: menu.key,
          allowed: nextAllowed,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal menyimpan izin.");

      showToast({
        type: "success",
        title: "Hak Akses Role Diperbarui",
        message: `Menu *${menu.label}* untuk *${ROLE_LABEL[role]}* diubah menjadi *${nextAllowed ? "Diizinkan" : "Dinonaktifkan"}*.`,
      });
      await fetchRbac();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menyimpan Izin Role",
        message:
          error instanceof Error ? error.message : "Gagal memperbarui izin.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleUserMenu = async (
    user: RbacUserRow,
    menu: RbacMenu,
    nextAllowed: boolean
  ) => {
    const key = `user:${user.id}:${menu.key}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/rbac", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "user",
          userId: user.id,
          menuKey: menu.key,
          allowed: nextAllowed,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal menyimpan izin.");

      showToast({
        type: "success",
        title: "Hak Akses Kustom Diperbarui",
        message: `Akses *${menu.label}* untuk *${user.nama}* diubah menjadi *${nextAllowed ? "Diizinkan" : "Dinonaktifkan"}*.`,
      });
      await fetchRbac();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menyimpan Izin Akun",
        message:
          error instanceof Error ? error.message : "Gagal memperbarui izin.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleResetUserOverride = async (user: RbacUserRow) => {
    const key = `reset:${user.id}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/rbac", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "reset_user",
          userId: user.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal mereset izin.");

      showToast({
        type: "info",
        title: "Izin Akun Direset",
        message: `Hak akses *${user.nama}* dikembalikan mengikuti default role *${ROLE_LABEL[user.role] || user.role}*.`,
      });
      await fetchRbac();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Mereset Izin",
        message:
          error instanceof Error ? error.message : "Gagal mereset izin akun.",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userRoleFilter && u.role !== userRoleFilter) return false;
      if (!q) return true;
      return (
        u.nama.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.subUnitKerja || "").toLowerCase().includes(q) ||
        (u.jabatan || "").toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, userRoleFilter]);

  if (loading) {
    return (
      <div className="p-8 space-y-4 animate-pulse">
        <div className="h-5 w-64 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-32 w-full rounded-xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-48 w-full rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Bagian 1: Default Hak Akses Per Role */}
      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <IconShieldFill className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-black dark:text-white">
              Default Hak Akses Menu Per Role
            </h2>
            <p className="text-xs text-black/75 dark:text-slate-400 mt-0.5">
              Mengatur menu bawaan yang tampil bagi <strong>Admin Sub Unit</strong>{" "}
              dan <strong>Pengguna</strong>. Role{" "}
              <strong>Super Administrator</strong> dan{" "}
              <strong>Administrator</strong> otomatis memiliki akses penuh.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[14px] font-bold text-black dark:text-white">
                <tr>
                  <th className="px-4 py-3 text-center w-36">Grup</th>
                  <th className="px-4 py-3 text-center">Menu &amp; Deskripsi</th>
                  <th className="px-4 py-3 text-center w-44">Admin Sub Unit</th>
                  <th className="px-4 py-3 text-center w-44">Pengguna</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {menus.map((menu) => {
                  const subUnitAllowed = Boolean(
                    roleDefaults.ADMIN_SUB_UNIT?.[menu.key]
                  );
                  const userAllowed = Boolean(roleDefaults.USER?.[menu.key]);

                  return (
                    <tr
                      key={menu.key}
                      className="odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50"
                    >
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs text-black dark:text-slate-200">
                          {menu.group}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left">
                        <p className="font-semibold text-black dark:text-white">
                          {menu.label}
                        </p>
                        <p className="text-xs text-black/70 dark:text-slate-400 mt-0.5">
                          {menu.description}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <ToggleSwitch
                            checked={subUnitAllowed}
                            disabled={
                              busyKey === `role:ADMIN_SUB_UNIT:${menu.key}`
                            }
                            onChange={(next) =>
                              void handleToggleRoleDefault(
                                "ADMIN_SUB_UNIT",
                                menu,
                                next
                              )
                            }
                            ariaLabel={`Toggle default ${menu.label} untuk Admin Sub Unit`}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <ToggleSwitch
                            checked={userAllowed}
                            disabled={busyKey === `role:USER:${menu.key}`}
                            onChange={(next) =>
                              void handleToggleRoleDefault("USER", menu, next)
                            }
                            ariaLabel={`Toggle default ${menu.label} untuk Pengguna`}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Bagian 2: Kustom Hak Akses Per Akun */}
      <section className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <IconUsersFill className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-black dark:text-white">
                Kustom Hak Akses Per Akun
              </h2>
              <p className="text-xs text-black/75 dark:text-slate-400 mt-0.5">
                Atur izin menu secara spesifik untuk masing-masing pegawai{" "}
                <strong>Admin Sub Unit</strong> atau <strong>Pengguna</strong>.
                Pengaturan kustom di sini menimpa default role di atas.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            <div className="relative w-full sm:w-64">
              <IconSearchFill className="h-4 w-4 text-black/50 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Cari pegawai atau sub unit..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-2 text-xs text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="w-full sm:w-44">
              <SearchableSelect
                value={userRoleFilter}
                onChange={setUserRoleFilter}
                options={[
                  { value: "ADMIN_SUB_UNIT", label: "Admin Sub Unit" },
                  { value: "USER", label: "Pengguna" },
                ]}
                placeholder="Semua Role"
                searchable={false}
                size="sm"
                ariaLabel="Filter Role RBAC"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[14px] font-bold text-black dark:text-white">
                <tr>
                  <th className="px-3 py-3 text-center w-14">No</th>
                  <th className="px-4 py-3 text-center">Pegawai &amp; Sub Unit</th>
                  <th className="px-4 py-3 text-center w-36">Role</th>
                  {menus.map((m) => (
                    <th key={m.key} className="px-4 py-3 text-center w-32">
                      {m.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center w-40">Mode Izin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4 + menus.length}
                      className="px-6 py-12 text-center text-sm text-black/70 dark:text-slate-400"
                    >
                      Belum ada pengguna dengan role{" "}
                      <strong>Admin Sub Unit</strong> atau{" "}
                      <strong>Pengguna</strong> yang cocok. Daftarkan atau ubah
                      role pengguna di tab <strong>Daftar Pengguna</strong>.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, idx) => (
                    <tr
                      key={u.id}
                      className="odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
                    >
                      <td className="px-3 py-3 text-center text-black dark:text-slate-300 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 text-left">
                        <p className="font-medium text-black dark:text-white">
                          {u.nama}
                        </p>
                        <p className="text-xs text-black/70 dark:text-slate-400">
                          {u.email}
                          {u.subUnitKerja ? ` • ${u.subUnitKerja}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${
                            u.role === "ADMIN_SUB_UNIT"
                              ? "bg-indigo-700 text-white dark:bg-indigo-600"
                              : "bg-slate-700 text-white dark:bg-slate-600"
                          }`}
                        >
                          {ROLE_LABEL[u.role] || u.role}
                        </span>
                      </td>
                      {menus.map((m) => {
                        const effective = Boolean(u.effectivePermissions[m.key]);
                        const isCustom = m.key in u.customOverrides;
                        return (
                          <td key={m.key} className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <ToggleSwitch
                                checked={effective}
                                disabled={busyKey === `user:${u.id}:${m.key}`}
                                onChange={(next) =>
                                  void handleToggleUserMenu(u, m, next)
                                }
                                ariaLabel={`Toggle ${m.label} untuk ${u.nama}`}
                              />
                              {isCustom && (
                                <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400">
                                  Kustom
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {u.hasCustomOverride ? (
                          <button
                            type="button"
                            disabled={busyKey === `reset:${u.id}`}
                            onClick={() => void handleResetUserOverride(u)}
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                          >
                            Reset Default
                          </button>
                        ) : (
                          <span className="text-xs text-black/60 dark:text-slate-400">
                            Ikuti Role
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
