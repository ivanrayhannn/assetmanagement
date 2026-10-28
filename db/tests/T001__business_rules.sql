/* =============================================================================
   T001 - Test guard business rule level database + konsistensi seed
   Setiap kasus berjalan di transaksi sendiri lalu di-ROLLBACK, sehingga data tidak berubah.
   Hasil ditampung di table variable (tidak ikut rollback). Gagal -> THROW 59000.
   Jalankan setelah seed: db/scripts/apply.sh --seed --test
   ============================================================================= */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT OFF;

DECLARE @r TABLE (NO int IDENTITY, TC varchar(80), PASSED bit, DETAIL nvarchar(400));
DECLARE @err int, @msg nvarchar(4000), @no varchar(21), @n int;

/* ---------- BR-01: nomor asset ---------- */
SELECT @err = 0, @msg = NULL, @no = NULL;
BEGIN TRAN;
BEGIN TRY
    EXEC dbo.USP_ASSET_NEXT_NO 'JKT', 'LPT', 2026, @no OUTPUT;
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-01 nomor berikutnya JKT-LPT-2026 = 0004', IIF(@no = 'AST-JKT-LPT-2026-0004', 1, 0), CONCAT(@no, ' ', @msg));

SELECT @err = 0, @msg = NULL, @no = NULL;
BEGIN TRAN;
BEGIN TRY
    EXEC dbo.USP_ASSET_NEXT_NO 'BDG', 'PRJ', 2026, @no OUTPUT;
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-01 sequence baru per kantor-kategori-tahun mulai 0001', IIF(@no = 'AST-BDG-PRJ-2026-0001', 1, 0), CONCAT(@no, ' ', @msg));

SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    INSERT dbo.TB_M_ASSET (ASSET_NO, ASSET_NM, CATEGORY_CD, ACQ_DT, OFFICE_CD, CREATED_BY)
    VALUES ('AST-JKT-LPT-2026-0099', N'Test', 'LPT', '2026-10-28', 'JKT', 'EMP001');
    UPDATE dbo.TB_M_ASSET SET ASSET_NO = 'AST-JKT-LPT-2026-0098' WHERE ASSET_NO = 'AST-JKT-LPT-2026-0099';
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-01 nomor asset tidak bisa diubah', IIF(@err = 50001, 1, 0), CONCAT(@err, ' ', @msg));

SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    INSERT dbo.TB_M_ASSET (ASSET_NO, ASSET_NM, CATEGORY_CD, ACQ_DT, OFFICE_CD, CREATED_BY)
    VALUES ('AST-JKT-MON-2026-0001', N'Test', 'LPT', '2026-10-28', 'JKT', 'EMP001');
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-01 kode kategori di nomor harus sama dengan CATEGORY_CD', IIF(@err = 547, 1, 0), CONCAT(@err, ' ', @msg));

/* ---------- BR-02: satu asset satu user ---------- */
SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    UPDATE dbo.TB_M_ASSET SET USER_ID = 'EMP006' WHERE ASSET_NO = 'AST-JKT-PRJ-2025-0001';  -- MISSING
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-02 asset MISSING tidak bisa dipegang user (TC-03)', IIF(@err = 547, 1, 0), CONCAT(@err, ' ', @msg));

SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    UPDATE dbo.TB_M_ASSET SET STATUS = 'IN_USE' WHERE ASSET_NO = 'AST-JKT-MON-2025-0004';  -- AVAILABLE tanpa user
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-02 IN_USE wajib punya user', IIF(@err = 547, 1, 0), CONCAT(@err, ' ', @msg));

SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    INSERT dbo.TB_T_ASSIGNMENT (ASSET_NO, ASSIGN_TYPE, TO_USER, FROM_OFFICE, TO_OFFICE, REQUESTED_BY)
    VALUES ('AST-JKT-LPT-2026-0003', 'ASSIGN', 'EMP006', 'JKT', 'JKT', 'EMP001');  -- sudah ada PENDING ke EMP009
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-02 hanya satu assignment PENDING per asset', IIF(@err = 2601, 1, 0), CONCAT(@err, ' ', @msg));

