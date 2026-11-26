export interface ProglatTopicSnapshot {
  id: string;
  code: string | null;
  title: string;
  duration: number;
  references: string | null;
  description: string | null;
  type: string | null;
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
      skkniId: t.skkniId ?? null,
      skkniUnitId: t.skkniUnitId ?? null,
    })),
  };
}

/**
 * Variasi warna kontras tinggi untuk badge Tipe Program / Unit:
 * - offline / luring -> Hijau (emerald)
 * - online / daring -> Biru (sky)
 * - both / blended / hybrid -> Ungu (violet)
 * - special / --spesial -> Oranye (amber)
 * - lainnya -> Slate gelap
 */
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
