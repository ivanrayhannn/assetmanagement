/* =============================================================================
   S003 - Seed stock opname: menjalankan alur UC-02 apa adanya
     snapshot (FR-06) -> hasil cek (FR-07/08) -> recalc (BR-05) -> submit (BR-06)
     -> approve + update asset (BR-07) -> refresh read model.

   Sesi:
     2026-03, 2026-06  JKT/JKS/JKU  semua SESUAI (data tren FR-12)
     2026-09  JKT  17 sistem, 1 TIDAK_DITEMUKAN (proyektor), 1 BEDA_LOKASI -> minus 1
     2026-09  JKS   9 sistem, 1 TIDAK_DITEMUKAN (monitor), 1 PLUS (kursi tanpa label) -> minus 1, plus 1
     2026-09  JKU   7 sistem, 1 RUSAK (printer) -> minus 0
     2026-10  JKU  OPEN, sebagian sudah dicek (contoh sesi berjalan; JKU ter-freeze BR-04)

   Snapshot berisi asset kantor yang statusnya bukan MISSING/DISPOSED.
   ============================================================================= */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.TB_S_SCHEMA_VERSION WHERE VERSION_NO = 'S003')
BEGIN
    PRINT 'S003 sudah diterapkan, skip.';
    SET NOEXEC ON;
END
GO
BEGIN TRANSACTION;

DECLARE @sessions TABLE (
    SEQ int IDENTITY PRIMARY KEY, OFFICE_CD varchar(3), PERIOD char(7), PIC varchar(20),
    CREATED_DT datetime2(0), SUBMITTED_DT datetime2(0) NULL, APPROVED_DT datetime2(0) NULL);

INSERT @sessions (OFFICE_CD, PERIOD, PIC, CREATED_DT, SUBMITTED_DT, APPROVED_DT) VALUES
 ('JKT', '2026-03', 'EMP002', '2026-03-02 08:00', '2026-03-05 16:00', '2026-03-06 10:00'),
 ('JKS', '2026-03', 'EMP003', '2026-03-02 08:00', '2026-03-05 15:00', '2026-03-06 10:30'),
 ('JKU', '2026-03', 'EMP004', '2026-03-02 08:00', '2026-03-04 16:00', '2026-03-06 11:00'),
 ('JKT', '2026-06', 'EMP002', '2026-06-01 08:00', '2026-06-04 16:00', '2026-06-05 10:00'),
 ('JKS', '2026-06', 'EMP003', '2026-06-01 08:00', '2026-06-04 15:00', '2026-06-05 10:30'),
 ('JKU', '2026-06', 'EMP004', '2026-06-01 08:00', '2026-06-03 16:00', '2026-06-05 11:00'),
 ('JKT', '2026-09', 'EMP002', '2026-09-01 08:00', '2026-09-04 16:00', '2026-09-07 10:00'),
 ('JKS', '2026-09', 'EMP003', '2026-09-01 08:00', '2026-09-04 15:00', '2026-09-07 10:30'),
 ('JKU', '2026-09', 'EMP004', '2026-09-01 08:00', '2026-09-03 16:00', '2026-09-07 11:00'),
 ('JKU', '2026-10', 'EMP004', '2026-10-26 08:00', NULL,               NULL);

/* Hasil cek yang bukan SESUAI */
DECLARE @findings TABLE (
    OFFICE_CD varchar(3), PERIOD char(7), ASSET_NO varchar(21) NULL, RESULT varchar(15),
    ACTUAL_USER_ID varchar(20) NULL, PLUS_CATEGORY varchar(3) NULL, PLUS_DESC nvarchar(200) NULL, REMARK nvarchar(500));

