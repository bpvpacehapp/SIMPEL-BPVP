export const PROGLAT_API_URL =
  "https://api.kemnaker.go.id/proglat/v1/public/programs";

export interface ExternalProglatTopic {
  id: string;
  program_id: string;
  code?: string | null;
  title: string;
  duration: number;
  references?: string | null;
  description?: string | null;
  type?: string | null;
  skkni_id?: string | null;
  skkni_unit_id?: string | null;
}

export interface ExternalProglatProgram {
  id: string;
  code?: string | null;
  title: string;
  total_modules: number;
  total_duration: number;
  type?: string | null;
  published_at?: string | null; // Waktu terbaru antara updated_at dan created_at
  cover_image?: string | null;
  download_material_uri?: string | null;
  vocational_name?: string | null;
  sub_vocational_name?: string | null;
  status?: string | null;
  version: number;
  program_topics: ExternalProglatTopic[];
}

interface RawProglatProgram {
  id?: string;
  code?: string | null;
  title?: string | null;
  total_modules?: number | string | null;
  total_topic?: number | string | null;
  total_duration?: number | string | null;
  total_topic_duration?: number | string | null;
  type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  cover_image?: string | null;
  download_material_uri?: string | null;
  vocational?: { name?: string | null } | null;
  sub_vocational?: { name?: string | null } | null;
  status?: string | null;
  version?: number | null;
  program_topics?: Array<{
    id?: string;
    program_id?: string;
    code?: string | null;
    title?: string | null;
    duration?: number | string | null;
    references?: string | null;
    description?: string | null;
    type?: string | null;
    skkni_id?: string | null;
    skkni_unit_id?: string | null;
  }>;
}

