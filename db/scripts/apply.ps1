<#
  Terapkan migration (dan opsional seed/test) AMS ke SQL Server - untuk server Windows on-prem.

    .\db\scripts\apply.ps1 -Server "DBSRV01" -Database AMS_DB -UseWindowsAuth
    .\db\scripts\apply.ps1 -Server "localhost,1433" -User sa -Password '***' -Seed -Test

  Butuh sqlcmd (mssql-tools18 atau go-sqlcmd) di PATH. -Seed hanya untuk DEV/SIT/UAT.
#>
param(
  [string]$Server = "localhost,1433",
  [string]$Database = "AMS_DB",
  [string]$User = "sa",
  [string]$Password,
  [switch]$UseWindowsAuth,
  [switch]$Seed,
  [switch]$Test
)
$ErrorActionPreference = "Stop"
$dbDir = Split-Path -Parent $PSScriptRoot

function Invoke-Sql([string]$db, [string[]]$extra) {
  $auth = if ($UseWindowsAuth) { @("-E") } else { @("-U", $User, "-P", $Password) }
  & sqlcmd -S $Server -d $db @auth -C -b -I -W @extra
  if ($LASTEXITCODE -ne 0) { throw "sqlcmd gagal (exit $LASTEXITCODE)" }
}

function Invoke-Dir([string]$name) {
  Get-ChildItem (Join-Path $dbDir $name) -Filter *.sql | Sort-Object Name | ForEach-Object {
    Write-Host ">> $($_.Name)"
    Invoke-Sql $Database @("-i", $_.FullName)
  }
}

Invoke-Sql "master" @("-Q", "IF DB_ID(N'$Database') IS NULL CREATE DATABASE [$Database];")
Invoke-Dir "migrations"
if ($Seed) { Invoke-Dir "seed" }
if ($Test) { Invoke-Dir "tests" }
Write-Host "Selesai: $Database"
