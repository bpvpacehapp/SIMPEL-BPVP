"use client";

import { useMemo, useState } from "react";
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  IconChevronDownFill,
  IconCloseFill,
  IconCheckCircleFill,
} from "@/components/icons/FilledIcons";

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  searchable?: boolean;
  clearable?: boolean;
  showResetOption?: boolean;
  size?: "md" | "sm";
  disabled?: boolean;
  className?: string;
}

const MAX_VISIBLE_OPTIONS = 80;

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyText = "Tidak ditemukan.",
  ariaLabel,
  searchable = true,
  clearable = true,
  showResetOption = true,
  size = "md",
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");

  const optionMap = useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options]
  );

  const selectedLabel = value ? optionMap.get(value) || value : "";

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const visibleOptions = useMemo(
    () => filteredOptions.slice(0, MAX_VISIBLE_OPTIONS),
    [filteredOptions]
  );

  const hiddenCount = filteredOptions.length - visibleOptions.length;

  const inputSizing =
    size === "sm"
      ? "rounded-lg py-1.5 pl-2.5 text-xs font-normal"
      : "rounded-xl py-2.5 pl-3.5 text-sm font-medium";

  const buttonSizing =
    size === "sm"
      ? "rounded-lg py-1.5 pl-2.5 text-xs font-normal"
      : "rounded-xl py-2.5 pl-3.5 text-sm font-medium";

  // Mode 1: Searchable Combobox (ketik langsung di placeholder utama + Tab/Enter)
  if (searchable) {
    return (
      <div className={`relative w-full ${className}`}>
        <Combobox
          immediate
          value={value}
          disabled={disabled}
          onChange={(next) => {
            onChange(next ?? "");
            setQuery("");
          }}
          onClose={() => setQuery("")}
        >
          <div className="relative w-full">
            <ComboboxInput
              aria-label={ariaLabel || placeholder}
              displayValue={(val: string) =>
                val ? optionMap.get(val) || val : ""
              }
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder || placeholder}
              className={`w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-black dark:text-slate-100 placeholder:text-black/65 dark:placeholder:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 transition-colors ${inputSizing} ${
                clearable && value && !disabled ? "pr-14" : "pr-9"
              }`}
            />

            <div className="absolute inset-y-0 right-2 flex items-center gap-0.5">
              {clearable && value && !disabled && (
                <button
                  type="button"
                  title="Hapus pilihan"
                  aria-label="Hapus pilihan"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                    setQuery("");
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-black/50 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-black dark:hover:text-white cursor-pointer"
                >
                  <IconCloseFill className="h-3.5 w-3.5" />
                </button>
              )}

              <ComboboxButton
                aria-label={`Buka daftar ${placeholder}`}
                className="flex h-6 w-6 items-center justify-center rounded text-black/60 dark:text-slate-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                <IconChevronDownFill
                  className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}`}
                />
              </ComboboxButton>
            </div>
          </div>

          <ComboboxOptions
            anchor={{ to: "bottom start", gap: 6 }}
            className="z-[90] w-[var(--input-width)] min-w-[200px] max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-xl focus:outline-none empty:invisible"
          >
            {showResetOption && !query.trim() && (
              <ComboboxOption
                value=""
                className="group flex items-center justify-between gap-2 px-3 py-2 text-[13.5px] text-black dark:text-slate-200 data-focus:bg-blue-50 dark:data-focus:bg-blue-950/60 data-focus:text-blue-700 dark:data-focus:text-blue-300 data-selected:font-semibold cursor-pointer select-none"
              >
                <span className="truncate">{placeholder}</span>
                <IconCheckCircleFill className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400 invisible group-data-selected:visible" />
              </ComboboxOption>
            )}

            {visibleOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-black/60 dark:text-slate-400">
                {emptyText}
              </div>
            ) : (
              <>
                {visibleOptions.map((opt) => (
                  <ComboboxOption
                    key={opt.value}
                    value={opt.value}
                    className="group flex items-center justify-between gap-2 px-3 py-2 text-[13.5px] text-black dark:text-slate-200 data-focus:bg-blue-50 dark:data-focus:bg-blue-950/60 data-focus:text-blue-700 dark:data-focus:text-blue-300 data-selected:font-semibold cursor-pointer select-none"
                  >
                    <span className="truncate">{opt.label}</span>
                    <IconCheckCircleFill className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400 invisible group-data-selected:visible" />
                  </ComboboxOption>
                ))}
                {hiddenCount > 0 && (
                  <div className="px-3 py-2 text-center text-[11px] text-black/60 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    +{hiddenCount.toLocaleString("id-ID")} opsi lainnya — ketik
                    untuk mempersempit pencarian
                  </div>
                )}
              </>
            )}
          </ComboboxOptions>
        </Combobox>
      </div>
    );
  }

  // Mode 2: Non-searchable Listbox (tanpa nested button agar klik selalu responsif)
  return (
    <div className={`relative w-full ${className}`}>
      <Listbox
        value={value}
        disabled={disabled}
        onChange={(next) => onChange(next ?? "")}
      >
        <div className="relative w-full">
          <ListboxButton
            aria-label={ariaLabel || placeholder}
            className={`w-full flex items-center justify-between gap-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-black dark:text-slate-100 hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors cursor-pointer ${buttonSizing} ${
              clearable && value && !disabled ? "pr-12" : "pr-8"
            }`}
          >
            <span className="truncate text-left">
              {selectedLabel || placeholder}
            </span>
          </ListboxButton>

          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-0.5">
            {clearable && value && !disabled && (
              <button
                type="button"
                title="Hapus pilihan"
                aria-label="Hapus pilihan"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded text-black/50 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-black dark:hover:text-white cursor-pointer"
              >
                <IconCloseFill className="h-3 w-3" />
              </button>
            )}
            <IconChevronDownFill
              className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} text-black/60 dark:text-slate-400`}
            />
          </div>
        </div>

        <ListboxOptions
          anchor={{ to: "bottom start", gap: 6 }}
          className="z-[90] min-w-[var(--button-width)] max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-xl focus:outline-none"
        >
          {showResetOption && (
            <ListboxOption
              value=""
              className="group flex items-center justify-between gap-2 px-3 py-2 text-[13.5px] text-black dark:text-slate-200 data-focus:bg-blue-50 dark:data-focus:bg-blue-950/60 data-focus:text-blue-700 dark:data-focus:text-blue-300 data-selected:font-semibold cursor-pointer select-none"
            >
              <span className="truncate">{placeholder}</span>
              <IconCheckCircleFill className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400 invisible group-data-selected:visible" />
            </ListboxOption>
          )}

          {options.map((opt) => (
            <ListboxOption
              key={opt.value}
              value={opt.value}
              className="group flex items-center justify-between gap-2 px-3 py-2 text-[13.5px] text-black dark:text-slate-200 data-focus:bg-blue-50 dark:data-focus:bg-blue-950/60 data-focus:text-blue-700 dark:data-focus:text-blue-300 data-selected:font-semibold cursor-pointer select-none"
            >
              <span className="truncate">{opt.label}</span>
              <IconCheckCircleFill className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400 invisible group-data-selected:visible" />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}
