# Blueprint & Rencana Implementasi Aplikasi Baru (Integrasi SSO BPVP, Session Tracking & Manajemen User ala SIMPRA)

Dokumen ini disusun sebagai **spesifikasi mandiri (*self-contained handoff plan*)** agar dapat langsung diberikan dan dieksekusi oleh agen pengembang di komputer/lingkungan lain tanpa memerlukan akses ke source code lokal `sso-bpvp`, `simpegbpvp`, maupun `simpra`.

---

## Ringkasan Arsitektur (Hub-and-Spoke)

Aplikasi baru berperan sebagai **Aplikasi Satelit** dalam Ekosistem Digital BPVP Banda Aceh dengan pola:

1. **Autentikasi Terpusat (*Identity Provider*)**: 100% login melalui **Central SSO BPVP (`sso-bpvp`)** menggunakan token kriptografis **HMAC-SHA256**.
2. **Otorisasi & Manajemen User (*Whitelist* ala SIMPRA)**:
   - Token SSO hanya menjadi **kunci masuk (autentikasi)**, bukan pembuat akun otomatis.
   - Hanya pegawai yang **sudah didaftarkan oleh Admin** di tabel `users` aplikasi baru yang diizinkan masuk.
   - Data profil pegawai (Nama, NIP, Jabatan, Unit Kerja, Sub Unit Kerja, Foto) disinkronkan langsung dari **API Integrasi SIMPEG BPVP** (saat pendaftaran user, saat user login, dan via tombol sinkronisasi massal).
3. **Session Tracking & Single Logout (Gabungan SIMPEG + SIMPRA)**:
   - Masa aktif sesi **1 jam (3600 detik)** dengan **Sliding Session** otomatis & manual yang tersinkronisasi ke database lokal dan server SSO (`/api/satellite/refresh`).
   - **Cross-Tab Logout Sync** (`BroadcastChannel` + `localStorage` + `visibilitychange`).
   - **Single Logout (SLO)** melalui validasi database (`sessionToken`, `tokenExpiredAt`, `deletedAt`) dan endpoint `POST /api/sso/revoke`.

```mermaid
flowchart LR
    U[Browser Pengguna] -->|1. Klik Login SSO| APP[Aplikasi Baru]
    APP -->|2. Redirect + callbackUrl| SSO[Central SSO BPVP]
    SSO -->|3. Validasi Pegawai & Password| SIMPEG[SIMPEG BPVP]
    SSO -->|4. Redirect + sso_token HMAC| APP
    APP -->|5. Verifikasi HMAC + Cek Whitelist DB| APP
    APP -->|6. Sync Profil Pegawai| SIMPEG
    APP -->|7. Sync Sesi Aktif / Sliding Session| SSO
    SSO -.->|8. Single Logout / Revoke| APP
```

---

## Bagian A — Persiapan di Server/Komputer Ekosistem BPVP (Sebelum Integrasi)

Langkah ini dilakukan **di komputer/server tempat `sso-bpvp` dan `simpegbpvp` berada** sebelum aplikasi baru diuji secara *end-to-end*:

1. **Daftarkan Aplikasi Baru di Database SSO (`sso-bpvp`)**
   - Tambahkan baris baru pada tabel `Application` di database `sso-bpvp`:
     - `id`: `<APP_ID>` (misal: `simasset`, `e-pelatihan`, dll. — huruf kecil tanpa spasi)
     - `nama`: Nama aplikasi baru
     - `deskripsi`: Deskripsi singkat aplikasi
     - `kategori`: Kategori layanan
     - `url`: URL produksi/staging/lokal aplikasi baru (misal `https://<app>.bpvpaceh.id` atau `http://<ip>:<port>`)
     - `aktif`: `true`
   - > [!IMPORTANT]
     > `sso-bpvp` memvalidasi `callbackUrl` terhadap tabel `Application` untuk mencegah *Open Redirect*. Jika aplikasi baru berjalan di port lokal selain `8081, 8082, 8083, 3000–3003`, pastikan URL+port-nya tercatat di tabel `Application` (atau tambahkan port ke `allowedPorts` di `sso-bpvp/lib/sso-core.ts`).

