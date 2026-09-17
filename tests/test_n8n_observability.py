import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ops.analyze_n8n_incident import build_timeline, log_line_events, redact_log_detail  # noqa: E402
from ops.n8n_scheduler_monitor import (  # noqa: E402
    classify_schedule,
    evaluate_workflow,
    previous_schedule,
)
from ops.postgres_readonly import (  # noqa: E402
    DockerExecError,
    PsqlExecutionError,
    SqlQueryError,
    build_psql_command,
    execute_readonly_query,
)


def completed(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess([], returncode, stdout, stderr)


class PostgresTransportTests(unittest.TestCase):
    def test_command_forwards_stdin_without_tty(self):
        command = build_psql_command("n8n-postgres")
        self.assertEqual(command[:4], ["docker", "exec", "-i", "n8n-postgres"])
        self.assertNotIn("-t", command)

    def test_sql_is_supplied_through_process_stdin(self):
        captured = {}

        def runner(command, **kwargs):
            captured["command"] = command
            captured.update(kwargs)
            return completed(stdout="1\n", stderr="__N8N_PSQL_STARTED__\n")

        execute_readonly_query("n8n-postgres", "SELECT 1;", runner=runner)
        self.assertEqual(captured["input"], "SELECT 1;")
        self.assertTrue(captured["text"])
        self.assertTrue(captured["capture_output"])

    def test_valid_query_with_rows(self):
        runner = lambda *args, **kwargs: completed(stdout='{"id":1}\n', stderr="__N8N_PSQL_STARTED__\n")
        result = execute_readonly_query("n8n-postgres", "SELECT 1;", runner=runner)
        self.assertEqual(result.rows, ['{"id":1}'])
        self.assertEqual(result.stderr, "")

    def test_valid_query_with_zero_rows(self):
        runner = lambda *args, **kwargs: completed(stdout="", stderr="__N8N_PSQL_STARTED__\n")
        result = execute_readonly_query("n8n-postgres", "SELECT 1 WHERE false;", runner=runner)
        self.assertEqual(result.rows, [])

    def test_sql_error_is_distinct(self):
        runner = lambda *args, **kwargs: completed(returncode=3, stderr="__N8N_PSQL_STARTED__\nERROR: relation missing does not exist\n")
        with self.assertRaises(SqlQueryError):
            execute_readonly_query("n8n-postgres", "SELECT * FROM missing;", runner=runner)

    def test_docker_error_is_distinct(self):
        runner = lambda *args, **kwargs: completed(returncode=125, stderr="Error response from daemon: no such container\n")
        with self.assertRaises(DockerExecError):
            execute_readonly_query("missing", "SELECT 1;", runner=runner)

    def test_psql_error_is_distinct(self):
        runner = lambda *args, **kwargs: completed(returncode=2, stderr="__N8N_PSQL_STARTED__\npsql: error: connection failed\n")
        with self.assertRaises(PsqlExecutionError):
            execute_readonly_query("n8n-postgres", "SELECT 1;", runner=runner)


class SchedulerMonitorTests(unittest.TestCase):
    def _run_cli(self, *arguments):
        environment = {**os.environ, "PATH": ""}
        return subprocess.run(
            [sys.executable, *arguments],
            cwd=ROOT,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_direct_script_cli_resolves_ops_without_pythonpath(self):
        completed = self._run_cli("ops/n8n_scheduler_monitor.py", "--help")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertNotIn("ModuleNotFoundError", completed.stderr)

    def test_direct_script_fixture_returns_json_without_docker(self):
        completed = self._run_cli(
            "ops/n8n_scheduler_monitor.py",
            "--fixture", "fixtures/n8n-observability/scheduler.json",
            "--now", "2026-09-14T14:02:00Z",
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["workflows"][0]["classification"], "DEGRADED")

    def test_module_fixture_returns_json_without_docker(self):
        completed = self._run_cli(
            "-m", "ops.n8n_scheduler_monitor",
            "--fixture", "fixtures/n8n-observability/scheduler.json",
            "--now", "2026-09-14T14:02:00Z",
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(json.loads(completed.stdout)["workflows"][0]["origin"], "correlated")

    def test_helper_imports_from_repo_root(self):
        completed = self._run_cli("-c", "from ops.postgres_readonly import build_psql_command; print('ok')")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout.strip(), "ok")

    def test_previous_schedule_uses_workflow_timezone(self):
        now = datetime.fromisoformat("2026-09-14T14:02:00+00:00")
        expected = previous_schedule("0 10 * * 1-5", "America/Santo_Domingo", now)
        self.assertEqual(expected.isoformat(), "2026-09-14T10:00:00-04:00")

    def test_delay_thresholds_and_missing_grace(self):
        scheduled = datetime.fromisoformat("2026-09-14T10:00:00-04:00")
        self.assertEqual(classify_schedule(29.99, True, scheduled, scheduled), "PASS")
        self.assertEqual(classify_schedule(30, True, scheduled, scheduled), "WARN")
        self.assertEqual(classify_schedule(60, True, scheduled, scheduled), "DEGRADED")
        self.assertEqual(classify_schedule(180, True, scheduled, scheduled), "DEGRADED")
        now = datetime.fromisoformat("2026-09-14T10:05:01-04:00")
        self.assertEqual(classify_schedule(None, False, scheduled, now), "FAIL")

    def test_observable_execution_on_time_is_pass(self):
        fixture = json.loads((ROOT / "fixtures/n8n-observability/scheduler.json").read_text())
        fixture[0]["last_execution"]["created_at"] = "2026-09-14T14:00:20+00:00"
        result = evaluate_workflow(fixture[0], datetime.fromisoformat("2026-09-14T14:02:00+00:00"))
        self.assertTrue(result["success_execution_observable"])
        self.assertEqual(result["classification"], "PASS")

    def test_observable_missing_execution_after_grace_is_fail(self):
        fixture = json.loads((ROOT / "fixtures/n8n-observability/scheduler.json").read_text())
        fixture[0]["last_execution"] = None
        result = evaluate_workflow(fixture[0], datetime.fromisoformat("2026-09-14T14:06:00+00:00"))
        self.assertEqual(result["classification"], "FAIL")
        self.assertIn("no compatible persisted execution", result["classification_reason"])

    def test_unobservable_success_without_parent_is_indeterminate(self):
        fixture = json.loads((ROOT / "fixtures/n8n-observability/scheduler.json").read_text())
        fixture[0]["save_data_success_execution"] = "none"
        fixture[0]["last_execution"] = None
        result = evaluate_workflow(fixture[0], datetime.fromisoformat("2026-09-14T14:06:00+00:00"))
        self.assertFalse(result["success_execution_observable"])
        self.assertEqual(result["observability"], "SUCCESS_NOT_PERSISTED")
        self.assertEqual(result["classification"], "INDETERMINATE")
        self.assertEqual(result["classification_reason"], "success executions are not persisted for this workflow")

    def test_integrated_evidence_does_not_prove_schedule_origin(self):
        fixture = json.loads((ROOT / "fixtures/n8n-observability/scheduler.json").read_text())
        fixture[0]["save_data_success_execution"] = "none"
        fixture[0]["last_execution"]["mode"] = "integrated"
        result = evaluate_workflow(fixture[0], datetime.fromisoformat("2026-09-14T14:06:00+00:00"))
        self.assertEqual(result["origin"], "unknown")
        self.assertEqual(result["classification"], "INDETERMINATE")

    def test_monthly_observable_execution_remains_pass(self):
        fixture = json.loads((ROOT / "fixtures/n8n-observability/scheduler.json").read_text())
        workflow = fixture[0]
        workflow["schedule_triggers"] = [{"name": "Monthly", "cron": "0 10 1-3 * *"}]
        workflow["last_execution"]["created_at"] = "2026-09-03T14:00:00.048+00:00"
        workflow["last_execution"]["started_at"] = "2026-09-03T14:00:00.063+00:00"
        result = evaluate_workflow(workflow, datetime.fromisoformat("2026-09-14T17:00:00+00:00"))
        self.assertEqual(result["classification"], "PASS")
        self.assertEqual(result["schedule_delay_seconds"], 0.048)

    def test_mode_trigger_is_only_correlated_not_observed_origin(self):
        fixture = json.loads((ROOT / "fixtures/n8n-observability/scheduler.json").read_text())
        result = evaluate_workflow(fixture[0], datetime.fromisoformat("2026-09-14T14:02:00+00:00"))
        self.assertEqual(result["origin"], "correlated")
        self.assertEqual(result["classification"], "DEGRADED")
        self.assertEqual(result["schedule_delay_seconds"], 89.869)

    def test_multiple_schedule_triggers_are_ambiguous(self):
        fixture = json.loads((ROOT / "fixtures/n8n-observability/scheduler.json").read_text())
        fixture[0]["schedule_triggers"].append({"name": "Segundo", "cron": "0 10 * * 1-5"})
        result = evaluate_workflow(fixture[0], datetime.fromisoformat("2026-09-14T14:02:00+00:00"))
        self.assertEqual(result["origin"], "ambiguous")

    def test_execution_before_schedule_does_not_correlate(self):
        fixture = json.loads((ROOT / "fixtures/n8n-observability/scheduler.json").read_text())
        fixture[0]["last_execution"]["created_at"] = "2026-09-14T13:59:59+00:00"
        result = evaluate_workflow(fixture[0], datetime.fromisoformat("2026-09-14T14:02:00+00:00"))
        self.assertEqual(result["origin"], "unknown")
        self.assertEqual(result["classification"], "PENDING")


class IncidentAnalyzerTests(unittest.TestCase):
    def _run_cli(self, *arguments):
        return subprocess.run(
            [sys.executable, *arguments],
            cwd=ROOT,
            env={**os.environ, "PATH": ""},
            check=False,
            capture_output=True,
            text=True,
        )

    def test_analyzer_direct_and_module_fixture_clis(self):
        common = [
            "--from", "2026-09-14T09:55:00-04:00",
            "--to", "2026-09-14T10:05:00-04:00",
            "--fixture", "fixtures/n8n-observability/incident-events.json",
        ]
        for entrypoint in (["ops/analyze_n8n_incident.py"], ["-m", "ops.analyze_n8n_incident"]):
            with self.subTest(entrypoint=entrypoint):
                completed = self._run_cli(*entrypoint, *common)
                self.assertEqual(completed.returncode, 0, completed.stderr)
                self.assertNotIn("ModuleNotFoundError", completed.stderr)
                self.assertEqual(json.loads(completed.stdout)["source_mode"], "fixture")

    def test_log_redaction_removes_auth_and_sql_statement_content(self):
        self.assertEqual(redact_log_detail("Authorization: Bearer synthetic-value"), "Authorization: Bearer <REDACTED>")
        self.assertEqual(redact_log_detail("STATEMENT: SELECT synthetic-sensitive-value"), "STATEMENT: <REDACTED_SQL_STATEMENT>")

    def test_postgres_log_keeps_docker_and_internal_timestamps(self):
        line = "2026-09-12T10:54:43.808Z 2026-09-12 07:28:02.904 UTC [60] WARNING: delayed worker"
        events = log_line_events("postgres", line)
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["timestamp"], "2026-09-12T10:54:43.808Z")
        self.assertEqual(events[1]["timestamp"], "2026-09-12T07:28:02.904+00:00")
        self.assertEqual(events[1]["source"], "postgres_internal_log")

    def test_timeline_is_utc_sorted_and_preserves_original_timestamp(self):
        events = [
            {"timestamp": "2026-09-14T10:01:29-04:00", "source": "execution", "detail": "created", "evidence": "observed"},
            {"timestamp": "2026-09-14T14:00:00Z", "source": "schedule", "detail": "expected", "evidence": "correlated"},
        ]
        timeline = build_timeline(events)
        self.assertEqual([item["source"] for item in timeline], ["schedule", "execution"])
        self.assertEqual(timeline[1]["timestamp_original"], "2026-09-14T10:01:29-04:00")
        self.assertEqual(timeline[1]["timestamp_utc"], "2026-09-14T14:01:29Z")

    def test_cli_uses_fixture_without_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "timeline.json"
            command = [
                sys.executable,
                str(ROOT / "ops/analyze_n8n_incident.py"),
                "--from", "2026-09-14 09:55:00-04:00",
                "--to", "2026-09-14 10:05:00-04:00",
                "--fixture", str(ROOT / "fixtures/n8n-observability/incident-events.json"),
                "--output", str(output),
            ]
            completed = subprocess.run(command, check=False, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            payload = json.loads(output.read_text())
            self.assertEqual(payload["causality"], "not_automatically_inferred")
            self.assertTrue(all(item["evidence"] in {"observed", "correlated", "inferred", "unknown"} for item in payload["events"]))


class CanaryTests(unittest.TestCase):
    def test_canary_is_inactive_and_has_only_allowed_nodes(self):
        canary = json.loads((ROOT / "workflows/ops/scheduler-canary.json").read_text())
        self.assertFalse(canary["active"])
        self.assertEqual(canary["settings"]["saveDataSuccessExecution"], "all")
        self.assertEqual(
            {node["type"] for node in canary["nodes"]},
            {"n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.set"},
        )
        self.assertFalse(any(node.get("credentials") for node in canary["nodes"]))
        schedule = next(node for node in canary["nodes"] if node["type"].endswith("scheduleTrigger"))
        self.assertEqual(schedule["parameters"]["rule"]["interval"][0]["expression"], "*/5 * * * *")


if __name__ == "__main__":
    unittest.main()
