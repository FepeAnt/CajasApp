#!/usr/bin/env bash
# Uso: ./run.sh  (requiere un Postgres local; variables PGHOST/PGPORT/PGUSER)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB=cajas_test
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d $DB -f "$DIR/00_harness_supabase.sql"
for f in "$DIR"/../migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d $DB -f "$f"; done
# El primer archivo crea el esquema de pruebas; el segundo lo reutiliza.
psql -v ON_ERROR_STOP=1 -q -d $DB -f "$DIR/10_rls_y_reglas.test.sql" 2>&1 | grep -E "ok  -|FALLÓ|ERROR" || true
psql -v ON_ERROR_STOP=1 -q -d $DB -f "$DIR/20_subcajas_usuarios.test.sql" 2>&1 | grep -E "ok  -|FALLÓ|ERROR|TODAS"
