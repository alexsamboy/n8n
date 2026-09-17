#!/usr/bin/env python3
"""Build a UTC-normalized incident timeline from read-only evidence."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops.n8n_scheduler_monitor import cron_matches, load_workflows_from_postgres
from ops.postgres_readonly import execute_readonly_query


EVIDENCE_LEVELS = {"observed", "correlated", "inferred", "unknown"}
LOG_CONTAINERS = {
    "n8n": "n8n",
    "postgres": "n8n-postgres",
    "runners": "n8n-task-runners",
}
LOG_TIMESTAMP = re.compile(r"^(?P<timestamp>\d{4}-\d{2}-\d{2}T\S+)\s+(?P<detail>.*)$")
POSTGRES_INTERNAL_TIMESTAMP = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)? UTC)\s+(?P<detail>.*)$"
)
SECRET_VALUE = re.compile(
    r"(?i)((?:password|passwd|token|api[_-]?key|secret)\s*[=:]\s*)\S+"
)
AUTHORIZATION_VALUE = re.compile(r"(?i)(Authorization:\s*(?:Bearer|Basic)\s+)\S+")


def parse_timestamp(value: str) -> datetime:
    normalized = value.strip().replace(" ", "T", 1).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError(f"timestamp requires an explicit UTC offset: {value}")
    return parsed


def utc_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def redact_log_detail(detail: str) -> str:
    if "STATEMENT:" in detail:
        prefix = detail.split("STATEMENT:", 1)[0]
        return f"{prefix}STATEMENT: <REDACTED_SQL_STATEMENT>"
    redacted = SECRET_VALUE.sub(r"\1<REDACTED>", detail)
    return AUTHORIZATION_VALUE.sub(r"\1<REDACTED>", redacted)


def build_timeline(events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for event in events:
        evidence = event.get("evidence", "unknown")
        if evidence not in EVIDENCE_LEVELS:
            raise ValueError(f"invalid evidence classification: {evidence}")
        original = event["timestamp"]
        parsed = parse_timestamp(original)
        normalized.append({
            **event,
            "timestamp_original": original,
            "timestamp_utc": utc_text(parsed),
            "evidence": evidence,
        })
    return sorted(normalized, key=lambda item: item["timestamp_utc"])


def log_line_events(source: str, line: str) -> list[dict[str, Any]]:
    match = LOG_TIMESTAMP.match(line)
    if not match:
        return []
    detail = redact_log_detail(match.group("detail"))
    events = [{
        "timestamp": match.group("timestamp"),
        "source": f"{source}_log",
        "detail": detail,
        "evidence": "observed",
    }]
    if source == "postgres":
        internal = POSTGRES_INTERNAL_TIMESTAMP.match(detail)
        if internal:
            internal_timestamp = internal.group("timestamp").removesuffix(" UTC").replace(" ", "T", 1) + "+00:00"
            events.append({
                "timestamp": internal_timestamp,
                "source": "postgres_internal_log",
                "detail": internal.group("detail"),
                "evidence": "observed",
                "transport_timestamp": match.group("timestamp"),
            })
    return events


def run_command(command: list[str], *, input_text: str | None = None, combine_stderr: bool = False) -> str:
    executable = command[0]
    if shutil.which(executable) is None:
        raise RuntimeError(f"required command not found: {executable}")
    completed = subprocess.run(command, input=input_text, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"command failed ({executable}): {completed.stderr.strip()}")
    return completed.stdout + (completed.stderr if combine_stderr else "")


def execution_events(from_utc: datetime, to_utc: datetime, container: str) -> list[dict[str, Any]]:
    from_text, to_text = utc_text(from_utc), utc_text(to_utc)
    query = f"""
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'id', e.id, 'workflow_id', e.\"workflowId\", 'workflow_name', w.name,
  'mode', e.mode, 'status', e.status, 'created_at', e.\"createdAt\",
  'started_at', e.\"startedAt\", 'stopped_at', e.\"stoppedAt\",
  'workflow_version_id', e.\"workflowVersionId\"
)::text
FROM execution_entity e JOIN workflow_entity w ON w.id=e.\"workflowId\"
WHERE e.\"createdAt\" >= '{from_text}'::timestamptz
  AND e.\"createdAt\" < '{to_text}'::timestamptz
