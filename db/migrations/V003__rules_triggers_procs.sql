/* =============================================================================
   V003 - Guard business rule di level database + stored procedure transaksional
   Business rule utama tetap divalidasi di service API (pesan ramah user);
   trigger di sini adalah jaring pengaman bila data diubah di luar API.

   Kode error (THROW):
     50001  BR-01  ASSET_NO tidak boleh diubah
     50004  BR-04  mutasi ditolak, kantor sedang stock opname
     50010  Audit  TB_T_ASSET_HISTORY append-only
     50011  SoD    hasil cek opname terkunci setelah submit
     50012  BR-01  sequence nomor asset habis (> 9999)
     50013  BR-01  tahun nomor asset tidak valid
   ============================================================================= */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.TB_S_SCHEMA_VERSION WHERE VERSION_NO = 'V003')
BEGIN
    PRINT 'V003 sudah diterapkan, skip.';
    SET NOEXEC ON;
END
GO
BEGIN TRANSACTION;
GO

/* BR-01 & BR-04 pada TB_M_ASSET */
CREATE TRIGGER dbo.TR_TB_M_ASSET_GUARD
ON dbo.TB_M_ASSET
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- BR-01: nomor asset immutable
    IF UPDATE(ASSET_NO)
       AND EXISTS (SELECT ASSET_NO FROM inserted EXCEPT SELECT ASSET_NO FROM deleted)
        THROW 50001, N'BR-01: Nomor asset tidak dapat diubah setelah disimpan.', 1;

    -- BR-04: pemakai/kantor tidak boleh berubah selama kantor asal atau tujuan punya sesi opname aktif.
    -- Approve opname (BR-07) meng-update header ke APPROVED lebih dulu dalam transaksi yang sama,
    -- sehingga perubahan hasil opname tidak tertahan oleh trigger ini.
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN deleted d ON d.ASSET_NO = i.ASSET_NO
        JOIN dbo.TB_T_OPNAME_H h
          ON h.STATUS IN ('OPEN', 'SUBMITTED')
         AND h.OFFICE_CD IN (i.OFFICE_CD, d.OFFICE_CD)
        WHERE i.OFFICE_CD <> d.OFFICE_CD
           OR ISNULL(i.USER_ID, '') <> ISNULL(d.USER_ID, ''))
        THROW 50004, N'BR-04: Asset tidak dapat dimutasi karena kantor sedang dalam sesi stock opname.', 1;
END;
GO

/* Audit: riwayat asset tidak boleh diubah atau dihapus */
CREATE TRIGGER dbo.TR_TB_T_ASSET_HISTORY_APPEND_ONLY
ON dbo.TB_T_ASSET_HISTORY
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 50010, N'Riwayat asset bersifat append-only dan tidak dapat diubah/dihapus.', 1;
END;
GO

/* SoD (SA §6): hasil cek hanya bisa diinput/diubah selama sesi OPEN */
CREATE TRIGGER dbo.TR_TB_T_OPNAME_D_LOCK
ON dbo.TB_T_OPNAME_D
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM (SELECT OPNAME_ID FROM inserted UNION SELECT OPNAME_ID FROM deleted) x
        JOIN dbo.TB_T_OPNAME_H h ON h.OPNAME_ID = x.OPNAME_ID
        WHERE h.STATUS <> 'OPEN')
        THROW 50011, N'Hasil cek opname terkunci karena sesi sudah di-submit/approve.', 1;
END;
GO

/* BR-01 / FR-01: ambil nomor asset berikutnya AST-[KANTOR]-[KATEGORI]-[TAHUN]-[SEQ4].
   Dipanggil di dalam transaksi registrasi asset; bila transaksi luar rollback,
   sequence ikut rollback sehingga nomor tidak loncat. Lock UPDLOCK+HOLDLOCK
   menserialkan registrasi untuk kombinasi kantor-kategori-tahun yang sama. */
CREATE PROCEDURE dbo.USP_ASSET_NEXT_NO
    @OFFICE_CD   varchar(3),
    @CATEGORY_CD varchar(3),
    @SEQ_YEAR    smallint,
    @ASSET_NO    varchar(21) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @SEQ_YEAR NOT BETWEEN 2000 AND 2999
        THROW 50013, N'BR-01: Tahun nomor asset tidak valid.', 1;

    DECLARE @seq int;

    BEGIN TRANSACTION;

    UPDATE dbo.TB_M_ASSET_SEQ WITH (UPDLOCK, HOLDLOCK)
       SET @seq = LAST_SEQ = LAST_SEQ + 1,
           UPDATED_DT = SYSDATETIME()
     WHERE OFFICE_CD = @OFFICE_CD AND CATEGORY_CD = @CATEGORY_CD AND SEQ_YEAR = @SEQ_YEAR
       AND LAST_SEQ < 9999;

    IF @@ROWCOUNT = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.TB_M_ASSET_SEQ WITH (UPDLOCK, HOLDLOCK)
                   WHERE OFFICE_CD = @OFFICE_CD AND CATEGORY_CD = @CATEGORY_CD AND SEQ_YEAR = @SEQ_YEAR)
            THROW 50012, N'BR-01: Sequence nomor asset untuk kantor-kategori-tahun ini sudah mencapai 9999.', 1;  -- XACT_ABORT -> rollback

        INSERT dbo.TB_M_ASSET_SEQ (OFFICE_CD, CATEGORY_CD, SEQ_YEAR, LAST_SEQ)
        VALUES (@OFFICE_CD, @CATEGORY_CD, @SEQ_YEAR, 1);
        SET @seq = 1;
    END;

    COMMIT TRANSACTION;

    SET @ASSET_NO = CONCAT('AST-', @OFFICE_CD, '-', @CATEGORY_CD, '-', @SEQ_YEAR, '-',
                           RIGHT(CONCAT('000', @seq), 4));
END;
GO

/* BR-05 / FR-09: hitung ulang angka header opname dari detail.
   Minus = TIDAK_DITEMUKAN; Plus = PLUS; Qty Fisik = Qty Sistem - Minus. */
CREATE PROCEDURE dbo.USP_OPNAME_RECALC
    @OPNAME_ID int
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE h
       SET QTY_SYSTEM = x.QTY_SYSTEM,
           QTY_MINUS  = x.QTY_MINUS,
           QTY_PLUS   = x.QTY_PLUS,
           QTY_FOUND  = x.QTY_SYSTEM - x.QTY_MINUS
      FROM dbo.TB_T_OPNAME_H h
      CROSS APPLY (
          SELECT QTY_SYSTEM = SUM(CASE WHEN d.ASSET_NO IS NOT NULL THEN 1 ELSE 0 END),
                 QTY_MINUS  = SUM(CASE WHEN d.RESULT = 'TIDAK_DITEMUKAN' THEN 1 ELSE 0 END),
                 QTY_PLUS   = SUM(CASE WHEN d.RESULT = 'PLUS' THEN 1 ELSE 0 END)
            FROM dbo.TB_T_OPNAME_D d
           WHERE d.OPNAME_ID = h.OPNAME_ID) x
     WHERE h.OPNAME_ID = @OPNAME_ID;
END;
GO

INSERT dbo.TB_S_SCHEMA_VERSION (VERSION_NO, DESCRIPTION) VALUES ('V003', N'Trigger guard BR & stored procedure');
COMMIT TRANSACTION;
PRINT 'V003 diterapkan.';
GO
SET NOEXEC OFF;
GO
