"""Read-only PostgreSQL transport through Docker with explicit error classes."""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from typing import Callable


PSQL_STARTED_MARKER = "__N8N_PSQL_STARTED__"


class PostgresReadOnlyError(RuntimeError):
    """Base error for the read-only PostgreSQL adapter."""


class DockerExecError(PostgresReadOnlyError):
    """Docker could not start the command in the target container."""


class PsqlExecutionError(PostgresReadOnlyError):
    """psql could not start or connect successfully."""


class SqlQueryError(PostgresReadOnlyError):
    """PostgreSQL rejected the SQL statement."""


@dataclass(frozen=True)
class QueryResult:
    rows: list[str]
    stdout: str
    stderr: str
    exit_code: int


def build_psql_command(container: str) -> list[str]:
    if not container or container.startswith("-"):
        raise ValueError("invalid PostgreSQL container name")
    shell_command = (
        f'printf "{PSQL_STARTED_MARKER}\\n" >&2; '
        'exec psql -X -q -v ON_ERROR_STOP=1 '
        '-U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'
    )
    return ["docker", "exec", "-i", container, "sh", "-lc", shell_command]


def execute_readonly_query(
    container: str,
    sql: str,
    *,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> QueryResult:
    if not sql.strip():
        raise ValueError("SQL input cannot be empty")
    if shutil.which("docker") is None and runner is subprocess.run:
        raise DockerExecError("required command not found: docker")
    completed = runner(
        build_psql_command(container),
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    stdout = completed.stdout or ""
    stderr = completed.stderr or ""
    transport_started = PSQL_STARTED_MARKER in stderr
    clean_stderr = "\n".join(
        line for line in stderr.splitlines() if line.strip() != PSQL_STARTED_MARKER
    ).strip()

    if completed.returncode != 0:
        safe_detail = clean_stderr or f"exit code {completed.returncode}"
        if not transport_started:
            raise DockerExecError(f"docker exec failed: {safe_detail}")
        if any(line.lstrip().startswith("ERROR:") for line in clean_stderr.splitlines()):
            raise SqlQueryError(f"PostgreSQL rejected the read-only query: {safe_detail}")
        raise PsqlExecutionError(f"psql failed: {safe_detail}")

    if not transport_started:
        raise DockerExecError("docker exec completed without the container-side transport marker")

    rows = [line for line in stdout.splitlines() if line.strip()]
    return QueryResult(rows=rows, stdout=stdout, stderr=clean_stderr, exit_code=completed.returncode)