2. **Aktifkan Broadcast Single Logout di `sso-bpvp` (Opsional tapi Direkomendasikan)**
   - Saat ini `sso-bpvp/app/api/logout/route.ts` dan `sso-bpvp/app/api/sessions/revoke/route.ts` baru memanggil `POST /api/sso/revoke` ke `simpeg`.
   - Perbarui kedua file tersebut agar melakukan *broadcast* `POST {app.url}/api/sso/revoke` (dengan header `Authorization: Bearer <SSO_SECRET>` dan body `{ email }`) ke seluruh aplikasi aktif di tabel `Application` (termasuk aplikasi baru).

3. **Terbitkan API Key Integrasi Pegawai di SIMPEG (`simpegbpvp`)**
   - Buat 1 API Key acak untuk aplikasi baru, misal `<RAW_API_KEY>`.
   - Hitung hash SHA-256 hex (huruf kecil) dari `<RAW_API_KEY>`:
     ```bash
     printf "%s" "<RAW_API_KEY>" | sha256sum
     ```
   - Tambahkan ke `.env` milik `simpegbpvp` pada variabel `SIMPEG_ALLOWED_CLIENT_HASHES`:
     ```env
     SIMPEG_ALLOWED_CLIENT_HASHES="...existing...,<SHA256_HASH>:<NamaAplikasiBaru>"
     ```
   - Jika suatu saat dipanggil dari browser (CORS), tambahkan juga origin aplikasi baru ke `ALLOWED_ORIGINS` di `.env` `simpegbpvp`.

4. **Siapkan Informasi Konfigurasi untuk Agen Eksternal**
   Serahkan variabel berikut secara aman (via `.env.local` / secret manager, **jangan commit ke Git**):
   - `APP_ID` & `APP_NAME` (identitas unik aplikasi baru)
   - `SSO_SECRET` (**wajib identik** dengan `SSO_SECRET` di `sso-bpvp`)
   - `NEXT_PUBLIC_SSO_URL` (URL server SSO)
   - `SIMPEG_API_URL` (URL server SIMPEG)
   - `SIMPEG_API_KEY` (raw key yang hash SHA-256-nya sudah didaftarkan di SIMPEG)
   - Email & Nama **Super Admin awal** untuk seeding database pertama kali.

---

## Bagian B — Spesifikasi Teknis untuk Agen Eksternal (Siap Eksekusi)

> [!TIP]
> Bagian B hingga Bagian C di bawah ini dirancang sebagai instruksi kerja langsung yang bisa diberikan kepada agen AI di komputer lain.

### 1. Stack & Konvensi Dasar
- **Framework**: Next.js (App Router, TypeScript) + Tailwind CSS
- **Auth**: `next-auth` (v4, strategi `jwt`)
- **Database**: PostgreSQL + Prisma ORM
- **Password Hashing** (opsional untuk fallback darurat): `bcryptjs`
- **Environment Variables (`.env`)**:
  ```env
  DATABASE_URL="postgresql://user:pass@localhost:5432/<nama_db>?schema=public"

  # Identitas Aplikasi
  NEXT_PUBLIC_APP_ID="<app_slug>"         # misal: "simkeu"
  NEXT_PUBLIC_APP_NAME="<Nama Aplikasi>"
  NEXTAUTH_URL="http://localhost:8085"
  NEXTAUTH_SECRET="<random_secret_unik_untuk_app_ini>"

  # Integrasi Central SSO BPVP
  NEXT_PUBLIC_SSO_URL="https://sso.bpvpaceh.id"   # atau http://<ip_sso>:8081
  SSO_SECRET="<WAJIB_SAMA_DENGAN_SSO_SECRET_SERVER_SSO>"

  # Integrasi Master Pegawai SIMPEG BPVP
  SIMPEG_API_URL="https://simpeg.bpvpaceh.id"     # atau http://<ip_simpeg>:8082
  SIMPEG_API_KEY="<RAW_API_KEY_TERDAFTAR_DI_SIMPEG>"

  # Seed Super Admin Pertama
  SEED_SUPERADMIN_EMAIL="admin@bpvp.kemnaker.go.id"
  SEED_SUPERADMIN_NAMA="Administrator Sistem"
  ```

