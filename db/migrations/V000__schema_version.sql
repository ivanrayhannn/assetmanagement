/* =============================================================================
   V000 - Tabel versi schema
   Mencatat migration & seed yang sudah diterapkan agar script aman dijalankan ulang.
   ============================================================================= */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
IF OBJECT_ID(N'dbo.TB_S_SCHEMA_VERSION', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.TB_S_SCHEMA_VERSION (
        VERSION_NO   varchar(10)   NOT NULL CONSTRAINT PK_TB_S_SCHEMA_VERSION PRIMARY KEY,
        DESCRIPTION  nvarchar(200) NOT NULL,
        APPLIED_BY   sysname       NOT NULL CONSTRAINT DF_TB_S_SCHEMA_VERSION_BY DEFAULT (SUSER_SNAME()),
        APPLIED_DT   datetime2(0)  NOT NULL CONSTRAINT DF_TB_S_SCHEMA_VERSION_DT DEFAULT (SYSDATETIME())
    );
    INSERT dbo.TB_S_SCHEMA_VERSION (VERSION_NO, DESCRIPTION) VALUES ('V000', N'Tabel versi schema');
    PRINT 'V000 diterapkan.';
END
ELSE
    PRINT 'V000 sudah diterapkan, skip.';
GO
