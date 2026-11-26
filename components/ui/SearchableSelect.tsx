"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconChevronDownFill,
  IconSearchFill,
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

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Ketik untuk mencari...",
  emptyText = "Tidak ditemukan.",
  ariaLabel,
  searchable = true,
  clearable = true,
  showResetOption = true,
  size = "md",
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    return options.find((o) => o.value === value)?.label || value;
  }, [value, options]);

  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = Math.min(
      300,
      (searchable ? 48 : 0) + Math.max(1, options.length + 1) * 36 + 12
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight && rect.top > spaceBelow;

    const minWidth = Math.max(rect.width, size === "sm" ? 160 : rect.width);
    const left = Math.min(
      rect.left,
      Math.max(8, window.innerWidth - minWidth - 8)
    );

    setMenuStyle({
      position: "fixed",
      left,
      width: minWidth,
      top: openUpward ? undefined : rect.bottom + 6,
      bottom: openUpward ? window.innerHeight - rect.top + 6 : undefined,
      zIndex: 90,
    });
  }, [options.length, searchable, size]);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const timer = window.setTimeout(() => {
      if (searchable) inputRef.current?.focus();
    }, 10);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      setQuery("");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };

    const handleReposition = () => updatePosition();

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, searchable, updatePosition]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  };

  const triggerSizing =
    size === "sm"
      ? "rounded-lg px-2.5 py-1.5 text-xs font-normal"
      : "rounded-xl px-3.5 py-2.5 text-sm font-medium";

  return (
    <div className={`relative w-full ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        className={`w-full flex items-center justify-between gap-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-black dark:text-slate-100 hover:border-slate-400 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors cursor-pointer ${triggerSizing}`}
      >
        <span className="truncate text-left">
          {selectedLabel || placeholder}
        </span>

        <span className="flex items-center gap-1 shrink-0">
          {clearable && value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              title="Hapus pilihan"
              aria-label="Hapus pilihan"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect("");
                }
              }}
              className="flex h-4 w-4 items-center justify-center rounded text-black/50 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-black dark:hover:text-white"
            >
              <IconCloseFill className="h-3 w-3" />
            </span>
          )}
          <IconChevronDownFill
            className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} text-black/60 dark:text-slate-400 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
          >
            {searchable && (
              <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <div className="relative">
                  <IconSearchFill className="h-3.5 w-3.5 text-black/50 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-black dark:text-white placeholder:text-black/45 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto py-1">
              {showResetOption && !query.trim() && (
                <button
                  type="button"
                  onClick={() => handleSelect("")}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                    value === ""
                      ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold"
                      : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="truncate">{placeholder}</span>
                  {value === "" && (
                    <IconCheckCircleFill className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              )}

              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-black/60 dark:text-slate-400">
                  {emptyText}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold"
                          : "text-black dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <IconCheckCircleFill className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
