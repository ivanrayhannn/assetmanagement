/* =============================================================================
   S002 - Seed asset, sequence nomor, riwayat, dan assignment
   Asset dimasukkan dalam kondisi SEBELUM opname 2026-09; S003 menjalankan
   alur opname (snapshot -> hasil cek -> submit -> approve BR-07) sehingga
   kondisi akhir konsisten dengan contoh response dashboard di SA §4:
     total 33 | In Use 25 | Available 5 | Under Repair 1 | Missing 2
   ============================================================================= */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.TB_S_SCHEMA_VERSION WHERE VERSION_NO = 'S002')
BEGIN
    PRINT 'S002 sudah diterapkan, skip.';
    SET NOEXEC ON;
END
GO
BEGIN TRANSACTION;

DECLARE @a TABLE (
    ASSET_NO varchar(21) PRIMARY KEY, ASSET_NM nvarchar(150), BRAND_MODEL nvarchar(100),
    SERIAL_NO varchar(100), ACQ_DT date, USER_ID varchar(20));

INSERT @a (ASSET_NO, ASSET_NM, BRAND_MODEL, SERIAL_NO, ACQ_DT, USER_ID) VALUES
 /* ---- JKT (17) ---- */
 ('AST-JKT-LPT-2024-0001', N'Laptop',                        N'Dell Latitude 5420',          'DL5420-7HQ2K13', '2024-02-05', 'EMP001'),
 ('AST-JKT-LPT-2024-0002', N'Laptop',                        N'Dell Latitude 5420',          'DL5420-7HQ2K14', '2024-02-05', 'EMP002'),
 ('AST-JKT-LPT-2024-0003', N'Laptop',                        N'Dell Latitude 5420',          'DL5420-7HQ2K15', '2024-02-05', 'EMP010'),
 ('AST-JKT-LPT-2025-0001', N'Laptop',                        N'Lenovo ThinkPad T14 Gen 4',   'PF4XK2A1',       '2025-01-20', 'EMP005'),
 ('AST-JKT-LPT-2025-0002', N'Laptop',                        N'Lenovo ThinkPad T14 Gen 4',   'PF4XK2A2',       '2025-01-20', 'EMP006'),
 ('AST-JKT-LPT-2026-0001', N'Laptop',                        N'HP EliteBook 840 G10',        '5CG3301ABC',     '2026-02-10', 'EMP007'),
 ('AST-JKT-LPT-2026-0002', N'Laptop',                        N'HP EliteBook 840 G10',        '5CG3301ABD',     '2026-02-10', 'EMP008'),
 ('AST-JKT-LPT-2026-0003', N'Laptop',                        N'HP EliteBook 840 G10',        '5CG3388XYZ',     '2026-08-18', NULL),
 ('AST-JKT-MON-2025-0001', N'Monitor 24 inch',               N'Dell P2422H',                 'CN0D2PMX-001',   '2025-03-03', 'EMP006'),
 ('AST-JKT-MON-2025-0002', N'Monitor 24 inch',               N'Dell P2422H',                 'CN0D2PMX-002',   '2025-03-03', 'EMP007'),
 ('AST-JKT-MON-2025-0003', N'Monitor 24 inch',               N'Dell P2422H',                 'CN0D2PMX-003',   '2025-03-03', 'EMP009'),
 ('AST-JKT-MON-2025-0004', N'Monitor 24 inch',               N'Dell P2422H',                 'CN0D2PMX-004',   '2025-03-03', NULL),
 ('AST-JKT-PRN-2024-0001', N'Printer Lantai 3',              N'Epson L6270',                 'X8EA012345',     '2024-03-11', 'EMP002'),
 ('AST-JKT-PRN-2024-0002', N'Printer Ruang Finance',         N'HP LaserJet Pro M404dn',      'PHBBK12345',     '2024-03-11', 'EMP006'),
 ('AST-JKT-PRJ-2025-0001', N'Proyektor Ruang Rapat Lt. 5',   N'Epson EB-X51',                'X5JK2201234',    '2025-05-14', NULL),
 ('AST-JKT-FUR-2024-0001', N'Kursi Kerja Ergonomis',         N'Informa Ergo Chair',          NULL,             '2024-01-15', 'EMP005'),
 ('AST-JKT-FUR-2024-0002', N'Lemari Arsip Besi 4 Laci',      N'Brother Filing Cabinet',      NULL,             '2024-01-15', NULL),
 /* ---- SBY (9) ---- */
 ('AST-SBY-LPT-2025-0001', N'Laptop',                        N'Lenovo ThinkPad E14',         'PF3SB001',       '2025-02-17', 'EMP003'),
 ('AST-SBY-LPT-2025-0002', N'Laptop',                        N'Lenovo ThinkPad E14',         'PF3SB002',       '2025-02-17', 'EMP011'),
 ('AST-SBY-LPT-2026-0001', N'Laptop',                        N'Lenovo ThinkPad E14 Gen 5',   'PF5SB001',       '2026-02-24', 'EMP012'),
 ('AST-SBY-LPT-2026-0002', N'Laptop',                        N'Lenovo ThinkPad E14 Gen 5',   'PF5SB002',       '2026-08-25', NULL),
 ('AST-SBY-MON-2025-0001', N'Monitor 24 inch',               N'LG 24MP400',                  '304NTAB0001',    '2025-02-17', 'EMP011'),
 ('AST-SBY-MON-2025-0002', N'Monitor 24 inch',               N'LG 24MP400',                  '304NTAB0002',    '2025-02-17', 'EMP012'),
 ('AST-SBY-PRN-2024-0001', N'Printer Kantor',                N'Canon imageCLASS MF445dw',    'XNC01234',       '2024-04-08', 'EMP003'),
 ('AST-SBY-PRJ-2025-0001', N'Proyektor Ruang Meeting',       N'BenQ MX560',                  'PDK9A0001',      '2025-06-02', 'EMP013'),
 ('AST-SBY-FUR-2024-0001', N'Meja Kerja L-Shape',            N'Olympic L-Desk',              NULL,             '2024-04-08', 'EMP013'),
 /* ---- BDG (7) ---- */
 ('AST-BDG-LPT-2025-0001', N'Laptop',                        N'Asus ExpertBook B1',          'N7NXBD0001',     '2025-04-07', 'EMP004'),
 ('AST-BDG-LPT-2025-0002', N'Laptop',                        N'Asus ExpertBook B1',          'N7NXBD0002',     '2025-04-07', 'EMP014'),
 ('AST-BDG-LPT-2025-0003', N'Laptop',                        N'Asus ExpertBook B1',          'N7NXBD0003',     '2025-04-07', NULL),
 ('AST-BDG-MON-2025-0001', N'Monitor 24 inch',               N'Samsung S24R350',             'ZZBDG0001',      '2025-04-07', 'EMP014'),
 ('AST-BDG-MON-2025-0002', N'Monitor 24 inch',               N'Samsung S24R350',             'ZZBDG0002',      '2025-04-07', 'EMP015'),
 ('AST-BDG-PRN-2025-0001', N'Printer Kantor',                N'Brother HL-L2375DW',          'E78123BDG',      '2025-04-07', 'EMP004'),
 ('AST-BDG-FUR-2024-0001', N'Kursi Kerja',                   N'Chairman PC 908',             NULL,             '2024-05-06', 'EMP015');

