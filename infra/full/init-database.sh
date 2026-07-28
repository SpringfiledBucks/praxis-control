#!/bin/sh
set -eu

app_password=$(cat /run/secrets/praxis_db_password)
if [ -z "$app_password" ]; then
  echo "praxis_db_password is empty" >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_password="$app_password" <<'SQL'
CREATE ROLE praxis_control
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  PASSWORD :'app_password';
CREATE DATABASE praxis_control OWNER praxis_control;
SQL

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname praxis_control <<'SQL'
DROP EXTENSION IF EXISTS timescaledb CASCADE;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO praxis_control;
SQL
