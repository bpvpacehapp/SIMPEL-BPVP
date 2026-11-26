"use client";

import {
  IconChevronLeftFill,
  IconChevronRightFill,
  IconChevronsLeftFill,
  IconChevronsRightFill,
} from "@/components/icons/FilledIcons";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  itemLabel?: string;
}

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = "dokumen",
}: PaginationBarProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, page * pageSize);

  const btnClass =
    "inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-semibold text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 px-5 py-3.5 text-sm">
      {/* Kiri: Awal & Kembali */}
      <div className="flex items-center justify-center sm:justify-start gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          title="Halaman Pertama"
          className={btnClass}
        >
          <IconChevronsLeftFill className="h-4 w-4" />
          <span>Awal</span>
        </button>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          title="Halaman Sebelumnya"
          className={btnClass}
        >
          <IconChevronLeftFill className="h-4 w-4" />
          <span>Kembali</span>
        </button>
      </div>

      {/* Tengah: Info Halaman */}
      <div className="text-center text-black dark:text-slate-200 tabular-nums">
        <span className="font-bold">Halaman {page}</span> dari{" "}
        <span className="font-bold">{safeTotalPages}</span>
        <span className="mx-2 text-black/40 dark:text-slate-500">•</span>
        <span>
          {startItem}–{endItem} dari {totalItems.toLocaleString("id-ID")}{" "}
          {itemLabel}
        </span>
      </div>

      {/* Kanan: Lanjut & Akhir */}
      <div className="flex items-center justify-center sm:justify-end gap-2">
        <button
          type="button"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          title="Halaman Berikutnya"
          className={btnClass}
        >
          <span>Lanjut</span>
          <IconChevronRightFill className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(safeTotalPages)}
          title="Halaman Terakhir"
          className={btnClass}
        >
          <span>Akhir</span>
          <IconChevronsRightFill className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
