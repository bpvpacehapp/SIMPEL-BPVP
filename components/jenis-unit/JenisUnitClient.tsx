"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/providers/ToastProvider";
import {
  IconCheckCircleFill,
  IconCloseFill,
  IconEditFill,
  IconLayersFill,
  IconPlusFill,
  IconRefreshFill,
  IconSearchFill,
  IconTrashFill,
} from "@/components/icons/FilledIcons";

interface JenisUnitRecord {
  id: string;
  jenisUnit: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JenisUnitStats {
  totalAktif: number;
  totalTerhapus: number;
}

interface JenisUnitClientProps {
  userRole: Role;
}

const PAGE_SIZE = 15;

export function JenisUnitClient({ userRole }: JenisUnitClientProps) {
  const canEdit = userRole !== "USER";
  const { showToast } = useToast();

  const [rows, setRows] = useState<JenisUnitRecord[]>([]);
  const [stats, setStats] = useState<JenisUnitStats>({
    totalAktif: 0,
    totalTerhapus: 0,
  });

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("aktif");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  // Modal Tambah / Edit
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<JenisUnitRecord | null>(null);
  const [jenisUnitInput, setJenisUnitInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal Konfirmasi Soft Delete
  const [deleteTarget, setDeleteTarget] = useState<JenisUnitRecord | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  // Restore busy state
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        status: statusFilter,
      });
      if (search.trim()) qs.set("search", search.trim());

      const res = await fetch(`/api/jenis-unit-kompetensi?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.message || "Gagal memuat data Jenis Unit Kompetensi."
        );
      }

      setRows(json.data || []);
      if (json.stats) setStats(json.stats);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalFiltered(json.pagination?.total || 0);
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memuat Data",
        message:
          error instanceof Error
            ? error.message
            : "Gagal memuat data Jenis Unit Kompetensi.",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData();
    }, 180);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const openAddModal = () => {
    setEditingRow(null);
    setJenisUnitInput("");
    setFormOpen(true);
  };

  const openEditModal = (row: JenisUnitRecord) => {
    setEditingRow(row);
    setJenisUnitInput(row.jenisUnit);
    setFormOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = jenisUnitInput.trim();
    if (!cleaned) {
      showToast({
        type: "error",
        title: "Jenis Unit Wajib Diisi",
        message: "Masukkan nama jenis unit kompetensi terlebih dahulu.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const url = editingRow
        ? `/api/jenis-unit-kompetensi/${editingRow.id}`
        : "/api/jenis-unit-kompetensi";
      const method = editingRow ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jenisUnit: cleaned }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menyimpan data.");
      }

      showToast({
        type: "success",
        title: editingRow ? "Jenis Unit Diperbarui" : "Jenis Unit Ditambahkan",
        message: editingRow
          ? `Jenis unit berhasil diperbarui menjadi *${cleaned}*.`
          : `Jenis unit *${cleaned}* berhasil ditambahkan.`,
      });
      setFormOpen(false);
      void fetchData();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menyimpan",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menyimpan data.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/jenis-unit-kompetensi/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menghapus data.");
      }

      showToast({
        type: "success",
        title: "Berhasil Dihapus Sementara",
        message: `Jenis unit *${deleteTarget.jenisUnit}* telah dipindahkan ke data terhapus.`,
      });
      setDeleteTarget(null);
      void fetchData();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menghapus",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menghapus data.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async (row: JenisUnitRecord) => {
    setRestoringId(row.id);
    try {
      const res = await fetch(`/api/jenis-unit-kompetensi/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal memulihkan data.");
      }

