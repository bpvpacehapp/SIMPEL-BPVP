"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/providers/ToastProvider";
import { getProglatTypeBadgeClass } from "@/lib/proglat-types";
import {
  IconCloseFill,
  IconDownloadFill,
  IconFilterFill,
  IconSearchFill,
  IconCheckCircleFill,
  IconCancelCircleFill,
  IconBookFill,
} from "@/components/icons/FilledIcons";

type RowAction = "ADD" | "UPDATE" | "SKIP";
type SyncStatus = "NEW" | "CHANGED" | "MANUAL_EDITED" | "UP_TO_DATE";

interface PreviewProgram {
  id: string;
  code: string | null;
  title: string;
  total_modules: number;
  total_duration: number;
  type: string | null;
  vocational_name: string | null;
  topicsCount: number;
  hasPdf: boolean;
  existsInLocal: boolean;
  isManualEdited: boolean;
  syncStatus: SyncStatus;
  defaultAction: RowAction;
}

export interface ProglatCommitSummary {
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  totalTopicsSaved: number;
}

interface ProglatActionModalProps {
  mode: "penuh" | "pilihan" | null;
  onClose: () => void;
  onCommitted: (summary: ProglatCommitSummary) => void;
}

const MODAL_PAGE_SIZE = 15;

export function ProglatActionModal({
  mode,
  onClose,
  onCommitted,
}: ProglatActionModalProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<"filter" | "review" | "confirm">("filter");
  const [activeTab, setActiveTab] = useState<"all" | "new" | "changed">("all");

  // Filter form untuk Tarik Pilihan (Kode wajib, Judul & Tipe opsional)
  const [filterCode, setFilterCode] = useState("");
  const [filterTitle, setFilterTitle] = useState("");
  const [filterType, setFilterType] = useState("");

  const [fetching, setFetching] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUpToDate, setIsUpToDate] = useState(false);
  const [manualProtectedCount, setManualProtectedCount] = useState(0);
  const [previewItems, setPreviewItems] = useState<PreviewProgram[]>([]);
  const [actionsMap, setActionsMap] = useState<Record<string, RowAction>>({});
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPage, setReviewPage] = useState(1);

  const runFetch = async (
    targetMode: "penuh" | "pilihan",
    filters?: {
      code: string;
      title?: string;
      type?: string;
    }
  ) => {
    setFetching(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/proglat/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: targetMode,
          filters,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.message || "Gagal menarik data dari API Proglat Kemnaker."
        );
      }

      const list: PreviewProgram[] = json.data || [];
      const initialActions: Record<string, RowAction> = {};
      for (const item of list) {
        initialActions[item.id] = item.defaultAction;
      }

      setPreviewItems(list);
      setActionsMap(initialActions);
      const upToDate = Boolean(json.meta?.isUpToDate);
      setIsUpToDate(upToDate);
      setManualProtectedCount(Number(json.meta?.manualProtectedCount || 0));
      setActiveTab("all");
      setReviewSearch("");
      setReviewPage(1);

      if (list.length === 0) {
        showToast({
          type: "info",
          title: "Data Tidak Ditemukan",
          message:
            "Tidak ada Program Pelatihan pada API Kemnaker yang cocok dengan filter tersebut.",
        });
      } else if (upToDate) {
        showToast({
          type: "info",
          title: "Data Sudah Paling Terbaru",
          message: `Seluruh *${list.length} program* sudah sesuai dengan database lokal (termasuk program yang dilindungi edit manual).`,
        });
      }

      setStep("review");
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Gagal menghubungi server API Proglat.";
      setErrorMsg(msg);
      showToast({
        type: "error",
        title: "Gagal Menarik Data Program",
        message: msg,
      });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!mode) return;
    setErrorMsg(null);
    setPreviewItems([]);
    setActionsMap({});
    setIsUpToDate(false);
    setManualProtectedCount(0);
    setReviewSearch("");
    setReviewPage(1);
    setActiveTab("all");

    if (mode === "penuh") {
      setStep("review");
      void runFetch("penuh");
    } else {
      setFilterCode("");
      setFilterTitle("");
      setFilterType("");
      setStep("filter");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const tabCounts = useMemo(() => {
    let newCount = 0;
    let changedCount = 0;
    for (const item of previewItems) {
      if (item.syncStatus === "NEW") newCount++;
      else if (item.syncStatus === "CHANGED") changedCount++;
    }
    return {
      all: previewItems.length,
      new: newCount,
      changed: changedCount,
    };
  }, [previewItems]);

  const tabScopedItems = useMemo(() => {
    if (activeTab === "new") {
      return previewItems.filter((p) => p.syncStatus === "NEW");
    }
    if (activeTab === "changed") {
      return previewItems.filter((p) => p.syncStatus === "CHANGED");
    }
    return previewItems;
  }, [previewItems, activeTab]);

  const filteredPreview = useMemo(() => {
    const q = reviewSearch.trim().toLowerCase();
    if (!q) return tabScopedItems;
    return tabScopedItems.filter(
      (p) =>
        (p.code || "").toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        (p.type || "").toLowerCase().includes(q) ||
        (p.vocational_name || "").toLowerCase().includes(q)
    );
  }, [tabScopedItems, reviewSearch]);

  const reviewTotalPages = Math.max(
    1,
    Math.ceil(filteredPreview.length / MODAL_PAGE_SIZE)
  );
  const paginatedPreview = useMemo(() => {
    const safePage = Math.min(reviewPage, reviewTotalPages);
    const start = (safePage - 1) * MODAL_PAGE_SIZE;
    return filteredPreview.slice(start, start + MODAL_PAGE_SIZE);
  }, [filteredPreview, reviewPage, reviewTotalPages]);

  const summary = useMemo(() => {
    let add = 0;
    let update = 0;
    let skip = 0;
    for (const item of previewItems) {
      const act = actionsMap[item.id] || item.defaultAction;
      if (act === "ADD") add++;
      else if (act === "UPDATE") update++;
      else skip++;
    }
    return { add, update, skip, active: add + update };
  }, [previewItems, actionsMap]);

  if (!mode) return null;

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filterCode.trim()) {
      setErrorMsg("Kode program wajib diisi untuk mode Tarik Pilihan.");
      return;
    }
    void runFetch("pilihan", {
      code: filterCode.trim(),
      title: filterTitle.trim() || undefined,
      type: filterType.trim() || undefined,
    });
  };

  const handleBulkAction = (kind: "smart" | "skipAll") => {
    const next: Record<string, RowAction> = { ...actionsMap };
    for (const item of tabScopedItems) {
      next[item.id] = kind === "skipAll" ? "SKIP" : item.defaultAction;
    }
    setActionsMap(next);
  };

  const handleCommit = async () => {
    setCommitting(true);
    setErrorMsg(null);
    try {
      const activeItems: Array<{ id: string; action: RowAction }> = [];
      let skippedCount = 0;
      for (const item of previewItems) {
        const action = actionsMap[item.id] || item.defaultAction;
        if (action === "SKIP") {
          skippedCount++;
        } else {
          activeItems.push({ id: item.id, action });
        }
      }

      const res = await fetch("/api/proglat/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          skippedCount,
          items: activeItems,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.message || "Gagal menyimpan data Program Pelatihan."
        );
      }
      onCommitted(json.summary);
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menyimpan data Program Pelatihan.";
      setErrorMsg(msg);
      showToast({
        type: "error",
        title: "Gagal Menyimpan Program",
        message: msg,
      });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5 backdrop-blur-[2px]"
      onClick={() => !committing && onClose()}
    >
      <div
        className={`flex w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${
          step === "filter"
            ? "max-w-xl"
            : step === "confirm"
              ? "max-w-lg"
              : "max-w-[94vw] h-[88vh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-800 text-white dark:bg-blue-600">
              {mode === "pilihan" ? (
                <IconFilterFill className="h-5 w-5" />
              ) : (
                <IconDownloadFill className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-black dark:text-white">
                {mode === "pilihan"
                  ? "Tarik Pilihan Program Pelatihan"
                  : "Tarik Penuh Program Pelatihan"}
              </h3>
              <p className="text-[12.5px] text-slate-600 dark:text-slate-400">
                {step === "filter"
                  ? "Filter berdasarkan Kode Program (wajib), Judul, dan Tipe."
                  : step === "confirm"
                    ? "Konfirmasi akhir sebelum menyimpan ke database lokal."
                    : "Tinjau hasil penarikan dari API Proglat Kemnaker sebelum disimpan."}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={committing}
            onClick={onClose}
            aria-label="Tutup modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <IconCloseFill className="h-5 w-5" />
          </button>
        </div>

        {/* STEP 1: Filter Form (Tarik Pilihan) */}
        {step === "filter" && (
          <form onSubmit={handleFilterSubmit} className="space-y-4 p-6">
            {errorMsg && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-black dark:text-white">
                Kode Program <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={filterCode}
                onChange={(e) => setFilterCode(e.target.value)}
                placeholder="Contoh: C.28LOG atau sebagian kode program..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[13.5px] text-black outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-black dark:text-white">
                Judul Program{" "}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  (Opsional)
                </span>
              </label>
              <input
                type="text"
                value={filterTitle}
                onChange={(e) => setFilterTitle(e.target.value)}
                placeholder="Contoh: Pengelasan, Pemrograman Web, Barista..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[13.5px] text-black outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-semibold text-black dark:text-white">
                Tipe Program{" "}
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  (Opsional)
                </span>
              </label>
              <input
                type="text"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                placeholder="Contoh: skkni, special, non-skkni..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[13.5px] text-black outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13.5px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={fetching}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2 text-[13.5px] font-semibold text-white hover:bg-blue-900 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <IconSearchFill className="h-4 w-4" />
                {fetching ? "Menarik Data..." : "Cari & Tarik Data"}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Review Table with Browser-style Tabs */}
        {step === "review" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {fetching ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700 dark:border-slate-700 dark:border-t-blue-400" />
                <p className="text-[14.5px] font-semibold text-black dark:text-white">
                  Menarik data Program Pelatihan dari API Proglat Kemnaker...
                </p>
                <p className="text-[13px] text-slate-600 dark:text-slate-400">
                  Mohon tunggu sebentar, sistem sedang membandingkan data terbaru
                  dengan database lokal.
                </p>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
                <IconCancelCircleFill className="h-12 w-12 text-rose-600" />
                <p className="max-w-md text-[14px] text-black dark:text-white">
                  {errorMsg}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    mode === "pilihan"
                      ? setStep("filter")
                      : void runFetch("penuh")
                  }
                  className="rounded-lg bg-blue-800 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-blue-900"
                >
                  Coba Lagi
                </button>
              </div>
            ) : (
              <>
                {/* Browser-style Tabs */}
                <div className="flex shrink-0 items-end gap-1 border-b border-slate-200 bg-slate-100/90 px-5 pt-3 dark:border-slate-800 dark:bg-slate-950/60">
                  {(
                    [
                      {
                        key: "all",
                        label: "Seluruh Program",
                        count: tabCounts.all,
                      },
                      {
                        key: "new",
                        label: "Program Terbaru",
                        count: tabCounts.new,
                      },
                      {
                        key: "changed",
                        label: "Pembaruan",
                        count: tabCounts.changed,
                      },
                    ] as const
                  ).map((tab) => {
                    const active = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => {
                          setActiveTab(tab.key);
                          setReviewPage(1);
                        }}
                        className={`inline-flex items-center gap-2 rounded-t-xl border-x border-t px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                          active
                            ? "-mb-px border-slate-200 bg-white text-blue-800 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-400"
                            : "border-transparent bg-transparent text-slate-600 hover:bg-slate-200/70 hover:text-black dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-white"
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold ${
                            active
                              ? "bg-blue-800 text-white dark:bg-blue-600"
                              : "bg-slate-300/80 text-slate-800 dark:bg-slate-700 dark:text-slate-200"
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Unified Search & Action Badges Bar */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="relative min-w-[260px] flex-1 max-w-md">
                    <IconSearchFill className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={reviewSearch}
                      onChange={(e) => {
                        setReviewSearch(e.target.value);
                        setReviewPage(1);
                      }}
                      placeholder="Cari kode, judul, tipe, atau kejuruan..."
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-[13px] text-black outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="rounded-md bg-emerald-700 px-2.5 py-1 font-semibold text-white">
                      Tambah: {summary.add}
                    </span>
                    <span className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white">
                      Update: {summary.update}
                    </span>
                    <span className="rounded-md bg-slate-600 px-2.5 py-1 font-semibold text-white">
                      Lewati: {summary.skip}
                    </span>
                    {manualProtectedCount > 0 && (
                      <span
                        title="Program yang pernah disesuaikan manual otomatis diset Lewati agar tidak tertimpa"
                        className="rounded-md bg-indigo-700 px-2.5 py-1 font-semibold text-white"
                      >
                        Dilindungi Manual: {manualProtectedCount}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleBulkAction("smart")}
                      className="rounded-md border border-blue-700 px-2.5 py-1 font-semibold text-blue-800 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-300 dark:hover:bg-blue-950/60"
                    >
                      Reset Otomatis
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkAction("skipAll")}
                      className="rounded-md border border-slate-300 px-2.5 py-1 font-semibold text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Lewati Semua
                    </button>
                  </div>
                </div>

                {/* Info banner jika sudah terbaru */}
                {isUpToDate && previewItems.length > 0 && (
                  <div className="flex shrink-0 items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-5 py-2.5 text-[12.5px] text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <IconCheckCircleFill className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    <span>
                      Seluruh data sudah paling terbaru (tidak ada program baru
                      atau pembaruan otomatis). Anda tetap dapat memilih aksi{" "}
                      <strong>Update Program</strong> secara manual pada baris
                      tertentu bila ingin menimpa data lokal dengan versi API.
                    </span>
                  </div>
                )}

                {/* Table */}
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full border-collapse text-[13.5px]">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-[14px] font-bold text-black shadow-sm dark:bg-slate-800 dark:text-white">
                      <tr>
                        <th className="w-12 border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          No
                        </th>
                        <th className="w-40 border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          Kode Program
                        </th>
                        <th className="border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          Judul Program
                        </th>
                        <th className="w-28 border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          Tipe
                        </th>
                        <th className="w-28 border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          Total Modul
                        </th>
                        <th className="w-32 border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          Total Durasi
                        </th>
                        <th className="w-48 border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPreview.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-12 text-center text-slate-500 dark:text-slate-400"
                          >
                            Tidak ada program pada tab atau pencarian ini.
                          </td>
                        </tr>
                      ) : (
                        paginatedPreview.map((item, idx) => {
                          const rowNumber =
                            (Math.min(reviewPage, reviewTotalPages) - 1) *
                              MODAL_PAGE_SIZE +
                            idx +
                            1;
                          const currentAction =
                            actionsMap[item.id] || item.defaultAction;

                          const actionOptions = item.existsInLocal
                            ? [
                                { value: "UPDATE", label: "Update Program" },
                                { value: "SKIP", label: "Lewati" },
                              ]
                            : [
                                { value: "ADD", label: "Tambah Data" },
                                { value: "SKIP", label: "Lewati" },
                              ];

                          return (
                            <tr
                              key={item.id}
                              className="border-b border-slate-200/80 odd:bg-white even:bg-slate-50/90 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800/50"
                            >
                              <td className="px-3 py-2.5 text-center font-normal text-black dark:text-slate-200">
                                {rowNumber}
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono text-[12.5px] font-normal text-black dark:text-slate-200">
                                {item.code || "-"}
                              </td>
                              <td className="px-3 py-2.5 text-left font-normal text-black dark:text-slate-100">
                                <div>{item.title}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px]">
                                  {item.syncStatus === "NEW" && (
                                    <span className="rounded-md bg-emerald-700 px-2 py-0.5 font-semibold text-white">
                                      Program baru
                                    </span>
                                  )}
                                  {item.syncStatus === "CHANGED" && (
                                    <span className="rounded-md bg-amber-600 px-2 py-0.5 font-semibold text-white">
                                      Ada pembaruan
                                    </span>
                                  )}
                                  {item.syncStatus === "MANUAL_EDITED" && (
                                    <span className="rounded-md bg-indigo-700 px-2 py-0.5 font-semibold text-white">
                                      Diedit manual (dilindungi)
                                    </span>
                                  )}
                                  {item.syncStatus === "UP_TO_DATE" && (
                                    <span className="rounded-md bg-slate-500 px-2 py-0.5 font-semibold text-white">
                                      Sudah terbaru
                                    </span>
                                  )}
                                  <span className="text-black dark:text-slate-300">
                                    {item.topicsCount} unit kompetensi
                                    {item.hasPdf ? " • PDF tersedia" : ""}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center font-normal">
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-[11.5px] font-semibold uppercase ${getProglatTypeBadgeClass(item.type)}`}
                                >
                                  {item.type || "-"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center font-normal text-black dark:text-slate-200">
                                {item.total_modules}
                              </td>
                              <td className="px-3 py-2.5 text-center font-normal text-black dark:text-slate-200">
                                {item.total_duration} JP
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <SearchableSelect
                                  value={currentAction}
                                  onChange={(val) =>
                                    setActionsMap((prev) => ({
                                      ...prev,
                                      [item.id]: (val || "SKIP") as RowAction,
                                    }))
                                  }
                                  placeholder="Pilih aksi"
                                  options={actionOptions}
                                  searchable={false}
                                  clearable={false}
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination + Footer */}
                <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="mb-3">
                    <PaginationBar
                      page={Math.min(reviewPage, reviewTotalPages)}
                      totalPages={reviewTotalPages}
                      totalItems={filteredPreview.length}
                      pageSize={MODAL_PAGE_SIZE}
                      onPageChange={setReviewPage}
                      itemLabel="program"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      {mode === "pilihan" && (
                        <button
                          type="button"
                          onClick={() => setStep("filter")}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Ubah Filter
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13.5px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      >
                        Tutup
                      </button>
                      <button
                        type="button"
                        disabled={previewItems.length === 0}
                        onClick={() => setStep("confirm")}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-5 py-2 text-[13.5px] font-semibold text-white hover:bg-blue-900 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                      >
                        <IconCheckCircleFill className="h-4 w-4" />
                        Lanjut Konfirmasi ({summary.active})
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 3: Final Confirmation */}
        {step === "confirm" && (
          <div className="space-y-5 p-6">
            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/40">
              <IconBookFill className="mt-0.5 h-5 w-5 shrink-0 text-blue-800 dark:text-blue-400" />
              <div className="text-[13.5px] text-black dark:text-slate-100">
                <p className="font-semibold">
                  Ringkasan Penyimpanan Program Pelatihan
                </p>
                <p className="mt-1 text-[13px] text-slate-700 dark:text-slate-300">
                  Data akan disimpan ke database lokal SIMPEL dengan ID asli API
                  Proglat Kemnaker beserta seluruh unit kompetensinya.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/40">
                <p className="text-[12px] font-semibold text-emerald-800 dark:text-emerald-300">
                  Ditambah
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-200">
                  {summary.add}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40">
                <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                  Diperbarui
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-200">
                  {summary.update}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
                  Dilewati
                </p>
                <p className="mt-1 text-2xl font-bold text-black dark:text-white">
                  {summary.skip}
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                disabled={committing}
                onClick={() => setStep("review")}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13.5px] font-medium text-black hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Kembali Tinjau
              </button>
              <button
                type="button"
                disabled={committing}
                onClick={() => void handleCommit()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2 text-[13.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                <IconCheckCircleFill className="h-4 w-4" />
                {committing ? "Menyimpan..." : "Ya, Simpan Sekarang"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