/* ---------- BR-03: mutasi antar kantor (positif, kantor tidak sedang opname) ---------- */
SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    UPDATE dbo.TB_M_ASSET SET OFFICE_CD = 'SBY', USER_ID = 'EMP011' WHERE ASSET_NO = 'AST-JKT-LPT-2025-0002';
    SELECT @n = COUNT(*) FROM dbo.TB_M_ASSET WHERE ASSET_NO = 'AST-JKT-LPT-2025-0002' AND OFFICE_CD = 'SBY';
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-03 mutasi JKT -> SBY diizinkan (TC-05)', IIF(@err = 0 AND @n = 1, 1, 0), CONCAT(@err, ' ', @msg));

/* ---------- BR-04: freeze selama opname (BDG punya sesi OPEN 2026-10) ---------- */
SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    UPDATE dbo.TB_M_ASSET SET USER_ID = 'EMP015' WHERE ASSET_NO = 'AST-BDG-LPT-2025-0002';
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-04 mutasi user di kantor yang sedang opname ditolak', IIF(@err = 50004, 1, 0), CONCAT(@err, ' ', @msg));

SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    UPDATE dbo.TB_M_ASSET SET OFFICE_CD = 'BDG', USER_ID = 'EMP014' WHERE ASSET_NO = 'AST-JKT-LPT-2025-0002';
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-04 mutasi ke kantor tujuan yang sedang opname ditolak', IIF(@err = 50004, 1, 0), CONCAT(@err, ' ', @msg));

SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    INSERT dbo.TB_T_OPNAME_H (OFFICE_CD, PERIOD, CREATED_BY) VALUES ('BDG', '2026-11', 'EMP001');
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-04 maksimal satu sesi aktif per kantor', IIF(@err = 2601, 1, 0), CONCAT(@err, ' ', @msg));

/* ---------- BR-05: rumus selisih ---------- */
SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    UPDATE dbo.TB_T_OPNAME_H SET QTY_FOUND = 17 WHERE OFFICE_CD = 'JKT' AND PERIOD = '2026-09';
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('BR-05 Qty Fisik harus = Qty Sistem - Minus', IIF(@err = 547, 1, 0), CONCAT(@err, ' ', @msg));

/* ---------- SoD & audit ---------- */
SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    UPDATE d SET RESULT = 'SESUAI'
      FROM dbo.TB_T_OPNAME_D d JOIN dbo.TB_T_OPNAME_H h ON h.OPNAME_ID = d.OPNAME_ID
     WHERE h.OFFICE_CD = 'JKT' AND h.PERIOD = '2026-09' AND d.ASSET_NO = 'AST-JKT-PRJ-2025-0001';
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('SoD hasil cek tidak bisa diubah setelah approve', IIF(@err = 50011, 1, 0), CONCAT(@err, ' ', @msg));

SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    UPDATE dbo.TB_T_OPNAME_H SET STATUS = 'SUBMITTED', SUBMITTED_BY = 'EMP004', SUBMITTED_DT = SYSDATETIME()
     WHERE OFFICE_CD = 'BDG' AND PERIOD = '2026-10';
    UPDATE dbo.TB_T_OPNAME_H SET STATUS = 'APPROVED', APPROVED_BY = 'EMP004', APPROVED_DT = SYSDATETIME()
     WHERE OFFICE_CD = 'BDG' AND PERIOD = '2026-10';
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('SoD approver tidak boleh sama dengan submitter', IIF(@err = 547, 1, 0), CONCAT(@err, ' ', @msg));

SELECT @err = 0, @msg = NULL;
BEGIN TRAN;
BEGIN TRY
    DELETE dbo.TB_T_ASSET_HISTORY WHERE ASSET_NO = 'AST-JKT-PRJ-2025-0001';
END TRY BEGIN CATCH SELECT @err = ERROR_NUMBER(), @msg = ERROR_MESSAGE(); END CATCH;
IF @@TRANCOUNT > 0 ROLLBACK;
INSERT @r VALUES ('Audit riwayat asset append-only', IIF(@err = 50010, 1, 0), CONCAT(@err, ' ', @msg));

/* ---------- Konsistensi seed (contoh response SA §4, TC-06/TC-08 baseline) ---------- */
INSERT @r
SELECT 'Seed KPI total 33 / in use 25 / available 5 / repair 1 / missing 2',
       IIF(SUM(TOTAL) = 33 AND SUM(IN_USE) = 25 AND SUM(AVAILABLE) = 5 AND SUM(UNDER_REPAIR) = 1 AND SUM(MISSING) = 2, 1, 0),
       CONCAT(SUM(TOTAL), '/', SUM(IN_USE), '/', SUM(AVAILABLE), '/', SUM(UNDER_REPAIR), '/', SUM(MISSING))
  FROM dbo.VW_DASHBOARD_KPI;