interface ProglatApiPageResponse {
  data: RawProglatProgram[];
  meta?: {
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
}

interface ProglatSnapshotCache {
  fetchedAt: number;
  totalPages: number;
  totalFromApi: number;
  programs: ExternalProglatProgram[];
  byId: Map<string, ExternalProglatProgram>;
}

const SNAPSHOT_TTL_MS = 5 * 60 * 1000; // 5 menit

const globalForProglat = globalThis as unknown as {
  proglatSnapshot?: ProglatSnapshotCache;
  proglatItemsCache?: Map<
    string,
    { item: ExternalProglatProgram; cachedAt: number }
  >;
};

function getItemsCache() {
  if (!globalForProglat.proglatItemsCache) {
    globalForProglat.proglatItemsCache = new Map();
  }
  return globalForProglat.proglatItemsCache;
}

export function rememberProglatPrograms(items: ExternalProglatProgram[]) {
  const cache = getItemsCache();
  const now = Date.now();
  for (const item of items) {
    cache.set(item.id, { item, cachedAt: now });
  }
}

export function getCachedProglatSnapshot(): ProglatSnapshotCache | null {
  const snap = globalForProglat.proglatSnapshot;
  if (!snap) return null;
  if (Date.now() - snap.fetchedAt > SNAPSHOT_TTL_MS) {
    globalForProglat.proglatSnapshot = undefined;
    return null;
  }
  return snap;
}

export function getSnapshotProglatById(
  id: string
): ExternalProglatProgram | null {
  const snap = getCachedProglatSnapshot();
  if (snap?.byId.has(id)) {
    return snap.byId.get(id) ?? null;
  }
  const entry = getItemsCache().get(id);
  if (entry && Date.now() - entry.cachedAt <= SNAPSHOT_TTL_MS * 3) {
    return entry.item;
  }
  return null;
}

function toSafeInt(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function parseApiTimestamp(val?: string | null): Date | null {
  if (!val) return null;
  // Format dari API Proglat: "2026-05-07 13:30:55"
  const normalized = val.includes("T") ? val : val.replace(" ", "T") + "+07:00";
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) return d;
  const fallback = new Date(val);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function resolveLatestPublishIso(
  createdAt?: string | null,
  updatedAt?: string | null
): string | null {
  const c = parseApiTimestamp(createdAt);
  const u = parseApiTimestamp(updatedAt);
  if (c && u) {
    return (u.getTime() >= c.getTime() ? u : c).toISOString();
  }
  return (u || c)?.toISOString() ?? null;
}

function normalizeProgram(raw: RawProglatProgram): ExternalProglatProgram | null {
  if (!raw?.id) return null;

  const topics: ExternalProglatTopic[] = Array.isArray(raw.program_topics)
    ? raw.program_topics
        .filter((t): t is NonNullable<typeof t> & { id: string } =>
          Boolean(t?.id)
        )
        .map((t) => ({
          id: t.id,
          program_id: t.program_id || raw.id!,
          code: t.code ? String(t.code).trim() : null,
          title: (t.title || "-").trim(),
          duration: toSafeInt(t.duration),
          references: t.references ? String(t.references).trim() : null,
          description: t.description ? String(t.description).trim() : null,
          type: t.type ? String(t.type).trim() : null,
          skkni_id: t.skkni_id ?? null,
          skkni_unit_id: t.skkni_unit_id ?? null,
        }))
    : [];

  return {
    id: raw.id,
    code: raw.code ? String(raw.code).trim() : null,
    title: (raw.title || "-").trim(),
    total_modules: toSafeInt(
      raw.total_modules ?? raw.total_topic ?? topics.length
    ),
    total_duration: toSafeInt(
      raw.total_duration ?? raw.total_topic_duration ?? 0
    ),
    type: raw.type ? String(raw.type).trim() : null,
    published_at: resolveLatestPublishIso(raw.created_at, raw.updated_at),
    cover_image: raw.cover_image ?? null,
    download_material_uri: raw.download_material_uri ?? null,
    vocational_name: raw.vocational?.name?.trim() || null,
    sub_vocational_name: raw.sub_vocational?.name?.trim() || null,
    status: raw.status ?? null,
    version: toSafeInt(raw.version) || 1,
    program_topics: topics,
  };
}

/**
 * Pencarian AJAX cepat (default limit=10) untuk dropdown Combobox di Modal Tambah Program.
 */
export async function searchProglatProgramsAjax(
  keyword: string,
  limit = 10
): Promise<{
  programs: ExternalProglatProgram[];
  totalFromApi: number;
}> {
  const res = await fetchProglatPage(1, limit, 1, keyword);
  const programs: ExternalProglatProgram[] = [];
  for (const raw of res.data) {
    const norm = normalizeProgram(raw);
    if (norm) programs.push(norm);
  }
  rememberProglatPrograms(programs);
  return {
    programs,
    totalFromApi: res.meta?.pagination?.total ?? programs.length,
  };
}

export async function fetchProglatPage(
  page: number,
  limit = 20,
  retries = 2,
  keyword = ""
): Promise<ProglatApiPageResponse> {
  const qs = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    keyword: keyword.trim(),
    vocational: "",
    sub_vocational: "",
    status: "",
    module_id: "",
    hasCode: "false",
    sortBy: "created_at",
    sortOrder: "desc",
  });
  const url = `${PROGLAT_API_URL}?${qs.toString()}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      });

      if (!res.ok) {
        throw new Error(
          `API Proglat Kemnaker gagal pada halaman ${page} (HTTP ${res.status})`
        );
      }

      const json = (await res.json()) as ProglatApiPageResponse;
      return {
        data: Array.isArray(json.data) ? json.data : [],
        meta: json.meta,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Gagal menarik halaman ${page} dari API Proglat Kemnaker.`);
}

/**
 * Menarik Program Pelatihan menggunakan pencarian server-side (`keyword`) untuk mode Tarik Pilihan.
 * Jauh lebih cepat (1-4 detik) dibanding menarik seluruh 985 program.
 */
