# CLAUDE.md – Asset Management System (AMS) Perkantoran

## Ringkasan proyek

AMS mencatat setiap asset kantor dengan nomor unik, pemakai, dan lokasi kantor, lalu mencocokkan data sistem
dengan kondisi fisik lewat stock opname berkala. Selisih minus otomatis masuk laporan dan dashboard.

- Kebutuhan fungsional: `docs/FSD-AMS.md` (FR-01–FR-13, BR-01–BR-08, data model, UAT TC-01–TC-09)
- Arsitektur & API: `docs/Solution-Architecture-AMS.md`
- Prototipe UI: `docs/asset-management.html` (belum ada di repo, akan ditambahkan)
- Use case: UC-01 Registrasi & Assignment (termasuk mutasi), UC-02 Stock Opname & Laporan Selisih
- Kantor: JKT, SBY, BDG. Kategori: LPT, MON, PRN, PRJ, FUR.

## Tech stack

| Layer | Teknologi |
| --- | --- |
| Frontend | React + TypeScript, Vite, Tailwind CSS, Recharts/Chart.js, html5-qrcode (mobile-first) |
| Backend | ASP.NET Core 8 Web API, EF Core (CRUD), Dapper (report/dashboard), FluentValidation, Hangfire, Serilog |
| Database | SQL Server 2019/2022, database-first (script di `/db`) |
| Auth | Mock role (dev) → AD SSO (OIDC/LDAP) via hook yang sama |
| Hosting | IIS on Windows Server, on-premise |

## Struktur repo

```
/docs       FSD, Solution Architecture, prototipe UI
/db         migrations (V###), seed (S###, non-PRD), tests (T###), scripts apply.sh/apply.ps1
/backend    Ams.sln – Ams.Api, Ams.Shared, Ams.Modules.{Asset,Opname,Reporting}, tests/Ams.UnitTests
/frontend   SPA React + Vite
```

## Arsitektur: modular monolith

| Modul | Tanggung jawab | FR | BR |
| --- | --- | --- | --- |
| Asset | Registrasi, nomor asset, assign/konfirmasi, mutasi, tracking, QR | FR-01–FR-05 | BR-01, BR-02, BR-03 |
| Opname | Sesi + snapshot, hasil cek, temuan plus, submit, approve | FR-06–FR-10 | BR-04–BR-07 |
| Reporting | Dashboard KPI & grafik, laporan selisih, export Excel/PDF | FR-11–FR-13 | BR-08 |

Aturan modul:
- Setiap modul punya Controller → Service (business rule) → Repository sendiri.
- Modul lain **hanya** dipanggil lewat interface service di `Ams.Shared` (mis. `IAssetFreezeService`, `ISummaryRefresher`),
  tidak boleh query langsung ke tabel milik modul lain.
- Pemilik tabel: Asset = `TB_M_*`, `TB_T_ASSET_HISTORY`, `TB_T_ASSIGNMENT`; Opname = `TB_T_OPNAME_*`;
  Reporting = `TB_R_*` dan view `VW_*`.

## Database

- Script `/db` adalah sumber kebenaran schema. **Tidak memakai EF Migrations**; EF Core hanya memetakan.
- Penamaan: `TB_M_` master, `TB_T_` transaksi, `TB_R_` read model, `TB_S_` sistem, `VW_` view, `USP_` stored procedure,
  `TR_` trigger, `PK_/FK_/CK_/UQ_/UX_/IX_/DF_` constraint & index. Kolom UPPER_SNAKE.
- Kode status disimpan UPPER_SNAKE (`IN_USE`, `TIDAK_DITEMUKAN`); label tampilan diatur di frontend.
- Migration yang sudah naik ke SIT/UAT/PRD tidak boleh diubah; tambah file `V###` baru.
- Detail tabel, kode status, guard BR, dan isi seed: `db/README.md`.

## Business rules (wajib divalidasi di service API, dengan unit test per BR)

