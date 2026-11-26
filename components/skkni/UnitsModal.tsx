"use client";

import { useMemo, useState } from "react";
import {
  IconCloseFill,
  IconLayersFill,
  IconSearchFill,
  IconCheckCircleFill,
  IconCancelCircleFill,
} from "@/components/icons/FilledIcons";

export interface SkkniUnitItem {
  id: string;
  code: string;
  title: string;
  titleEn?: string | null;
  title_en?: string | null;
  availability?: string | null;
}

interface UnitsModalProps {
  open: boolean;
  onClose: () => void;
  documentNumber: string;
  sectorTitle: string;
  units: SkkniUnitItem[];
}

export function UnitsModal({
  open,
  onClose,
  documentNumber,
  sectorTitle,
  units,
}: UnitsModalProps) {
  const [search, setSearch] = useState("");

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.code.toLowerCase().includes(q) || u.title.toLowerCase().includes(q)
    );
  }, [units, search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="units-modal-title"
    >
      <div className="w-full max-w-5xl max-h-[86vh] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <IconLayersFill className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="units-modal-title"
                className="text-lg font-bold text-black dark:text-white truncate"
              >
                Daftar Unit Kompetensi
              </h2>
              <p className="text-sm text-black/80 dark:text-slate-300 mt-0.5 truncate">
                <span className="font-semibold text-black dark:text-white">
                  {documentNumber}
                </span>{" "}
                — {sectorTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-black dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <IconCloseFill className="h-5 w-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900">
          <div className="relative flex-1">
            <IconSearchFill className="h-4 w-4 text-black/50 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode atau judul unit kompetensi..."
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-3.5 py-2 text-sm text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <span className="text-sm font-semibold text-black dark:text-slate-200 tabular-nums shrink-0">
            Menampilkan {filteredUnits.length} dari {units.length} unit
          </span>
        </div>

        {/* Table: Judul Unit Kompetensi rata kiri, kolom lain center */}
        <div className="flex-1 overflow-y-auto">
          {filteredUnits.length === 0 ? (
            <div className="py-14 text-center text-sm text-black/75 dark:text-slate-400">
              Tidak ada unit kompetensi yang cocok.
            </div>
          ) : (
            <table className="w-full text-[13.5px]">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[14px] font-bold text-black dark:text-white">
                <tr>
                  <th className="px-4 py-3 text-center w-14">No</th>
                  <th className="px-4 py-3 text-center w-48">Kode Unit</th>
                  <th className="px-4 py-3 text-center">
                    Judul Unit Kompetensi
                  </th>
                  <th className="px-5 py-3 text-center w-32">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {filteredUnits.map((unit, idx) => {
                  const isApplied =
                    !unit.availability || unit.availability === "applied";
                  return (
                    <tr
                      key={unit.id}
                      className="odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900 dark:even:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors font-normal"
                    >
                      <td className="px-4 py-3 text-center text-black dark:text-slate-300 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[12.5px] text-black dark:text-slate-200 whitespace-nowrap">
                        {unit.code || "-"}
                      </td>
                      <td className="px-4 py-3 text-left text-black dark:text-slate-100">
                        <p className="leading-snug">{unit.title}</p>
                        {(unit.titleEn || unit.title_en) && (
                          <p className="text-xs text-black/70 dark:text-slate-400 italic mt-0.5">
                            {unit.titleEn || unit.title_en}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center whitespace-nowrap">
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 dark:bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
