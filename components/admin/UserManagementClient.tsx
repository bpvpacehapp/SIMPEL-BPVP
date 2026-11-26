"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { UserPlus, RefreshCw, Loader2, X, Info } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useToast } from "@/components/providers/ToastProvider";
import { RbacPermissionsTab } from "@/components/admin/RbacPermissionsTab";
import {
  IconSearchFill,
  IconShieldFill,
  IconUsersFill,
} from "@/components/icons/FilledIcons";

interface LocalUser {
  id: string;
  nama: string;
  email: string;
  nip: string | null;
  jabatan: string | null;
  unitKerja: string | null;
  subUnitKerja: string | null;
  role: Role;
  deletedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface SimpegCandidate {
  id: string;
  nik?: string | null;
  nip?: string | null;
  nama: string;
  email?: string | null;
  jabatan?: string | null;
  unitKerja?: string | null;
  subUnitKerja?: string | null;
  fotoUrl?: string | null;
  isRegistered: boolean;
  appUserId: string | null;
  appRole: Role | null;
  appAktif: boolean;
}

interface UserManagementClientProps {
  currentUserId: string;
  currentUserRole: Role;
}

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Administrator",
  ADMIN: "Administrator",
  ADMIN_SUB_UNIT: "Admin Sub Unit",
  USER: "Pengguna",
};

const PAGE_SIZE = 10;