| BR | Rule | Catatan implementasi |
| --- | --- | --- |
| BR-01 | Nomor `AST-[KANTOR]-[KATEGORI]-[TAHUN]-[SEQ4]` unik, immutable, reset per kantor-kategori-tahun | Ambil via `USP_ASSET_NEXT_NO` di transaksi registrasi; TAHUN = tahun registrasi |
| BR-02 | Satu asset satu user; Missing/Disposed tidak bisa di-assign | Juga tolak bila sudah ada assignment PENDING |
| BR-03 | Mutasi antar kantor ubah `OFFICE_CD`, tanggung jawab pindah ke PIC kantor tujuan | Riwayat `TRANSFER` |
| BR-04 | Selama sesi opname aktif, asset kantor itu tidak bisa dimutasi | Freeze berlaku untuk OPEN **dan** SUBMITTED, kantor asal dan tujuan |
| BR-05 | Minus = TIDAK_DITEMUKAN; Plus = PLUS; Fisik = Sistem − Minus | `USP_OPNAME_RECALC` |
| BR-06 | Submit hanya bila semua asset sudah dicek | Error menyebut jumlah asset belum dicek (TC-07) |
| BR-07 | Approve: TIDAK_DITEMUKAN → MISSING (user dilepas); BEDA_LOKASI → user/kantor aktual; RUSAK → UNDER_REPAIR | Set header APPROVED dulu, lalu update asset + riwayat, lalu refresh read model |
| BR-08 | Dashboard tandai kantor Minus > 0 merah + jumlahnya | `VW_OPNAME_LAST_APPROVED.IS_RED` |

Keputusan tambahan:
- Assign ke user memakai konfirmasi terima: asset tetap `AVAILABLE` sampai user CONFIRMED (flowchart UC-01).
- Snapshot opname berisi asset kantor dengan status selain MISSING/DISPOSED.
- Segregation of duty: hasil cek terkunci setelah submit; approver ≠ submitter.

## Role & otorisasi

| Role (`ROLE_CD`) | AD group (produksi) | Scope data |
| --- | --- | --- |
| `ADMIN_GA` | `AMS_ADMIN_GA` | Semua kantor, satu-satunya yang mengubah master asset & approve opname |
| `PIC` | `AMS_PIC_<KANTOR>` | Hanya kantornya; input hasil cek opname |
| `USER` | default | Hanya asset dengan `USER_ID` = dirinya; konfirmasi terima |
| `EXEC` | `AMS_EXEC` | Read-only semua kantor, dashboard & laporan |

- Otorisasi dicek di API (policy per endpoint + filter row-level di service), bukan hanya disembunyikan di UI.
- Dev: mock auth memilih user seed (EMP001 Admin GA, EMP002–004 PIC, EMP005 Executive, EMP006+ User).
  Implementasi di balik interface yang sama dengan AD SSO, ditukar lewat konfigurasi.

## Konvensi API

- Prefix `/api/v1`, JSON camelCase, semua endpoint butuh token.
- Error memakai RFC 7807 ProblemDetails; error business rule menyertakan `code` (mis. `BR-04`) dan pesan Bahasa Indonesia.
- List memakai paging server-side, maksimal 50 baris per halaman.
- Optimistic concurrency memakai `ROW_VER` (rowversion) → HTTP 409 bila bentrok.
- Setiap create/update menulis `TB_T_ASSET_HISTORY` (bila relevan) dan `TB_T_AUDIT_LOG` (user, waktu, IP).
- Notifikasi email ditulis ke `TB_T_EMAIL_OUTBOX` dalam transaksi yang sama; dikirim oleh job Hangfire.

## Perintah

```bash
# Database (dev): lihat db/README.md
AMS_DB_PASSWORD='...' SQLCMD="docker exec -i ams-sql /opt/mssql-tools18/bin/sqlcmd" db/scripts/apply.sh --seed --test
```

Backend dan frontend: akan ditambahkan di langkah 3 dan 4.

## Konvensi kode & git

- C#: nullable enabled, file-scoped namespace, async end-to-end, nama BR di nama test (`BR04_...`).
- TypeScript: strict, komponen fungsional, Tailwind utility class, mobile-first.
- Bahasa: UI dan pesan error Bahasa Indonesia; kode, nama identifier, dan komentar teknis boleh Inggris/Indonesia
  mengikuti file sekitarnya.
- Commit: `<area>: <ringkasan>` (area = `db`, `api`, `web`, `docs`, `ci`). Setiap perubahan BR wajib disertai test.
- Referensikan ID FSD (FR/BR/TC/SCR) di komentar atau nama test bila relevan.