---

### 2. Skema Database Prisma (`prisma/schema.prisma`)

Model `User` dan `LogAktivitas` mengikuti struktur **SIMPRA** agar kompatibel penuh dengan SSO, Session Tracking, Soft Delete, dan sinkronisasi SIMPEG:

```prisma
enum Role {
  SUPER_ADMIN
  ADMIN
  USER
}

model User {
  id             String    @id @default(cuid())
  nama           String
  email          String    @unique
  nip            String?   @unique
  jabatan        String?
  unitKerja      String?   @map("unit_kerja")
  subUnitKerja   String?   @map("sub_unit_kerja")
  role           Role      @default(USER)
  deletedAt      DateTime? @map("deleted_at")
  password       String?   // Opsional (null untuk akun SSO penuh)
  fotoUrl        String?   @map("foto_url")
  pegawaiId      String?   @map("pegawai_id") // Referensi ID pegawai di SIMPEG
  sessionToken   String?   @map("session_token") @db.Text
  tokenExpiredAt DateTime? @map("token_expired_at")
  lastLoginAt    DateTime? @map("last_login_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  logs           LogAktivitas[]

  @@index([deletedAt])
  @@map("users")
}

model LogAktivitas {
  id          String   @id @default(cuid())
  userId      String?  @map("user_id")
  userName    String?  @map("user_name")
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  aksi        String   // LOGIN_SSO, LOGOUT, REVOKE_SSO, TAMBAH_USER, UPDATE_USER, SOFT_DELETE, SINKRONISASI_USER_SIMPEG, dll
  modul       String   // AUTENTIKASI, MANAJEMEN_USER, dll
  detail      String?
  dataSebelum Json?    @map("data_sebelum")
  dataSesudah Json?    @map("data_sesudah")
  ipAddress   String?  @map("ip_address")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([createdAt])
  @@index([modul])
  @@map("log_aktivitas")
}
```

---

### 3. Kontrak Protokol Central SSO BPVP

#### A. Redirect Login dari Aplikasi Baru ke SSO
Tombol **"Masuk dengan SSO BPVP Banda Aceh"** di halaman `/login` mengarahkan browser ke:
```text
{SSO_URL}?service={APP_ID}&callbackUrl={encodeURIComponent(origin + "/auth/sso-callback")}&redirect={encodeURIComponent(origin + "/auth/sso-callback")}&app={APP_ID}
```

#### B. Callback & Format Token SSO (`sso_token`)
Setelah login di SSO berhasil, SSO mengarahkan kembali ke:
```text
{origin}/auth/sso-callback?sso_token={payloadBase64Url}.{signatureBase64Url}
```
- **Algoritma Verifikasi (`lib/sso.ts`)**:
  1. Pisahkan `tokenString.split(".")` menjadi `[payloadBase64, signature]`.
  2. Hitung `expectedSig = crypto.createHmac("sha256", SSO_SECRET).update(payloadBase64).digest("base64url")`.
  3. Bandingkan secara aman (`crypto.timingSafeEqual` atau perbandingan konstan). Jika tidak cocok, tolak.
  4. Decode `Buffer.from(payloadBase64, "base64url").toString("utf8")` lalu `JSON.parse`.
  5. Pastikan `payload.exp >= Math.floor(Date.now() / 1000)`.
- **Struktur `SsoTokenPayload`**:
  ```ts
  export interface SsoTokenPayload {
    tokenId: string;
    userId: string;
    pegawaiId?: string;
    nik: string;
    nip: string;
    nama: string;
    email: string;
    role: string;
    unitKerja?: string;
    bagian?: string;
    subUnitKerja?: string;
    statusPegawai?: string;
    iat: number; // Unix timestamp (detik)
    exp: number; // Unix timestamp (detik), default iat + 3600
  }
  ```