export async function fetchProglatProgramsByKeyword(
  keyword: string,
  concurrency = 4
): Promise<{
  programs: ExternalProglatProgram[];
  totalPages: number;
  totalFromApi: number;
}> {
  const limit = 20;
  const firstPage = await fetchProglatPage(1, limit, 2, keyword);
  const lastPage = firstPage.meta?.pagination?.last_page ?? 1;
  const totalFromApi =
    firstPage.meta?.pagination?.total ?? firstPage.data.length;

  const pageResults: RawProglatProgram[][] = new Array(lastPage);
  pageResults[0] = firstPage.data;

  let nextPage = 2;
  const workerCount = Math.min(concurrency, Math.max(0, lastPage - 1));

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = nextPage++;
      if (current > lastPage) break;
      const res = await fetchProglatPage(current, limit, 2, keyword);
      pageResults[current - 1] = res.data;
    }
  });

  await Promise.all(workers);

  const uniqueMap = new Map<string, ExternalProglatProgram>();
  for (const pageItems of pageResults) {
    if (!pageItems) continue;
    for (const raw of pageItems) {
      const norm = normalizeProgram(raw);
      if (norm) uniqueMap.set(norm.id, norm);
    }
  }

  const programs = Array.from(uniqueMap.values());
  rememberProglatPrograms(programs);

  return {
    programs,
    totalPages: lastPage,
    totalFromApi,
  };
}

/**
 * Menarik seluruh Program Pelatihan (beserta program_topics & download_material_uri)
 * dari 1 URL Proglat Kemnaker menggunakan async worker pool (limit=20, concurrency=4) + snapshot cache 5 menit.
 */
export async function fetchAllProglatPrograms(
  concurrency = 4,
  options?: { useCache?: boolean }
): Promise<{
  programs: ExternalProglatProgram[];
  totalPages: number;
  totalFromApi: number;
}> {
  if (options?.useCache) {
    const cached = getCachedProglatSnapshot();
    if (cached) {
      return {
        programs: cached.programs,
        totalPages: cached.totalPages,
        totalFromApi: cached.totalFromApi,
      };
    }
  }

  const limit = 20;
  const firstPage = await fetchProglatPage(1, limit, 2);
  const lastPage = firstPage.meta?.pagination?.last_page ?? 1;
  const totalFromApi =
    firstPage.meta?.pagination?.total ?? firstPage.data.length;

  const pageResults: RawProglatProgram[][] = new Array(lastPage);
  pageResults[0] = firstPage.data;

  let nextPage = 2;
  const workerCount = Math.min(concurrency, Math.max(0, lastPage - 1));

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = nextPage++;
      if (current > lastPage) break;
      const res = await fetchProglatPage(current, limit, 2);
      pageResults[current - 1] = res.data;
    }
  });

  await Promise.all(workers);

  const uniqueMap = new Map<string, ExternalProglatProgram>();
  for (const pageItems of pageResults) {
    if (!pageItems) continue;
    for (const raw of pageItems) {
      const norm = normalizeProgram(raw);
      if (norm) uniqueMap.set(norm.id, norm);
    }
  }

  const programs = Array.from(uniqueMap.values());
  rememberProglatPrograms(programs);

  globalForProglat.proglatSnapshot = {
    fetchedAt: Date.now(),
    totalPages: lastPage,
    totalFromApi,
    programs,
    byId: uniqueMap,
  };

  return {
    programs,
    totalPages: lastPage,
    totalFromApi,
  };
}

export interface ProglatFilterInput {
  code?: string;
  title?: string;
  type?: string;
}

export function filterProglatPrograms(
  programs: ExternalProglatProgram[],
  filters: ProglatFilterInput
): ExternalProglatProgram[] {
  const codeQ = (filters.code || "").trim().toLowerCase();
  const titleQ = (filters.title || "").trim().toLowerCase();
  const typeQ = (filters.type || "").trim().toLowerCase();

  return programs.filter((p) => {
    if (codeQ && !(p.code || "").toLowerCase().includes(codeQ)) {
      return false;
    }
    if (titleQ && !p.title.toLowerCase().includes(titleQ)) {
      return false;
    }
    if (typeQ && !(p.type || "").toLowerCase().includes(typeQ)) {
      return false;
    }
    return true;
  });
}