      showToast({
        type: "success",
        title: "Jenis Unit Dipulihkan",
        message: `Jenis unit *${row.jenisUnit}* kembali aktif.`,
      });
      void fetchData();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memulihkan",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat memulihkan data.",
      });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12.5px] font-semibold uppercase tracking-wide text-black dark:text-slate-300">
            Administrasi
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
            Jenis Unit Kompetensi
          </h1>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-800 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <IconPlusFill className="h-4 w-4" />
            Tambah Jenis Unit
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-black dark:text-slate-300">
              Total Jenis Unit Aktif
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-800 text-white dark:bg-blue-600">
              <IconLayersFill className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-black dark:text-white">
            {stats.totalAktif.toLocaleString("id-ID")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-black dark:text-slate-300">
              Data Terhapus (Soft Delete)
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-700 text-white">
              <IconTrashFill className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-black dark:text-white">
            {stats.totalTerhapus.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {/* Filter & Table Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 md:grid-cols-12 dark:border-slate-800">
          <div className="relative md:col-span-9">
            <IconSearchFill className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari jenis unit kompetensi..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-[13.5px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          <div className="md:col-span-3">
            <SearchableSelect
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val || "aktif");
                setPage(1);
              }}
              placeholder="Status Data"
              searchable={false}
              clearable={false}
              options={[
                { value: "aktif", label: "Aktif" },
                { value: "terhapus", label: "Terhapus" },
                { value: "semua", label: "Semua Data" },
              ]}
            />
          </div>
        </div>

        {/* Table (kolom data hanya Jenis Unit) */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead className="bg-slate-100 text-[14px] font-bold text-black dark:bg-slate-800 dark:text-white">
              <tr>
                <th className="w-16 border-b border-slate-200 px-4 py-3.5 text-center dark:border-slate-700">
                  No
                </th>
                <th className="border-b border-slate-200 px-4 py-3.5 text-center dark:border-slate-700">
                  Jenis Unit
                </th>
                {canEdit && (
                  <th className="w-48 border-b border-slate-200 px-4 py-3.5 text-center dark:border-slate-700">
                    Aksi
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={canEdit ? 3 : 2}
                    className="px-4 py-12 text-center text-black dark:text-slate-300"
                  >
                    Memuat data Jenis Unit Kompetensi...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 3 : 2}
                    className="px-4 py-12 text-center text-black dark:text-slate-300"
                  >
                    Belum ada data jenis unit kompetensi pada filter ini.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                  const isDeleted = Boolean(row.deletedAt);

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-200/80 odd:bg-white even:bg-slate-50/90 hover:bg-blue-50/50 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800/50 dark:hover:bg-slate-800/80"
                    >
                      <td className="px-4 py-3 text-center font-normal text-black dark:text-slate-200">
                        {rowNum}
                      </td>
                      <td className="px-4 py-3 text-left font-normal text-black dark:text-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={isDeleted ? "line-through" : ""}>
                            {row.jenisUnit}
                          </span>
                          {isDeleted && (
                            <span className="rounded-md bg-rose-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                              Terhapus
                            </span>
                          )}
                        </div>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-center">
                          {isDeleted ? (
                            <button
                              type="button"
                              disabled={restoringId === row.id}
                              onClick={() => void handleRestore(row)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
                            >
                              <IconRefreshFill className="h-3.5 w-3.5" />
                              {restoringId === row.id ? "..." : "Pulihkan"}
                            </button>
                          ) : (
                            <div className="inline-flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditModal(row)}
                                className="inline-flex items-center gap-1 rounded-lg border border-blue-800 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-800 transition-colors hover:bg-blue-50 dark:border-blue-500 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/60"
                              >
                                <IconEditFill className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(row)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-600 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-500 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
                              >
                                <IconTrashFill className="h-3.5 w-3.5" />
                                Hapus
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={totalFiltered}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="jenis unit"
          />
        </div>
      </div>

      {/* Modal Tambah / Edit */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => !submitting && setFormOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-800 text-white dark:bg-blue-600">
                  {editingRow ? (
                    <IconEditFill className="h-4 w-4" />
                  ) : (
                    <IconPlusFill className="h-5 w-5" />
                  )}
                </div>
                <h3 className="text-[15.5px] font-bold text-black dark:text-white">
                  {editingRow
                    ? "Edit Jenis Unit Kompetensi"
                    : "Tambah Jenis Unit Kompetensi"}
                </h3>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <IconCloseFill className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-black dark:text-white">
                  Jenis Unit <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={jenisUnitInput}
                  onChange={(e) => setJenisUnitInput(e.target.value)}
                  placeholder="Contoh: SKKNI, Softskill, Produktivitas..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[13.5px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  <IconCheckCircleFill className="h-4 w-4" />
                  {submitting ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Soft Delete */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-700 text-white">
                  <IconTrashFill className="h-5 w-5" />
                </div>
                <h3 className="text-[15.5px] font-bold text-black dark:text-white">
                  Hapus Jenis Unit?
                </h3>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <IconCloseFill className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 p-5 text-[13.5px] text-black dark:text-slate-200">
              <p>
                Hapus sementara jenis unit{" "}
                <strong>{deleteTarget.jenisUnit}</strong>? Data tetap tersimpan
                (soft delete) dan dapat dipulihkan kembali melalui filter{" "}
                <strong>Terhapus</strong>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
              >
                <IconTrashFill className="h-4 w-4" />
                {deleting ? "Menghapus..." : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
