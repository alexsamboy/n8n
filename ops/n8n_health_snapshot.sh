#!/usr/bin/env bash
set -euo pipefail

# Read-only snapshot collector. It writes only beneath the selected repository
# output root and never attempts remediation.

N8N_CONTAINER="${N8N_CONTAINER:-n8n}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-n8n-postgres}"
RUNNERS_CONTAINER="${RUNNERS_CONTAINER:-n8n-task-runners}"
OUTPUT_ROOT="${OUTPUT_ROOT:-logs/health}"
LOG_SINCE="${LOG_SINCE:-15m}"
DNS_ATTEMPTS="${DNS_ATTEMPTS:-10}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 2
}

for required in docker python3 uptime free df; do
  command -v "$required" >/dev/null 2>&1 || fail "required command not found: $required"
done
[[ "$DNS_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || fail "DNS_ATTEMPTS must be a positive integer"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
case "$OUTPUT_ROOT" in
  /*) output_base="$OUTPUT_ROOT" ;;
  *) output_base="$repo_root/$OUTPUT_ROOT" ;;
esac
case "$output_base" in
  "$repo_root"/logs/health|"$repo_root"/logs/health/*) ;;
  *) fail "OUTPUT_ROOT must remain beneath $repo_root/logs/health" ;;
esac

docker inspect "$N8N_CONTAINER" >/dev/null 2>&1 || fail "container unavailable: $N8N_CONTAINER"
docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 || fail "container unavailable: $POSTGRES_CONTAINER"
docker inspect "$RUNNERS_CONTAINER" >/dev/null 2>&1 || fail "container unavailable: $RUNNERS_CONTAINER"

timestamp_local="$(date --iso-8601=seconds)"
timestamp_utc="$(date --utc --iso-8601=seconds)"
day="$(date +%F)"
stamp="$(date +%F_%H-%M-%S)"
snapshot_dir="$output_base/$day/$stamp"
mkdir -p "$snapshot_dir"

redact_stream() {
  sed -E \
    -e 's/(STATEMENT:).*/\1 <REDACTED_SQL_STATEMENT>/I' \
    -e 's/((password|passwd|token|api[_-]?key|secret)[=:][[:space:]]*)[^[:space:]]+/\1<REDACTED>/Ig' \
    -e 's/(Authorization:[[:space:]]*(Bearer|Basic)[[:space:]]+)[^[:space:]]+/\1<REDACTED>/Ig'
}

{
  printf 'timestamp_local=%s\n' "$timestamp_local"
  printf 'timestamp_utc=%s\n' "$timestamp_utc"
  uptime
  free -h
  df -hT
  df -i
  if command -v vmstat >/dev/null 2>&1; then vmstat 1 5; else printf 'vmstat=UNAVAILABLE\n'; fi
  if command -v iostat >/dev/null 2>&1; then iostat -xz 1 3; else printf 'iostat=UNAVAILABLE\n'; fi
} >"$snapshot_dir/host.txt"

{
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
  docker stats --no-stream
  for container in "$N8N_CONTAINER" "$POSTGRES_CONTAINER" "$RUNNERS_CONTAINER"; do
    docker inspect "$container" --format 'name={{.Name}} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restartCount={{.RestartCount}} startedAt={{.State.StartedAt}} networks={{range $name, $network := .NetworkSettings.Networks}}{{$name}}:{{$network.IPAddress}} {{end}}'
  done
} >"$snapshot_dir/docker.txt"

docker exec -e DNS_ATTEMPTS="$DNS_ATTEMPTS" "$N8N_CONTAINER" node -e '
const dns = require("dns");
const attempts = Number(process.env.DNS_ATTEMPTS);
let count = 0;
const run = () => {
  const started = process.hrtime.bigint();
  const timestamp = new Date().toISOString();
  dns.lookup("postgres", {all: true}, (error, addresses) => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(JSON.stringify({
      timestamp,
      duration_ms: Math.round(durationMs * 1000) / 1000,
      resolved_ip: error ? null : addresses.map(item => item.address),
      error: error ? {code: error.code || "UNKNOWN", message: String(error.message || error)} : null
    }));
    count += 1;
    if (count < attempts) setTimeout(run, 200);
  });
};
run();
' >"$snapshot_dir/dns.jsonl"

python3 - "$snapshot_dir/dns.jsonl" "$snapshot_dir/dns.json" <<'PY'
import json
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:])
rows = [json.loads(line) for line in source.read_text(encoding="utf-8").splitlines() if line.strip()]
target.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
source.unlink()
PY

docker exec -i "$POSTGRES_CONTAINER" sh -lc 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' >"$snapshot_dir/postgres_stats.json" <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
  'timestamp', now(),
  'max_connections', current_setting('max_connections')::integer,
  'connections', (SELECT jsonb_agg(x) FROM (SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY state NULLS FIRST) x),
  'waits', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT pid, application_name, state, wait_event_type, wait_event, now() - query_start AS duration
    FROM pg_stat_activity WHERE pid <> pg_backend_pid() ORDER BY pid
  ) x),
  'locks', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT pid, pg_blocking_pids(pid) AS blocked_by FROM pg_stat_activity
    WHERE cardinality(pg_blocking_pids(pid)) > 0 ORDER BY pid
  ) x),
  'vacuum', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (SELECT * FROM pg_stat_progress_vacuum) x),
  'database', (SELECT to_jsonb(x) FROM (
    SELECT datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit,
           temp_files, temp_bytes, deadlocks
    FROM pg_stat_database WHERE datname=current_database()
  ) x),
  'tables', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT schemaname, relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum,
           vacuum_count, autovacuum_count
    FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 25
  ) x)
));
COMMIT;
SQL

docker logs --timestamps --since "$LOG_SINCE" "$N8N_CONTAINER" 2>&1 \
  | sed -n -E '/error|warn|schedule|trigger|timer|postgres|EAI_AGAIN|timeout|pool|connection|recover/Ip' \
  | redact_stream >"$snapshot_dir/n8n.log"
docker logs --timestamps --since "$LOG_SINCE" "$POSTGRES_CONTAINER" 2>&1 \
  | sed -n -E '/error|warn|timeout|connection|autovacuum|vacuum|checkpoint|recover/Ip' \
  | redact_stream >"$snapshot_dir/postgres.log"
docker logs --timestamps --since "$LOG_SINCE" "$RUNNERS_CONTAINER" 2>&1 \
  | sed -n -E '/error|warn|timeout|broker|reconnect|runner/Ip' \
  | redact_stream >"$snapshot_dir/runners.log"

python3 - "$snapshot_dir" "$timestamp_local" "$timestamp_utc" <<'PY'
import json
import sys
from pathlib import Path

directory = Path(sys.argv[1])
dns = json.loads((directory / "dns.json").read_text(encoding="utf-8"))
summary = {
    "timestamp_local": sys.argv[2],
    "timestamp_utc": sys.argv[3],
    "mode": "read_only",
    "dns_attempts": len(dns),
    "dns_errors": sum(1 for item in dns if item.get("error")),
    "files": sorted(path.name for path in directory.iterdir()),
    "automatic_remediation": False,
}
(directory / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
PY

printf '%s\n' "$snapshot_dir"
