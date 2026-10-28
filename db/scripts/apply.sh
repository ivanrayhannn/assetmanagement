#!/usr/bin/env bash
# Terapkan migration (dan opsional seed/test) AMS ke SQL Server.
#
#   db/scripts/apply.sh                 # migration saja (semua environment)
#   db/scripts/apply.sh --seed          # + seed data contoh (DEV/SIT/UAT, BUKAN produksi)
#   db/scripts/apply.sh --seed --test   # + test business rule database
#
# Variabel lingkungan:
#   AMS_DB_SERVER (default localhost,1433)  AMS_DB_NAME (default AMS_DB)
#   AMS_DB_USER   (default sa)              AMS_DB_PASSWORD (wajib)
#   SQLCMD        (default sqlcmd; contoh via Docker:
#                  SQLCMD="docker exec -i ams-sql /opt/mssql-tools18/bin/sqlcmd")
# Script dikirim lewat stdin sehingga path file tidak perlu ada di sisi sqlcmd.
set -euo pipefail

DB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AMS_DB_SERVER="${AMS_DB_SERVER:-localhost,1433}"
AMS_DB_NAME="${AMS_DB_NAME:-AMS_DB}"
AMS_DB_USER="${AMS_DB_USER:-sa}"
: "${AMS_DB_PASSWORD:?Set AMS_DB_PASSWORD}"
read -r -a SQLCMD_CMD <<< "${SQLCMD:-sqlcmd}"

SEED=0; TEST=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --test) TEST=1 ;;
    *) echo "Argumen tidak dikenal: $arg" >&2; exit 2 ;;
  esac
done

run() {  # run <database> [sqlcmd args...]
  local db="$1"; shift
  "${SQLCMD_CMD[@]}" -S "$AMS_DB_SERVER" -U "$AMS_DB_USER" -P "$AMS_DB_PASSWORD" \
    -d "$db" -C -b -I -W "$@"
}

apply_dir() {
  local f
  for f in "$DB_DIR/$1"/*.sql; do
    echo ">> $(basename "$f")"
    run "$AMS_DB_NAME" < "$f"
  done
}

run master -Q "IF DB_ID(N'$AMS_DB_NAME') IS NULL CREATE DATABASE [$AMS_DB_NAME];"
apply_dir migrations
[[ $SEED -eq 1 ]] && apply_dir seed
[[ $TEST -eq 1 ]] && apply_dir tests
echo "Selesai: $AMS_DB_NAME"
