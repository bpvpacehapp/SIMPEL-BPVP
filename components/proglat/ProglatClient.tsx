"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import {
  ProglatActionModal,
  type ProglatCommitSummary,
} from "@/components/proglat/ProglatActionModal";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/providers/ToastProvider";
import { getProglatTypeBadgeClass } from "@/lib/proglat-types";
import {
  IconBookFill,
  IconDownloadFill,
  IconFilterFill,
  IconLayersFill,
  IconSearchFill,
  IconEditFill,
  IconEyeFill,
  IconCheckCircleFill,
  IconRefreshFill,
  IconCloseFill,
} from "@/components/icons/FilledIcons";

interface ProglatRecord {
  id: string;
  code: string | null;
  title: string;
  totalModules: number;
  totalDuration: number;
  type: string | null;
  vocationalName: string | null;
  subVocationalName: string | null;
  downloadMaterialUri: string | null;
  isManualEdited: boolean;
  syncedAt: string;
  _count: { topics: number };
}

interface ProglatStats {
  totalProgram: number;
  totalTopics: number;
  totalDurasiJp: number;
  totalManualEdited: number;
}

interface FilterOptions {
  types: string[];
  vocationals: string[];
}

interface ProglatClientProps {
  userRole: Role;
}

const PAGE_SIZE = 15;

