# AMS Backend (ASP.NET Core 8)

Dikerjakan di langkah 3. Struktur rencana:

```
Ams.sln
src/Ams.Api                 host, auth (mock role + hook AD SSO), middleware, Swagger
src/Ams.Shared              kontrak antar modul, audit, current-user, ProblemDetails
src/Ams.Modules.Asset       FR-01..05, BR-01..03
src/Ams.Modules.Opname      FR-06..10, BR-04..07
src/Ams.Modules.Reporting   FR-11..13, BR-08 (Dapper)
tests/Ams.UnitTests         satu kelas test per BR
```

Schema database dikelola di `/db` (database-first); EF Core hanya memetakan, tanpa EF Migrations.
