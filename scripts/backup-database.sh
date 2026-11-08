#!/bin/sh
# Back up every table in the dashboard database. No Node.js installation needed.
set -eu
umask 077

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: sh scripts/backup-database.sh <backup-directory> [compose-file]" >&2
  exit 1
fi

# Resolve relative arguments from the caller's directory before locating the repo.
case "$1" in
  /*) backup_dir=$1 ;;
  *) backup_dir=$PWD/$1 ;;
esac
compose_file=${2:-docker-compose.prod.yml}
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"

# Avoid placing dumps inside files served by the application, including aliases.
mkdir -p "$backup_dir"
backup_dir=$(CDPATH= cd -- "$backup_dir" && pwd -P)
public_dir=$(CDPATH= cd public && pwd -P)
case "$backup_dir/" in
  "$public_dir/"*) echo "Choose a backup directory outside public/." >&2; exit 1 ;;
esac

stamp=$(date '+%Y%m%d-%H%M%S')
temporary=$(mktemp "$backup_dir/.dashboard-$stamp.XXXXXX")
cleanup() { [ ! -f "$temporary" ] || rm -f "$temporary"; }
trap cleanup 0
trap 'exit 1' HUP INT TERM

# pg_dump takes a consistent snapshot without stopping the application.
# Deliberately no table/schema filters: includes Japanese, finance, and everything else.
docker compose -f "$compose_file" exec -T dashboard-db sh -c \
  'exec pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$temporary"

# Catch incomplete/invalid archives before giving the backup its final filename.
docker compose -f "$compose_file" exec -T dashboard-db pg_restore --list < "$temporary" > /dev/null
name=${temporary##*/}
backup_file=$backup_dir/${name#.}.dump
mv "$temporary" "$backup_file"
trap - 0 HUP INT TERM
printf 'Whole database backup saved: %s\n' "$backup_file"