/* Asset dalam kondisi sebelum opname 2026-09 */
INSERT dbo.TB_M_ASSET (ASSET_NO, ASSET_NM, CATEGORY_CD, BRAND_MODEL, SERIAL_NO, ACQ_DT, OFFICE_CD, USER_ID,
                       STATUS, CONDITION, CREATED_BY, CREATED_DT)
SELECT ASSET_NO, ASSET_NM, SUBSTRING(ASSET_NO, 9, 3), BRAND_MODEL, SERIAL_NO, ACQ_DT, SUBSTRING(ASSET_NO, 5, 3), USER_ID,
       CASE WHEN USER_ID IS NULL THEN 'AVAILABLE' ELSE 'IN_USE' END, 'BAIK',
       'EMP001', DATEADD(HOUR, 9, CAST(ACQ_DT AS datetime2(0)))
  FROM @a;

/* BR-01: sequence mengikuti nomor terbesar per kantor-kategori-tahun */
INSERT dbo.TB_M_ASSET_SEQ (OFFICE_CD, CATEGORY_CD, SEQ_YEAR, LAST_SEQ, UPDATED_DT)
SELECT SUBSTRING(ASSET_NO, 5, 3), SUBSTRING(ASSET_NO, 9, 3), CAST(SUBSTRING(ASSET_NO, 13, 4) AS smallint),
       MAX(CAST(RIGHT(ASSET_NO, 4) AS int)), MAX(CREATED_DT)
  FROM dbo.TB_M_ASSET
 GROUP BY SUBSTRING(ASSET_NO, 5, 3), SUBSTRING(ASSET_NO, 9, 3), SUBSTRING(ASSET_NO, 13, 4);

/* Riwayat REGISTER untuk semua asset */
INSERT dbo.TB_T_ASSET_HISTORY (ASSET_NO, ACTION, TO_OFFICE, TO_STATUS, REASON, CREATED_BY, CREATED_DT)
SELECT ASSET_NO, 'REGISTER', OFFICE_CD, 'AVAILABLE', N'Registrasi asset baru', 'EMP001', CREATED_DT
  FROM dbo.TB_M_ASSET;

