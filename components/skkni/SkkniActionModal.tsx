"use client";

import { useEffect, useMemo, useState } from "react";
import { UnitsModal, type SkkniUnitItem } from "@/components/skkni/UnitsModal";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { useToast } from "@/components/providers/ToastProvider";
import {
  IconCloseFill,
  IconDownloadFill,
  IconFilterFill,
  IconLayersFill,
  IconSearchFill,
  IconCheckCircleFill,
  IconCancelCircleFill,
} from "@/components/icons/FilledIcons";

type RowAction = "ADD" | "UPDATE" | "SKIP";
type SyncStatus = "NEW" | "CHANGED" | "UP_TO_DATE";

interface PreviewDocument {
  id: string;
  number_kepmen: string;
  year?: number | null;
  sector: string;
  agency_name?: string | null;
  availability: string;
  notes?: string | null;
  unitsCount: number;
  existsInLocal: boolean;
  syncStatus: SyncStatus;
  defaultAction: RowAction;
}

export interface CommitSummary {
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  totalUnitsSaved: number;
}

interface SkkniActionModalProps {
  mode: "penuh" | "pilihan" | null;
  onClose: () => void;
  onCommitted: (summary: CommitSummary) => void;
}

const MODAL_PAGE_SIZE = 15;

export function SkkniActionModal({
  mode,
  onClose,
  onCommitted,
}: SkkniActionModalProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<"filter" | "review" | "confirm">("filter");
  const [activeTab, setActiveTab] = useState<"all" | "new" | "changed">("all");

  // Form filter untuk mode Tarik Pilihan
  const [filterNumber, setFilterNumber] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [filterTag, setFilterTag] = useState("");

  // State data & aksi
  const [fetching, setFetching] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUpToDate, setIsUpToDate] = useState(false);
  const [previewDocs, setPreviewDocs] = useState<PreviewDocument[]>([]);
  const [actionsMap, setActionsMap] = useState<Record<string, RowAction>>({});
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPage, setReviewPage] = useState(1);

  const [activeUnitDoc, setActiveUnitDoc] = useState<{
    number_kepmen: string;
    sector: string;
    units: SkkniUnitItem[];
  } | null>(null);
  const [loadingUnitsId, setLoadingUnitsId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const runFetch = async (
    targetMode: "penuh" | "pilihan",
    filters?: {
      number: string;
      year?: string;
      sector?: string;
      tag?: string;
    }
  ) => {
    setFetching(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/skkni/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: targetMode,
          filters,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menarik data dari API SKKNI.");
      }

      const list: PreviewDocument[] = json.data || [];
      const initialActions: Record<string, RowAction> = {};
      for (const doc of list) {
        initialActions[doc.id] = doc.defaultAction;
      }

      setPreviewDocs(list);
      setActionsMap(initialActions);
      const upToDate = Boolean(json.meta?.isUpToDate);
      setIsUpToDate(upToDate);
      setActiveTab("all");
      setReviewSearch("");
      setReviewPage(1);
      setStep("review");

      if (upToDate) {
        showToast({
          type: "success",
          title: "Data SKKNI Sudah Terbaru",
          message: `Seluruh *${list.length.toLocaleString("id-ID")} Dokumen* sudah sesuai dengan API resmi Kemnaker. Tidak ada dokumen baru maupun pembaruan.`,
        });
      } else {
        showToast({
          type: "info",
          title: "Data SKKNI Berhasil Ditarik",
          message: `Ditarik *${list.length.toLocaleString("id-ID")} Dokumen* dari Kemnaker (*${json.meta?.newCount ?? 0} Dokumen Baru*, *${json.meta?.changedCount ?? 0} Pembaruan*).`,
        });
      }
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menarik data SKKNI."
      );
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!mode) return;
    setErrorMsg(null);
    setIsUpToDate(false);
    setPreviewDocs([]);
    setActionsMap({});
    setReviewSearch("");
    setReviewPage(1);
    setActiveTab("all");

    if (mode === "penuh") {
      setStep("review");
      void runFetch("penuh");
    } else {
      setStep("filter");
    }
  }, [mode]);

  const newDocsCount = useMemo(
    () => previewDocs.filter((d) => d.syncStatus === "NEW").length,
    [previewDocs]
  );

  const changedDocsCount = useMemo(
    () => previewDocs.filter((d) => d.syncStatus === "CHANGED").length,
    [previewDocs]
  );

  const filteredPreview = useMemo(() => {
    let base =
      activeTab === "new"
        ? previewDocs.filter((d) => d.syncStatus === "NEW")
        : activeTab === "changed"
          ? previewDocs.filter((d) => d.syncStatus === "CHANGED")
          : previewDocs;

    const q = reviewSearch.trim().toLowerCase();
    if (q) {
      base = base.filter(
        (d) =>
          (d.number_kepmen || "").toLowerCase().includes(q) ||
          (d.sector || "").toLowerCase().includes(q) ||
          (d.notes || "").toLowerCase().includes(q)
      );
    }
    return base;
  }, [previewDocs, activeTab, reviewSearch]);

  const totalReviewPages = Math.max(
    1,
    Math.ceil(filteredPreview.length / MODAL_PAGE_SIZE)
  );

  const paginatedPreview = useMemo(() => {
    const start = (reviewPage - 1) * MODAL_PAGE_SIZE;
    return filteredPreview.slice(start, start + MODAL_PAGE_SIZE);
  }, [filteredPreview, reviewPage]);

  const actionSummary = useMemo(() => {
    let add = 0;
    let update = 0;
    let skip = 0;
    for (const doc of previewDocs) {
      const act = actionsMap[doc.id] || doc.defaultAction;
      if (act === "ADD") add++;
      else if (act === "UPDATE") update++;
      else skip++;
    }
    return { add, update, skip, total: previewDocs.length };
  }, [previewDocs, actionsMap]);

  const setAllAction = (strategy: "auto" | "SKIP") => {
    const next: Record<string, RowAction> = {};
    for (const doc of previewDocs) {
      next[doc.id] = strategy === "SKIP" ? "SKIP" : doc.defaultAction;
    }
    setActionsMap(next);
  };

  const handleOpenPreviewUnits = async (doc: PreviewDocument) => {
    setLoadingUnitsId(doc.id);
    try {
      const res = await fetch(
        `/api/skkni/preview-units/${encodeURIComponent(doc.id)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      setActiveUnitDoc({
        number_kepmen: doc.number_kepmen,
        sector: doc.sector,
        units: Array.isArray(json.data) ? json.data : [],
      });
    } catch {
      setErrorMsg("Gagal memuat daftar unit kompetensi untuk dokumen ini.");
    } finally {
      setLoadingUnitsId(null);
    }
  };

  const handleCommit = async () => {
    if (!mode) return;
    setCommitting(true);
    setErrorMsg(null);
    try {
      // Hanya kirim ID & aksi untuk ADD/UPDATE (payload ringan ~KB, bukan MB!)
      const activeItems: Array<{ id: string; action: RowAction }> = [];
      let skippedCount = 0;

      for (const doc of previewDocs) {
        const act = actionsMap[doc.id] || doc.defaultAction;
        if (act === "SKIP") {
          skippedCount++;
        } else {
          activeItems.push({ id: doc.id, action: act });
        }
      }

      const res = await fetch("/api/skkni/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, skippedCount, items: activeItems }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menyimpan data SKKNI.");
      }

      onCommitted(
        json.summary || {
          addedCount: 0,
          updatedCount: 0,
          skippedCount,
          totalUnitsSaved: 0,
        }
      );
      onClose();
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan data SKKNI ke database lokal."
      );
    } finally {
      setCommitting(false);
    }
  };

  const handleDownloadPdf = async (doc: PreviewDocument) => {
    setDownloadingId(doc.id);
    try {
      const res = await fetch(
        `/api/skkni/${encodeURIComponent(doc.id)}/download`,
        { method: "GET" }
      );

      if (!res.ok) {
        let errMsg = `Server mengembalikan HTTP ${res.status}.`;
        try {
          const json = await res.json();
          if (json?.message) errMsg = json.message;
        } catch {
          // Abaikan
        }
        throw new Error(errMsg);
      }

      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || `SKKNI ${doc.number_kepmen}.pdf`;

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
        message: `Dokumen *${doc.number_kepmen}* (*${filename}*) berhasil diunduh ke perangkat Anda.`,
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Pengunduhan Gagal",
        message: `Gagal mengunduh *${doc.number_kepmen}*: ${
          error instanceof Error ? error.message : "Terjadi kesalahan jaringan."
        }`,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (!mode) return null;

  const isFull = mode === "penuh";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skkni-action-modal-title"
      >
        <div
          className={`w-full ${
            step === "review"
              ? "max-w-[94vw] h-[88vh]"
              : "max-w-2xl max-h-[90vh]"
          } rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden transition-all duration-200`}
        >
          {/* Header Modal */}
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                {isFull ? (
                  <IconDownloadFill className="h-5 w-5" />
                ) : (
                  <IconFilterFill className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <h2
                  id="skkni-action-modal-title"
                  className="text-lg font-bold text-black dark:text-white"
                >
                  {isFull
                    ? "Tarik Penuh Data SKKNI"
                    : "Tarik Pilihan Data SKKNI"}
                </h2>
                <p className="text-xs text-black/75 dark:text-slate-400">
                  {step === "filter" &&
                    "Tentukan kriteria dokumen yang ingin ditarik dari API SKKNI Kemnaker."}
                  {step === "review" &&
                    "Tinjau dokumen yang belum terdaftar maupun yang sudah ada sebelum konfirmasi akhir."}
                  {step === "confirm" &&
                    "Konfirmasi akhir sebelum menyimpan dokumen menggunakan ID asli API Kemnaker."}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={fetching || committing}
              onClick={onClose}
              aria-label="Tutup"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-black dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <IconCloseFill className="h-5 w-5" />
            </button>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="mx-6 mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-900 dark:text-rose-200 flex items-center gap-2">
              <IconCancelCircleFill className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1 (Khusus Tarik Pilihan): Form Filter */}
          {step === "filter" && (
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-black dark:text-slate-200 mb-1.5">
                      Nomor Dokumen <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={filterNumber}
                      onChange={(e) => setFilterNumber(e.target.value)}
                      placeholder="Contoh: 299"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-black dark:text-slate-200 mb-1.5">
                      Tahun{" "}
                      <span className="text-black/60 dark:text-slate-400 font-normal">
                        (Opsional)
                      </span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={filterYear}
                      onChange={(e) =>
                        setFilterYear(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="Contoh: 2026"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-black dark:text-slate-200 mb-1.5">
                      Judul / Sektor{" "}
                      <span className="text-black/60 dark:text-slate-400 font-normal">
                        (Opsional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={filterSector}
                      onChange={(e) => setFilterSector(e.target.value)}
                      placeholder="Contoh: Green Soft Skills, TIK"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-black dark:text-slate-200 mb-1.5">
                      Tag{" "}
                      <span className="text-black/60 dark:text-slate-400 font-normal">
                        (Opsional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={filterTag}
                      onChange={(e) => setFilterTag(e.target.value)}
                      placeholder="Contoh: Green Jobs"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>

              {fetching && (
                <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-950 dark:text-blue-200 font-medium flex items-center gap-3">
                  <span className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0" />
                  <span>
                    Menarik &amp; menyaring data dari API SKKNI Kemnaker...
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={fetching}
                  onClick={onClose}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={fetching || !filterNumber.trim()}
                  onClick={() =>
                    void runFetch("pilihan", {
                      number: filterNumber.trim(),
                      year: filterYear.trim() || undefined,
                      sector: filterSector.trim() || undefined,
                      tag: filterTag.trim() || undefined,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  <IconFilterFill className="h-4 w-4" />
                  {fetching ? "Menarik Data..." : "Tarik Pilihan"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: REVIEW TABLE WITH TABS */}
          {step === "review" && (
            <>
              {fetching ? (
                <div className="flex-1 px-6 flex flex-col items-center justify-center gap-3 text-center">
                  <span className="h-8 w-8 rounded-full border-[3px] border-blue-600 border-t-transparent animate-spin" />
                  <p className="text-base font-bold text-black dark:text-white">
                    Menarik Seluruh Dokumen dari API SKKNI Kemnaker...
                  </p>
                  <p className="text-sm text-black/75 dark:text-slate-400 max-w-md">
                    Sistem sedang mengambil seluruh halaman dokumen beserta unit
                    kompetensi &amp; instansi teknis lalu membandingkannya
                    dengan database lokal.
                  </p>
                </div>
              ) : (
                <>
                  {/* Strip Browser-Style Tabs di Atas Panel Tabel */}
                  <div
                    className="px-6 pt-3 bg-slate-100/80 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex items-end gap-1 overflow-x-auto shrink-0"
                    role="tablist"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "all"}
                      onClick={() => {
                        setActiveTab("all");
                        setReviewPage(1);
                      }}
                      className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2 text-xs font-semibold border-t border-x transition-colors cursor-pointer whitespace-nowrap ${
                        activeTab === "all"
                          ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-400 -mb-px relative z-10"
                          : "bg-slate-200/70 dark:bg-slate-800/60 border-transparent text-black/75 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>Seluruh Dokumen</span>
                      <span className="rounded-md bg-slate-200/90 dark:bg-slate-700 px-1.5 py-0.5 text-[11px] tabular-nums text-black dark:text-slate-200">
                        {previewDocs.length.toLocaleString("id-ID")}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "new"}
                      onClick={() => {
                        setActiveTab("new");
                        setReviewPage(1);
                      }}
                      className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2 text-xs font-semibold border-t border-x transition-colors cursor-pointer whitespace-nowrap ${
                        activeTab === "new"
                          ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-400 -mb-px relative z-10"
                          : "bg-slate-200/70 dark:bg-slate-800/60 border-transparent text-black/75 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>Dokumen Terbaru</span>
                      <span className="rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 text-[11px] tabular-nums">
                        {newDocsCount.toLocaleString("id-ID")}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "changed"}
                      onClick={() => {
                        setActiveTab("changed");
                        setReviewPage(1);
                      }}
                      className={`inline-flex items-center gap-2 rounded-t-xl px-4 py-2 text-xs font-semibold border-t border-x transition-colors cursor-pointer whitespace-nowrap ${
                        activeTab === "changed"
                          ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 -mb-px relative z-10"
                          : "bg-slate-200/70 dark:bg-slate-800/60 border-transparent text-black/75 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>Pembaruan</span>
                      <span className="rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-300 px-1.5 py-0.5 text-[11px] tabular-nums">
                        {changedDocsCount.toLocaleString("id-ID")}
                      </span>
                    </button>
                  </div>

                  {/* Toolbar Pencarian & Badge Menyatu di Antara Tab dan Header Tabel */}
                  <div className="px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
                    <div className="relative flex-1 min-w-[260px]">
                      <IconSearchFill className="h-4 w-4 text-black/50 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={reviewSearch}
                        onChange={(e) => {
                          setReviewPage(1);
                          setReviewSearch(e.target.value);
                        }}
                        placeholder="Cari nomor SKKNI, judul sektor, atau keterangan di hasil tarikan..."
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 pl-10 pr-4 py-2 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-slate-950 focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                      {isUpToDate && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-700 text-white px-2.5 py-1 font-semibold">
                          <IconCheckCircleFill className="h-3.5 w-3.5" />
                          Sudah Terbaru
                        </span>
                      )}
                      <span className="rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-2.5 py-1 font-semibold text-blue-900 dark:text-blue-300 tabular-nums">
                        Tambah: {actionSummary.add}
                      </span>
                      <span className="rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-2.5 py-1 font-semibold text-amber-900 dark:text-amber-300 tabular-nums">
                        Update: {actionSummary.update}
                      </span>
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-1 font-semibold text-black dark:text-slate-300 tabular-nums">
                        Lewati: {actionSummary.skip}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAllAction("auto")}
                        className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Reset Otomatis
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllAction("SKIP")}
                        className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Lewati Semua
                      </button>
                    </div>
                  </div>

                  {/* Tabel Hasil Tarikan: ukuran kontainer konsisten di semua tab */}
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto flex flex-col">
                    {paginatedPreview.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center px-6 text-center text-sm text-black/75 dark:text-slate-400">
                        {activeTab === "new"
                          ? "Semua dokumen dari hasil tarikan sudah terdaftar di database lokal."
                          : activeTab === "changed"
                            ? "Tidak ada dokumen yang mengalami pembaruan dari API Kemnaker."
                            : "Tidak ada dokumen SKKNI yang cocok dengan kriteria."}
                      </div>
                    ) : (
                      <table className="w-full text-[13px]">
                        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[13.5px] font-bold text-black dark:text-white">
                          <tr>
                            <th className="px-3 py-3 text-center w-14">No</th>
                            <th className="px-4 py-3 text-center w-52">
                              Nomor &amp; Tahun SKKNI
                            </th>
                            <th className="px-4 py-3 text-center">Judul</th>
                            <th className="px-3 py-3 text-center w-28">
                              Status
                            </th>
                            <th className="px-4 py-3 text-center w-44">
                              Keterangan
                            </th>
                            <th className="px-3 py-3 text-center w-40">
                              Unit Kompetensi
                            </th>
                            <th className="px-3 py-3 text-center w-32">
                              Unduh Dokumen
                            </th>
                            <th className="px-4 py-3 text-center w-44">
                              Aksi
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                          {paginatedPreview.map((doc, idx) => {
                            const rowNum =
                              (reviewPage - 1) * MODAL_PAGE_SIZE + idx + 1;
                            const isApplied = doc.availability === "applied";
                            const currentAction =
                              actionsMap[doc.id] || doc.defaultAction;

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
                                    {doc.number_kepmen}
                                  </p>
                                  <p
                                    className={`text-[11.5px] mt-0.5 ${
                                      doc.syncStatus === "NEW"
                                        ? "text-blue-700 dark:text-blue-400 font-medium"
                                        : doc.syncStatus === "CHANGED"
                                          ? "text-amber-700 dark:text-amber-400 font-medium"
                                          : "text-emerald-700 dark:text-emerald-400"
                                    }`}
                                  >
                                    {doc.syncStatus === "NEW"
                                      ? "Dokumen baru"
                                      : doc.syncStatus === "CHANGED"
                                        ? "Ada pembaruan"
                                        : "Sudah terbaru"}
                                  </p>
                                </td>
                                <td className="px-4 py-3 text-left text-black dark:text-slate-100">
                                  {doc.sector}
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
                                    disabled={loadingUnitsId === doc.id}
                                    onClick={() =>
                                      void handleOpenPreviewUnits(doc)
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1.5 text-xs font-normal text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors cursor-pointer"
                                  >
                                    <IconLayersFill className="h-3.5 w-3.5" />
                                    {loadingUnitsId === doc.id
                                      ? "Memuat..."
                                      : `Lihat Unit (${doc.unitsCount})`}
                                  </button>
                                </td>
                                <td className="px-3 py-3 text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    disabled={downloadingId === doc.id}
                                    onClick={() => void handleDownloadPdf(doc)}
                                    title={`Unduh PDF ${doc.number_kepmen}`}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-black dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
                                  >
                                    <IconDownloadFill className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                    {downloadingId === doc.id
                                      ? "Mengunduh..."
                                      : "Unduh PDF"}
                                  </button>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <select
                                    value={currentAction}
                                    onChange={(e) =>
                                      setActionsMap((prev) => ({
                                        ...prev,
                                        [doc.id]: e.target.value as RowAction,
                                      }))
                                    }
                                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-normal text-black dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                  >
                                    <option value="UPDATE">
                                      Update Dokumen
                                    </option>
                                    <option value="ADD">Tambah Data</option>
                                    <option value="SKIP">Lewati</option>
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* PaginationBar di dalam modal */}
                  <PaginationBar
                    page={reviewPage}
                    totalPages={totalReviewPages}
                    totalItems={filteredPreview.length}
                    pageSize={MODAL_PAGE_SIZE}
                    onPageChange={setReviewPage}
                  />

                  {/* Footer Aksi Modal */}
                  <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
                    <div>
                      {!isFull && (
                        <button
                          type="button"
                          onClick={() => setStep("filter")}
                          className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Ubah Filter
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={previewDocs.length === 0}
                        onClick={() => setStep("confirm")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                      >
                        <IconCheckCircleFill className="h-4 w-4" />
                        Lanjut ke Konfirmasi
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* STEP 3: FINAL CONFIRMATION */}
          {step === "confirm" && (
            <div className="p-6 space-y-5">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-black dark:text-white">
                    Konfirmasi Akhir Penarikan Data SKKNI
                  </h3>
                  <p className="text-sm text-black/80 dark:text-slate-300 mt-1">
                    Mode:{" "}
                    <strong className="text-black dark:text-white">
                      {isFull ? "Tarik Penuh" : "Tarik Pilihan"}
                    </strong>
                    . Seluruh dokumen &amp; unit kompetensi disimpan dengan{" "}
                    <strong>ID asli dari API SKKNI Kemnaker</strong> tanpa
                    membuat ID baru.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 p-4 text-center">
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-400">
                      Tambah Data
                    </p>
                    <p className="mt-1 text-2xl font-bold text-black dark:text-white tabular-nums">
                      {actionSummary.add}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 p-4 text-center">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                      Update Dokumen
                    </p>
                    <p className="mt-1 text-2xl font-bold text-black dark:text-white tabular-nums">
                      {actionSummary.update}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-4 text-center">
                    <p className="text-xs font-semibold text-black dark:text-slate-300">
                      Lewati
                    </p>
                    <p className="mt-1 text-2xl font-bold text-black dark:text-white tabular-nums">
                      {actionSummary.skip}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={committing}
                  onClick={() => setStep("review")}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  Kembali Tinjau
                </button>
                <button
                  type="button"
                  disabled={committing}
                  onClick={() => void handleCommit()}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  <IconCheckCircleFill className="h-4 w-4" />
                  {committing
                    ? "Menyimpan ke Database..."
                    : "Konfirmasi & Simpan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Daftar Unit Kompetensi dari baris pratinjau */}
      <UnitsModal
        open={Boolean(activeUnitDoc)}
        onClose={() => setActiveUnitDoc(null)}
        documentNumber={activeUnitDoc?.number_kepmen || ""}
        sectorTitle={activeUnitDoc?.sector || ""}
        units={activeUnitDoc?.units || []}
      />
    </>
  );
}
