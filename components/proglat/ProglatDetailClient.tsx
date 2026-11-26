"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { useToast } from "@/components/providers/ToastProvider";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { getProglatTypeBadgeClass } from "@/lib/proglat-types";
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

interface ProglatDetailClientProps {
  initialProgram: ProglatProgramDetail;
  userRole: Role;
}

export function ProglatDetailClient({
  initialProgram,
  userRole,
}: ProglatDetailClientProps) {
  const canEdit = userRole !== "USER";
  const { showToast } = useToast();

  const [program, setProgram] = useState<ProglatProgramDetail>(initialProgram);

  // Edit state untuk informasi program (code read-only; totalModules & totalDuration otomatis dari topics)
  const [editingProgram, setEditingProgram] = useState(false);
  const [progTitle, setProgTitle] = useState(initialProgram.title);
  const [progType, setProgType] = useState(initialProgram.type || "");
  const [savingProgram, setSavingProgram] = useState(false);

  // Filter pencarian unit kompetensi
  const [topicSearch, setTopicSearch] = useState("");

  // Edit inline 1 baris unit kompetensi (code TIDAK bisa diedit)
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicDuration, setTopicDuration] = useState("0");
  const [topicReferences, setTopicReferences] = useState("");
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null);

  // Modal Tambah Unit Kompetensi manual
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTopicCode, setNewTopicCode] = useState("");
  const [newTopicType, setNewTopicType] = useState("skkni");
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicDuration, setNewTopicDuration] = useState("0");
  const [newTopicReferences, setNewTopicReferences] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);

  // Konfirmasi Hapus Unit Kompetensi
  const [deleteTargetTopic, setDeleteTargetTopic] =
    useState<ProglatTopicDetail | null>(null);
  const [deletingTopic, setDeletingTopic] = useState(false);

  // Reset state (program keseluruhan atau 1 unit kompetensi)
  const [resetConfirmTarget, setResetConfirmTarget] = useState<
    { scope: "all" } | { scope: "topic"; topic: ProglatTopicDetail } | null
  >(null);
  const [resetting, setResetting] = useState(false);

  const filteredTopics = useMemo(() => {
    const q = topicSearch.trim().toLowerCase();
    if (!q) return program.topics;
    return program.topics.filter(
      (t) =>
        (t.code || "").toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.references || "").toLowerCase().includes(q) ||
        (t.type || "").toLowerCase().includes(q)
    );
  }, [program.topics, topicSearch]);

  // Total modul & total durasi otomatis mengikuti daftar unit kompetensi
  const computedTotalModules = program.topics.length;
  const computedTotalDuration = useMemo(
    () => program.topics.reduce((acc, t) => acc + (t.duration || 0), 0),
    [program.topics]
  );

  const startEditProgram = () => {
    setProgTitle(program.title);
    setProgType(program.type || "");
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

  const startEditTopic = (topic: ProglatTopicDetail) => {
    setEditingTopicId(topic.id);
    setTopicTitle(topic.title);
    setTopicDuration(String(topic.duration));
    setTopicReferences(topic.references || "");
  };

  const cancelEditTopic = () => {
    setEditingTopicId(null);
    setTopicTitle("");
    setTopicDuration("0");
    setTopicReferences("");
  };

  const handleSaveTopic = async (topicId: string) => {
    if (!topicTitle.trim()) {
      showToast({
        type: "error",
        title: "Judul Unit Wajib Diisi",
        message: "Judul unit kompetensi tidak boleh kosong.",
      });
      return;
    }

    setSavingTopicId(topicId);
    try {
      const res = await fetch(`/api/proglat/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: {
            id: topicId,
            title: topicTitle.trim(),
            duration: Number(topicDuration) || 0,
            references: topicReferences.trim() || null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json.message || "Gagal menyimpan perubahan unit kompetensi."
        );
      }
      setProgram(json.data);
      cancelEditTopic();
      showToast({
        type: "success",
        title: "Unit Kompetensi Diperbarui",
        message: json.message || "Unit kompetensi berhasil disesuaikan.",
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menyimpan Unit",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menyimpan unit kompetensi.",
      });
    } finally {
      setSavingTopicId(null);
    }
  };

  const openAddTopicModal = () => {
    setNewTopicCode("");
    setNewTopicType("skkni");
    setNewTopicTitle("");
    setNewTopicDuration("0");
    setNewTopicReferences("");
    setAddModalOpen(true);
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim()) {
      showToast({
        type: "error",
        title: "Judul Unit Wajib Diisi",
        message: "Masukkan judul unit kompetensi terlebih dahulu.",
      });
      return;
    }

    setAddingTopic(true);
    try {
      const res = await fetch(`/api/proglat/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addTopic: {
            code: newTopicCode.trim() || null,
            type: newTopicType || "skkni",
            title: newTopicTitle.trim(),
            duration: Number(newTopicDuration) || 0,
            references: newTopicReferences.trim() || null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menambahkan unit kompetensi.");
      }
      setProgram(json.data);
      setAddModalOpen(false);
      showToast({
        type: "success",
        title: "Unit Kompetensi Ditambahkan",
        message: `Unit *${newTopicTitle.trim()}* berhasil ditambahkan. Total modul & durasi otomatis diperbarui.`,
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Gagal Menambahkan Unit",
        message:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat menambahkan unit kompetensi.",
      });
    } finally {
      setAddingTopic(false);
    }
  };

  const handleDeleteTopic = async () => {
    if (!deleteTargetTopic) return;
    setDeletingTopic(true);
    try {
      const res = await fetch(`/api/proglat/${program.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deleteTopicId: deleteTargetTopic.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal menghapus unit kompetensi.");
      }
      setProgram(json.data);
      if (editingTopicId === deleteTargetTopic.id) {
        cancelEditTopic();
      }
      showToast({
        type: "success",
        title: "Unit Kompetensi Dihapus",
        message: `Unit *${deleteTargetTopic.title}* telah dihapus. Total modul & durasi otomatis diperbarui.`,
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
    if (!resetConfirmTarget) return;
    setResetting(true);
    try {
      const payload =
        resetConfirmTarget.scope === "topic"
          ? { scope: "topic", topicId: resetConfirmTarget.topic.id }
          : { scope: "all" };

      const res = await fetch(`/api/proglat/${program.id}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Gagal mereset data.");
      }

      setProgram(json.data);
      setEditingProgram(false);
      cancelEditTopic();
      setResetConfirmTarget(null);
      showToast({
        type: "success",
        title: "Reset ke Bawaan Berhasil",
        message:
          resetConfirmTarget.scope === "topic"
            ? `Unit kompetensi *${resetConfirmTarget.topic.code || resetConfirmTarget.topic.title}* telah dikembalikan ke data bawaan.`
            : `Seluruh data program *${json.data.title}* telah dikembalikan ke data bawaan.`,
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
                  onClick={() => setResetConfirmTarget({ scope: "all" })}
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
                <input
                  type="text"
                  value={progType}
                  onChange={(e) => setProgType(e.target.value)}
                  placeholder="offline, online, both"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[12px] font-medium text-black dark:text-slate-300">
                Kode Program
              </p>
              <p className="mt-1 font-mono text-[14px] font-bold text-black dark:text-white">
                {program.code || "-"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
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
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="text-[12px] font-medium text-black dark:text-slate-300">
                Total Modul
              </p>
              <p className="mt-1 text-[16px] font-bold text-black dark:text-white">
                {computedTotalModules}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
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
        {/* LEFT: Daftar Unit Kompetensi (SKKNI + --Spesial disatukan) */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <h2 className="text-[15px] font-bold text-black dark:text-white">
              Daftar Unit Kompetensi ({computedTotalModules})
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
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
                  onClick={openAddTopicModal}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-800"
                >
                  <IconPlusFill className="h-4 w-4" />
                  Tambah Unit
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead className="bg-slate-100 text-[13.5px] font-bold text-black dark:bg-slate-800 dark:text-white">
                <tr>
                  <th className="w-11 border-b border-slate-200 px-2.5 py-3 text-center dark:border-slate-700">
                    No
                  </th>
                  <th className="w-36 border-b border-slate-200 px-2.5 py-3 text-center dark:border-slate-700">
                    Kode Unit
                  </th>
                  <th className="border-b border-slate-200 px-2.5 py-3 text-center dark:border-slate-700">
                    Judul Unit & Referensi
                  </th>
                  <th className="w-24 border-b border-slate-200 px-2.5 py-3 text-center dark:border-slate-700">
                    Durasi
                  </th>
                  {canEdit && (
                    <th className="w-28 border-b border-slate-200 px-2.5 py-3 text-center dark:border-slate-700">
                      Aksi
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredTopics.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canEdit ? 5 : 4}
                      className="px-4 py-10 text-center text-black dark:text-slate-300"
                    >
                      Belum ada unit kompetensi.
                    </td>
                  </tr>
                ) : (
                  filteredTopics.map((topic, idx) => {
                    const isEditing = editingTopicId === topic.id;
                    const isSpecial =
                      (topic.type || "").toLowerCase().includes("special") ||
                      (topic.code || "").toLowerCase().includes("spesial");

                    return (
                      <tr
                        key={topic.id}
                        className="border-b border-slate-200/80 align-top odd:bg-white even:bg-slate-50/90 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800/50"
                      >
                        <td className="px-2.5 py-3 text-center font-normal text-black dark:text-slate-200">
                          {idx + 1}
                        </td>
                        <td className="px-2.5 py-3 text-center font-normal">
                          <div className="font-mono text-[12px] text-black dark:text-slate-200">
                            {topic.code || "-"}
                          </div>
                          <div className="mt-1 flex flex-wrap justify-center gap-1">
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-white ${
                                isSpecial
                                  ? "bg-amber-600"
                                  : "bg-slate-700 dark:bg-slate-600"
                              }`}
                            >
                              {topic.type || "unit"}
                            </span>
                            {topic.isManualEdited && (
                              <span className="rounded-md bg-indigo-700 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
                                Manual
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2.5 py-3 text-left font-normal text-black dark:text-slate-100">
                          {isEditing ? (
                            <div className="space-y-2">
                              <div>
                                <label className="mb-0.5 block text-[11.5px] font-semibold text-black dark:text-slate-300">
                                  Judul Unit Kompetensi
                                </label>
                                <textarea
                                  rows={2}
                                  value={topicTitle}
                                  onChange={(e) =>
                                    setTopicTitle(e.target.value)
                                  }
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-black outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[11.5px] font-semibold text-black dark:text-slate-300">
                                  Referensi
                                </label>
                                <input
                                  type="text"
                                  value={topicReferences}
                                  onChange={(e) =>
                                    setTopicReferences(e.target.value)
                                  }
                                  placeholder="Nomor SKKNI / referensi dokumen..."
                                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                                />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div>{topic.title}</div>
                              {topic.references && (
                                <p className="mt-1 text-[12px] text-black dark:text-slate-300">
                                  Ref: {topic.references}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-3 text-center font-normal text-black dark:text-slate-200">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              value={topicDuration}
                              onChange={(e) => setTopicDuration(e.target.value)}
                              className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-[13px] text-black outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            />
                          ) : (
                            <span>{topic.duration} JP</span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-2.5 py-3 text-center">
                            {isEditing ? (
                              <div className="flex flex-col items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={savingTopicId === topic.id}
                                  onClick={() => void handleSaveTopic(topic.id)}
                                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                                >
                                  <IconCheckCircleFill className="h-3.5 w-3.5" />
                                  {savingTopicId === topic.id
                                    ? "..."
                                    : "Simpan"}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingTopicId === topic.id}
                                  onClick={cancelEditTopic}
                                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                  <IconCloseFill className="h-3.5 w-3.5" />
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => startEditTopic(topic)}
                                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-blue-800 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-blue-800 transition-colors hover:bg-blue-50 dark:border-blue-500 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/60"
                                >
                                  <IconEditFill className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                                {topic.isManualEdited && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setResetConfirmTarget({
                                        scope: "topic",
                                        topic,
                                      })
                                    }
                                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-amber-600 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-500 dark:bg-slate-900 dark:text-amber-400 dark:hover:bg-amber-950/50"
                                  >
                                    <IconRefreshFill className="h-3 w-3" />
                                    Reset
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setDeleteTargetTopic(topic)}
                                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-rose-600 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-500 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
                                >
                                  <IconTrashFill className="h-3 w-3" />
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

      {/* Modal Tambah Unit Kompetensi */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => !addingTopic && setAddModalOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white">
                  <IconPlusFill className="h-5 w-5" />
                </div>
                <h3 className="text-[15.5px] font-bold text-black dark:text-white">
                  Tambah Unit Kompetensi
                </h3>
              </div>
              <button
                type="button"
                disabled={addingTopic}
                onClick={() => setAddModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <IconCloseFill className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddTopic} className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12.5px] font-semibold text-black dark:text-white">
                    Kode Unit
                  </label>
                  <input
                    type="text"
                    value={newTopicCode}
                    onChange={(e) => setNewTopicCode(e.target.value)}
                    placeholder="Contoh: C.28LOG09.001.2 / --Spesial"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12.5px] font-semibold text-black dark:text-white">
                    Tipe Unit
                  </label>
                  <SearchableSelect
                    value={newTopicType}
                    onChange={(val) => setNewTopicType(val || "skkni")}
                    placeholder="Pilih tipe unit"
                    searchable={false}
                    clearable={false}
                    options={[
                      { value: "skkni", label: "SKKNI" },
                      { value: "special", label: "Spesial (--Spesial)" },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[12.5px] font-semibold text-black dark:text-white">
                  Judul Unit Kompetensi <span className="text-rose-600">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  placeholder="Masukkan judul unit kompetensi sesuai dokumen PDF..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[12.5px] font-semibold text-black dark:text-white">
                    Durasi (JP) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newTopicDuration}
                    onChange={(e) => setNewTopicDuration(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-black outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[12.5px] font-semibold text-black dark:text-white">
                    Referensi
                  </label>
                  <input
                    type="text"
                    value={newTopicReferences}
                    onChange={(e) => setNewTopicReferences(e.target.value)}
                    placeholder="Nomor SKKNI / referensi dokumen (opsional)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-black placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  disabled={addingTopic}
                  onClick={() => setAddModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={addingTopic}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  <IconCheckCircleFill className="h-4 w-4" />
                  {addingTopic ? "Menyimpan..." : "Simpan Unit"}
                </button>
              </div>
            </form>
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
      {resetConfirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
          onClick={() => !resetting && setResetConfirmTarget(null)}
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
                  {resetConfirmTarget.scope === "topic"
                    ? "Reset Unit Kompetensi?"
                    : "Reset Program ke Bawaan?"}
                </h3>
              </div>
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetConfirmTarget(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-black hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <IconCloseFill className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5 text-[13.5px] text-black dark:text-slate-200">
              {resetConfirmTarget.scope === "topic" ? (
                <p>
                  Unit kompetensi{" "}
                  <strong>
                    {resetConfirmTarget.topic.code ||
                      resetConfirmTarget.topic.title}
                  </strong>{" "}
                  akan dikembalikan ke data bawaan penarikan.
                </p>
              ) : (
                <p>
                  Seluruh penyesuaian manual pada program dan semua unit
                  kompetensi <strong>{program.title}</strong> akan dikembalikan
                  ke data bawaan penarikan.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetConfirmTarget(null)}
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
