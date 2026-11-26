"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import { UnitsModal, type SkkniUnitItem } from "@/components/skkni/UnitsModal";
import { SkkniActionModal } from "@/components/skkni/SkkniActionModal";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/providers/ToastProvider";
import {
  IconDownloadFill,
  IconFilterFill,
  IconDocumentFill,
  IconLayersFill,
  IconCheckCircleFill,
  IconCancelCircleFill,
  IconSearchFill,
} from "@/components/icons/FilledIcons";

interface SkkniRecord {
  id: string;
  numberKepmen: string;
  year: number | null;
  sector: string;
  agencyName: string | null;
  availability: string;
  notes: string | null;
  syncedAt: string;
  units: SkkniUnitItem[];
}

interface SkkniStats {
  totalDokumen: number;
  totalUnitKerja: number;
  jumlahBerlaku: number;
  jumlahDicabut: number;
}

interface FilterOptions {
  years: number[];
  sectors: string[];
  agencies: string[];
}

interface SkkniClientProps {
  userRole: Role;
}

const PAGE_SIZE = 15;

export function SkkniClient({ userRole }: SkkniClientProps) {
  const canManage = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const { showToast } = useToast();

  const [docs, setDocs] = useState<SkkniRecord[]>([]);
  const [stats, setStats] = useState<SkkniStats>({
    totalDokumen: 0,
    totalUnitKerja: 0,
    jumlahBerlaku: 0,
    jumlahDicabut: 0,
  });
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    years: [],
    sectors: [],
    agencies: [],
  });

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Default data yang muncul di awal adalah status Berlaku ("applied")
  const [availabilityFilter, setAvailabilityFilter] = useState("applied");
  const [yearFilter, setYearFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFiltered, setTotalFiltered] = useState(0);

  const [modalMode, setModalMode] = useState<"penuh" | "pilihan" | null>(null);
  const [activeUnitsDoc, setActiveUnitsDoc] = useState<SkkniRecord | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchLocalSkkni = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        availability: availabilityFilter,
      });
      if (search.trim()) qs.set("search", search.trim());
      if (yearFilter) qs.set("year", yearFilter);
      if (sectorFilter) qs.set("sector", sectorFilter);
      if (agencyFilter) qs.set("agency", agencyFilter);

      const res = await fetch(`/api/skkni?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal memuat data SKKNI.");

      setDocs(json.data || []);
      if (json.stats) setStats(json.stats);
      if (json.filterOptions) setFilterOptions(json.filterOptions);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalFiltered(json.pagination?.total || 0);
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memuat Data SKKNI",
        message:
          error instanceof Error ? error.message : "Gagal memuat data SKKNI.",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, availabilityFilter, yearFilter, sectorFilter, agencyFilter, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchLocalSkkni();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [fetchLocalSkkni]);

  const hasExtraFilter = Boolean(
    search.trim() ||
      availabilityFilter !== "applied" ||
      yearFilter ||
      sectorFilter ||
      agencyFilter
  );

  const resetFilters = () => {
    setSearch("");
    setAvailabilityFilter("applied");
    setYearFilter("");
    setSectorFilter("");
    setAgencyFilter("");
    setPage(1);
  };

  const handleDownloadPdf = async (doc: SkkniRecord) => {
    setDownloadingId(doc.id);
    try {
      const res = await fetch(`/api/skkni/${encodeURIComponent(doc.id)}/download`, {
        method: "GET",
      });

      if (!res.ok) {
        let errMsg = `Server mengembalikan HTTP ${res.status}.`;
        try {
          const json = await res.json();
          if (json?.message) errMsg = json.message;
        } catch {
          // Abaikan jika bukan JSON
        }
        throw new Error(errMsg);
      }

      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || `SKKNI ${doc.numberKepmen}.pdf`;

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast({
        type: "success",
        title: "Pengunduhan Berhasil",
        message: `Dokumen *${doc.numberKepmen}* (*${filename}*) berhasil diunduh ke perangkat Anda.`,
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Pengunduhan Gagal",
        message: `Gagal mengunduh *${doc.numberKepmen}*: ${
          error instanceof Error ? error.message : "Terjadi kesalahan jaringan."
        }`,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleLocalRowAction = async (
    doc: SkkniRecord,
    action: "UPDATE" | "ADD" | "SKIP"
  ) => {
    if (action === "SKIP") {
      showToast({
        type: "info",
        title: "Dokumen Dilewati",
        message: `Dokumen *${doc.numberKepmen}* dilewati tanpa perubahan.`,
      });
      return;
    }

    setRowBusyId(doc.id);
    try {
      const res = await fetch(`/api/skkni/${encodeURIComponent(doc.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Gagal memproses aksi.");

      showToast({
        type: "success",
        title: "Dokumen SKKNI Diperbarui",
        message: `Dokumen *${doc.numberKepmen}* berhasil diperbarui dari API resmi Kemnaker.`,
      });
      await fetchLocalSkkni();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memperbarui Dokumen",
        message:
          error instanceof Error
            ? error.message
            : "Gagal memperbarui dokumen SKKNI.",
      });
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header Judul + 2 Tombol Tarik Terpisah */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-[26px] font-bold tracking-tight text-black dark:text-white">
            Dokumen SKKNI
          </h1>
          <p className="mt-1 text-sm text-black/80 dark:text-slate-300">
            Kelola Standar Kompetensi Kerja Nasional Indonesia dari portal resmi
            Kemnaker menggunakan ID dokumen dan unit kompetensi asli.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setModalMode("pilihan")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-black dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <IconFilterFill className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Tarik Pilihan
            </button>

            <button
              type="button"
              onClick={() => setModalMode("penuh")}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors cursor-pointer"
            >
              <IconDownloadFill className="h-4 w-4" />
              Tarik Penuh
            </button>
          </div>
        )}
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-black dark:text-slate-300">
              Total Dokumen
            </p>
            <p className="mt-1.5 text-3xl font-bold text-black dark:text-white tabular-nums">
              {stats.totalDokumen.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <IconDocumentFill className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-black dark:text-slate-300">
              Total Unit Kerja
            </p>
            <p className="mt-1.5 text-3xl font-bold text-black dark:text-white tabular-nums">
              {stats.totalUnitKerja.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
            <IconLayersFill className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-black dark:text-slate-300">
              Status Berlaku
            </p>
            <p className="mt-1.5 text-3xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {stats.jumlahBerlaku.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
            <IconCheckCircleFill className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-black dark:text-slate-300">
              Status Dicabut
            </p>
            <p className="mt-1.5 text-3xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">
              {stats.jumlahDicabut.toLocaleString("id-ID")}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
            <IconCancelCircleFill className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar Lengkap (Status, Tahun, Sektor, Instansi Teknis) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <IconSearchFill className="h-4 w-4 text-black/50 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Cari Nomor/Tahun SKKNI, Judul sektor, Instansi Teknis, atau Keterangan..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-4 py-2.5 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {hasExtraFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
            >
              Reset Filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <SearchableSelect
            value={availabilityFilter}
            onChange={(val) => {
              setPage(1);
              setAvailabilityFilter(val || "applied");
            }}
            options={[
              { value: "applied", label: "Status: Berlaku" },
              { value: "cancelled", label: "Status: Dicabut" },
              { value: "semua", label: "Status: Semua" },
            ]}
            placeholder="Status: Berlaku"
            searchable={false}
            clearable={false}
            showResetOption={false}
            ariaLabel="Filter Status"
          />

          <SearchableSelect
            value={yearFilter}
            onChange={(val) => {
              setPage(1);
              setYearFilter(val);
            }}
            options={filterOptions.years.map((y) => ({
              value: String(y),
              label: `Tahun ${y}`,
            }))}
            placeholder="Semua Tahun"
            searchPlaceholder="Ketik tahun (misal: 2026)..."
            emptyText="Tahun tidak ditemukan."
            ariaLabel="Filter Tahun"
          />

          <SearchableSelect
            value={sectorFilter}
            onChange={(val) => {
              setPage(1);
              setSectorFilter(val);
            }}
            options={filterOptions.sectors.map((s) => ({
              value: s,
              label: s,
            }))}
            placeholder="Semua Sektor"
            searchPlaceholder="Ketik nama sektor..."
            emptyText="Sektor tidak ditemukan."
            ariaLabel="Filter Sektor"
          />

          <SearchableSelect
            value={agencyFilter}
            onChange={(val) => {
              setPage(1);
              setAgencyFilter(val);
            }}
            options={filterOptions.agencies.map((ag) => ({
              value: ag,
              label: ag,
            }))}
            placeholder={
              filterOptions.agencies.length > 0
                ? "Semua Instansi Teknis"
                : "Instansi Teknis (Tarik Penuh dulu)"
            }
            searchPlaceholder="Ketik nama instansi teknis..."
            emptyText="Instansi teknis tidak ditemukan."
            ariaLabel="Filter Instansi Teknis"
          />
        </div>
      </div>

      {/* Tabel Utama SKKNI (Header Bold Besar, Judul Rata Kiri, Kolom Lain Center, Zebra Striping) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[14px] font-bold text-black dark:text-white">
              <tr>
                <th className="px-3 py-3.5 text-center w-14">No</th>
                <th className="px-4 py-3.5 text-center w-52">
                  Nomor &amp; Tahun SKKNI
                </th>
                <th className="px-4 py-3.5 text-center">Judul</th>
                <th className="px-3 py-3.5 text-center w-28">Status</th>
                <th className="px-4 py-3.5 text-center w-44">Keterangan</th>
                <th className="px-3 py-3.5 text-center w-44">
                  Daftar Unit Kompetensi
                </th>
                <th className="px-3 py-3.5 text-center w-36">Unduh Dokumen</th>
                <th className="px-4 py-3.5 text-center w-44">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className="animate-pulse odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50"
                  >
                    {Array.from({ length: 8 }).map((__, colIdx) => (
                      <td key={colIdx} className="px-4 py-4">
                        <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700 mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-black/40 dark:text-slate-400 mb-3">
                      <IconDocumentFill className="h-6 w-6" />
                    </div>
                    <p className="text-base font-semibold text-black dark:text-slate-200">
                      Tidak ada dokumen SKKNI yang cocok
                    </p>
                    <p className="mt-1 text-sm text-black/75 dark:text-slate-400 max-w-md mx-auto">
                      Ubah filter pencarian di atas atau gunakan tombol{" "}
                      <strong>Tarik Penuh</strong> /{" "}
                      <strong>Tarik Pilihan</strong> untuk mengambil data
                      terbaru dari API SKKNI Kemnaker.
                    </p>
                  </td>
                </tr>
              ) : (
                docs.map((doc, idx) => {
                  const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                  const isApplied = doc.availability === "applied";
                  const busy = rowBusyId === doc.id;

                  return (
                    <tr
                      key={doc.id}
                      className="odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors font-normal"
                    >
                      <td className="px-3 py-3 text-center text-black dark:text-slate-300 tabular-nums">
                        {rowNum}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-black dark:text-white">
                          {doc.numberKepmen}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-left">
                        <p className="text-black dark:text-slate-100 leading-snug">
                          {doc.sector}
                        </p>
                        {doc.agencyName && (
                          <p className="text-[11.5px] text-black/70 dark:text-slate-400 mt-0.5">
                            {doc.agencyName}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                            isApplied
                              ? "bg-emerald-700 text-white dark:bg-emerald-600 dark:text-white"
                              : "bg-rose-700 text-white dark:bg-rose-600 dark:text-white"
                          }`}
                        >
                          {isApplied ? (
                            <IconCheckCircleFill className="h-3.5 w-3.5" />
                          ) : (
                            <IconCancelCircleFill className="h-3.5 w-3.5" />
                          )}
                          {isApplied ? "Berlaku" : "Dicabut"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-black dark:text-slate-200">
                        {doc.notes || "—"}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setActiveUnitsDoc(doc)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1.5 text-xs font-normal text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors cursor-pointer"
                        >
                          <IconLayersFill className="h-3.5 w-3.5" />
                          Lihat Unit ({doc.units.length})
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          disabled={downloadingId === doc.id}
                          onClick={() => void handleDownloadPdf(doc)}
                          title={`Unduh PDF ${doc.numberKepmen}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-black dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <IconDownloadFill className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          {downloadingId === doc.id
                            ? "Mengunduh..."
                            : "Unduh PDF"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SearchableSelect
                          value=""
                          disabled={!canManage || busy}
                          onChange={(val) => {
                            if (!val) return;
                            void handleLocalRowAction(
                              doc,
                              val as "UPDATE" | "ADD" | "SKIP"
                            );
                          }}
                          options={[
                            { value: "UPDATE", label: "Update Dokumen" },
                            { value: "ADD", label: "Tambah Data" },
                            { value: "SKIP", label: "Lewati" },
                          ]}
                          placeholder={busy ? "Memproses..." : "Pilih Aksi"}
                          searchable={false}
                          clearable={false}
                          showResetOption={false}
                          size="sm"
                          ariaLabel={`Aksi untuk ${doc.numberKepmen}`}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginasi 3 Kolom */}
        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={totalFiltered}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>

      {/* Modal Tarik Penuh / Tarik Pilihan */}
      <SkkniActionModal
        mode={modalMode}
        onClose={() => setModalMode(null)}
        onCommitted={(summary) => {
          showToast({
            type: "success",
            title: "Sinkronisasi SKKNI Berhasil",
            message: `Hasil penyimpanan: *${summary.addedCount} Ditambah*, *${summary.updatedCount} Diperbarui*, dan *${summary.skippedCount} Dilewati* (${summary.totalUnitsSaved.toLocaleString("id-ID")} unit kompetensi).`,
          });
          setPage(1);
          void fetchLocalSkkni();
        }}
      />

      {/* Modal Daftar Unit Kompetensi */}
      <UnitsModal
        open={Boolean(activeUnitsDoc)}
        onClose={() => setActiveUnitsDoc(null)}
        documentNumber={activeUnitsDoc?.numberKepmen || ""}
        sectorTitle={activeUnitsDoc?.sector || ""}
        units={activeUnitsDoc?.units || []}
      />
    </div>
  );
}