#### C. Sinkronisasi Sesi ke Server SSO
1. **Saat Login & Sliding Session (Perpanjang Sesi)**:
   Panggil non-blocking (fire-and-forget dengan catch error):
   ```http
   POST {SSO_URL}/api/satellite/refresh
   Content-Type: application/json

   {
     "appId": "<APP_ID>",
     "email": "pegawai@email.com",
     "token": "<ssoToken_aktif>",
     "tokenExpiredAt": "2026-11-25T10:30:00.000Z"
   }
   ```
2. **Endpoint Single Logout di Aplikasi Baru (`POST /api/sso/revoke`)**:
   - Menerima header `Authorization: Bearer <SSO_SECRET>` (verifikasi wajib cocok dengan `process.env.SSO_SECRET`, kembalikan `401` jika tidak cocok).
   - Body JSON: `{ "email"?: string, "token"?: string }`.
   - Aksi: Update tabel `users` menjadi `sessionToken: null, tokenExpiredAt: new Date(0)` untuk user yang cocok, lalu catat di `LogAktivitas`.

---

### 4. Kontrak API Integrasi Pegawai SIMPEG (`lib/simpeg.ts`)

- **Endpoint**: `GET {SIMPEG_API_URL}/api/v1/integrasi/pegawai`
- **Header Wajib**: `x-api-key: {SIMPEG_API_KEY}`
- **Query Parameter Didukung**:
  - Tanpa query: mengembalikan seluruh pegawai aktif (`aktif: true, deletedAt: null`)
  - `?nama=<keyword>` / `?search=<keyword>`: filter nama (case-insensitive)
  - `?nip=<nip_atau_nik>`: mengembalikan 1 objek pegawai (atau 404 jika tidak ditemukan)
  - `?email=<email>` atau `?id=<pegawaiId>`: filter spesifik
- **Format Respon Sukses**:
  ```json
  {
    "success": true,
    "client": "NamaAplikasiBaru",
    "total": 1,
    "data": [
      {
        "id": "clx...",
        "nik": "1171...",
        "nip": "1990...",
        "nama": "Nama Pegawai",
        "email": "pegawai@domain.com",
        "noHp": "08...",
        "fotoUrl": "/uploads/...",
        "aktif": true,
        "unitKerja": "Balai Pelatihan Vokasi dan Produktivitas Banda Aceh",
        "bagian": "Subbagian Umum",
        "subUnitKerja": "Subbagian Umum",
        "jabatan": "Pranata Komputer Ahli Pertama",
        "statusPegawai": "PNS"
      }
    ]
  }
  ```
  > [!NOTE]
  > Jika query menggunakan `?nip=...`, field `data` berupa **object tunggal**; selain itu berupa **array**. Helper `getPegawaiFromSimpeg` dan `getSinglePegawaiFromSimpeg` harus menangani kedua bentuk tersebut.

---

### 5. Aturan NextAuth & Session Security (`lib/auth.ts`)

1. **Provider `sso-kemnaker` (`CredentialsProvider`)**:
   - Verifikasi `ssoToken` via `verifySsoToken()`.
   - Cari user di tabel lokal `users` berdasarkan `email` (lowercase) atau `nip`.
   - **Tolak jika tidak ditemukan** (*whitelist-only* ala SIMPRA): lempar error `"Akses Ditolak: Pegawai belum didaftarkan sebagai pengguna aplikasi ini. Hubungi Administrator."`
   - **Tolak jika `user.deletedAt !== null`**: lempar error `"Akses Ditolak: Akun Anda saat ini dinonaktifkan oleh Administrator."`
   - **Auto-Sync Profil dari SIMPEG (Opsi B)**: Panggil `getSinglePegawaiFromSimpeg({ nip, email, pegawaiId })` dalam blok `try/catch`. Jika berhasil, perbarui `nama`, `nip`, `jabatan`, `unitKerja`, `subUnitKerja`, `fotoUrl`, `pegawaiId`. Jika SIMPEG gagal dijangkau, login tetap berjalan dengan profil lokal yang sudah ada.
   - Simpan `sessionToken`, `tokenExpiredAt` (`now + 3600s`), dan `lastLoginAt: new Date()` di tabel `users`, lalu catat `LogAktivitas` (`LOGIN_SSO`).

