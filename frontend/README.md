# AMS Web (React + TypeScript + Vite + Tailwind)

SPA mobile-first sesuai prototipe `docs/asset-management.html`. Layar: SCR-01 Dashboard, SCR-02 Daftar Asset,
SCR-03 Form Asset, SCR-04 Detail & Tracking, SCR-05 Stock Opname, SCR-06 Laporan Selisih.

## Menjalankan

```bash
npm ci
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

## Mode data (`.env`, lihat `.env.example`)

| Variabel | Nilai | Keterangan |
| --- | --- | --- |
| `VITE_API_MODE` | `demo` (default) | Data & business rule berjalan di browser (`src/api/demo`), disimpan di localStorage. Dipakai untuk GitHub Pages. |
| | `http` | Memanggil AMS API `.NET` di `/api/v1` (`src/api/http.ts`). |
| `VITE_API_BASE` | URL | Base URL API untuk mode `http`; kosong = origin yang sama (reverse proxy IIS / proxy Vite ke `localhost:5080`). |
| `VITE_AUTH_MODE` | `mock` (default) / `sso` | Mock: pilih user seed. SSO: hook AD OIDC di `src/auth/auth.ts` (diisi saat API siap). |

Komponen UI hanya bergantung pada interface `AmsApi` (`src/api/types.ts`), sehingga demo ↔ produksi cukup diganti lewat konfigurasi build.

## Struktur

```
src/api/types.ts        kontrak data & interface AmsApi
src/api/demo/           backend demo: db (cermin tabel SQL), service (BR-01..BR-08 + otorisasi), seed (= db/seed)
src/api/http.ts         klien /api/v1 untuk API .NET
src/auth/auth.ts        AuthAdapter: mock role & titik sambung AD SSO
src/app/                AppContext (user, master data, toast), Shell (sidebar / bottom nav)
src/features/           dashboard, assets, tracking, opname, reports
src/styles/index.css    design system dari prototipe (token light/dark)
```

## Kontrak API untuk langkah 3 (.NET)

Endpoint SA §4 ditambah endpoint pendukung yang dibutuhkan UI. Error memakai ProblemDetails dengan `code`
(`BR-01`…`BR-08`, `SOD`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `DUPLICATE_SERIAL`, `DUPLICATE_PERIOD`).
Perilaku acuan = `src/api/demo/service.ts` dan test-nya.

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | /offices, /categories, /users?office= | Master |
| GET | /assets?office=&cat=&status=&q=&page=&pageSize= | List asset sesuai scope (maks 50/halaman) |
| GET | /assets/next-no?office=&cat= | Pratinjau nomor asset (SCR-03) |
| POST | /assets | Registrasi (BR-01) |
| GET | /assets/{assetNo} | Detail + riwayat + assignment pending |
| POST | /assets/{assetNo}/assignments | Assign / mutasi (PENDING) atau ke stok kantor (APPLIED) |
| GET | /assignments/mine | Permintaan yang menunggu konfirmasi user login |
| POST | /assignments/{id}/confirm, /reject, /cancel | Konfirmasi terima / tolak (wajib alasan) / batal |
| GET | /opnames?office=&status=, /opnames/{id} | Daftar & detail sesi |
| POST | /opnames | Buat sesi + snapshot (FR-06) |
| PUT | /opnames/{id}/items/{assetNo} | Simpan hasil cek (FR-07) |
| POST | /opnames/{id}/items/mark-remaining-ok | Tandai sisa sesuai |
| POST | /opnames/{id}/plus, /submit, /approve | Temuan plus, submit (BR-06), approve (BR-07) |
| GET | /dashboard/summary?office= | KPI, per kantor/kategori, opname terakhir (isRed), tren |
| GET | /reports/variance/{id}/minus | Asset minus + user terakhir |
| GET | /reports/variance?opnameId=&format=xlsx | Export (FR-13) |

Header mock auth (non-produksi): `X-Ams-Mock-User: EMP001`.