INSERT @findings VALUES
 ('JKT', '2026-09', 'AST-JKT-PRJ-2025-0001', 'TIDAK_DITEMUKAN', NULL,     NULL,  NULL,
     N'Tidak ada di ruang rapat Lt. 5 maupun gudang; terakhir dipakai acara townhall Agustus'),
 ('JKT', '2026-09', 'AST-JKT-MON-2025-0002', 'BEDA_LOKASI',     'EMP008', NULL,  NULL,
     N'Monitor dipakai Fajar (IT) sejak Dewi pindah meja'),
 ('JKS', '2026-09', 'AST-JKS-MON-2025-0002', 'TIDAK_DITEMUKAN', NULL,     NULL,  NULL,
     N'Indah menyatakan monitor dipinjam tim event dan belum kembali'),
 ('JKS', '2026-09', NULL,                    'PLUS',            NULL,     'FUR', N'Kursi kerja hitam tanpa label nomor asset di ruang Sales',
     N'Perlu diregistrasi oleh Admin GA'),
 ('JKU', '2026-09', 'AST-JKU-PRN-2025-0001', 'RUSAK',           NULL,     NULL,  NULL,
     N'Paper feed macet, tidak bisa mencetak');

DECLARE @seq int = 1, @max int = (SELECT MAX(SEQ) FROM @sessions);
DECLARE @office varchar(3), @period char(7), @pic varchar(20),
        @created datetime2(0), @submitted datetime2(0), @approved datetime2(0), @id int;
DECLARE @order TABLE (OPNAME_D_ID bigint PRIMARY KEY, RN int);

