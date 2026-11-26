"use client";

import { useCallback, useEffect, useState } from "react";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  IconHistoryFill,
  IconSearchFill,
  IconCodeFill,
  IconCloseFill,
  IconCheckCircleFill,
} from "@/components/icons/FilledIcons";

interface ActivityLogRecord {
  id: string;
  userId: string | null;
  userName: string | null;
  aksi: string;
  modul: string;
  detail: string | null;
  dataSebelum: unknown;
  dataSesudah: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface FilterOptions {
  moduls: string[];
  aksis: string[];
}

const PAGE_SIZE = 15;

function getActionBadgeStyle(aksi: string): string {
  const upper = aksi.toUpperCase();
  if (upper.includes("DELETE") || upper.includes("REVOKE")) {
    return "bg-rose-700 text-white dark:bg-rose-600";
  }
  if (upper.includes("UPDATE") || upper.includes("SINKRONISASI")) {
    return "bg-amber-600 text-white dark:bg-amber-600";
  }
  if (
    upper.includes("TAMBAH") ||
    upper.includes("TARIK") ||
    upper.includes("SEED")
  ) {
    return "bg-blue-700 text-white dark:bg-blue-600";
  }
  if (upper.includes("LOGIN")) {
    return "bg-emerald-700 text-white dark:bg-emerald-600";
  }
  return "bg-slate-700 text-white dark:bg-slate-600";
}

function normalizeDisplayIp(ip?: string | null): string | null {
  if (!ip) return null;
  if (ip === "::1" || ip === "::ffff:127.0.0.1") return "127.0.0.1";
  return ip.replace(/^::ffff:/, "");
}

function buildCompleteLogJson(log: ActivityLogRecord) {
  return {
    id: log.id,
    waktu: log.createdAt,
    pengguna: {
      userId: log.userId,
      nama: log.userName || "Sistem",
    },
    modul: log.modul,
    aksi: log.aksi,
    detail: log.detail,
    ipAddress: normalizeDisplayIp(log.ipAddress),
    dataSebelum: log.dataSebelum ?? null,
    dataSesudah: log.dataSesudah ?? null,
  };
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function JsonPrettyView({ data }: { data: unknown }) {
  const jsonStr = formatJson(data);
  const tokenRegex =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  const lines = jsonStr.split("\n");

  return (
    <pre className="p-4 text-[13px] font-mono leading-6 bg-slate-50 dark:bg-slate-950 text-black dark:text-slate-200 overflow-x-auto flex-1 select-text">
      {lines.map((line, lineIdx) => {
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        tokenRegex.lastIndex = 0;

        while ((match = tokenRegex.exec(line)) !== null) {
          if (match.index > lastIndex) {
            parts.push(
              <span
                key={`t-${lineIdx}-${lastIndex}`}
                className="text-black/70 dark:text-slate-400"
              >
                {line.slice(lastIndex, match.index)}
              </span>
            );
          }

          const token = match[0];
          let cls = "text-indigo-700 dark:text-violet-300"; // number
          if (token.startsWith('"')) {
            if (token.endsWith(":")) {
              cls = "text-blue-800 dark:text-sky-300 font-semibold"; // key
            } else {
              cls = "text-emerald-800 dark:text-emerald-300"; // string
            }
          } else if (token === "true" || token === "false") {
            cls = "text-amber-700 dark:text-amber-300 font-semibold"; // boolean
          } else if (token === "null") {
            cls = "text-rose-700 dark:text-rose-400 font-semibold"; // null
          }

          parts.push(
            <span key={`m-${lineIdx}-${match.index}`} className={cls}>
              {token}
            </span>
          );
          lastIndex = match.index + token.length;
        }

        if (lastIndex < line.length) {
          parts.push(
            <span
              key={`e-${lineIdx}-${lastIndex}`}
              className="text-black/70 dark:text-slate-400"
            >
              {line.slice(lastIndex)}
            </span>
          );
        }

        return (
          <div key={lineIdx} className="whitespace-pre">
            {parts.length > 0 ? parts : " "}
          </div>
        );
      })}
    </pre>
  );
}

export function LogAktivitasClient() {
  const [logs, setLogs] = useState<ActivityLogRecord[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    moduls: [],
    aksis: [],
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modulFilter, setModulFilter] = useState("");
  const [aksiFilter, setAksiFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ActivityLogRecord | null>(null);
  const [jsonTab, setJsonTab] = useState<"full" | "diff">("full");
  const [copied, setCopied] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search.trim()) qs.set("search", search.trim());
      if (modulFilter) qs.set("modul", modulFilter);
      if (aksiFilter) qs.set("aksi", aksiFilter);

      const res = await fetch(`/api/logs?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.message || "Gagal memuat log aktivitas.");

      setLogs(json.data || []);
      if (json.filterOptions) setFilterOptions(json.filterOptions);
      setTotalPages(json.pagination?.totalPages || 1);
      setTotalLogs(json.pagination?.total || 0);
    } catch (error) {
      console.error("Gagal memuat log aktivitas:", error);
    } finally {
      setLoading(false);
    }
  }, [page, search, modulFilter, aksiFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchLogs();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [fetchLogs]);

  const hasFilter = Boolean(search.trim() || modulFilter || aksiFilter);

  const handleOpenModal = (log: ActivityLogRecord) => {
    setSelectedLog(log);
    setJsonTab("full");
    setCopied(false);
  };

  const handleCopyJson = () => {
    if (!selectedLog) return;
    try {
      void navigator.clipboard?.writeText(
        formatJson(buildCompleteLogJson(selectedLog))
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Abaikan
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
            Log Aktivitas
          </h1>
          <p className="mt-1 text-sm text-black/80 dark:text-slate-300">
            Rekam jejak seluruh aktivitas pengguna (autentikasi, penambahan,
            perubahan data sebelum &amp; sesudah, serta soft delete) dalam
            format JSON lengkap.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <IconSearchFill className="h-4 w-4 text-black/50 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Cari pengguna, aksi, modul, atau detail aktivitas..."
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-4 py-2 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="w-full lg:w-52 shrink-0">
          <SearchableSelect
            value={modulFilter}
            onChange={(val) => {
              setPage(1);
              setModulFilter(val);
            }}
            options={filterOptions.moduls.map((m) => ({
              value: m,
              label: m,
            }))}
            placeholder="Semua Modul"
            searchable={false}
            ariaLabel="Filter Modul"
          />
        </div>

        <div className="w-full lg:w-52 shrink-0">
          <SearchableSelect
            value={aksiFilter}
            onChange={(val) => {
              setPage(1);
              setAksiFilter(val);
            }}
            options={filterOptions.aksis.map((a) => ({
              value: a,
              label: a,
            }))}
            placeholder="Semua Aksi"
            searchable={false}
            ariaLabel="Filter Aksi"
          />
        </div>

        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setModulFilter("");
              setAksiFilter("");
              setPage(1);
            }}
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0"
          >
            Reset
          </button>
        )}
      </div>

      {/* Tabel Log Aktivitas */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[13.5px] font-bold text-black dark:text-white">
              <tr>
                <th className="px-3 py-3.5 text-center w-14">No</th>
                <th className="px-4 py-3.5 text-center w-44">Waktu</th>
                <th className="px-4 py-3.5 text-center w-44">Pengguna</th>
                <th className="px-3 py-3.5 text-center w-40">Modul</th>
                <th className="px-3 py-3.5 text-center w-44">Aksi</th>
                <th className="px-4 py-3.5 text-center">Detail Aktivitas</th>
                <th className="px-4 py-3.5 text-center w-36">Data JSON</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className="animate-pulse odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50"
                  >
                    {Array.from({ length: 7 }).map((__, colIdx) => (
                      <td key={colIdx} className="px-4 py-4">
                        <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700 mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-black/40 dark:text-slate-400 mb-3">
                      <IconHistoryFill className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-semibold text-black dark:text-slate-200">
                      Belum ada rekaman log aktivitas yang cocok
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => {
                  const rowNum = (page - 1) * PAGE_SIZE + idx + 1;

                  return (
                    <tr
                      key={log.id}
                      className="odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors font-normal"
                    >
                      <td className="px-3 py-3 text-center text-black dark:text-slate-300 tabular-nums">
                        {rowNum}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-black dark:text-slate-200 tabular-nums">
                        {new Date(log.createdAt).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-center text-black dark:text-white">
                        {log.userName || "Sistem"}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs text-black dark:text-slate-200">
                          {log.modul}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${getActionBadgeStyle(log.aksi)}`}
                        >
                          {log.aksi}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left text-black dark:text-slate-100 leading-snug">
                        {log.detail || "—"}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenModal(log)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-black dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <IconCodeFill className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          Lihat JSON
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
          totalItems={totalLogs}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          itemLabel="log"
        />
      </div>

      {/* Modal Detail JSON Lengkap + Perbandingan Sebelum & Sesudah */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-json-modal-title"
        >
          <div className="w-full max-w-4xl max-h-[86vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <IconCodeFill className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="log-json-modal-title"
                    className="text-base font-bold text-black dark:text-white"
                  >
                    Detail Log Aktivitas (JSON Lengkap)
                  </h2>
                  <p className="text-xs text-black/75 dark:text-slate-400 mt-0.5 truncate">
                    {selectedLog.userName || "Sistem"} • {selectedLog.modul} •{" "}
                    {selectedLog.aksi} •{" "}
                    {new Date(selectedLog.createdAt).toLocaleString("id-ID")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                aria-label="Tutup"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-black dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                <IconCloseFill className="h-5 w-5" />
              </button>
            </div>

            {/* Tab JSON Lengkap vs Sebelum/Sesudah */}
            <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setJsonTab("full")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    jsonTab === "full"
                      ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs"
                      : "text-black/75 dark:text-slate-300"
                  }`}
                >
                  JSON Lengkap
                </button>
                <button
                  type="button"
                  onClick={() => setJsonTab("diff")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    jsonTab === "diff"
                      ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs"
                      : "text-black/75 dark:text-slate-300"
                  }`}
                >
                  Sebelum &amp; Sesudah
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                {copied ? (
                  <>
                    <IconCheckCircleFill className="h-3.5 w-3.5 text-emerald-600" />
                    Tersalin
                  </>
                ) : (
                  <>
                    <IconCodeFill className="h-3.5 w-3.5 text-blue-600" />
                    Salin JSON
                  </>
                )}
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {jsonTab === "full" ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <JsonPrettyView data={buildCompleteLogJson(selectedLog)} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                    <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-amber-950 dark:text-amber-200">
                      Data Sebelum (Before)
                    </div>
                    <JsonPrettyView data={selectedLog.dataSebelum ?? null} />
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
                    <div className="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/50 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-emerald-950 dark:text-emerald-200">
                      Data Sesudah (After)
                    </div>
                    <JsonPrettyView data={selectedLog.dataSesudah ?? null} />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl bg-slate-900 dark:bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-700 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
