/* =============================================================================
   V005 - Role Internal Auditor (modul AI Audit & Anomaly Detection)
   AD group produksi: AMS_AUDITOR. Read-only atas data asset; mengelola alert & kasus audit.
   ============================================================================= */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.TB_S_SCHEMA_VERSION WHERE VERSION_NO = 'V005')
BEGIN
    PRINT 'V005 sudah diterapkan, skip.';
    SET NOEXEC ON;
END
GO
BEGIN TRANSACTION;
GO
ALTER TABLE dbo.TB_M_USER DROP CONSTRAINT CK_TB_M_USER_ROLE;
ALTER TABLE dbo.TB_M_USER ADD CONSTRAINT CK_TB_M_USER_ROLE CHECK (ROLE_CD IN ('ADMIN_GA', 'PIC', 'USER', 'EXEC', 'AUDITOR'));
GO
INSERT dbo.TB_S_SCHEMA_VERSION (VERSION_NO, DESCRIPTION) VALUES ('V005', N'Role Internal Auditor');
COMMIT TRANSACTION;
PRINT 'V005 diterapkan.';
GO
SET NOEXEC OFF;
GO