ORDER BY e.\"createdAt\";
COMMIT;
"""
    result = execute_readonly_query(container, query)
    events: list[dict[str, Any]] = []
    for line in result.rows:
        if not line.startswith("{"):
            continue
        row = json.loads(line)
        for field in ("created_at", "started_at", "stopped_at"):
            if row.get(field):
                events.append({
                    "timestamp": row[field],
                    "source": "execution_entity",
                    "detail": f"execution={row['id']} workflow={row['workflow_id']} {field} mode={row['mode']} status={row['status']}",
                    "evidence": "observed",
                })
    return events


def schedule_events(from_utc: datetime, to_utc: datetime, container: str) -> list[dict[str, Any]]:
    events = []
    for workflow in load_workflows_from_postgres(container):
        for trigger in workflow.get("schedule_triggers", []):
            cursor = from_utc.astimezone(ZoneInfo(workflow["timezone"])).replace(second=0, microsecond=0)
            limit = to_utc.astimezone(ZoneInfo(workflow["timezone"]))
            while cursor < limit:
                expected = cursor
                cursor += timedelta(minutes=1)
                if not cron_matches(expected, trigger["cron"]):
                    continue
                events.append({
                    "timestamp": expected.isoformat(),
                    "source": "schedule",
                    "detail": f"expected workflow={workflow['workflow_id']} trigger={trigger.get('name')} cron={trigger['cron']}",
                    "evidence": "correlated",
                })
    return events


def docker_log_events(from_utc: datetime, to_utc: datetime) -> list[dict[str, Any]]:
    events = []
    for source, container in LOG_CONTAINERS.items():
        stdout = run_command([
            "docker", "logs", "--timestamps", "--since", utc_text(from_utc), "--until", utc_text(to_utc), container
        ], combine_stderr=True)
        for line in stdout.splitlines():
            events.extend(log_line_events(source, line))
    return events


def snapshot_events(root: Path, from_utc: datetime, to_utc: datetime) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    if not root.exists():
        return events
    for path in sorted(root.glob("*/*")):
        if not path.is_dir():
            continue
        summary = path / "summary.json"
        if summary.exists():
            try:
                payload = json.loads(summary.read_text(encoding="utf-8"))
                timestamp = payload.get("timestamp_utc")
                if timestamp and from_utc <= parse_timestamp(timestamp) < to_utc:
                    events.append({"timestamp": timestamp, "source": "host_snapshot", "detail": str(path), "evidence": "observed"})
            except (OSError, ValueError, json.JSONDecodeError):
                events.append({"timestamp": utc_text(from_utc), "source": "host_snapshot", "detail": f"unreadable snapshot {path}", "evidence": "unknown"})
        dns_path = path / "dns.json"
        if dns_path.exists():
            try:
                for item in json.loads(dns_path.read_text(encoding="utf-8")):
                    timestamp = item.get("timestamp")
                    if timestamp and from_utc <= parse_timestamp(timestamp) < to_utc:
                        events.append({"timestamp": timestamp, "source": "dns", "detail": json.dumps(item, ensure_ascii=False), "evidence": "observed"})
            except (OSError, ValueError, json.JSONDecodeError):
                pass
    return events


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="from_time", required=True)
    parser.add_argument("--to", dest="to_time", required=True)
    parser.add_argument("--fixture", type=Path, help="offline event JSON; disables all Docker access")
    parser.add_argument("--snapshot-root", type=Path, default=Path("logs/health"))
    parser.add_argument("--postgres-container", default="n8n-postgres")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        from_time, to_time = parse_timestamp(args.from_time), parse_timestamp(args.to_time)
        if from_time >= to_time:
            raise ValueError("--from must be earlier than --to")
        if args.fixture:
            events = json.loads(args.fixture.read_text(encoding="utf-8"))
            source_mode = "fixture"
        else:
            events = []
            events.extend(schedule_events(from_time, to_time, args.postgres_container))
            events.extend(execution_events(from_time, to_time, args.postgres_container))
            events.extend(docker_log_events(from_time, to_time))
            events.extend(snapshot_events(args.snapshot_root, from_time, to_time))
            source_mode = "live_read_only"
        result = {
            "from": args.from_time,
            "to": args.to_time,
            "source_mode": source_mode,
            "causality": "not_automatically_inferred",
            "evidence_legend": {
                "observed": "directly present in a source",
                "correlated": "time/version compatible but not proof of origin",
                "inferred": "explicit analyst hypothesis; never generated automatically",
                "unknown": "missing or unreadable evidence",
            },
            "events": build_timeline(events),
        }
        rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        if args.output:
            args.output.write_text(rendered, encoding="utf-8")
        else:
            sys.stdout.write(rendered)
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
