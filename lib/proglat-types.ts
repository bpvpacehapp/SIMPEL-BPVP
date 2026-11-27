export const PROGLAT_PROGRAM_TYPE_OPTIONS = [
  { value: "offline", label: "OFFLINE" },
  { value: "online", label: "ONLINE" },
  { value: "both", label: "BOTH" },
];

export function getProgramTypeOptions(currentValue?: string | null) {
  const norm = (currentValue || "").trim().toLowerCase();
  if (norm && !PROGLAT_PROGRAM_TYPE_OPTIONS.some((o) => o.value === norm)) {
    return [
      ...PROGLAT_PROGRAM_TYPE_OPTIONS,
      {
        value: currentValue!.trim(),
        label: currentValue!.trim().toUpperCase(),
      },
    ];
  }
  return PROGLAT_PROGRAM_TYPE_OPTIONS;
}

/**
 * Mengembalikan true jika kode unit valid (bukan kosong dan bukan kategori spesial / --Spesial).
 * Unit dengan kode valid otomatis diarahkan ke jenis unit "Teknis".
 */
export function hasValidUnitCode(code?: string | null): boolean {
  const cleaned = (code || "").trim().toLowerCase();
  if (!cleaned) return false;
  if (cleaned === "-" || cleaned === "--") return false;
  if (cleaned.includes("spesial") || cleaned.includes("special")) return false;
  return true;
}

export function formatPublishDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export interface ProglatTopicSnapshot {
  id: string;
  code: string | null;
  title: string;
  duration: number;
  references: string | null;
  description: string | null;
  type: string | null;
  jenisUnitId?: string | null;
  skkniId: string | null;
  skkniUnitId: string | null;
}

export interface ProglatOriginalSnapshot {
  code: string | null;
  title: string;
  totalModules: number;
  totalDuration: number;
  type: string | null;
  topics: ProglatTopicSnapshot[];
}

export function parseOriginalSnapshot(
  raw: unknown
): ProglatOriginalSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<ProglatOriginalSnapshot>;
  if (typeof obj.title !== "string" || !Array.isArray(obj.topics)) {
    return null;
  }
  return {
    code: obj.code ?? null,
    title: obj.title,
    totalModules: Number(obj.totalModules) || 0,
    totalDuration: Number(obj.totalDuration) || 0,
    type: obj.type ?? null,
    topics: obj.topics.map((t) => ({
      id: String(t.id),
      code: t.code ?? null,
      title: String(t.title || "-"),
      duration: Number(t.duration) || 0,
      references: t.references ?? null,
      description: t.description ?? null,
      type: t.type ?? null,
      jenisUnitId: t.jenisUnitId ?? null,
      skkniId: t.skkniId ?? null,
      skkniUnitId: t.skkniUnitId ?? null,
    })),
  };
}

export function getProglatTypeBadgeClass(type?: string | null): string {
  const norm = (type || "").trim().toLowerCase();
  if (norm === "offline" || norm.includes("luring")) {
    return "bg-emerald-700 text-white dark:bg-emerald-600";
  }
  if (norm === "online" || norm.includes("daring")) {
    return "bg-sky-700 text-white dark:bg-sky-600";
  }
  if (norm === "both" || norm.includes("blended") || norm.includes("hybrid")) {
    return "bg-violet-700 text-white dark:bg-violet-600";
  }
  if (norm.includes("special") || norm.includes("spesial")) {
    return "bg-amber-600 text-white";
  }
  return "bg-slate-700 text-white dark:bg-slate-600";
}
