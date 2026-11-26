export const SKKNI_API_URL =
  "https://skkni-api.kemnaker.go.id/v1/public/documents/with-units";
export const SKKNI_AGENCIES_URL =
  "https://skkni-api.kemnaker.go.id/v1/public/agencies";

export interface ExternalSkkniUnit {
  id: string;
  document_id: string;
  code: string;
  title: string;
  title_en?: string | null;
  availability?: string | null;
}

export interface ExternalSkkniDocument {
  id: string;
  number?: string | null;
  number_kepmen: string;
  year?: number | null;
  sector: string;
  title?: string | null;
  agency_id?: string | null;
  agency_name?: string | null;
  availability: string;
  status?: string | null;
  notes?: string | null;
  published_at?: string | null;
  file_name?: string | null;
  file_path?: string | null;
  tags?: string[] | null;
  units: ExternalSkkniUnit[];
}

interface SkkniApiPageResponse {
  data: ExternalSkkniDocument[];
  meta?: {
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
}

interface SkkniAgencyItem {
  id: string;
  name: string;
  label?: string | null;
}

interface SkkniSnapshotCache {
  fetchedAt: number;
  totalPages: number;
  totalFromApi: number;
  documents: ExternalSkkniDocument[];
  byId: Map<string, ExternalSkkniDocument>;
}

const SNAPSHOT_TTL_MS = 5 * 60 * 1000; // 5 menit

const globalForSkkni = globalThis as unknown as {
  skkniSnapshot?: SkkniSnapshotCache;
};

export function getCachedSkkniSnapshot(): SkkniSnapshotCache | null {
  const snap = globalForSkkni.skkniSnapshot;
  if (!snap) return null;
  if (Date.now() - snap.fetchedAt > SNAPSHOT_TTL_MS) {
    globalForSkkni.skkniSnapshot = undefined;
    return null;
  }
  return snap;
}

export function getSnapshotDocumentById(
  id: string
): ExternalSkkniDocument | null {
  const snap = getCachedSkkniSnapshot();
  if (!snap) return null;
  return snap.byId.get(id) ?? null;
}

export function extractSkkniYear(
  numberKepmen?: string | null,
  publishedAt?: string | null
): number | null {
  if (numberKepmen) {
    const match = numberKepmen.match(/\b(19\d{2}|20\d{2})\b/);
    if (match) return Number(match[1]);
  }
  if (publishedAt) {
    const match = publishedAt.match(/\b(19\d{2}|20\d{2})\b/);
    if (match) return Number(match[1]);
  }
  return null;
}

export async function fetchSkkniAgenciesMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(SKKNI_AGENCIES_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return map;
    const json = (await res.json()) as { data?: SkkniAgencyItem[] };
    for (const ag of json.data || []) {
      if (ag?.id && (ag.name || ag.label)) {
        map.set(ag.id, (ag.name || ag.label || "").trim());
      }
    }
  } catch (error) {
    console.warn("[SKKNI] Gagal memuat daftar instansi teknis:", error);
  }
  return map;
}

export async function fetchSkkniPage(
  page: number,
  retries = 1
): Promise<SkkniApiPageResponse> {
  const url = `${SKKNI_API_URL}?page=${page}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        throw new Error(
          `API SKKNI Kemnaker gagal pada halaman ${page} (HTTP ${res.status})`
        );
      }

      const json = (await res.json()) as SkkniApiPageResponse;
      return {
        data: Array.isArray(json.data) ? json.data : [],
        meta: json.meta,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Gagal menarik halaman ${page} dari API SKKNI Kemnaker.`);
}

/**
 * Menarik seluruh dokumen SKKNI dari API Kemnaker menggunakan async worker pool
 * (tanpa head-of-line blocking) dengan retry otomatis dan caching snapshot 5 menit di server.
 * ID dokumen dan ID unit kompetensi dipertahankan 100% asli dari API Kemnaker.
 */