export function UserManagementClient({
  currentUserId,
  currentUserRole,
}: UserManagementClientProps) {
  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";
  const { showToast } = useToast();

  // Browser-Style Tabs: Daftar Pengguna | Hak Akses Menu (RBAC)
  const [activeTab, setActiveTab] = useState<"users" | "rbac">("users");

  // Tabel user lokal
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("semua");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Sinkronisasi massal
  const [syncing, setSyncing] = useState(false);

  // Modal Tambah dari SIMPEG
  const [modalOpen, setModalOpen] = useState(false);
  const [simpegSearch, setSimpegSearch] = useState("");
  const [simpegList, setSimpegList] = useState<SimpegCandidate[]>([]);
  const [simpegLoading, setSimpegLoading] = useState(false);
  const [simpegIsMock, setSimpegIsMock] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role>>({});
  const [addingId, setAddingId] = useState<string | null>(null);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const assignableRoleOptions = [
    { value: "USER", label: "Pengguna" },
    { value: "ADMIN_SUB_UNIT", label: "Admin Sub Unit" },
    { value: "ADMIN", label: "Administrator" },
    ...(isSuperAdmin
      ? [{ value: "SUPER_ADMIN", label: "Super Administrator" }]
      : []),
  ];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        status: statusFilter,
      });
      if (search.trim()) qs.set("search", search.trim());
      if (roleFilter) qs.set("role", roleFilter);

      const res = await fetch(`/api/users?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal memuat data user.");

      setUsers(json.data || []);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalUsers(json.pagination?.total || 0);
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memuat Pengguna",
        message:
          error instanceof Error ? error.message : "Gagal memuat daftar user.",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchUsers();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchUsers]);

  const fetchSimpegPegawai = useCallback(
    async (keyword: string) => {
      setSimpegLoading(true);
      try {
        const qs = keyword.trim()
          ? `?search=${encodeURIComponent(keyword.trim())}`
          : "";
        const res = await fetch(`/api/simpeg/pegawai${qs}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message || "Gagal memuat pegawai dari SIMPEG.");
        }
        setSimpegList(json.data || []);
        setSimpegIsMock(Boolean(json.isMock));
      } catch (error) {
        showToast({
          type: "error",
          title: "Gagal Memuat SIMPEG",
          message:
            error instanceof Error
              ? error.message
              : "Gagal mengambil data pegawai SIMPEG.",
        });
      } finally {
        setSimpegLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      void fetchSimpegPegawai(simpegSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [modalOpen, simpegSearch, fetchSimpegPegawai]);

  const handleSyncSimpeg = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/users/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Sinkronisasi gagal.");

      showToast({
        type: "success",
        title: "Sinkronisasi SIMPEG Selesai",
        message: json.message,
      });
      await fetchUsers();
    } catch (error) {
      showToast({
        type: "error",
        title: "Sinkronisasi Gagal",
        message:
          error instanceof Error
            ? error.message
            : "Gagal sinkronisasi dari SIMPEG.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleRegisterPegawai = async (pegawai: SimpegCandidate) => {
    if (!pegawai.email) {
      showToast({
        type: "error",
        title: "Email Tidak Tersedia",
        message: `Pegawai *${pegawai.nama}* tidak memiliki email di SIMPEG.`,
      });
      return;
    }

    setAddingId(pegawai.id);
    try {
      const chosenRole = selectedRoles[pegawai.id] || "USER";
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama: pegawai.nama,
          email: pegawai.email,
          nip: pegawai.nip,
          jabatan: pegawai.jabatan,
          unitKerja: pegawai.unitKerja,
          subUnitKerja: pegawai.subUnitKerja,
          fotoUrl: pegawai.fotoUrl,
          pegawaiId: pegawai.id,
          role: chosenRole,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal mendaftarkan user.");

      showToast({
        type: "success",
        title: "Pengguna Didaftarkan",
        message: `*${pegawai.nama}* berhasil didaftarkan sebagai *${ROLE_LABELS[chosenRole]}*.`,
      });
      await Promise.all([fetchUsers(), fetchSimpegPegawai(simpegSearch)]);
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Mendaftarkan",
        message:
          error instanceof Error
            ? error.message
            : "Gagal mendaftarkan pegawai.",
      });
    } finally {
      setAddingId(null);
    }
  };

  const handleUpdateUser = async (
    user: LocalUser,
    payload: { role?: Role; aktif?: boolean }
  ) => {
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal memperbarui user.");

      showToast({
        type: "success",
        title: "Pengguna Diperbarui",
        message: payload.role
          ? `Role *${user.nama}* diubah menjadi *${ROLE_LABELS[payload.role]}*.`
          : `Status *${user.nama}* diubah menjadi *${payload.aktif ? "Aktif" : "Nonaktif"}*.`,
      });
      await fetchUsers();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memperbarui",
        message:
          error instanceof Error
            ? error.message
            : "Gagal memperbarui pengguna.",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">
            Manajemen Pengguna &amp; Hak Akses
          </h1>
          <p className="mt-1 text-sm text-black/80 dark:text-slate-300">
            Kelola whitelist pegawai, 4 tingkatan role, sinkronisasi SIMPEG, dan
            izin akses menu (RBAC).
          </p>
        </div>

        {activeTab === "users" && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSyncSimpeg()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-black dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Menyinkronkan..." : "Sinkronkan dari SIMPEG"}
            </button>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              Tambah Pengguna dari SIMPEG
            </button>
          </div>
        )}
      </div>

      {/* Browser-Style Tabs Container */}
      <div className="w-full">
        {/* Strip Tab */}
        <div
          className="flex items-end gap-1.5 px-2 overflow-x-auto"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "users"}
            onClick={() => setActiveTab("users")}
            className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold border-t border-x transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "users"
                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-blue-700 dark:text-blue-400 -mb-px relative z-10"
                : "bg-slate-200/70 dark:bg-slate-800/60 border-transparent text-black/75 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <IconUsersFill className="h-4 w-4" />
            <span>Daftar Pengguna</span>
            <span className="rounded-md bg-slate-200/90 dark:bg-slate-700 px-1.5 py-0.5 text-xs tabular-nums text-black dark:text-slate-200">
              {totalUsers}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "rbac"}
            onClick={() => setActiveTab("rbac")}
            className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold border-t border-x transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "rbac"
                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-blue-700 dark:text-blue-400 -mb-px relative z-10"
                : "bg-slate-200/70 dark:bg-slate-800/60 border-transparent text-black/75 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            <IconShieldFill className="h-4 w-4" />
            <span>Hak Akses Menu (RBAC)</span>
          </button>
        </div>

        {/* Panel Konten Menyatu dengan Tab */}
        <div className="rounded-2xl rounded-tl-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          {activeTab === "rbac" ? (
            <RbacPermissionsTab />
          ) : (
            <>
              {/* Filter Bar Menyatu di Atas Tabel */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <IconSearchFill className="h-4 w-4 text-black/50 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setPage(1);
                      setSearch(e.target.value);
                    }}
                    placeholder="Cari nama, email, NIP, atau jabatan..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-4 py-2.5 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="w-full md:w-52 shrink-0">
                  <SearchableSelect
                    value={roleFilter}
                    onChange={(val) => {
                      setPage(1);
                      setRoleFilter(val);
                    }}
                    options={[
                      { value: "SUPER_ADMIN", label: "Super Administrator" },
                      { value: "ADMIN", label: "Administrator" },
                      { value: "ADMIN_SUB_UNIT", label: "Admin Sub Unit" },
                      { value: "USER", label: "Pengguna" },
                    ]}
                    placeholder="Semua Role"
                    searchable={false}
                    ariaLabel="Filter Role"
                  />
                </div>

                <div className="w-full md:w-44 shrink-0">
                  <SearchableSelect
                    value={statusFilter}
                    onChange={(val) => {
                      setPage(1);
                      setStatusFilter(val || "semua");
                    }}
                    options={[
                      { value: "semua", label: "Semua Status" },
                      { value: "aktif", label: "Aktif" },
                      { value: "nonaktif", label: "Nonaktif" },
                    ]}
                    placeholder="Semua Status"
                    searchable={false}
                    clearable={false}
                    showResetOption={false}
                    ariaLabel="Filter Status"
                  />
                </div>
              </div>

              {/* Tabel Users */}
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[14px] font-bold text-black dark:text-white">
                    <tr>
                      <th className="px-3 py-3.5 text-center w-14">No</th>
                      <th className="px-4 py-3.5 text-center">Pegawai</th>
                      <th className="px-4 py-3.5 text-center">
                        Jabatan &amp; Unit
                      </th>
                      <th className="px-4 py-3.5 text-center w-52">Role</th>
                      <th className="px-3 py-3.5 text-center w-28">Status</th>
                      <th className="px-4 py-3.5 text-center w-44">
                        Login Terakhir
                      </th>
                      <th className="px-4 py-3.5 text-center w-36">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {loading ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-10 text-center text-black/70 dark:text-slate-400"
                        >
                          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                          Memuat daftar pengguna...
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-10 text-center text-black/70 dark:text-slate-400"
                        >
                          Belum ada data pengguna yang cocok dengan filter.
                        </td>
                      </tr>
                    ) : (
                      users.map((u, idx) => {
                        const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                        const isAktif = u.deletedAt === null;
                        const isSelf = u.id === currentUserId;
                        const lockedByRole =
                          !isSuperAdmin && u.role === "SUPER_ADMIN";
                        const busy = busyUserId === u.id;

                        const rowRoleOptions =
                          isSuperAdmin || u.role === "SUPER_ADMIN"
                            ? [
                                { value: "USER", label: "Pengguna" },
                                {
                                  value: "ADMIN_SUB_UNIT",
                                  label: "Admin Sub Unit",
                                },
                                { value: "ADMIN", label: "Administrator" },
                                {
                                  value: "SUPER_ADMIN",
                                  label: "Super Administrator",
                                },
                              ]
                            : [
                                { value: "USER", label: "Pengguna" },
                                {
                                  value: "ADMIN_SUB_UNIT",
                                  label: "Admin Sub Unit",
                                },
                                { value: "ADMIN", label: "Administrator" },
                              ];

                        return (
                          <tr
                            key={u.id}
                            className="odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors font-normal"
                          >
                            <td className="px-3 py-3 text-center text-black dark:text-slate-300 tabular-nums">
                              {rowNum}
                            </td>
                            <td className="px-4 py-3 text-left">
                              <p className="text-black dark:text-white">
                                {u.nama}
                                {isSelf && (
                                  <span className="ml-2 rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                    Anda
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-black/70 dark:text-slate-400">
                                {u.email}
                              </p>
                              {u.nip && (
                                <p className="text-[11px] text-black/60 dark:text-slate-400">
                                  NIP: {u.nip}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-left">
                              <p className="text-black dark:text-slate-200">
                                {u.jabatan || "-"}
                              </p>
                              <p className="text-xs text-black/70 dark:text-slate-400">
                                {u.subUnitKerja || u.unitKerja || "-"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <SearchableSelect
                                value={u.role}
                                disabled={busy || lockedByRole}
                                onChange={(val) =>
                                  void handleUpdateUser(u, {
                                    role: val as Role,
                                  })
                                }
                                options={rowRoleOptions}
                                placeholder="Pilih Role"
                                searchable={false}
                                clearable={false}
                                showResetOption={false}
                                size="sm"
                                ariaLabel={`Role untuk ${u.nama}`}
                              />
                            </td>
                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${
                                  isAktif
                                    ? "bg-emerald-700 text-white dark:bg-emerald-600"
                                    : "bg-slate-600 text-white dark:bg-slate-700"
                                }`}
                              >
                                {isAktif ? "Aktif" : "Nonaktif"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-black/80 dark:text-slate-300 tabular-nums">
                              {u.lastLoginAt
                                ? new Date(u.lastLoginAt).toLocaleString(
                                    "id-ID"
                                  )
                                : "Belum pernah"}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                disabled={busy || isSelf || lockedByRole}
                                onClick={() =>
                                  void handleUpdateUser(u, { aktif: !isAktif })
                                }
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-40 cursor-pointer ${
                                  isAktif
                                    ? "border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/60"
                                    : "border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60"
                                }`}
                              >
                                {isAktif ? "Nonaktifkan" : "Aktifkan"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationBar
                page={page}
                totalPages={totalPages}
                totalItems={totalUsers}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemLabel="pengguna"
              />
            </>
          )}
        </div>
      </div>

      {/* Modal Tambah Pengguna dari SIMPEG */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div>
                <h2 className="text-base font-bold text-black dark:text-white">
                  Tambah Pengguna dari Master SIMPEG
                </h2>
                <p className="text-xs text-black/75 dark:text-slate-400">
                  Cari pegawai BPVP lalu pilih role (4 tingkatan) untuk
                  didaftarkan ke whitelist SIMPEL BPVP.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-black/60 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {simpegIsMock && (
                <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-3.5 py-2.5 text-xs text-amber-950 dark:text-amber-200">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Sedang menggunakan <strong>Mode Mock SIMPEG</strong> lokal
                    (sambil menunggu <code>SIMPEG_API_KEY</code> asli dari
                    mentor).
                  </span>
                </div>
              )}

              <div className="relative">
                <IconSearchFill className="h-4 w-4 text-black/50 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={simpegSearch}
                  onChange={(e) => setSimpegSearch(e.target.value)}
                  placeholder="Ketik nama, NIP, email, atau jabatan pegawai..."
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-4 py-2.5 text-sm text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {simpegLoading ? (
                <div className="py-10 text-center text-sm text-black/70 dark:text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Mencari pegawai di SIMPEG...
                </div>
              ) : simpegList.length === 0 ? (
                <div className="py-10 text-center text-sm text-black/70 dark:text-slate-400">
                  Pegawai tidak ditemukan.
                </div>
              ) : (
                <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {simpegList.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/60"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-black dark:text-white truncate">
                          {p.nama}
                        </p>
                        <p className="text-xs text-black/75 dark:text-slate-400 truncate">
                          {p.email || "Tanpa email"} • NIP: {p.nip || "-"}
                        </p>
                        <p className="text-xs text-black/65 dark:text-slate-400 truncate">
                          {p.jabatan || "-"} —{" "}
                          {p.subUnitKerja || p.unitKerja || "-"}
                        </p>
                      </div>

                      {p.isRegistered ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-black dark:text-slate-300 shrink-0">
                          <IconShieldFill className="h-3.5 w-3.5" />
                          Terdaftar ({p.appRole ? ROLE_LABELS[p.appRole] : "-"})
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-44">
                            <SearchableSelect
                              value={selectedRoles[p.id] || "USER"}
                              onChange={(val) =>
                                setSelectedRoles((prev) => ({
                                  ...prev,
                                  [p.id]: val as Role,
                                }))
                              }
                              options={assignableRoleOptions}
                              placeholder="Pilih Role"
                              searchable={false}
                              clearable={false}
                              showResetOption={false}
                              size="sm"
                              ariaLabel={`Role awal untuk ${p.nama}`}
                            />
                          </div>
                          <button
                            type="button"
                            disabled={addingId === p.id}
                            onClick={() => void handleRegisterPegawai(p)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                          >
                            {addingId === p.id ? "Menyimpan..." : "Daftarkan"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
