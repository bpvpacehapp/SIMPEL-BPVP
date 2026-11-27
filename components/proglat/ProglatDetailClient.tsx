"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import type { Role } from "@prisma/client";
import { useToast } from "@/components/providers/ToastProvider";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  formatPublishDate,
  getProglatTypeBadgeClass,
  getProgramTypeOptions,
} from "@/lib/proglat-types";
import {
  IconArrowLeftFill,
  IconBookFill,
  IconCheckCircleFill,
  IconCloseFill,
  IconDocumentFill,
  IconDownloadFill,
  IconEditFill,
  IconEyeFill,
  IconPlusFill,
  IconRefreshFill,
  IconSearchFill,
  IconTrashFill,
} from "@/components/icons/FilledIcons";

export interface ProglatTopicDetail {
  id: string;
  code: string | null;
  title: string;
  duration: number;
  references: string | null;
  description: string | null;
  type: string | null;
  jenisUnitId: string | null;
  skkniId: string | null;
  skkniUnitId: string | null;
  isManualEdited: boolean;
}

export interface ProglatProgramDetail {
  id: string;
  code: string | null;
  title: string;
  totalModules: number;
  totalDuration: number;
  type: string | null;
  publishedAt: string | null;
  coverImage: string | null;
  downloadMaterialUri: string | null;
  vocationalName: string | null;
  subVocationalName: string | null;
  status: string | null;
  version: number;
  isManualEdited: boolean;
  syncedAt: string;
  topics: ProglatTopicDetail[];
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

interface ProglatDetailClientProps {
  initialProgram: ProglatProgramDetail;
  jenisUnitOptions: JenisUnitOption[];
  userRole: Role;
}

export function ProglatDetailClient({
  initialProgram,
  jenisUnitOptions,
  userRole,
}: ProglatDetailClientProps) {
  const canEdit = userRole !== "USER";
  const { showToast } = useToast();

  const [program, setProgram] = useState<ProglatProgramDetail>(initialProgram);

  // Edit ringkasan program (code, version, publishedAt read-only)
  const [editingProgram, setEditingProgram] = useState(false);
  const [progTitle, setProgTitle] = useState(initialProgram.title);
  const [progType, setProgType] = useState(initialProgram.type || "");
  const [savingProgram, setSavingProgram] = useState(false);

  // Pencarian daftar unit
  const [topicSearch, setTopicSearch] = useState("");

  // State lokal input durasi per baris (agar mulus saat mengetik sebelum blur/simpan)
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        initialProgram.topics.map((t) => [t.id, String(t.duration)])
      )
  );
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null);

  // Modal Tambah Unit dari SKKNI (`skkni_units`)
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [skkniQuery, setSkkniQuery] = useState("");
  const [skkniSearching, setSkkniSearching] = useState(false);
  const [skkniResults, setSkkniResults] = useState<SkkniUnitSearchItem[]>([]);
  const [addingSkkni, setAddingSkkni] = useState(false);

  // Konfirmasi Hapus Unit
  const [deleteTargetTopic, setDeleteTargetTopic] =
    useState<ProglatTopicDetail | null>(null);
  const [deletingTopic, setDeletingTopic] = useState(false);

  // Reset Program ke Bawaan
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setDurationDrafts(
      Object.fromEntries(program.topics.map((t) => [t.id, String(t.duration)]))
    );
  }, [program.topics]);

  useEffect(() => {
    if (!addModalOpen) return;
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
        if (res.ok) setSkkniResults(json.data || []);
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
  }, [addModalOpen, skkniQuery]);

  const filteredTopics = useMemo(() => {
    const q = topicSearch.trim().toLowerCase();
    if (!q) return program.topics;
    return program.topics.filter(
      (t) =>
        (t.code || "").toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.references || "").toLowerCase().includes(q)
    );
  }, [program.topics, topicSearch]);

  const computedTotalModules = program.topics.length;
  const computedTotalDuration = useMemo(
    () =>
      program.topics.reduce((acc, t) => {
        const draftVal = durationDrafts[t.id];
        const num =
          draftVal !== undefined ? Math.max(0, Math.round(Number(draftVal) || 0)) : t.duration;
        return acc + num;
      }, 0),
    [program.topics, durationDrafts]
  );

  const jenisSelectOptions = useMemo(
    () => jenisUnitOptions.map((j) => ({ value: j.id, label: j.jenisUnit })),
    [jenisUnitOptions]
  );

  const jenisLabelMap = useMemo(
    () => new Map(jenisUnitOptions.map((j) => [j.id, j.jenisUnit])),
    [jenisUnitOptions]
  );

  const startEditProgram = () => {
    setProgTitle(program.title);
    setProgType(program.type || "offline");
    setEditingProgram(true);
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progTitle.trim()) {
      showToast({
        type: "error",
        title: "Judul Wajib Diisi",
        message: "Judul program pelatihan tidak boleh kosong.",
      });
      return;
    }

    setSavingProgram(true);
    try {
      const res = await fetch(`/api/proglat/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program: {
            title: progTitle.trim(),
            type: progType.trim() || null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menyimpan perubahan program.");
      }
      setProgram(json.data);
      setEditingProgram(false);
      showToast({
        type: "success",
        title: "Program Disesuaikan",
        message: `Informasi program *${json.data.title}* berhasil disimpan.`,
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menyimpan",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menyimpan program.",
      });
    } finally {
      setSavingProgram(false);
    }
  };

  const handleSaveDuration = async (topic: ProglatTopicDetail) => {
    const raw = durationDrafts[topic.id];
    const nextDuration = Math.max(0, Math.round(Number(raw) || 0));
    if (nextDuration === topic.duration) return;

    setSavingTopicId(topic.id);
    try {
      const res = await fetch(`/api/proglat/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: { id: topic.id, duration: nextDuration },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal memperbarui durasi.");
      }
      setProgram(json.data);
    } catch (error) {
      setDurationDrafts((prev) => ({
        ...prev,
        [topic.id]: String(topic.duration),
      }));
      showToast({
        type: "error",
        title: "Gagal Memperbarui Durasi",
        message:
          error instanceof Error ? error.message : "Gagal menyimpan durasi JP.",
      });
    } finally {
      setSavingTopicId(null);
    }
  };

  const handleSaveJenisUnit = async (
    topic: ProglatTopicDetail,
    jenisUnitId: string
  ) => {
    if ((topic.jenisUnitId || "") === jenisUnitId) return;
    setSavingTopicId(topic.id);
    try {
      const res = await fetch(`/api/proglat/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: { id: topic.id, jenisUnitId: jenisUnitId || null },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal memperbarui jenis unit.");
      }
      setProgram(json.data);
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Memperbarui Jenis Unit",
        message:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan jenis unit.",
      });
    } finally {
      setSavingTopicId(null);
    }
  };

  const handleAddSkkniUnit = async (unit: SkkniUnitSearchItem | null) => {
    if (!unit) return;
    setAddingSkkni(true);
    try {
      const res = await fetch(`/api/proglat/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addSkkniUnit: { skkniUnitId: unit.id, duration: 0 },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menambahkan unit SKKNI.");
      }
      setProgram(json.data);
      setAddModalOpen(false);
      setSkkniQuery("");
      showToast({
        type: "success",
        title: "Unit SKKNI Ditambahkan",
        message: `Unit *${unit.code}* berhasil ditambahkan ke program.`,
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menambahkan Unit",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menambahkan unit SKKNI.",
      });
    } finally {
      setAddingSkkni(false);
    }
  };

  const handleDeleteTopic = async () => {
    if (!deleteTargetTopic) return;
    setDeletingTopic(true);
    try {
      const res = await fetch(`/api/proglat/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteTopicId: deleteTargetTopic.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menghapus unit kompetensi.");
      }
      setProgram(json.data);
      showToast({
        type: "success",
        title: "Unit Kompetensi Dihapus",
        message: `Unit *${deleteTargetTopic.title}* telah dihapus.`,
      });
      setDeleteTargetTopic(null);
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menghapus Unit",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menghapus unit kompetensi.",
      });
    } finally {
      setDeletingTopic(false);
    }
  };

  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      const res = await fetch(`/api/proglat/${program.id}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "all" }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal mereset data.");
      }
      setProgram(json.data);
      setEditingProgram(false);
      setResetConfirmOpen(false);
      showToast({
        type: "success",
        title: "Reset ke Bawaan Berhasil",
        message: `Seluruh data program *${json.data.title}* telah dikembalikan ke data bawaan.`,
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Mereset Data",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mereset data.",
      });
    } finally {
      setResetting(false);
    }
  };

  const pdfPreviewUrl = `/api/proglat/${program.id}/pdf`;
  const pdfDownloadUrl = `/api/proglat/${program.id}/pdf?download=1`;

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div>
            <Link
              href="/administrasi/program-pelatihan"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-black shadow-xs transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
            >
              <IconArrowLeftFill className="h-4 w-4" />
              Kembali
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-black sm:text-2xl dark:text-white">
              {program.title}
            </h1>
            {program.isManualEdited && (
              <span className="rounded-md bg-indigo-700 px-2.5 py-1 text-[11.5px] font-semibold text-white">
                Disesuaikan Manual
              </span>
            )}
          </div>
          {program.vocationalName && (
            <p className="text-[13px] font-medium text-black dark:text-slate-200">
              {program.vocationalName}
              {program.subVocationalName
                ? ` / ${program.subVocationalName}`
                : ""}
            </p>
          )}
        </div>
      </div>

      {/* Program Summary Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-800 text-white dark:bg-blue-600">
              <IconBookFill className="h-4 w-4" />
            </div>
            <h2 className="text-[15px] font-bold text-black dark:text-white">
              Ringkasan Program Pelatihan
            </h2>
          </div>

          {canEdit && !editingProgram && (
            <div className="flex flex-wrap items-center gap-2">
              {program.isManualEdited && (
                <button
                  type="button"
                  onClick={() => setResetConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600 bg-white px-3.5 py-2 text-[13px] font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-500 dark:bg-slate-900 dark:text-amber-400 dark:hover:bg-amber-950/50"
                >
                  <IconRefreshFill className="h-4 w-4" />
                  Reset Bawaan
                </button>
              )}
              <button
                type="button"
                onClick={startEditProgram}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <IconEditFill className="h-4 w-4" />
                Edit Ringkasan
              </button>
            </div>
          )}
        </div>

        {editingProgram ? (
          <form onSubmit={handleSaveProgram} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-3">
                <label className="mb-1 block text-[12.5px] font-semibold text-black dark:text-slate-300">
                  Kode Program (Tetap)
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={program.code || "-"}
                  className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-[13px] text-black dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                />
              </div>

              <div className="md:col-span-6">
                <label className="mb-1 block text-[12.5px] font-semibold text-black dark:text-white">
                  Judul Program <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={progTitle}
                  onChange={(e) => setProgTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-black outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="md:col-span-3">
                <label className="mb-1 block text-[12.5px] font-semibold text-black dark:text-white">
                  Tipe Program
                </label>
                <SearchableSelect
                  value={progType}
                  onChange={(val) => setProgType(val)}
                  placeholder="Pilih tipe"
                  searchable={false}
                  clearable={false}
                  options={getProgramTypeOptions(progType)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <p className="text-[12px] text-black dark:text-slate-300">
                Total Modul ({computedTotalModules}) dan Total Durasi (
                {computedTotalDuration} JP) dihitung otomatis dari Daftar Unit
                Kompetensi.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingProgram}
                  onClick={() => setEditingProgram(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingProgram}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  <IconCheckCircleFill className="h-4 w-4" />
                  {savingProgram ? "Menyimpan..." : "Simpan Ringkasan"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-12">
            <div className="col-span-2 flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:col-span-2 lg:col-span-3 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[12px] font-medium text-black dark:text-slate-300">
                Kode Program
              </p>
              <p className="mt-1 break-all font-mono text-[12.5px] font-bold leading-snug text-black dark:text-white">
                {program.code || "-"}
              </p>
            </div>
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-1 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[12px] font-medium text-black dark:text-slate-300">
                Versi
              </p>
              <p className="mt-1 text-[15px] font-bold text-black dark:text-white">
                v{program.version || 1}
              </p>
            </div>
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[12px] font-medium text-black dark:text-slate-300">
                Tanggal Publish
              </p>
              <p className="mt-1 text-[14px] font-bold text-black dark:text-white">
                {formatPublishDate(program.publishedAt)}
              </p>
            </div>
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[12px] font-medium text-black dark:text-slate-300">
                Tipe Program
              </p>
              <p className="mt-1">
                <span
                  className={`inline-block rounded-md px-2.5 py-0.5 text-[12px] font-semibold uppercase ${getProglatTypeBadgeClass(program.type)}`}
                >
                  {program.type || "-"}
                </span>
              </p>
            </div>
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[12px] font-medium text-black dark:text-slate-300">
                Total Modul
              </p>
              <p className="mt-1 text-[16px] font-bold text-black dark:text-white">
                {computedTotalModules}
              </p>
            </div>
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[12px] font-medium text-black dark:text-slate-300">
                Total Durasi
              </p>
              <p className="mt-1 text-[16px] font-bold text-black dark:text-white">
                {computedTotalDuration} JP
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Split-Screen Grid: Left = Unit Kompetensi Table, Right = Inline PDF Preview */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        {/* LEFT: Daftar Unit Kompetensi */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <h2 className="text-[15px] font-bold text-black dark:text-white">
              Daftar Unit Kompetensi ({computedTotalModules})
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-52">
                <IconSearchFill className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                  placeholder="Cari kode atau judul unit..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-[13px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setSkkniQuery("");
                    setAddModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <IconPlusFill className="h-4 w-4" />
                  Tambah Unit
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-slate-100 text-[13.5px] font-bold text-black dark:bg-slate-800 dark:text-white">
                <tr>
                  <th className="w-10 border-b border-slate-200 px-2 py-3 text-center dark:border-slate-700">
                    No
                  </th>
                  <th className="w-32 border-b border-slate-200 px-2 py-3 text-center dark:border-slate-700">
                    Kode Unit
                  </th>
                  <th className="border-b border-slate-200 px-2 py-3 text-center dark:border-slate-700">
                    Judul Unit
                  </th>
                  <th className="w-40 border-b border-slate-200 px-2 py-3 text-center dark:border-slate-700">
                    Jenis Unit
                  </th>
                  <th className="w-24 border-b border-slate-200 px-2 py-3 text-center dark:border-slate-700">
                    Durasi (JP)
                  </th>
                  {canEdit && (
                    <th className="w-20 border-b border-slate-200 px-2 py-3 text-center dark:border-slate-700">
                      Aksi
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredTopics.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEdit ? 6 : 5}
                      className="px-4 py-10 text-center text-black dark:text-slate-300"
                    >
                      Belum ada unit kompetensi.
                    </td>
                  </tr>
                ) : (
                  filteredTopics.map((topic, idx) => (
                    <tr
                      key={topic.id}
                      className="border-b border-slate-200/80 align-top odd:bg-white even:bg-slate-50/90 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800/50"
                    >
                      <td className="px-2 py-3 text-center font-normal text-black dark:text-slate-200">
                        {idx + 1}
                      </td>
                      <td className="px-2 py-3 text-center font-mono text-[11.5px] font-normal text-black dark:text-slate-200">
                        {topic.code || "-"}
                      </td>
                      <td className="px-2 py-3 text-left font-normal text-black dark:text-slate-100">
                        {topic.title}
                      </td>
                      <td className="px-2 py-2.5 text-center font-normal">
                        {canEdit ? (
                          <SearchableSelect
                            value={topic.jenisUnitId || ""}
                            onChange={(val) =>
                              void handleSaveJenisUnit(topic, val)
                            }
                            placeholder="Pilih jenis..."
                            searchable={false}
                            clearable={false}
                            disabled={savingTopicId === topic.id}
                            options={jenisSelectOptions}
                          />
                        ) : (
                          <span className="text-black dark:text-slate-200">
                            {topic.jenisUnitId
                              ? jenisLabelMap.get(topic.jenisUnitId) || "-"
                              : "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center font-normal text-black dark:text-slate-200">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            disabled={savingTopicId === topic.id}
                            value={
                              durationDrafts[topic.id] ?? String(topic.duration)
                            }
                            onChange={(e) =>
                              setDurationDrafts((prev) => ({
                                ...prev,
                                [topic.id]: e.target.value,
                              }))
                            }
                            onBlur={() => void handleSaveDuration(topic)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                            aria-label={`Durasi JP ${topic.title}`}
                            className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-[13px] font-medium text-black outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          />
                        ) : (
                          <span>{topic.duration} JP</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-2 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setDeleteTargetTopic(topic)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-600 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-500 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
                          >
                            <IconTrashFill className="h-3.5 w-3.5" />
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: Live Inline PDF Preview */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-20 xl:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-700 text-white">
                <IconDocumentFill className="h-4 w-4" />
              </div>
              <h2 className="text-[14.5px] font-bold text-black dark:text-white">
                Pratinjau Dokumen Program
              </h2>
            </div>

            {program.downloadMaterialUri && (
              <div className="flex items-center gap-1.5">
                <a
                  href={pdfPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <IconEyeFill className="h-3.5 w-3.5" />
                  Tab Baru
                </a>
                <a
                  href={pdfDownloadUrl}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-800 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <IconDownloadFill className="h-3.5 w-3.5" />
                  Unduh
                </a>
              </div>
            )}
          </div>

          {program.downloadMaterialUri ? (
            <iframe
              src={pdfPreviewUrl}
              title={`Pratinjau PDF ${program.title}`}
              className="h-[74vh] w-full bg-slate-100 dark:bg-slate-950"
            />
          ) : (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
              <IconDocumentFill className="h-12 w-12 text-slate-300 dark:text-slate-700" />
              <p className="text-[14px] font-semibold text-black dark:text-white">
                Dokumen PDF Tidak Tersedia
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Tambah Unit Kompetensi dari SKKNI (`skkni_units`) */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => !addingSkkni && setAddModalOpen(false)}
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
                disabled={addingSkkni}
                onClick={() => setAddModalOpen(false)}
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
                onChange={(u) => void handleAddSkkniUnit(u)}
                disabled={addingSkkni}
              >
                <div className="relative">
                  <IconSearchFill className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <ComboboxInput
                    autoFocus
                    value={skkniQuery}
                    onChange={(e) => setSkkniQuery(e.target.value)}
                    placeholder="Ketik kode unit SKKNI atau judul unit..."
                    className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-[13px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <ComboboxOptions
                  static
                  className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-200/80 dark:border-slate-800 dark:bg-slate-950 dark:divide-slate-800"
                >
                  {skkniSearching ? (
                    <div className="px-4 py-8 text-center text-[13px] text-black dark:text-slate-300">
                      Mencari unit kerja SKKNI...
                    </div>
                  ) : skkniResults.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[13px] text-black dark:text-slate-300">
                      Unit SKKNI tidak ditemukan.
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

      {/* Modal Konfirmasi Hapus Unit */}
      {deleteTargetTopic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => !deletingTopic && setDeleteTargetTopic(null)}
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
                  Hapus Unit Kompetensi?
                </h3>
              </div>
              <button
                type="button"
                disabled={deletingTopic}
                onClick={() => setDeleteTargetTopic(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <IconCloseFill className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 p-5 text-[13.5px] text-black dark:text-slate-200">
              <p>
                Hapus unit kompetensi{" "}
                <strong>{deleteTargetTopic.title}</strong>? Total Modul dan
                Total Durasi akan otomatis disesuaikan.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <button
                type="button"
                disabled={deletingTopic}
                onClick={() => setDeleteTargetTopic(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingTopic}
                onClick={() => void handleDeleteTopic()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
              >
                <IconTrashFill className="h-4 w-4" />
                {deletingTopic ? "Menghapus..." : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {resetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => !resetting && setResetConfirmOpen(false)}
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
                  Reset Program ke Bawaan?
                </h3>
              </div>
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetConfirmOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <IconCloseFill className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5 text-[13.5px] text-black dark:text-slate-200">
              <p>
                Seluruh penyesuaian manual pada program dan semua unit
                kompetensi <strong>{program.title}</strong> akan dikembalikan ke
                data bawaan penarikan.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={() => void handleConfirmReset()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
              >
                <IconRefreshFill className="h-4 w-4" />
                {resetting ? "Mereset..." : "Ya, Reset Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
