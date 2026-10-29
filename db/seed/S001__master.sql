/* =============================================================================
   S001 - Seed master: kantor, kategori, user (DEV / SIT / UAT saja, bukan produksi)
   User mencakup keempat role untuk mock auth:
     ADMIN_GA : EMP001 Rina          EXEC : EMP005 Hendra
     PIC      : EMP002 (JKT), EMP003 (JKS), EMP004 (JKU)
     USER     : EMP006..EMP015 (EMP010 resign -> contoh "asset perlu ditarik")
   ============================================================================= */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.TB_S_SCHEMA_VERSION WHERE VERSION_NO = 'S001')
BEGIN
    PRINT 'S001 sudah diterapkan, skip.';
    SET NOEXEC ON;
END
GO
BEGIN TRANSACTION;

INSERT dbo.TB_M_OFFICE (OFFICE_CD, OFFICE_NM, CITY, ADDRESS, CREATED_BY, CREATED_DT) VALUES
 ('JKT', N'Kantor Pusat Jakarta Pusat', N'Jakarta Pusat',   N'Jl. M.H. Thamrin No. 1, Menteng, Jakarta Pusat',          'SYSTEM', '2024-01-02'),
 ('JKS', N'Kantor Jakarta Selatan',     N'Jakarta Selatan', N'Jl. H.R. Rasuna Said Kav. 5, Kuningan, Jakarta Selatan',   'SYSTEM', '2024-01-02'),
 ('JKU', N'Kantor Jakarta Utara',       N'Jakarta Utara',   N'Jl. Yos Sudarso No. 10, Tanjung Priok, Jakarta Utara',     'SYSTEM', '2024-01-02');

INSERT dbo.TB_M_CATEGORY (CATEGORY_CD, CATEGORY_NM, CREATED_BY, CREATED_DT) VALUES
 ('LPT', N'Laptop',    'SYSTEM', '2024-01-02'),
 ('MON', N'Monitor',   'SYSTEM', '2024-01-02'),
 ('PRN', N'Printer',   'SYSTEM', '2024-01-02'),
 ('PRJ', N'Proyektor', 'SYSTEM', '2024-01-02'),
 ('FUR', N'Furniture', 'SYSTEM', '2024-01-02');

INSERT dbo.TB_M_USER (USER_ID, USER_NM, EMAIL, AD_ACCOUNT, DEPT, OFFICE_CD, ROLE_CD, IS_ACTIVE, RESIGN_DT, CREATED_BY, CREATED_DT) VALUES
 ('EMP001', N'Rina Wulandari',  'rina.wulandari@ams.local',  'AMS\rina.wulandari',  N'General Affairs', 'JKT', 'ADMIN_GA', 1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP002', N'Budi Santoso',    'budi.santoso@ams.local',    'AMS\budi.santoso',    N'General Affairs', 'JKT', 'PIC',      1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP003', N'Sari Dewi',       'sari.dewi@ams.local',       'AMS\sari.dewi',       N'General Affairs', 'JKS', 'PIC',      1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP004', N'Agus Pratama',    'agus.pratama@ams.local',    'AMS\agus.pratama',    N'General Affairs', 'JKU', 'PIC',      1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP005', N'Hendra Wijaya',   'hendra.wijaya@ams.local',   'AMS\hendra.wijaya',   N'Direksi',         'JKT', 'EXEC',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP006', N'Andi Saputra',    'andi.saputra@ams.local',    'AMS\andi.saputra',    N'Finance',         'JKT', 'USER',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP007', N'Dewi Lestari',    'dewi.lestari@ams.local',    'AMS\dewi.lestari',    N'Marketing',       'JKT', 'USER',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP008', N'Fajar Nugroho',   'fajar.nugroho@ams.local',   'AMS\fajar.nugroho',   N'IT',              'JKT', 'USER',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP009', N'Maya Putri',      'maya.putri@ams.local',      'AMS\maya.putri',      N'HR',              'JKT', 'USER',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP010', N'Rudi Hartono',    'rudi.hartono@ams.local',    'AMS\rudi.hartono',    N'Sales',           'JKT', 'USER',     0, '2026-10-15', 'SYSTEM', '2024-01-02'),
 ('EMP011', N'Wahyu Setiawan',  'wahyu.setiawan@ams.local',  'AMS\wahyu.setiawan',  N'Sales',           'JKS', 'USER',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP012', N'Indah Permata',   'indah.permata@ams.local',   'AMS\indah.permata',   N'Operations',      'JKS', 'USER',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP013', N'Yoga Pradana',    'yoga.pradana@ams.local',    'AMS\yoga.pradana',    N'Finance',         'JKS', 'USER',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP014', N'Lina Marlina',    'lina.marlina@ams.local',    'AMS\lina.marlina',    N'Sales',           'JKU', 'USER',     1, NULL,         'SYSTEM', '2024-01-02'),
 ('EMP015', N'Dimas Ramadhan',  'dimas.ramadhan@ams.local',  'AMS\dimas.ramadhan',  N'Operations',      'JKU', 'USER',     1, NULL,         'SYSTEM', '2024-01-02');

UPDATE dbo.TB_M_OFFICE SET PIC_USER_ID = 'EMP002' WHERE OFFICE_CD = 'JKT';
UPDATE dbo.TB_M_OFFICE SET PIC_USER_ID = 'EMP003' WHERE OFFICE_CD = 'JKS';
UPDATE dbo.TB_M_OFFICE SET PIC_USER_ID = 'EMP004' WHERE OFFICE_CD = 'JKU';

INSERT dbo.TB_S_SCHEMA_VERSION (VERSION_NO, DESCRIPTION) VALUES ('S001', N'Seed master kantor, kategori, user');
COMMIT TRANSACTION;
PRINT 'S001 diterapkan.';
GO
SET NOEXEC OFF;
GO