export async function fetchAllSkkniDocuments(
  concurrency = 10,
  options?: { useCache?: boolean }
): Promise<{
  documents: ExternalSkkniDocument[];
  totalPages: number;
  totalFromApi: number;
}> {
  if (options?.useCache) {
    const cached = getCachedSkkniSnapshot();
    if (cached) {
      return {
        documents: cached.documents,
        totalPages: cached.totalPages,
        totalFromApi: cached.totalFromApi,
      };
    }
  }

  const [firstPage, agenciesMap] = await Promise.all([
    fetchSkkniPage(1),
    fetchSkkniAgenciesMap(),
  ]);

  const lastPage = firstPage.meta?.pagination?.last_page ?? 1;
  const totalFromApi =
    firstPage.meta?.pagination?.total ?? firstPage.data.length;

  const pageResults: ExternalSkkniDocument[][] = new Array(lastPage);
  pageResults[0] = firstPage.data;

  // Worker pool queue: begitu 1 worker selesai, langsung ambil halaman berikutnya
  let nextPage = 2;
  const workerCount = Math.min(concurrency, Math.max(0, lastPage - 1));

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = nextPage++;
      if (current > lastPage) break;
      const res = await fetchSkkniPage(current, 1);
      pageResults[current - 1] = res.data;
    }
  });

  await Promise.all(workers);

  const uniqueMap = new Map<string, ExternalSkkniDocument>();
  for (const pageDocs of pageResults) {
    if (!pageDocs) continue;
    for (const doc of pageDocs) {
      if (!doc?.id) continue;
      const kepmen = doc.number_kepmen || doc.number || "-";
      const agencyId = doc.agency_id ?? null;
      const agencyName = agencyId ? agenciesMap.get(agencyId) ?? null : null;

      uniqueMap.set(doc.id, {
        id: doc.id,
        number: doc.number ?? null,
        number_kepmen: kepmen,
        year: extractSkkniYear(kepmen, doc.published_at),
        sector: doc.sector || doc.title || "-",
        title: doc.title ?? null,
        agency_id: agencyId,
        agency_name: agencyName,
        availability: doc.availability || "applied",
        status: doc.status ?? null,
        notes: doc.notes ?? null,
        published_at: doc.published_at ?? null,
        file_name: doc.file_name ?? null,
        file_path: doc.file_path ?? null,
        tags: Array.isArray(doc.tags) ? doc.tags : [],
        units: Array.isArray(doc.units)
          ? doc.units
              .filter((u) => Boolean(u?.id))
              .map((u) => ({
                id: u.id,
                document_id: u.document_id || doc.id,
                code: (u.code || "").trim(),
                title: (u.title || "").trim(),
                title_en: u.title_en ?? null,
                availability: u.availability ?? null,
              }))
          : [],
      });
    }
  }

  const documents = Array.from(uniqueMap.values());

  globalForSkkni.skkniSnapshot = {
    fetchedAt: Date.now(),
    totalPages: lastPage,
    totalFromApi,
    documents,
    byId: uniqueMap,
  };

  return {
    documents,
    totalPages: lastPage,
    totalFromApi,
  };
}

export interface SkkniFilterInput {
  number?: string;
  year?: string;
  numberKepmen?: string;
  sector?: string;
  tag?: string;
}

export function filterSkkniDocuments(
  docs: ExternalSkkniDocument[],
  filters: SkkniFilterInput
): ExternalSkkniDocument[] {
  const numQuery = (filters.number || filters.numberKepmen || "")
    .trim()
    .toLowerCase();
  const yearQuery = (filters.year || "").trim().toLowerCase();
  const sectorQuery = (filters.sector || "").trim().toLowerCase();
  const tagQuery = (filters.tag || "").trim().toLowerCase();

  return docs.filter((doc) => {
    if (numQuery) {
      const kepmen = (doc.number_kepmen || "").toLowerCase();
      const num = (doc.number || "").toLowerCase();
      if (!num.includes(numQuery) && !kepmen.includes(numQuery)) {
        return false;
      }
    }

    if (yearQuery) {
      const docYear = doc.year ? String(doc.year) : "";
      const kepmen = (doc.number_kepmen || "").toLowerCase();
      if (!docYear.includes(yearQuery) && !kepmen.includes(yearQuery)) {
        return false;
      }
    }

    if (sectorQuery) {
      const sector = (doc.sector || "").toLowerCase();
      const title = (doc.title || "").toLowerCase();
      if (!sector.includes(sectorQuery) && !title.includes(sectorQuery)) {
        return false;
      }
    }

    if (tagQuery) {
      const tags = Array.isArray(doc.tags) ? doc.tags : [];
      const hasTag = tags.some((t) =>
        String(t).toLowerCase().includes(tagQuery)
      );
      if (!hasTag) {
        return false;
      }
    }

    return true;
  });
}