2. **Callback `jwt` & `session` (Keamanan & Revocation)**:
   - **Saat login awal (`if (user)`)**:
     - Set `token.expiresAt = Date.now() + 3600 * 1000` dan `token.exp = Math.floor(token.expiresAt / 1000)`.
     - Kirim `POST {SSO_URL}/api/satellite/refresh` (non-blocking).
   - **Saat Sliding Session (`if (trigger === "update" && token.id)`)**:
     - Perbarui `token.expiresAt` dan `token.exp` (+3600 detik).
     - Update `tokenExpiredAt` di tabel `users`.
     - Kirim `POST {SSO_URL}/api/satellite/refresh` (non-blocking).
   - **Validasi Real-time di `session()` callback (Kunci Single Logout & Role Sync)**:
     - Cek `nowSeconds >= token.exp` -> kembalikan `{ expires: new Date(0).toISOString() } as any`.
     - Query `prisma.user.findUnique({ where: { id: token.id }, select: { role: true, deletedAt: true, sessionToken: true, tokenExpiredAt: true } })`:
       - Jika `!dbUser || dbUser.deletedAt` -> paksa sesi kedaluwarsa.
       - Jika `dbUser.sessionToken === null` (telah di-revoke oleh SSO/logout) -> paksa sesi kedaluwarsa.
       - Jika `dbUser.tokenExpiredAt && dbUser.tokenExpiredAt.getTime() <= Date.now()` -> paksa sesi kedaluwarsa.
       - Sinkronkan `session.user.role = dbUser.role` secara dinamis sehingga perubahan role oleh admin langsung berlaku.
       - Sertakan `(session as any).expiresAt` (ms) agar dibaca oleh `SessionTracker`.
   - **Event `signOut`**:
     - Kosongkan `sessionToken: null` dan `tokenExpiredAt: new Date(0)` di database lokal.

3. **Cookie Unik (Wajib agar tidak bentrok antar aplikasi)**:
   ```ts
   cookies: {
     sessionToken: { name: "<app_slug>.session-token", options: { httpOnly: true, sameSite: "lax", path: "/", secure: false } },
     callbackUrl:  { name: "<app_slug>.callback-url",  options: { sameSite: "lax", path: "/", secure: false } },
     csrfToken:    { name: "<app_slug>.csrf-token",    options: { httpOnly: true, sameSite: "lax", path: "/", secure: false } },
   }
   ```
   *(Set `secure: process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL?.startsWith("https://")` jika hanya melayani HTTPS, atau `false` jika juga diakses via IP LAN HTTP seperti di ekosistem BPVP).*

---

### 6. Session Tracking di Frontend (`SessionTracker.tsx` & `lib/auth-sync.ts`)

Gabungkan perilaku terbaik dari SIMPEG & SIMPRA:
1. **Cross-Tab Sync (`lib/auth-sync.ts`)**:
   - Konstanta unik aplikasi:
     - `AUTH_CHANNEL = "<app_slug>_auth_sync_channel"`
     - `LOGOUT_EVENT = "<app_slug>_cross_tab_logout"`
   - Fungsi `broadcastLogout()` mengirim pesan `{ type: "LOGOUT" }` via `BroadcastChannel` sekaligus menulis timestamp ke `localStorage`.
   - Semua tombol logout di UI wajib memanggil `performAppSignOut()` (`broadcastLogout()` -> `signOut({ callbackUrl: "/login" })`).
