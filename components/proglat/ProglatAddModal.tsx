"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { useToast } from "@/components/providers/ToastProvider";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  formatPublishDate,
  getProglatTypeBadgeClass,
  getProgramTypeOptions,
  hasValidUnitCode,
  type ProglatOriginalSnapshot,
} from "@/lib/proglat-types";
import {
  IconBookFill,
  IconCheckCircleFill,
  IconCloseFill,
  IconDocumentFill,
  IconEyeFill,
  IconPlusFill,
  IconSearchFill,
  IconTrashFill,
} from "@/components/icons/FilledIcons";

interface SearchTopicResult {
  id: string;
  program_id: string;
  code: string | null;
  title: string;
  duration: number;
  references: string | null;
  description: string | null;
  type: string | null;
  skkni_id: string | null;
  skkni_unit_id: string | null;
}

interface SearchProgramSummary {
  id: string;
  code: string | null;
  title: string;
  type: string | null;
  version: number;
  published_at: string | null;
  total_duration: number;
  topicsCount: number;
  existsInLocal: boolean;
}

interface SearchProgramResult {
  id: string;
  code: string | null;
  title: string;
  total_modules: number;
  total_duration: number;
  type: string | null;
  published_at: string | null;
  cover_image: string | null;
  download_material_uri: string | null;
  vocational_name: string | null;
  sub_vocational_name: string | null;
  status: string | null;
  version: number;
  program_topics: SearchTopicResult[];
}

interface JenisUnitOption {
  id: string;
  jenisUnit: string;
}

interface SkkniUnitSearchItem {
  id: string;
  code: string;
  title: string;
  skkniId: string;
  skkni: {
    id: string;
    numberKepmen: string;
    sector: string;
    availability: string;
  };
}

interface DraftTopic {
  id: string;
  code: string | null;
  title: string;
  duration: number;
  references: string | null;
  description: string | null;
  type: string | null;
  jenisUnitId: string;
  skkniId: string | null;
  skkniUnitId: string | null;
  isManualEdited: boolean;
}

interface ProglatAddModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (programTitle: string) => void;
}

