"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import {
  Search,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Shield,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";

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

export function UserManagementClient({
  currentUserId,
  currentUserRole,
}: UserManagementClientProps) {
  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";

  // Tabel user lokal
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("semua");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Feedback banner
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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

  // Loading per-row action
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: "10",
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
      setFeedback({
        type: "error",
        text:
          error instanceof Error ? error.message : "Gagal memuat daftar user.",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchUsers();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchUsers]);

  const fetchSimpegPegawai = useCallback(async (keyword: string) => {
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
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Gagal mengambil data pegawai SIMPEG.",
      });
    } finally {
      setSimpegLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const timer = window.setTimeout(() => {
      void fetchSimpegPegawai(simpegSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [modalOpen, simpegSearch, fetchSimpegPegawai]);

  const handleSyncSimpeg = async () => {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/users/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Sinkronisasi gagal.");

      setFeedback({ type: "success", text: json.message });
      await fetchUsers();
    } catch (error) {
      setFeedback({
        type: "error",
        text:
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
      setFeedback({
        type: "error",
        text: `Pegawai ${pegawai.nama} tidak memiliki email di SIMPEG.`,
      });
      return;
    }

    setAddingId(pegawai.id);
    setFeedback(null);
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

      setFeedback({
        type: "success",
        text: `${pegawai.nama} berhasil didaftarkan sebagai ${chosenRole}.`,
      });
      await Promise.all([fetchUsers(), fetchSimpegPegawai(simpegSearch)]);
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Gagal mendaftarkan pegawai.",
      });
    } finally {
      setAddingId(null);
    }
  };

  const handleUpdateUser = async (
    userId: string,
    payload: { role?: Role; aktif?: boolean }
  ) => {
    setBusyUserId(userId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal memperbarui user.");

      setFeedback({
        type: "success",
        text: "Data pengguna berhasil diperbarui.",
      });
      await fetchUsers();
    } catch (error) {
      setFeedback({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Gagal memperbarui pengguna.",
      });
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Manajemen Pengguna
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Kelola whitelist pegawai SIMPEL BPVP dan sinkronisasi profil dari
            SIMPEG BPVP Banda Aceh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSyncSimpeg()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
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
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Cari nama, email, NIP, atau jabatan..."
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => {
            setPage(1);
            setRoleFilter(e.target.value);
          }}
          className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Semua Role</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          <option value="ADMIN">ADMIN</option>
          <option value="USER">USER</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
          className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="semua">Semua Status</option>
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
        </select>
      </div>

      {/* Tabel Users */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Pegawai</th>
                <th className="px-5 py-3.5 font-semibold">Jabatan &amp; Unit</th>
                <th className="px-5 py-3.5 font-semibold">Role</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold">Login Terakhir</th>
                <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Memuat daftar pengguna...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Belum ada data pengguna yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isAktif = u.deletedAt === null;
                  const isSelf = u.id === currentUserId;
                  const lockedByRole =
                    !isSuperAdmin && u.role === "SUPER_ADMIN";
                  const busy = busyUserId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">
                          {u.nama}
                          {isSelf && (
                            <span className="ml-2 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              Anda
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                        {u.nip && (
                          <p className="text-[11px] text-slate-400">
                            NIP: {u.nip}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-slate-800">{u.jabatan || "-"}</p>
                        <p className="text-xs text-slate-500">
                          {u.subUnitKerja || u.unitKerja || "-"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <select
                          value={u.role}
                          disabled={busy || lockedByRole}
                          onChange={(e) =>
                            void handleUpdateUser(u.id, {
                              role: e.target.value as Role,
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                          {(isSuperAdmin || u.role === "SUPER_ADMIN") && (
                            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                          )}
                        </select>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isAktif
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {isAktif ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString("id-ID")
                          : "Belum pernah"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={busy || isSelf || lockedByRole}
                          onClick={() =>
                            void handleUpdateUser(u.id, { aktif: !isAktif })
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors disabled:opacity-40 cursor-pointer ${
                            isAktif
                              ? "border-red-200 text-red-700 hover:bg-red-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
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

        {/* Paginasi */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
          <span>
            Total <strong>{totalUsers}</strong> pengguna — Halaman {page} dari{" "}
            {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Sebelumnya
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Berikutnya
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Tambah Pengguna dari SIMPEG */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Tambah Pengguna dari Master SIMPEG
                </h2>
                <p className="text-xs text-slate-500">
                  Cari pegawai BPVP lalu pilih role untuk didaftarkan ke
                  whitelist SIMPEL BPVP.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {simpegIsMock && (
                <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Sedang menggunakan <strong>Mode Mock SIMPEG</strong> lokal
                    (sambil menunggu <code>SIMPEG_API_KEY</code> asli dari
                    mentor).
                  </span>
                </div>
              )}

              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={simpegSearch}
                  onChange={(e) => setSimpegSearch(e.target.value)}
                  placeholder="Ketik nama, NIP, email, atau jabatan pegawai..."
                  className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {simpegLoading ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Mencari pegawai di SIMPEG...
                </div>
              ) : simpegList.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Pegawai tidak ditemukan.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {simpegList.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white hover:bg-slate-50/70"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-900 truncate">
                          {p.nama}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {p.email || "Tanpa email"} • NIP: {p.nip || "-"}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {p.jabatan || "-"} —{" "}
                          {p.subUnitKerja || p.unitKerja || "-"}
                        </p>
                      </div>

                      {p.isRegistered ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 shrink-0">
                          <Shield className="h-3.5 w-3.5" />
                          Terdaftar ({p.appRole})
                        </span>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={selectedRoles[p.id] || "USER"}
                            onChange={(e) =>
                              setSelectedRoles((prev) => ({
                                ...prev,
                                [p.id]: e.target.value as Role,
                              }))
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium"
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                            {isSuperAdmin && (
                              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                            )}
                          </select>
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