2. **Komponen `SessionTracker.tsx`** (dipasang di `SessionProvider` atau root protected layout):
   - **Countdown 1 detik** membaca `session.expiresAt`.
   - **Auto Sliding Session saat aktif**: Pantau event `mousemove`, `mousedown`, `keydown`, `scroll`, `touchstart`, `click` (di-*throttle* minimal 1–2 detik). Jika sisa waktu `<= 5 menit` (atau `< 15 menit` dengan cooldown refresh minimal 2 menit) dan ada aktivitas -> panggil `update()` + `POST {SSO_URL}/api/satellite/refresh`.
   - **Warning Modal/Banner saat idle (`remainingSeconds <= 300 && remainingSeconds > 0`)**:
     - Tampilkan countdown `MM:SS`, tombol **"Perpanjang Sesi"** (memanggil `update()` + refresh ke SSO), dan tombol **"Keluar"**.
   - **Auto Logout saat habis (`remainingSeconds <= 0`)**:
     - Panggil `broadcastLogout()` lalu `signOut({ callbackUrl: "/login?reason=expired" })`.
   - **Deteksi Tab Kembali Aktif / Bangun dari Sleep (`visibilitychange` & `focus`)**:
     - Cek apakah `Date.now() >= expiryTimestampRef.current` atau ada `LOGOUT_EVENT` baru di `localStorage`.
     - Panggil `getSession()` ke server; jika `null` (misalnya sesi sudah dicabut via Single Logout dari SSO), langsung keluarkan tab ke `/login?reason=logged_out_elsewhere`.
   - **Halaman `/login`** menampilkan banner informatif untuk `?reason=expired`, `?reason=logged_out_elsewhere`, dan `?error=...`.

---

### 7. Manajemen User ala SIMPRA (`/admin/users`)

Buat modul manajemen user yang hanya dapat diakses oleh role `ADMIN` dan `SUPER_ADMIN`:

| Endpoint / Halaman | Fungsi & Aturan Bisnis |
| --- | --- |
| `GET /api/simpeg/pegawai?search=...` | Proxy ke SIMPEG API + menandai setiap pegawai dengan flag `isRegistered`, `appUserId`, `appRole`, `appAktif` berdasarkan tabel `users` lokal. |
| `GET /api/users` | Daftar user lokal dengan pencarian (`nama`, `email`, `nip`, `jabatan`), filter `role` & `status` (aktif/nonaktif), dan paginasi. |
| `POST /api/users` | Mendaftarkan pegawai dari hasil pencarian SIMPEG ke tabel `users`. Tolak duplikat email/NIP (`409`). Hanya `SUPER_ADMIN` yang boleh menunjuk role `SUPER_ADMIN`. Catat `LogAktivitas`. |
| `PATCH /api/users/[id]` | Mengubah `role` atau status `aktif` (`deletedAt`). Proteksi: admin tidak boleh ubah/angkat `SUPER_ADMIN`; tidak boleh menonaktifkan akun sendiri; tidak boleh menurunkan role sendiri jika satu-satunya `SUPER_ADMIN` aktif. |
| `DELETE /api/users/[id]` | Soft delete (`deletedAt = new Date()`) dengan proteksi akun sendiri & minimal 1 `SUPER_ADMIN` tersisa. |
| `POST /api/users/sync` | Sinkronisasi massal seluruh user lokal dengan data terbaru dari SIMPEG API (prioritas cocokkan via `pegawaiId` → `nip` → `email`), perbarui profil yang berubah tanpa menimpa `role`, lalu laporkan ringkasan perubahan & catat `LogAktivitas`. |
| `/admin/users` (UI) | Tabel user + pencarian/filter + tombol **"Tambah Pengguna dari SIMPEG"** (modal pencarian pegawai SIMPEG secara live) + tombol **"Sinkronkan dari SIMPEG"** + aksi ubah role & aktif/nonaktif. |

---

## Bagian C — Urutan Eksekusi Bertahap (Checklist untuk Agen Eksternal)

1. **Fase 1 — Inisialisasi Proyek & Database**
   - [x] Setup Next.js App Router + TypeScript + Tailwind + Prisma + `next-auth` + `lucide-react`.
   - [x] Buat `prisma/schema.prisma` (`Role`, `User`, `LogAktivitas`) dan jalankan migrasi.
   - [x] Buat `prisma/seed.ts` untuk mendaftarkan 1 `SUPER_ADMIN` awal (`SEED_SUPERADMIN_EMAIL`) agar bisa login pertama kali.
