export interface SimpegPegawai {
  id: string;
  nik?: string | null;
  nip?: string | null;
  nama: string;
  email?: string | null;
  noHp?: string | null;
  fotoUrl?: string | null;
  aktif?: boolean;
  unitKerja?: string | null;
  bagian?: string | null;
  subUnitKerja?: string | null;
  jabatan?: string | null;
  statusPegawai?: string | null;
}

interface SimpegApiResponse {
  success: boolean;
  client?: string;
  total?: number;
  data?: SimpegPegawai | SimpegPegawai[];
  message?: string;
}

export interface SimpegQueryParams {
  search?: string;
  nama?: string;
  nip?: string;
  email?: string;
  id?: string;
}

const MOCK_PEGAWAI_SIMPEG: SimpegPegawai[] = [
  {
    id: "peg-001",
    nik: "1171010101900001",
    nip: "199001012020011001",
    nama: "Administrator Sistem",
    email: "admin@bpvp.kemnaker.go.id",
    noHp: "081269000001",
    fotoUrl: null,
    aktif: true,
    unitKerja: "Balai Pelatihan Vokasi dan Produktivitas Banda Aceh",
    bagian: "Subbagian Umum",
    subUnitKerja: "Subbagian Umum",
    jabatan: "Pranata Komputer Ahli Pertama",
    statusPegawai: "PNS",
  },
  {
    id: "peg-002",
    nik: "1171021505880002",
    nip: "198805152019031002",
    nama: "Teuku Muhammad Reza",
    email: "reza.bpvp@kemnaker.go.id",
    noHp: "081269000002",
    fotoUrl: null,
    aktif: true,
    unitKerja: "Balai Pelatihan Vokasi dan Produktivitas Banda Aceh",
    bagian: "Seksi Penyelenggaraan Pelatihan",
    subUnitKerja: "Seksi Penyelenggaraan Pelatihan",
    jabatan: "Instruktur Ahli Muda",
    statusPegawai: "PNS",
  },
  {
    id: "peg-003",
    nik: "1171032208920003",
    nip: "199208222020122003",
    nama: "Cut Nadia Putri",
    email: "nadia.bpvp@kemnaker.go.id",
    noHp: "081269000003",
    fotoUrl: null,
    aktif: true,
    unitKerja: "Balai Pelatihan Vokasi dan Produktivitas Banda Aceh",
    bagian: "Seksi Pemberdayaan",
    subUnitKerja: "Seksi Pemberdayaan",
    jabatan: "Analis Pelatihan Kerja",
    statusPegawai: "PNS",
  },
  {
    id: "peg-004",
    nik: "1171041011950004",
    nip: "199511102022031004",
    nama: "Fajar Ramadhan",
    email: "fajar.bpvp@kemnaker.go.id",
    noHp: "081269000004",
    fotoUrl: null,
    aktif: true,
    unitKerja: "Balai Pelatihan Vokasi dan Produktivitas Banda Aceh",
    bagian: "Subbagian Umum",
    subUnitKerja: "Subbagian Umum",
    jabatan: "Pengelola Data Kepegawaian",
    statusPegawai: "PPPK",
  },
  {
    id: "peg-005",
    nik: "1171050504910005",
    nip: "199104052019032005",
    nama: "Siti Rahmawati",
    email: "siti.rahmawati@kemnaker.go.id",
    noHp: "081269000005",
    fotoUrl: null,
    aktif: true,
    unitKerja: "Balai Pelatihan Vokasi dan Produktivitas Banda Aceh",
    bagian: "Seksi Penyelenggaraan Pelatihan",
    subUnitKerja: "Seksi Penyelenggaraan Pelatihan",
    jabatan: "Instruktur Kejuruan TIK",
    statusPegawai: "PNS",
  },
];

function isSimpegMockEnabled(): boolean {
  return process.env.ENABLE_SIMPEG_MOCK === "true";
}

function filterMockPegawai(params?: SimpegQueryParams): SimpegPegawai[] {
  let list = [...MOCK_PEGAWAI_SIMPEG];
  if (!params) return list;

  if (params.id) {
    list = list.filter((p) => p.id === params.id);
  }
  if (params.nip) {
    const q = params.nip.trim();
    list = list.filter((p) => p.nip === q || p.nik === q);
  }
  if (params.email) {
    const q = params.email.trim().toLowerCase();
    list = list.filter((p) => p.email?.toLowerCase() === q);
  }
  const keyword = (params.search || params.nama || "").trim().toLowerCase();
  if (keyword) {
    list = list.filter(
      (p) =>
        p.nama.toLowerCase().includes(keyword) ||
        p.nip?.toLowerCase().includes(keyword) ||
        p.email?.toLowerCase().includes(keyword) ||
        p.jabatan?.toLowerCase().includes(keyword)
    );
  }
  return list;
}

function normalizeSimpegData(
  data?: SimpegPegawai | SimpegPegawai[]
): SimpegPegawai[] {
  if (!data) return [];
  const raw = Array.isArray(data) ? data : [data];
  return raw.map((item) => ({
    ...item,
    subUnitKerja: item.subUnitKerja || item.bagian || null,
  }));
}

/**
 * Mengambil daftar pegawai dari API Integrasi SIMPEG BPVP:
 * GET {SIMPEG_API_URL}/api/v1/integrasi/pegawai
 * Header: x-api-key: {SIMPEG_API_KEY}
 */
export async function getPegawaiFromSimpeg(
  params?: SimpegQueryParams
): Promise<SimpegPegawai[]> {
  if (isSimpegMockEnabled()) {
    return filterMockPegawai(params);
  }

  const baseUrl = (process.env.SIMPEG_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.SIMPEG_API_KEY || "";

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Konfigurasi SIMPEG_API_URL atau SIMPEG_API_KEY belum diatur."
    );
  }

  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.nama) query.set("nama", params.nama);
  if (params?.nip) query.set("nip", params.nip);
  if (params?.email) query.set("email", params.email);
  if (params?.id) query.set("id", params.id);

  const qs = query.toString();
  const url = `${baseUrl}/api/v1/integrasi/pegawai${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 404) {
    return [];
  }

  if (!res.ok) {
    throw new Error(`SIMPEG API error: HTTP ${res.status}`);
  }

  const json = (await res.json()) as SimpegApiResponse;
  if (!json.success) {
    throw new Error(json.message || "SIMPEG API mengembalikan status gagal.");
  }

  return normalizeSimpegData(json.data);
}

/**
 * Mencari 1 pegawai spesifik dari SIMPEG berdasarkan prioritas:
 * pegawaiId -> nip -> email.
 */
export async function getSinglePegawaiFromSimpeg(params: {
  pegawaiId?: string | null;
  nip?: string | null;
  email?: string | null;
}): Promise<SimpegPegawai | null> {
  if (params.pegawaiId) {
    const byId = await getPegawaiFromSimpeg({ id: params.pegawaiId });
    if (byId.length > 0) return byId[0];
  }

  if (params.nip) {
    const byNip = await getPegawaiFromSimpeg({ nip: params.nip });
    if (byNip.length > 0) return byNip[0];
  }

  if (params.email) {
    const byEmail = await getPegawaiFromSimpeg({ email: params.email });
    if (byEmail.length > 0) return byEmail[0];
  }

  return null;
}