WHILE @seq <= @max
BEGIN
    SELECT @office = OFFICE_CD, @period = PERIOD, @pic = PIC,
           @created = CREATED_DT, @submitted = SUBMITTED_DT, @approved = APPROVED_DT
      FROM @sessions WHERE SEQ = @seq;

    /* FR-06: buat sesi + snapshot */
    INSERT dbo.TB_T_OPNAME_H (OFFICE_CD, PERIOD, STATUS, CREATED_BY, CREATED_DT)
    VALUES (@office, @period, 'OPEN', 'EMP001', @created);
    SET @id = SCOPE_IDENTITY();

    INSERT dbo.TB_T_OPNAME_D (OPNAME_ID, ASSET_NO, SYS_CATEGORY_CD, SYS_USER_ID, SYS_OFFICE, SYS_STATUS)
    SELECT @id, ASSET_NO, CATEGORY_CD, USER_ID, OFFICE_CD, STATUS
      FROM dbo.TB_M_ASSET
     WHERE OFFICE_CD = @office
       AND STATUS NOT IN ('MISSING', 'DISPOSED')
       AND CREATED_DT < @created;

    /* FR-07: hasil cek, satu asset per 10 menit. Sesi berjalan (belum submit) baru dicek 4 asset. */
    DELETE @order;
    INSERT @order (OPNAME_D_ID, RN)
    SELECT OPNAME_D_ID, ROW_NUMBER() OVER (ORDER BY ASSET_NO)
      FROM dbo.TB_T_OPNAME_D WHERE OPNAME_ID = @id;

    UPDATE d
       SET RESULT         = ISNULL(f.RESULT, 'SESUAI'),
           ACTUAL_USER_ID = f.ACTUAL_USER_ID,
           REMARK         = f.REMARK,
           CHECKED_BY     = @pic,
           CHECKED_DT     = DATEADD(MINUTE, 10 * o.RN, DATEADD(DAY, 1, @created))
      FROM dbo.TB_T_OPNAME_D d
      JOIN @order o ON o.OPNAME_D_ID = d.OPNAME_D_ID
      LEFT JOIN @findings f ON f.OFFICE_CD = @office AND f.PERIOD = @period AND f.ASSET_NO = d.ASSET_NO
     WHERE @submitted IS NOT NULL OR o.RN <= 4;

    /* FR-08: temuan PLUS */
    INSERT dbo.TB_T_OPNAME_D (OPNAME_ID, ASSET_NO, SYS_CATEGORY_CD, RESULT, PLUS_DESC, REMARK, CHECKED_BY, CHECKED_DT)
    SELECT @id, NULL, PLUS_CATEGORY, 'PLUS', PLUS_DESC, REMARK, @pic, DATEADD(HOUR, 4, DATEADD(DAY, 1, @created))
      FROM @findings
     WHERE OFFICE_CD = @office AND PERIOD = @period AND RESULT = 'PLUS';

    /* BR-05 */
    EXEC dbo.USP_OPNAME_RECALC @OPNAME_ID = @id;

    IF @submitted IS NOT NULL
    BEGIN
        /* BR-06: semua asset sudah punya hasil cek */
        IF EXISTS (SELECT 1 FROM dbo.TB_T_OPNAME_D WHERE OPNAME_ID = @id AND RESULT IS NULL)
            THROW 51000, N'Seed tidak konsisten: ada asset belum dicek pada sesi yang di-submit.', 1;

        UPDATE dbo.TB_T_OPNAME_H SET STATUS = 'SUBMITTED', SUBMITTED_BY = @pic, SUBMITTED_DT = @submitted
         WHERE OPNAME_ID = @id;

        /* FR-10: approve. Header APPROVED lebih dulu agar freeze BR-04 terlepas. */
        UPDATE dbo.TB_T_OPNAME_H SET STATUS = 'APPROVED', APPROVED_BY = 'EMP001', APPROVED_DT = @approved
         WHERE OPNAME_ID = @id;

        /* BR-07: riwayat dulu (butuh nilai sebelum update), lalu update asset */
        INSERT dbo.TB_T_ASSET_HISTORY (ASSET_NO, ACTION, FROM_USER, TO_USER, FROM_OFFICE, TO_OFFICE,
                                       FROM_STATUS, TO_STATUS, REASON, OPNAME_ID, CREATED_BY, CREATED_DT)
        SELECT a.ASSET_NO,
               CASE d.RESULT WHEN 'BEDA_LOKASI' THEN 'TRANSFER' ELSE 'STATUS_CHANGE' END,
               a.USER_ID,
               CASE d.RESULT WHEN 'BEDA_LOKASI' THEN d.ACTUAL_USER_ID
                             WHEN 'RUSAK'       THEN a.USER_ID END,
               a.OFFICE_CD,
               CASE d.RESULT WHEN 'BEDA_LOKASI' THEN ISNULL(d.ACTUAL_OFFICE, a.OFFICE_CD) ELSE a.OFFICE_CD END,
               a.STATUS,
               CASE d.RESULT WHEN 'TIDAK_DITEMUKAN' THEN 'MISSING'
                             WHEN 'RUSAK'           THEN 'UNDER_REPAIR'
                             ELSE 'IN_USE' END,
               CONCAT(N'Hasil stock opname ', @office, N' ', @period, N': ', d.RESULT), @id, 'EMP001', @approved
          FROM dbo.TB_T_OPNAME_D d
          JOIN dbo.TB_M_ASSET a ON a.ASSET_NO = d.ASSET_NO
         WHERE d.OPNAME_ID = @id AND d.RESULT IN ('TIDAK_DITEMUKAN', 'BEDA_LOKASI', 'RUSAK');

        UPDATE a
           SET STATUS     = CASE d.RESULT WHEN 'TIDAK_DITEMUKAN' THEN 'MISSING'
                                          WHEN 'RUSAK'           THEN 'UNDER_REPAIR'
                                          ELSE 'IN_USE' END,
               USER_ID    = CASE d.RESULT WHEN 'TIDAK_DITEMUKAN' THEN NULL
                                          WHEN 'BEDA_LOKASI'     THEN d.ACTUAL_USER_ID
                                          ELSE a.USER_ID END,
               OFFICE_CD  = CASE d.RESULT WHEN 'BEDA_LOKASI' THEN ISNULL(d.ACTUAL_OFFICE, a.OFFICE_CD) ELSE a.OFFICE_CD END,
               CONDITION  = CASE d.RESULT WHEN 'RUSAK' THEN 'RUSAK_RINGAN' ELSE a.CONDITION END,
               UPDATED_BY = 'EMP001',
               UPDATED_DT = @approved
          FROM dbo.TB_M_ASSET a
          JOIN dbo.TB_T_OPNAME_D d ON d.ASSET_NO = a.ASSET_NO
         WHERE d.OPNAME_ID = @id AND d.RESULT IN ('TIDAK_DITEMUKAN', 'BEDA_LOKASI', 'RUSAK');
    END;

    EXEC dbo.USP_REFRESH_OPNAME_VARIANCE @OPNAME_ID = @id;
    SET @seq += 1;
END;

EXEC dbo.USP_REFRESH_DASHBOARD_SUMMARY;

INSERT dbo.TB_S_SCHEMA_VERSION (VERSION_NO, DESCRIPTION) VALUES ('S003', N'Seed stock opname & read model');
COMMIT TRANSACTION;
PRINT 'S003 diterapkan.';
GO
SET NOEXEC OFF;
GO