export function ProglatClient({ userRole }: ProglatClientProps) {
  const canPull = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const canEdit = userRole !== "USER";
  const { showToast } = useToast();

  const [programs, setPrograms] = useState<ProglatRecord[]>([]);
  const [stats, setStats] = useState<ProglatStats>({
    totalProgram: 0,
    totalTopics: 0,
    totalDurasiJp: 0,
    totalManualEdited: 0,
  });
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    types: [],
    vocationals: [],
  });

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [vocationalFilter, setVocationalFilter] = useState("");
  const [editFilter, setEditFilter] = useState("semua");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  const [modalMode, setModalMode] = useState<"penuh" | "pilihan" | null>(null);
  const [confirmResetProg, setConfirmResetProg] =
    useState<ProglatRecord | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const fetchLocalPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        editFilter,
      });
      if (search.trim()) qs.set("search", search.trim());
      if (typeFilter) qs.set("type", typeFilter);
      if (vocationalFilter) qs.set("vocational", vocationalFilter);

      const res = await fetch(`/api/proglat?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal memuat data Program Pelatihan.");
      }

      setPrograms(json.data || []);
      if (json.stats) setStats(json.stats);
      if (json.filterOptions) setFilterOptions(json.filterOptions);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalFiltered(json.pagination?.total || 0);
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memuat Program Pelatihan",
        message:
          error instanceof Error
            ? error.message
            : "Gagal memuat data Program Pelatihan.",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, vocationalFilter, editFilter, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchLocalPrograms();
    }, 180);
    return () => clearTimeout(timer);
  }, [fetchLocalPrograms]);

  const handleCommitted = (summary: ProglatCommitSummary) => {
    showToast({
      type: "success",
      title: "Sinkronisasi Program Pelatihan Selesai",
      message: `*${summary.addedCount} program* ditambah, *${summary.updatedCount} program* diperbarui, *${summary.skippedCount} program* dilewati (*${summary.totalTopicsSaved} unit kompetensi*).`,
    });
    setPage(1);
    void fetchLocalPrograms();
  };

  const handleConfirmReset = async () => {
    if (!confirmResetProg) return;
    setResettingId(confirmResetProg.id);
    try {
      const res = await fetch(`/api/proglat/${confirmResetProg.id}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "all" }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal mereset data program.");
      }
      showToast({
        type: "success",
        title: "Reset ke Bawaan API Berhasil",
        message: `Program *${confirmResetProg.title}* telah dikembalikan ke data asli API Proglat Kemnaker.`,
      });
      setConfirmResetProg(null);
      void fetchLocalPrograms();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Mereset Program",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menarik ulang data asli program.",
      });
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
            Program Pelatihan
          </h1>
          <p className="mt-1 text-[13.5px] text-black dark:text-slate-300">
            Data program pelatihan dari Proglat Kemnaker beserta unit kompetensi
            dan pratinjau dokumen PDF resmi.
          </p>
        </div>

        {canPull && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setModalMode("pilihan")}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-800 bg-white px-4 py-2.5 text-[13.5px] font-semibold text-blue-800 shadow-sm transition-colors hover:bg-blue-50 dark:border-blue-500 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/60"
            >
              <IconFilterFill className="h-4 w-4" />
              Tarik Pilihan
            </button>
            <button
              type="button"
              onClick={() => setModalMode("penuh")}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-800 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              <IconDownloadFill className="h-4 w-4" />
              Tarik Penuh
            </button>
          </div>
        )}
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-black dark:text-slate-300">
              Total Program
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-800 text-white dark:bg-blue-600">
              <IconBookFill className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-black dark:text-white">
            {stats.totalProgram.toLocaleString("id-ID")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-black dark:text-slate-300">
              Total Unit Kompetensi
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <IconLayersFill className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-black dark:text-white">
            {stats.totalTopics.toLocaleString("id-ID")}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-black dark:text-slate-300">
              Akumulasi Durasi (JP)
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white">
              <IconCheckCircleFill className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-black dark:text-white">
            {stats.totalDurasiJp.toLocaleString("id-ID")} JP
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-black dark:text-slate-300">
              Disesuaikan Manual
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-700 text-white">
              <IconEditFill className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-black dark:text-white">
            {stats.totalManualEdited.toLocaleString("id-ID")}
          </p>
        </div>
      </div>

      {/* Filter & Table Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Filter Bar */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 md:grid-cols-12 dark:border-slate-800">
          <div className="relative md:col-span-5">
            <IconSearchFill className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari judul program, kode program, atau kejuruan..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-[13.5px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          <div className="md:col-span-2">
            <SearchableSelect
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val);
                setPage(1);
              }}
              placeholder="Semua Tipe"
              options={filterOptions.types.map((t) => ({
                value: t,
                label: t.toUpperCase(),
              }))}
            />
          </div>

          <div className="md:col-span-3">
            <SearchableSelect
              value={vocationalFilter}
              onChange={(val) => {
                setVocationalFilter(val);
                setPage(1);
              }}
              placeholder="Semua Kejuruan"
              options={filterOptions.vocationals.map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </div>

          <div className="md:col-span-2">
            <SearchableSelect
              value={editFilter}
              onChange={(val) => {
                setEditFilter(val || "semua");
                setPage(1);
              }}
              placeholder="Status Edit"
              searchable={false}
              clearable={false}
              options={[
                { value: "semua", label: "Semua Status" },
                { value: "manual", label: "Disesuaikan Manual" },
                { value: "asli", label: "Asli API Proglat" },
              ]}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px]">
            <thead className="bg-slate-100 text-[14px] font-bold text-black dark:bg-slate-800 dark:text-white">
              <tr>
                <th className="w-12 border-b border-slate-200 px-3.5 py-3.5 text-center dark:border-slate-700">
                  No
                </th>
                <th className="w-40 border-b border-slate-200 px-3.5 py-3.5 text-center dark:border-slate-700">
                  Kode Program
                </th>
                <th className="border-b border-slate-200 px-3.5 py-3.5 text-center dark:border-slate-700">
                  Judul Program
                </th>
                <th className="w-28 border-b border-slate-200 px-3.5 py-3.5 text-center dark:border-slate-700">
                  Tipe
                </th>
                <th className="w-28 border-b border-slate-200 px-3.5 py-3.5 text-center dark:border-slate-700">
                  Total Modul
                </th>
                <th className="w-32 border-b border-slate-200 px-3.5 py-3.5 text-center dark:border-slate-700">
                  Total Durasi
                </th>
                <th className="w-44 border-b border-slate-200 px-3.5 py-3.5 text-center dark:border-slate-700">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-slate-500 dark:text-slate-400"
                  >
                    Memuat data Program Pelatihan...
                  </td>
                </tr>
              ) : programs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-slate-500 dark:text-slate-400"
                  >
                    {stats.totalProgram === 0
                      ? "Belum ada data Program Pelatihan tersimpan. Gunakan tombol Tarik Pilihan atau Tarik Penuh di atas."
                      : "Tidak ada Program Pelatihan yang cocok dengan pencarian atau filter."}
                  </td>
                </tr>
              ) : (
                programs.map((prog, idx) => {
                  const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                  return (
                    <tr
                      key={prog.id}
                      className="border-b border-slate-200/80 odd:bg-white even:bg-slate-50/90 hover:bg-blue-50/50 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800/50 dark:hover:bg-slate-800/80"
                    >
                      <td className="px-3.5 py-3 text-center font-normal text-black dark:text-slate-200">
                        {rowNum}
                      </td>
                      <td className="px-3.5 py-3 text-center font-mono text-[12.5px] font-normal text-black dark:text-slate-200">
                        {prog.code || "-"}
                      </td>
                      <td className="px-3.5 py-3 text-left font-normal text-black dark:text-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{prog.title}</span>
                          {prog.isManualEdited && (
                            <span className="rounded-md bg-indigo-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                              Manual
                            </span>
                          )}
                        </div>
                        {prog.vocationalName && (
                          <div className="mt-0.5 text-[12px] text-black dark:text-slate-300">
                            {prog.vocationalName}
                            {prog.subVocationalName
                              ? ` • ${prog.subVocationalName}`
                              : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-center font-normal">
                        <span
                          className={`inline-block rounded-md px-2.5 py-0.5 text-[11.5px] font-semibold uppercase ${getProglatTypeBadgeClass(prog.type)}`}
                        >
                          {prog.type || "-"}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-center font-normal text-black dark:text-slate-200">
                        {prog.totalModules}
                      </td>
                      <td className="px-3.5 py-3 text-center font-normal text-black dark:text-slate-200">
                        {prog.totalDuration} JP
                      </td>
                      <td className="px-3.5 py-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <Link
                            href={`/administrasi/program-pelatihan/${prog.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500"
                          >
                            <IconEyeFill className="h-3.5 w-3.5" />
                            Detail
                          </Link>
                          {canEdit && prog.isManualEdited && (
                            <button
                              type="button"
                              onClick={() => setConfirmResetProg(prog)}
                              disabled={resettingId === prog.id}
                              title="Kembalikan data program & unit kompetensi ke bawaan API Proglat"
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-600 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500 dark:bg-slate-900 dark:text-amber-400 dark:hover:bg-amber-950/50"
                            >
                              <IconRefreshFill className="h-3.5 w-3.5" />
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={totalFiltered}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="program"
          />
        </div>
      </div>

      {/* Pull Modal */}
      <ProglatActionModal
        mode={modalMode}
        onClose={() => setModalMode(null)}
        onCommitted={handleCommitted}
      />

      {/* Reset Confirmation Modal */}
      {confirmResetProg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => !resettingId && setConfirmResetProg(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white">
                  <IconRefreshFill className="h-5 w-5" />
                </div>
                <h3 className="text-[15.5px] font-bold text-black dark:text-white">
                  Reset ke Bawaan API?
                </h3>
              </div>
              <button
                type="button"
                disabled={Boolean(resettingId)}
                onClick={() => setConfirmResetProg(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <IconCloseFill className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5 text-[13.5px] text-black dark:text-slate-200">
              <p>
                Seluruh penyesuaian manual pada program{" "}
                <strong>{confirmResetProg.title}</strong> beserta unit
                kompetensinya akan dikembalikan sesuai data terbaru dari API
                Proglat Kemnaker.
              </p>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                Label <strong>Manual</strong> akan dilepas sehingga program ini
                kembali mengikuti pembaruan otomatis saat penarikan berikutnya.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <button
                type="button"
                disabled={Boolean(resettingId)}
                onClick={() => setConfirmResetProg(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={Boolean(resettingId)}
                onClick={() => void handleConfirmReset()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                <IconRefreshFill className="h-4 w-4" />
                {resettingId ? "Menarik Ulang..." : "Ya, Reset Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