2. **Fase 2 — Utilitas Integrasi Inti**
   - [x] `lib/prisma.ts`, `lib/audit.ts`
   - [x] `lib/sso-client.ts` (`getClientSsoUrl` dinamis untuk localhost/IP/domain BPVP)
   - [x] `lib/sso.ts` (`verifySsoToken`, `getServerSsoUrl`)
   - [x] `lib/simpeg.ts` (`getPegawaiFromSimpeg`, `getSinglePegawaiFromSimpeg`) *(sementara aktif `ENABLE_SIMPEG_MOCK="true"` sampai `SIMPEG_API_KEY` asli tersedia)*
   - [x] `lib/auth-sync.ts` (`broadcastLogout`, `clearLogoutSignal`, `performAppSignOut`)
3. **Fase 3 — Autentikasi SSO & Single Logout**
   - [x] `lib/auth.ts` & `app/api/auth/[...nextauth]/route.ts`
   - [x] `app/login/page.tsx` (tombol SSO + banner `expired`, `logged_out_elsewhere`, `error`)
   - [x] `app/auth/sso-callback/page.tsx` (baca `sso_token`, panggil `signIn("sso-kemnaker")`, tampilkan error jelas jika ditolak)
   - [x] `app/api/sso/revoke/route.ts` (endpoint Single Logout dari SSO)
4. **Fase 4 — Session Tracker & Proteksi Halaman**
   - [x] `components/providers/SessionProvider.tsx` + `components/layout/SessionTracker.tsx`
   - [x] `app/(protected)/layout.tsx` (cek `getServerSession(authOptions)`, redirect ke `/login` jika belum login)
   - [x] Pasang `performAppSignOut()` pada tombol Logout di Navbar/Sidebar.
5. **Fase 5 — Manajemen User ala SIMPRA**
   - [x] `app/api/simpeg/pegawai/route.ts`
   - [x] `app/api/users/route.ts`, `app/api/users/[id]/route.ts`, `app/api/users/sync/route.ts`
   - [x] `app/(protected)/admin/users/page.tsx` (UI manajemen user lengkap dengan proteksi role `ADMIN`/`SUPER_ADMIN`).
6. **Fase 6 — Verifikasi End-to-End**
   - [x] Uji login dengan akun **yang belum didaftarkan** di tabel `users` → harus ditolak dengan pesan jelas di `/auth/sso-callback`. *(Terverifikasi via E2E otomatis)*
   - [x] Uji login dengan **Super Admin hasil seed** via SSO → berhasil masuk `/dashboard`, profil tersinkron dari SIMPEG, dan `sessionToken`/`tokenExpiredAt` terisi di DB lokal serta SSO. *(Terverifikasi via E2E otomatis; perlu uji ulang di browser setelah terhubung langsung ke server SSO & SIMPEG asli)*
   - [x] Daftarkan 1 pegawai dari SIMPEG lewat `/admin/users` → uji login pegawai tersebut via SSO. *(Terverifikasi via API E2E dengan mock SIMPEG)*
   - [ ] Uji **Cross-Tab Logout**: buka 2 tab, logout di tab 1 → tab 2 otomatis keluar ke `/login?reason=logged_out_elsewhere`. *(Menunggu uji manual di 2 tab browser)*
   - [ ] Uji **Idle Auto-Logout & Sliding Session**: percepat `tokenExpiredAt` di DB ke sisa 2 menit → verifikasi peringatan muncul, dan saat klik "Perpanjang Sesi" (atau aktif bergerak) masa berlaku bertambah 1 jam di DB lokal & SSO. *(Menunggu uji manual di browser)*
   - [x] Uji **Single Logout (Revoke)**: kirim `POST /api/sso/revoke` dengan `Bearer <SSO_SECRET>` dan `{ "email": "..." }` → saat tab dibuka/refresh, sesi langsung terputus. *(Terverifikasi via E2E otomatis)*