INSERT @r
SELECT 'Seed opname JKT 2026-09: sistem 17, fisik 16, minus 1, merah (BR-08)',
       IIF(QTY_SYSTEM = 17 AND QTY_FOUND = 16 AND QTY_MINUS = 1 AND QTY_PLUS = 0 AND IS_RED = 1, 1, 0),
       CONCAT(QTY_SYSTEM, '/', QTY_FOUND, '/', QTY_MINUS, '/', QTY_PLUS, ' red=', IS_RED)
  FROM dbo.VW_OPNAME_LAST_APPROVED WHERE OFFICE_CD = 'JKT';

INSERT @r
SELECT 'Seed opname SBY 2026-09: minus 1, plus 1; BDG minus 0 tidak merah',
       IIF(SUM(CASE WHEN OFFICE_CD = 'SBY' AND QTY_MINUS = 1 AND QTY_PLUS = 1 AND IS_RED = 1 THEN 1 ELSE 0 END) = 1
       AND SUM(CASE WHEN OFFICE_CD = 'BDG' AND QTY_MINUS = 0 AND IS_RED = 0 AND PERIOD = '2026-09' THEN 1 ELSE 0 END) = 1, 1, 0),
       STRING_AGG(CONCAT(OFFICE_CD, ' ', PERIOD, ' m=', QTY_MINUS, ' p=', QTY_PLUS), '; ')
  FROM dbo.VW_OPNAME_LAST_APPROVED;

INSERT @r
SELECT 'Seed BR-07: minus -> MISSING, RUSAK -> UNDER_REPAIR, BEDA_LOKASI -> user aktual',
       IIF(SUM(CASE WHEN ASSET_NO IN ('AST-JKT-PRJ-2025-0001', 'AST-SBY-MON-2025-0002') AND STATUS = 'MISSING' AND USER_ID IS NULL THEN 1 ELSE 0 END) = 2
       AND SUM(CASE WHEN ASSET_NO = 'AST-BDG-PRN-2025-0001' AND STATUS = 'UNDER_REPAIR' THEN 1 ELSE 0 END) = 1
       AND SUM(CASE WHEN ASSET_NO = 'AST-JKT-MON-2025-0002' AND USER_ID = 'EMP008' THEN 1 ELSE 0 END) = 1, 1, 0),
       NULL
  FROM dbo.TB_M_ASSET;

INSERT @r
SELECT 'Seed variance per kategori = header (FR-09)',
       IIF(NOT EXISTS (
            SELECT 1 FROM dbo.TB_T_OPNAME_H h
            JOIN (SELECT OPNAME_ID, S = SUM(QTY_SYSTEM), F = SUM(QTY_FOUND), M = SUM(QTY_MINUS), P = SUM(QTY_PLUS)
                    FROM dbo.TB_R_OPNAME_VARIANCE GROUP BY OPNAME_ID) v ON v.OPNAME_ID = h.OPNAME_ID
            WHERE v.S <> h.QTY_SYSTEM OR v.F <> h.QTY_FOUND OR v.M <> h.QTY_MINUS OR v.P <> h.QTY_PLUS), 1, 0),
       NULL;

INSERT @r
SELECT 'Seed asset perlu ditarik dari karyawan resign',
       IIF(COUNT(*) = 1 AND MAX(ASSET_NO) = 'AST-JKT-LPT-2024-0003', 1, 0), STRING_AGG(ASSET_NO, ', ')
  FROM dbo.VW_ASSET_TO_RECALL;

/* ---------- Hasil ---------- */
SELECT NO, IIF(PASSED = 1, 'PASS', 'FAIL') AS RESULT, TC, DETAIL FROM @r ORDER BY NO;

SELECT @n = COUNT(*) FROM @r WHERE PASSED = 0;
IF @n > 0
BEGIN
    SET @msg = CONCAT(@n, ' test database gagal.');
    THROW 59000, @msg, 1;
END;
SELECT @n = COUNT(*) FROM @r;
PRINT CONCAT('Semua ', @n, ' test database lulus.');
