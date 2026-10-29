/* =============================================================================
   S004 - Seed user Internal Auditor (DEV / SIT / UAT saja)
   ============================================================================= */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO
IF EXISTS (SELECT 1 FROM dbo.TB_S_SCHEMA_VERSION WHERE VERSION_NO = 'S004')
BEGIN
    PRINT 'S004 sudah diterapkan, skip.';
    SET NOEXEC ON;
END
GO
BEGIN TRANSACTION;
INSERT dbo.TB_M_USER (USER_ID, USER_NM, EMAIL, AD_ACCOUNT, DEPT, OFFICE_CD, ROLE_CD, IS_ACTIVE, CREATED_BY, CREATED_DT)
VALUES ('EMP016', N'Ratna Kusuma', 'ratna.kusuma@ams.local', 'AMS\ratna.kusuma', N'Internal Audit', 'JKT', 'AUDITOR', 1, 'SYSTEM', '2024-01-02');
INSERT dbo.TB_S_SCHEMA_VERSION (VERSION_NO, DESCRIPTION) VALUES ('S004', N'Seed user Internal Auditor');
COMMIT TRANSACTION;
PRINT 'S004 diterapkan.';
GO
SET NOEXEC OFF;
GO
