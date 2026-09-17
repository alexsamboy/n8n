#!/usr/bin/env python3
"""Measure active n8n Schedule Triggers without executing workflows.

The live adapter uses fixed SELECT statements through the PostgreSQL container.
Use --fixture for deterministic/offline validation.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ops.postgres_readonly import execute_readonly_query


PASS_DELAY_SECONDS = 30
WARN_DELAY_SECONDS = 60
DEGRADED_DELAY_SECONDS = 180
MISSING_GRACE_SECONDS = 300
DEFAULT_POSTGRES_CONTAINER = "n8n-postgres"

READ_ONLY_QUERY = r"""
BEGIN TRANSACTION READ ONLY;
WITH active_schedules AS (
  SELECT
    w.id,
    w.name,
    w."activeVersionId",
    COALESCE(w.settings ->> 'timezone', 'UTC') AS timezone,
    COALESCE(w.settings ->> 'saveDataSuccessExecution', 'all') AS save_data_success_execution,
    COALESCE(w.settings ->> 'saveDataErrorExecution', 'all') AS save_data_error_execution,
    (SELECT jsonb_agg(jsonb_build_object('name', n ->> 'name', 'cron', i ->> 'expression')
                      ORDER BY n ->> 'name', i ->> 'expression')
       FROM json_array_elements(w.nodes) n
       CROSS JOIN LATERAL json_array_elements(COALESCE(n -> 'parameters' -> 'rule' -> 'interval', '[]'::json)) i
      WHERE n ->> 'type' = 'n8n-nodes-base.scheduleTrigger'
        AND i ->> 'expression' IS NOT NULL) AS schedule_triggers,
    (SELECT jsonb_agg(DISTINCT n ->> 'type')
       FROM json_array_elements(w.nodes) n
      WHERE n ->> 'type' <> 'n8n-nodes-base.scheduleTrigger'
        AND (n ->> 'type' LIKE '%Trigger' OR n ->> 'type' LIKE '%Webhook%')) AS other_trigger_types
  FROM workflow_entity w
  WHERE w.active = true
    AND EXISTS (SELECT 1 FROM json_array_elements(w.nodes) n
                WHERE n ->> 'type' = 'n8n-nodes-base.scheduleTrigger')
), latest AS (
  SELECT DISTINCT ON (e."workflowId")
    e."workflowId", e.id, e.mode, e.status, e."createdAt", e."startedAt",
    e."stoppedAt", e."workflowVersionId"
  FROM execution_entity e
  JOIN active_schedules s ON s.id = e."workflowId"
  ORDER BY e."workflowId", e."createdAt" DESC
)
SELECT jsonb_build_object(
  'workflow_id', s.id,
  'name', s.name,
  'active_version_id', s."activeVersionId",
  'timezone', s.timezone,
  'save_data_success_execution', s.save_data_success_execution,
  'save_data_error_execution', s.save_data_error_execution,
  'schedule_triggers', COALESCE(s.schedule_triggers, '[]'::jsonb),
  'other_trigger_types', COALESCE(s.other_trigger_types, '[]'::jsonb),
  'last_execution', CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', l.id,
    'mode', l.mode,
    'status', l.status,
    'created_at', l."createdAt",
    'started_at', l."startedAt",
    'stopped_at', l."stoppedAt",
    'workflow_version_id', l."workflowVersionId"
  ) END
)::text
FROM active_schedules s
LEFT JOIN latest l ON l."workflowId" = s.id
ORDER BY s.name;
COMMIT;
"""


def parse_timestamp(value: str | datetime | None) -> datetime | None:
    if value is None or isinstance(value, datetime):
        return value
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError(f"timestamp without timezone: {value}")
    return parsed


def _expand_field(value: str, minimum: int, maximum: int, *, sunday: bool = False) -> set[int]:
    result: set[int] = set()
    for component in value.split(","):
        base, slash, step_text = component.partition("/")
        step = int(step_text) if slash else 1
        if step < 1:
            raise ValueError(f"invalid cron step: {component}")
        if base == "*":
            start, end = minimum, maximum
        elif "-" in base:
            start_text, end_text = base.split("-", 1)
            start, end = int(start_text), int(end_text)
        else:
            start = end = int(base)
        if start < minimum or end > maximum or start > end:
            raise ValueError(f"cron value out of range: {component}")
        result.update(range(start, end + 1, step))
    if sunday and 7 in result:
        result.remove(7)
        result.add(0)
    return result


def cron_matches(local: datetime, expression: str) -> bool:
    fields = expression.split()
    if len(fields) != 5:
        raise ValueError(f"only five-field cron is supported: {expression}")
    minute_text, hour_text, dom_text, month_text, dow_text = fields
    minute = _expand_field(minute_text, 0, 59)
    hour = _expand_field(hour_text, 0, 23)
    dom = _expand_field(dom_text, 1, 31)
    month = _expand_field(month_text, 1, 12)
    dow = _expand_field(dow_text, 0, 7, sunday=True)
    cron_dow = (local.weekday() + 1) % 7
    dom_match = local.day in dom
    dow_match = cron_dow in dow
    day_match = (dom_match or dow_match) if dom_text != "*" and dow_text != "*" else dom_match and dow_match
    return local.minute in minute and local.hour in hour and local.month in month and day_match


def previous_schedule(expression: str, timezone_name: str, now: datetime) -> datetime:
    if now.tzinfo is None:
        raise ValueError("now must include a timezone")
    try:
        local = now.astimezone(ZoneInfo(timezone_name)).replace(second=0, microsecond=0)
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"unknown workflow timezone: {timezone_name}") from error
    for minutes_back in range(0, 366 * 24 * 60 + 1):
        candidate = local - timedelta(minutes=minutes_back)
        if cron_matches(candidate, expression):
            return candidate
    raise ValueError(f"no schedule found within one year for {expression}")


def classify_schedule(
    delay_seconds: float | None,
    execution_correlates: bool,
    scheduled_at: datetime,
    now: datetime,
    *,
    success_execution_observable: bool = True,
    origin_ambiguous: bool = False,
) -> str:
    if not execution_correlates:
        if origin_ambiguous or not success_execution_observable:
            return "INDETERMINATE"
        return "FAIL" if (now - scheduled_at).total_seconds() > MISSING_GRACE_SECONDS else "PENDING"
    if delay_seconds is None:
        return "UNKNOWN"
    if delay_seconds < PASS_DELAY_SECONDS:
        return "PASS"
    if delay_seconds < WARN_DELAY_SECONDS:
        return "WARN"
    return "DEGRADED"


def evaluate_workflow(workflow: dict[str, Any], now: datetime) -> dict[str, Any]:
    triggers = workflow.get("schedule_triggers") or []
    if not triggers:
        raise ValueError(f"workflow {workflow.get('workflow_id')} has no usable cron expression")
    schedules = [previous_schedule(item["cron"], workflow["timezone"], now) for item in triggers]
    scheduled_at = max(schedules)
    execution = workflow.get("last_execution") or {}
    created_at = parse_timestamp(execution.get("created_at"))
    started_at = parse_timestamp(execution.get("started_at"))
    version_matches = bool(execution) and execution.get("workflow_version_id") == workflow.get("active_version_id")
    observed_delay = (created_at - scheduled_at).total_seconds() if created_at else None
    within_window = observed_delay is not None and 0 <= observed_delay <= MISSING_GRACE_SECONDS
    trigger_mode = execution.get("mode") == "trigger"
    compatible_count = sum(
        1 for item in schedules
        if created_at and 0 <= (created_at - item).total_seconds() <= MISSING_GRACE_SECONDS
    )

    if compatible_count > 1 or len(triggers) > 1:
        origin = "ambiguous"
    elif trigger_mode and version_matches and within_window:
        origin = "correlated"
    else:
        origin = "unknown"

    execution_correlates = origin == "correlated"
    save_success = workflow.get("save_data_success_execution", "all")
    save_error = workflow.get("save_data_error_execution", "all")
    success_execution_observable = save_success != "none"
    schedule_delay = (created_at - scheduled_at).total_seconds() if execution_correlates and created_at else None
    start_delay = (started_at - created_at).total_seconds() if created_at and started_at else None
    classification = classify_schedule(
        schedule_delay,
        execution_correlates,
        scheduled_at,
        now.astimezone(scheduled_at.tzinfo),
        success_execution_observable=success_execution_observable,
        origin_ambiguous=origin == "ambiguous",
    )
    if execution_correlates:
        classification_reason = (
            f"persisted execution created {round(schedule_delay, 3)} seconds after scheduled time"
        )
    elif origin == "ambiguous":
        classification_reason = "multiple Schedule Triggers are compatible with the observable execution"
    elif not success_execution_observable:
        classification_reason = "success executions are not persisted for this workflow"
    elif classification == "FAIL":
        classification_reason = "no compatible persisted execution appeared within the configured grace period"
    else:
        classification_reason = "waiting for the configured grace period to expire"
    return {
        "workflow_id": workflow.get("workflow_id"),
        "name": workflow.get("name"),
        "active_version_id": workflow.get("active_version_id"),
        "timezone": workflow.get("timezone"),
        "saveDataSuccessExecution": save_success,
        "saveDataErrorExecution": save_error,
        "success_execution_observable": success_execution_observable,
        "observability": "SUCCESS_PERSISTED" if success_execution_observable else "SUCCESS_NOT_PERSISTED",
        "cron_expressions": [item["cron"] for item in triggers],
        "trigger_names": [item.get("name") for item in triggers],
        "other_trigger_types": workflow.get("other_trigger_types") or [],
        "last_execution_id": execution.get("id"),
        "mode": execution.get("mode"),
        "status": execution.get("status"),
        "workflow_version_id": execution.get("workflow_version_id"),
        "scheduled_at": scheduled_at.isoformat(),
        "created_at": created_at.isoformat() if created_at else None,
        "started_at": started_at.isoformat() if started_at else None,
        "stopped_at": parse_timestamp(execution.get("stopped_at")).isoformat() if execution.get("stopped_at") else None,
        "schedule_delay_seconds": round(schedule_delay, 3) if schedule_delay is not None else None,
        "start_delay_seconds": round(start_delay, 3) if start_delay is not None else None,
        "classification": classification,
        "classification_reason": classification_reason,
        "origin": origin,
        "origin_note": "mode=trigger is never treated as direct proof of Schedule Trigger origin",
    }


def load_workflows_from_postgres(container: str) -> list[dict[str, Any]]:
    result = execute_readonly_query(container, READ_ONLY_QUERY)
    rows = []
    for line in result.rows:
        if line.startswith("{"):
            rows.append(json.loads(line))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, help="offline JSON input; never contacts Docker")
    parser.add_argument("--postgres-container", default=DEFAULT_POSTGRES_CONTAINER)
    parser.add_argument("--now", help="timezone-aware ISO timestamp; defaults to current UTC")
    parser.add_argument("--output", type=Path, help="write JSON to this path instead of stdout")
    args = parser.parse_args()
    try:
        now = parse_timestamp(args.now) if args.now else datetime.now(timezone.utc)
        workflows = json.loads(args.fixture.read_text(encoding="utf-8")) if args.fixture else load_workflows_from_postgres(args.postgres_container)
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "thresholds_seconds": {
                "pass_lt": PASS_DELAY_SECONDS,
                "warn_lt": WARN_DELAY_SECONDS,
                "degraded_lt": DEGRADED_DELAY_SECONDS,
                "missing_fail_after": MISSING_GRACE_SECONDS,
            },
            "workflows": [evaluate_workflow(item, now) for item in workflows],
        }
        rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
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