/* Assign awal (UC-01): permintaan CONFIRMED + riwayat ASSIGN, 2 hari setelah registrasi.
   AST-JKT-MON-2025-0003 punya riwayat khusus (assign -> mutasi) di bawah. */
INSERT dbo.TB_T_ASSIGNMENT (ASSET_NO, ASSIGN_TYPE, FROM_USER, TO_USER, FROM_OFFICE, TO_OFFICE, REASON, STATUS,
                            REQUESTED_BY, REQUESTED_DT, RESPONDED_DT)
SELECT ASSET_NO, 'ASSIGN', NULL, USER_ID, OFFICE_CD, OFFICE_CD, N'Kebutuhan kerja', 'CONFIRMED',
       'EMP001', DATEADD(DAY, 2, CREATED_DT), DATEADD(HOUR, 3, DATEADD(DAY, 2, CREATED_DT))
  FROM dbo.TB_M_ASSET
 WHERE USER_ID IS NOT NULL AND ASSET_NO <> 'AST-JKT-MON-2025-0003';

INSERT dbo.TB_T_ASSET_HISTORY (ASSET_NO, ACTION, TO_USER, FROM_OFFICE, TO_OFFICE, FROM_STATUS, TO_STATUS, REASON, CREATED_BY, CREATED_DT)
SELECT ASSET_NO, 'ASSIGN', USER_ID, OFFICE_CD, OFFICE_CD, 'AVAILABLE', 'IN_USE', N'Dikonfirmasi diterima oleh user',
       'EMP001', DATEADD(HOUR, 3, DATEADD(DAY, 2, CREATED_DT))
  FROM dbo.TB_M_ASSET
 WHERE USER_ID IS NOT NULL AND ASSET_NO <> 'AST-JKT-MON-2025-0003';

/* Contoh mutasi antar user (FR-04): MON-2025-0003 dari Rudi (EMP010) ke Maya (EMP009) */
INSERT dbo.TB_T_ASSIGNMENT (ASSET_NO, ASSIGN_TYPE, FROM_USER, TO_USER, FROM_OFFICE, TO_OFFICE, REASON, STATUS,
                            REQUESTED_BY, REQUESTED_DT, RESPONDED_DT) VALUES
 ('AST-JKT-MON-2025-0003', 'ASSIGN',   NULL,     'EMP010', 'JKT', 'JKT', N'Kebutuhan kerja',                         'CONFIRMED', 'EMP001', '2025-03-05 09:00', '2025-03-05 12:00'),
 ('AST-JKT-MON-2025-0003', 'TRANSFER', 'EMP010', 'EMP009', 'JKT', 'JKT', N'Rudi pindah ke laptop dual-screen dock', 'CONFIRMED', 'EMP001', '2025-09-01 10:00', '2025-09-01 14:00');

INSERT dbo.TB_T_ASSET_HISTORY (ASSET_NO, ACTION, FROM_USER, TO_USER, FROM_OFFICE, TO_OFFICE, FROM_STATUS, TO_STATUS, REASON, CREATED_BY, CREATED_DT) VALUES
 ('AST-JKT-MON-2025-0003', 'ASSIGN',   NULL,     'EMP010', 'JKT', 'JKT', 'AVAILABLE', 'IN_USE', N'Dikonfirmasi diterima oleh user',          'EMP001', '2025-03-05 12:00'),
 ('AST-JKT-MON-2025-0003', 'TRANSFER', 'EMP010', 'EMP009', 'JKT', 'JKT', 'IN_USE',    'IN_USE', N'Rudi pindah ke laptop dual-screen dock', 'EMP001', '2025-09-01 14:00');

/* Contoh assign yang masih menunggu konfirmasi user (asset tetap AVAILABLE) */
INSERT dbo.TB_T_ASSIGNMENT (ASSET_NO, ASSIGN_TYPE, FROM_USER, TO_USER, FROM_OFFICE, TO_OFFICE, REASON, STATUS,
                            REQUESTED_BY, REQUESTED_DT) VALUES
 ('AST-JKT-LPT-2026-0003', 'ASSIGN', NULL, 'EMP009', 'JKT', 'JKT', N'Penggantian laptop lama', 'PENDING', 'EMP001', '2026-10-27 10:00');

INSERT dbo.TB_S_SCHEMA_VERSION (VERSION_NO, DESCRIPTION) VALUES ('S002', N'Seed asset, sequence, riwayat, assignment');
COMMIT TRANSACTION;
PRINT 'S002 diterapkan.';
GO
SET NOEXEC OFF;
GO