export function ProglatAddModal({
  open,
  onClose,
  onSaved,
}: ProglatAddModalProps) {
  const { showToast } = useToast();

  const [step, setStep] = useState<"search" | "review" | "confirm">("search");

  // Master Jenis Unit Kompetensi (aktif)
  const [jenisUnitList, setJenisUnitList] = useState<JenisUnitOption[]>([]);

  // Step 1: AJAX Search Combobox (limit=10) + client-side cache per query
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchProgramSummary[]>(
    []
  );
  const [totalFromApi, setTotalFromApi] = useState(0);
  const clientSearchCacheRef = useRef<
    Map<
      string,
      { fetchedAt: number; totalFromApi: number; data: SearchProgramSummary[] }
    >
  >(new Map());

  // Step 2: Draft review & edit state
  const [selectedProgram, setSelectedProgram] =
    useState<SearchProgramResult | null>(null);
  const [originalSnapshot, setOriginalSnapshot] =
    useState<ProglatOriginalSnapshot | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftType, setDraftType] = useState("");
  const [draftTopics, setDraftTopics] = useState<DraftTopic[]>([]);
  const [hasModifiedDraft, setHasModifiedDraft] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // Tambah Unit dari master SKKNI (`skkni_units`)
  const [showAddSkkniBox, setShowAddSkkniBox] = useState(false);
  const [skkniQuery, setSkkniQuery] = useState("");
  const [skkniSearching, setSkkniSearching] = useState(false);
  const [skkniResults, setSkkniResults] = useState<SkkniUnitSearchItem[]>([]);

  // Step 3: Saving state
  const [saving, setSaving] = useState(false);

  const teknisJenisUnitId = useMemo(() => {
    const found = jenisUnitList.find(
      (j) => j.jenisUnit.trim().toLowerCase() === "teknis"
    );
    return found?.id || "";
  }, [jenisUnitList]);

  // Load master Jenis Unit Kompetensi aktif setiap modal dibuka
  useEffect(() => {
    if (!open) return;
    setStep("search");
    setQuery("");
    setSearchError(null);
    setSelectedProgram(null);
    setOriginalSnapshot(null);
    setDraftTopics([]);
    setHasModifiedDraft(false);
    setShowValidationErrors(false);
    setShowAddSkkniBox(false);
    setSkkniQuery("");

    fetch("/api/jenis-unit-kompetensi?status=aktif&limit=50", {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.data)) {
          setJenisUnitList(
            j.data.map((d: { id: string; jenisUnit: string }) => ({
              id: d.id,
              jenisUnit: d.jenisUnit,
            }))
          );
        }
      })
      .catch(() => {});
  }, [open]);

  // Step 1: AJAX debounced search program Proglat (limit=10, min 2 char, debounce 400ms, client cache 5 menit)
  useEffect(() => {
    if (!open || step !== "search") return;

    const trimmed = query.trim();
    // Jangan kirim request saat baru mengetik 1 huruf
    if (trimmed.length === 1) {
      setSearching(false);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    const cached = clientSearchCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt <= 5 * 60 * 1000) {
      setSearchResults(cached.data);
      setTotalFromApi(cached.totalFromApi);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const delay = trimmed === "" ? 0 : 400;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const qs = new URLSearchParams();
        if (trimmed) qs.set("q", trimmed);
        const res = await fetch(`/api/proglat/search?${qs.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(
            json.message || "Gagal mencari data pada API Proglat Kemnaker."
          );
        }
        const data: SearchProgramSummary[] = json.data || [];
        const total = Number(json.totalFromApi || 0);
        clientSearchCacheRef.current.set(cacheKey, {
          fetchedAt: Date.now(),
          totalFromApi: total,
          data,
        });
        setSearchResults(data);
        setTotalFromApi(total);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setSearchError(
          err instanceof Error
            ? err.message
            : "Gagal menghubungi server API Proglat."
        );
      } finally {
        setSearching(false);
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, step, query]);

  // Step 2: AJAX debounced search unit kerja SKKNI (`skkni_units`)
  useEffect(() => {
    if (!open || step !== "review" || !showAddSkkniBox) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSkkniSearching(true);
      try {
        const qs = new URLSearchParams();
        if (skkniQuery.trim()) qs.set("q", skkniQuery.trim());
        const res = await fetch(`/api/skkni/units-search?${qs.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();
        if (res.ok) {
          setSkkniResults(json.data || []);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      } finally {
        setSkkniSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, step, showAddSkkniBox, skkniQuery]);

  const computedTotalModules = draftTopics.length;
  const computedTotalDuration = useMemo(
    () => draftTopics.reduce((acc, t) => acc + (t.duration || 0), 0),
    [draftTopics]
  );

  const missingJenisCount = useMemo(
    () => draftTopics.filter((t) => !t.jenisUnitId).length,
    [draftTopics]
  );

  if (!open) return null;

  const handleSelectProgram = async (summary: SearchProgramSummary | null) => {
    if (!summary) return;
    setLoadingDetailId(summary.id);
    setSearchError(null);
    try {
      const qs = new URLSearchParams({ id: summary.id });
      if (summary.code) qs.set("code", summary.code);
      const res = await fetch(`/api/proglat/search?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.data) {
        throw new Error(json.message || "Gagal memuat detail program.");
      }

      const prog: SearchProgramResult = json.data;

      const topics: DraftTopic[] = (prog.program_topics || []).map((t) => {
        // Logika otomatis: unit SKKNI valid (punya skkni_unit_id & kode valid) -> otomatis "Teknis",
        // unit non-SKKNI (SOFTSKILL, --Spesial, -, kosong) -> dibiarkan kosong agar dipilih manual oleh user.
        const isSkkniUnit =
          Boolean(t.skkni_unit_id) && hasValidUnitCode(t.code);
        const defaultJenisId = isSkkniUnit ? teknisJenisUnitId : "";
        return {
          id: t.id,
          code: t.code ?? null,
          title: t.title,
          duration: t.duration || 0,
          references: t.references ?? null,
          description: t.description ?? null,
          type: t.type ?? null,
          jenisUnitId: defaultJenisId,
          skkniId: t.skkni_id ?? null,
          skkniUnitId: t.skkni_unit_id ?? null,
          isManualEdited: false,
        };
      });

      const snapshot: ProglatOriginalSnapshot = {
        code: prog.code ?? null,
        title: prog.title,
        totalModules: topics.length,
        totalDuration: topics.reduce((acc, t) => acc + t.duration, 0),
        type: prog.type ?? null,
        topics: topics.map((t) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          duration: t.duration,
          references: t.references,
          description: t.description,
          type: t.type,
          jenisUnitId: t.jenisUnitId || null,
          skkniId: t.skkniId,
          skkniUnitId: t.skkniUnitId,
        })),
      };

      setSelectedProgram(prog);
      setOriginalSnapshot(snapshot);
      setDraftTitle(prog.title);
      setDraftType(prog.type || "offline");
      setDraftTopics(topics);
      setHasModifiedDraft(false);
      setShowValidationErrors(false);
      setShowAddSkkniBox(false);
      setStep("review");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal memuat detail program.";
      setSearchError(msg);
      showToast({
        type: "error",
        title: "Gagal Memuat Program",
        message: msg,
      });
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleAddSkkniUnit = (unit: SkkniUnitSearchItem | null) => {
    if (!unit) return;
    const exists = draftTopics.some(
      (t) =>
        (t.skkniUnitId && t.skkniUnitId === unit.id) ||
        (t.code &&
          unit.code &&
          t.code.trim().toLowerCase() === unit.code.trim().toLowerCase())
    );
    if (exists) {
      showToast({
        type: "info",
        title: "Unit Sudah Ada",
        message: `Unit dengan kode *${unit.code}* sudah terdapat pada daftar.`,
      });
      return;
    }

    const newId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `skkni-${Date.now()}`;

    setDraftTopics((prev) => [
      ...prev,
      {
        id: newId,
        code: unit.code,
        title: unit.title,
        duration: 0,
        references: unit.skkni?.numberKepmen ?? null,
        description: null,
        type: "skkni",
        jenisUnitId: teknisJenisUnitId,
        skkniId: unit.skkniId,
        skkniUnitId: unit.id,
        isManualEdited: true,
      },
    ]);
    setHasModifiedDraft(true);
    setSkkniQuery("");
    setShowAddSkkniBox(false);
    showToast({
      type: "success",
      title: "Unit SKKNI Ditambahkan",
      message: `Unit *${unit.code}* berhasil ditambahkan dari data SKKNI.`,
    });
  };

  const handleDurationChange = (topicId: string, val: string) => {
    const parsed = Math.max(0, Math.round(Number(val) || 0));
    setDraftTopics((prev) =>
      prev.map((t) =>
        t.id === topicId
          ? { ...t, duration: parsed, isManualEdited: true }
          : t
      )
    );
    setHasModifiedDraft(true);
  };

  const handleJenisUnitChange = (topicId: string, jenisUnitId: string) => {
    setDraftTopics((prev) =>
      prev.map((t) =>
        t.id === topicId
          ? { ...t, jenisUnitId, isManualEdited: true }
          : t
      )
    );
    setHasModifiedDraft(true);
  };

  const handleDeleteTopic = (topicId: string) => {
    setDraftTopics((prev) => prev.filter((t) => t.id !== topicId));
    setHasModifiedDraft(true);
  };

  const handleProceedToConfirm = () => {
    if (!draftTitle.trim()) {
      showToast({
        type: "error",
        title: "Judul Program Wajib Diisi",
        message: "Judul program pelatihan tidak boleh kosong.",
      });
      return;
    }
    if (missingJenisCount > 0) {
      setShowValidationErrors(true);
      showToast({
        type: "error",
        title: "Jenis Unit Belum Lengkap",
        message: `Masih ada *${missingJenisCount} unit kompetensi* yang belum dipilih Jenis Unit-nya. Harap lengkapi terlebih dahulu.`,
      });
      return;
    }
    setShowValidationErrors(false);
    setStep("confirm");
  };

  const handleSaveToLocal = async () => {
    if (!selectedProgram) return;
    setSaving(true);
    try {
      const changedSummary =
        draftTitle.trim() !== selectedProgram.title ||
        (draftType.trim() || null) !== (selectedProgram.type || null);

      const res = await fetch("/api/proglat/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program: {
            id: selectedProgram.id,
            code: selectedProgram.code,
            title: draftTitle.trim(),
            type: draftType.trim() || null,
            publishedAt: selectedProgram.published_at,
            coverImage: selectedProgram.cover_image,
            downloadMaterialUri: selectedProgram.download_material_uri,
            vocationalName: selectedProgram.vocational_name,
            subVocationalName: selectedProgram.sub_vocational_name,
            status: selectedProgram.status,
            version: selectedProgram.version,
          },
          topics: draftTopics,
          originalSnapshot,
          isManualEdited: hasModifiedDraft || changedSummary,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menyimpan program pelatihan.");
      }

      onSaved(draftTitle.trim());
      onClose();
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menyimpan Program",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menyimpan ke database lokal.",
      });
    } finally {
      setSaving(false);
    }
  };

  const pdfPreviewUrl = selectedProgram?.download_material_uri
    ? `/api/proglat/preview-pdf?url=${encodeURIComponent(selectedProgram.download_material_uri)}`
    : null;

  const jenisSelectOptions = jenisUnitList.map((j) => ({
    value: j.id,
    label: j.jenisUnit,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5 backdrop-blur-[2px]"
      onClick={() => !saving && onClose()}
    >
      <div
        className={`flex w-full flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${
          step === "search"
            ? "max-w-3xl"
            : step === "confirm"
              ? "max-w-lg"
              : "max-w-[96vw] h-[90vh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-800 text-white dark:bg-blue-600">
              <IconBookFill className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-black dark:text-white">
                Tambah Program Pelatihan
              </h3>
              <p className="text-[12.5px] text-black dark:text-slate-300">
                {step === "search"
                  ? "Cari dan pilih program dari referensi Proglat Kemnaker."
                  : step === "confirm"
                    ? "Konfirmasi akhir sebelum menyimpan ke database lokal."
                    : "Lengkapi Jenis Unit, sesuaikan durasi JP, dan cocokkan dengan PDF di kanan."}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Tutup modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <IconCloseFill className="h-5 w-5" />
          </button>
        </div>

        {/* STEP 1: AJAX Search Combobox (limit=10) */}
        {step === "search" && (
          <div className="flex min-h-[460px] flex-col p-6">
            <label className="mb-2 block text-[13.5px] font-semibold text-black dark:text-white">
              Cari Program Pelatihan (Kode atau Judul)
            </label>

            <Combobox
              value={null as SearchProgramSummary | null}
              onChange={(p) => void handleSelectProgram(p)}
              disabled={Boolean(loadingDetailId)}
            >
              <div className="relative">
                <IconSearchFill className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <ComboboxInput
                  autoFocus
                  displayValue={(p: SearchProgramSummary | null) =>
                    p ? p.title : query
                  }
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ketik judul atau kode program pelatihan..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-4 text-[13.5px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[12px] text-black dark:text-slate-300">
                <span>
                  {loadingDetailId
                    ? "Memuat detail unit kompetensi program..."
                    : query.trim().length === 1
                      ? "Ketik minimal 2 karakter untuk mulai mencari..."
                      : searching
                        ? "Mencari data program..."
                        : `Menampilkan ${searchResults.length} dari ${totalFromApi.toLocaleString("id-ID")} program tersedia`}
                </span>
                <span>Ketik kata kunci untuk mencari program lain</span>
              </div>

              {searchError && (
                <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                  {searchError}
                </div>
              )}

              <ComboboxOptions
                static
                className="mt-3 max-h-[320px] flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-200/80 dark:border-slate-800 dark:bg-slate-950 dark:divide-slate-800"
              >
                {searching && searchResults.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[13px] text-black dark:text-slate-300">
                    Memuat daftar program...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[13px] text-black dark:text-slate-300">
                    Tidak ada program yang cocok dengan pencarian &ldquo;{query}
                    &rdquo;.
                  </div>
                ) : (
                  searchResults.map((prog) => (
                    <ComboboxOption
                      key={prog.id}
                      value={prog}
                      className="cursor-pointer px-4 py-3 transition-colors data-[focus]:bg-blue-50 dark:data-[focus]:bg-slate-800/80"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-semibold text-black dark:text-white">
                              {prog.title}
                            </span>
                            {prog.existsInLocal && (
                              <span className="rounded-md bg-indigo-700 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                                Sudah Terdata
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-black dark:text-slate-300">
                            <span className="font-mono">
                              {prog.code || "-"}
                            </span>
                            <span>•</span>
                            <span className="font-semibold">
                              Versi {prog.version || 1}
                            </span>
                            <span>•</span>
                            <span>
                              Publish: {formatPublishDate(prog.published_at)}
                            </span>
                            <span>•</span>
                            <span>
                              {prog.topicsCount} unit ({prog.total_duration} JP)
                            </span>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${getProglatTypeBadgeClass(prog.type)}`}
                        >
                          {prog.type || "-"}
                        </span>
                      </div>
                    </ComboboxOption>
                  ))
                )}
              </ComboboxOptions>
            </Combobox>
          </div>
        )}

        {/* STEP 2: Split-Screen Pencocokan & Edit + PDF Preview */}
        {step === "review" && selectedProgram && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 xl:grid-cols-12">
              {/* KIRI: Form Program & Tabel Unit Kompetensi */}
              <div className="flex min-h-0 flex-col gap-3 overflow-hidden xl:col-span-7">
                {/* Ringkasan Program */}
                <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-4">
                      <label className="mb-1 block text-[11.5px] font-semibold text-black dark:text-slate-300">
                        Kode Program (Tetap)
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={selectedProgram.code || "-"}
                        className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-200/70 px-2.5 py-1.5 font-mono text-[12px] text-black dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[11.5px] font-semibold text-black dark:text-slate-300">
                        Versi (Tetap)
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={`v${selectedProgram.version || 1}`}
                        className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-200/70 px-2.5 py-1.5 text-center font-semibold text-[12.5px] text-black dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="mb-1 block text-[11.5px] font-semibold text-black dark:text-slate-300">
                        Tanggal Publish (Tetap)
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={formatPublishDate(selectedProgram.published_at)}
                        className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-200/70 px-2.5 py-1.5 text-[12.5px] text-black dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="mb-1 block text-[11.5px] font-semibold text-black dark:text-white">
                        Tipe Program
                      </label>
                      <SearchableSelect
                        value={draftType}
                        onChange={(val) => {
                          setDraftType(val);
                          setHasModifiedDraft(true);
                        }}
                        placeholder="Pilih tipe"
                        searchable={false}
                        clearable={false}
                        options={getProgramTypeOptions(draftType)}
                      />
                    </div>

                    <div className="sm:col-span-8">
                      <label className="mb-1 block text-[11.5px] font-semibold text-black dark:text-white">
                        Judul Program <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={draftTitle}
                        onChange={(e) => {
                          setDraftTitle(e.target.value);
                          setHasModifiedDraft(true);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-black outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:col-span-4">
                      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center dark:border-slate-800 dark:bg-slate-900">
                        <div className="text-[11px] text-black dark:text-slate-300">
                          Total Modul
                        </div>
                        <div className="text-[14px] font-bold text-black dark:text-white">
                          {computedTotalModules}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center dark:border-slate-800 dark:bg-slate-900">
                        <div className="text-[11px] text-black dark:text-slate-300">
                          Total Durasi
                        </div>
                        <div className="text-[14px] font-bold text-black dark:text-white">
                          {computedTotalDuration} JP
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error banner validasi Jenis Unit */}
                {showValidationErrors && missingJenisCount > 0 && (
                  <div className="shrink-0 rounded-xl border border-rose-400 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                    Terdapat <strong>{missingJenisCount} unit kompetensi</strong>{" "}
                    yang belum memiliki Jenis Unit. Pilih Jenis Unit pada baris
                    bertanda merah sebelum melanjutkan konfirmasi.
                  </div>
                )}

                {/* Toolbar Daftar Unit */}
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <h4 className="text-[14px] font-bold text-black dark:text-white">
                    Daftar Unit Kompetensi ({computedTotalModules})
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSkkniQuery("");
                      setShowAddSkkniBox(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    <IconPlusFill className="h-3.5 w-3.5" />
                    Tambah Unit dari SKKNI
                  </button>
                </div>

                {/* Tabel Unit Kompetensi (Durasi langsung input, kolom Jenis Unit dropdown, tanpa tombol Edit) */}
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full border-collapse text-[13px]">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-[13px] font-bold text-black dark:bg-slate-800 dark:text-white">
                      <tr>
                        <th className="w-10 border-b border-slate-200 px-2 py-2.5 text-center dark:border-slate-700">
                          No
                        </th>
                        <th className="w-32 border-b border-slate-200 px-2 py-2.5 text-center dark:border-slate-700">
                          Kode Unit
                        </th>
                        <th className="border-b border-slate-200 px-2 py-2.5 text-center dark:border-slate-700">
                          Judul Unit
                        </th>
                        <th className="w-40 border-b border-slate-200 px-2 py-2.5 text-center dark:border-slate-700">
                          Jenis Unit <span className="text-rose-600">*</span>
                        </th>
                        <th className="w-24 border-b border-slate-200 px-2 py-2.5 text-center dark:border-slate-700">
                          Durasi (JP)
                        </th>
                        <th className="w-20 border-b border-slate-200 px-2 py-2.5 text-center dark:border-slate-700">
                          Aksi
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {draftTopics.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-8 text-center text-black dark:text-slate-300"
                          >
                            Belum ada unit kompetensi. Gunakan tombol Tambah
                            Unit dari SKKNI di atas.
                          </td>
                        </tr>
                      ) : (
                        draftTopics.map((topic, idx) => {
                          const isUnselectedJenis = !topic.jenisUnitId;
                          const isMissingJenis =
                            showValidationErrors && isUnselectedJenis;

                          return (
                            <tr
                              key={topic.id}
                              className={`border-b border-slate-200/80 align-top dark:border-slate-800 ${
                                isMissingJenis
                                  ? "bg-rose-50/90 dark:bg-rose-950/40"
                                  : "odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50"
                              }`}
                            >
                              <td className="px-2 py-2.5 text-center text-black dark:text-slate-200">
                                {idx + 1}
                              </td>
                              <td className="px-2 py-2.5 text-center font-mono text-[11.5px] text-black dark:text-slate-200">
                                {topic.code || "-"}
                              </td>
                              <td className="px-2 py-2.5 text-left text-black dark:text-slate-100">
                                {topic.title}
                              </td>
                              <td className="px-2 py-2 text-left">
                                {isUnselectedJenis && (
                                  <p className="mb-1 text-left text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                                    * Wajib dipilih
                                  </p>
                                )}
                                <div
                                  className={
                                    isUnselectedJenis
                                      ? "rounded-lg ring-2 ring-rose-500"
                                      : ""
                                  }
                                >
                                  <SearchableSelect
                                    value={topic.jenisUnitId}
                                    onChange={(val) =>
                                      handleJenisUnitChange(topic.id, val)
                                    }
                                    placeholder="Pilih jenis..."
                                    searchable={false}
                                    clearable={false}
                                    options={jenisSelectOptions}
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-2 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  value={topic.duration}
                                  onChange={(e) =>
                                    handleDurationChange(
                                      topic.id,
                                      e.target.value
                                    )
                                  }
                                  aria-label={`Durasi JP ${topic.title}`}
                                  className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-[13px] font-medium text-black outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                />
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTopic(topic.id)}
                                  className="inline-flex items-center justify-center gap-1 rounded-md border border-rose-600 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500 dark:bg-slate-900 dark:text-rose-400"
                                >
                                  <IconTrashFill className="h-3.5 w-3.5" />
                                  Hapus
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* KANAN: Pratinjau PDF Langsung */}
              <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white xl:col-span-5 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3.5 py-2.5 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-700 text-white">
                      <IconDocumentFill className="h-4 w-4" />
                    </div>
                    <span className="text-[13.5px] font-bold text-black dark:text-white">
                      Pratinjau Dokumen PDF
                    </span>
                  </div>
                  {pdfPreviewUrl && (
                    <a
                      href={pdfPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <IconEyeFill className="h-3.5 w-3.5" />
                      Tab Baru
                    </a>
                  )}
                </div>

                {pdfPreviewUrl ? (
                  <iframe
                    src={pdfPreviewUrl}
                    title={`Pratinjau PDF ${selectedProgram.title}`}
                    className="min-h-[380px] flex-1 w-full bg-slate-100 dark:bg-slate-950"
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                    <IconDocumentFill className="h-10 w-10 text-slate-300 dark:text-slate-700" />
                    <p className="text-[13px] font-semibold text-black dark:text-white">
                      Dokumen PDF Tidak Tersedia
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Step 2 */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/60">
              <button
                type="button"
                onClick={() => setStep("search")}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Ganti Program
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleProceedToConfirm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-5 py-2 text-[13.5px] font-semibold text-white hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <IconCheckCircleFill className="h-4 w-4" />
                  Simpan Data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Konfirmasi Simpan */}
        {step === "confirm" && selectedProgram && (
          <div className="space-y-5 p-6">
            <div className="space-y-2 text-[13.5px] text-black dark:text-slate-100">
              <p className="font-semibold">
                Apakah data program dan unit kompetensi yang dimasukkan sudah
                benar?
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[13px] space-y-1 dark:border-slate-800 dark:bg-slate-950">
                <div>
                  <span className="font-semibold">Kode Program:</span>{" "}
                  <span className="font-mono">
                    {selectedProgram.code || "-"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">Judul Program:</span>{" "}
                  {draftTitle}
                </div>
                <div>
                  <span className="font-semibold">Versi:</span> v
                  {selectedProgram.version || 1}
                </div>
                <div>
                  <span className="font-semibold">Tanggal Publish:</span>{" "}
                  {formatPublishDate(selectedProgram.published_at)}
                </div>
                <div>
                  <span className="font-semibold">Total:</span>{" "}
                  {computedTotalModules} Modul • {computedTotalDuration} JP
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep("review")}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13.5px] font-medium text-black hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Kembali Cek
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveToLocal()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-5 py-2 text-[13.5px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                <IconCheckCircleFill className="h-4 w-4" />
                {saving ? "Menyimpan..." : "Ya, Simpan"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-Modal: Tambah Unit dari SKKNI (`skkni_units`) */}
      {showAddSkkniBox && step === "review" && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => setShowAddSkkniBox(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-800 text-white dark:bg-blue-600">
                  <IconPlusFill className="h-5 w-5" />
                </div>
                <h3 className="text-[15.5px] font-bold text-black dark:text-white">
                  Tambah Unit dari SKKNI
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSkkniBox(false)}
                aria-label="Tutup modal tambah unit SKKNI"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <IconCloseFill className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5">
              <label className="mb-1.5 block text-[13px] font-semibold text-black dark:text-white">
                Cari Kode Unit atau Judul Unit Kerja SKKNI
              </label>
              <Combobox
                value={null as SkkniUnitSearchItem | null}
                onChange={handleAddSkkniUnit}
              >
                <div className="relative">
                  <IconSearchFill className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <ComboboxInput
                    autoFocus
                    value={skkniQuery}
                    onChange={(e) => setSkkniQuery(e.target.value)}
                    placeholder="Ketik kode unit SKKNI (mis. C.28LOG...) atau judul unit..."
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-[13px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <ComboboxOptions
                  static
                  className="mt-2.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-200/80 dark:border-slate-800 dark:bg-slate-950 dark:divide-slate-800"
                >
                  {skkniSearching ? (
                    <div className="px-4 py-8 text-center text-[13px] text-black dark:text-slate-300">
                      Mencari unit kerja SKKNI...
                    </div>
                  ) : skkniResults.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[13px] text-black dark:text-slate-300">
                      Unit SKKNI tidak ditemukan di database lokal.
                    </div>
                  ) : (
                    skkniResults.map((u) => (
                      <ComboboxOption
                        key={u.id}
                        value={u}
                        className="cursor-pointer px-4 py-2.5 text-[13px] data-[focus]:bg-blue-50 dark:data-[focus]:bg-slate-800"
                      >
                        <div className="font-mono text-[12px] font-bold text-blue-800 dark:text-blue-400">
                          {u.code}
                        </div>
                        <div className="text-black dark:text-white">
                          {u.title}
                        </div>
                        <div className="text-[11.5px] text-black dark:text-slate-300">
                          SKKNI: {u.skkni.numberKepmen} • {u.skkni.sector}
                        </div>
                      </ComboboxOption>
                    ))
                  )}
                </ComboboxOptions>
              </Combobox>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
