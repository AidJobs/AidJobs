#!/usr/bin/env python3
"""Dependency audit gate (security plan, stage 3A, part 3).

Runs one audit, checks that its output can be trusted, and decides:

- npm: `npm audit --omit=dev`. Each advisory is judged on its own; high and critical fail.
- pypi: pip-audit on the installed set. Any finding fails, because pip-audit reports no severity.
  `pip`, `setuptools`, and `wheel` come with the runner and are reported, not gated (Render's own
  build tools are part 3's later step). Other packages are labelled "runtime (Render)" when
  `requirements.txt` resolves to them, otherwise "CI only".

An accepted finding needs an entry in `.github/audit-exceptions.json` with a reason and a review
date; an expired entry fails, an unused one warns. A missing, broken, or incomplete audit output
fails after retries: it never passes silently.

Exit codes: 0 pass, 1 findings or an expired exception, 2 the audit could not run or the
exceptions file is invalid. Standard library only.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

EXIT_PASS = 0
EXIT_FINDINGS = 1
EXIT_ERROR = 2

NPM_GATED = {"high", "critical"}
NPM_SEVERITIES = {"info", "low", "moderate", "high", "critical"}
BUILD_TOOLS = {"pip", "setuptools", "wheel"}
RETRY_WAITS = (15, 45)
GHSA = re.compile(r"^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$", re.IGNORECASE)
EXCEPTION_KEYS = {"ecosystem", "package", "advisory", "reason", "review_by"}

LABEL_RUNTIME = "runtime (Render)"
LABEL_CI_ONLY = "CI only"
LABEL_BUILD_TOOL = "build tool, not gated"
LABEL_UNKNOWN = "unlabelled"


class AuditError(Exception):
    """The audit could not run, or its output cannot be trusted."""

    def __init__(self, message: str, retry: bool = True):
        super().__init__(message)
        self.retry = retry


@dataclass(frozen=True)
class Finding:
    ecosystem: str
    package: str
    advisory: str
    aliases: frozenset[str] = frozenset()
    severity: str | None = None
    title: str = ""
    detail: str = ""
    label: str = ""

    def ids(self) -> set[str]:
        return {self.advisory.upper(), *(a.upper() for a in self.aliases)}


@dataclass(frozen=True)
class AuditException:
    ecosystem: str
    package: str
    advisory: str
    reason: str
    review_by: dt.date


@dataclass
class Decision:
    failures: list[Finding] = field(default_factory=list)
    excepted: list[tuple[Finding, AuditException]] = field(default_factory=list)
    reported: list[Finding] = field(default_factory=list)
    expired: list[AuditException] = field(default_factory=list)
    unused: list[AuditException] = field(default_factory=list)

    @property
    def exit_code(self) -> int:
        return EXIT_FINDINGS if self.failures or self.expired else EXIT_PASS


def normalise_pypi(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def normalise_package(ecosystem: str, name: str) -> str:
    return normalise_pypi(name) if ecosystem == "pypi" else name.strip().lower()


def _load_json(text: str, what: str, retry: bool = True) -> object:
    if not text or not text.strip():
        raise AuditError(f"{what} is empty", retry=retry)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AuditError(f"{what} is not valid JSON ({exc})", retry=retry) from exc


def load_exceptions(text: str) -> list[AuditException]:
    """Parse the exceptions file; anything unexpected is an error, never a silent pass."""
    data = _load_json(text, "the exceptions file", retry=False)
    if not isinstance(data, dict) or set(data) != {"version", "exceptions"} or data.get("version") != 1:
        raise AuditError('the exceptions file must be {"version": 1, "exceptions": [...]}', retry=False)
    entries = data["exceptions"]
    if not isinstance(entries, list):
        raise AuditError("the exceptions file's `exceptions` must be a list", retry=False)
    result: list[AuditException] = []
    seen: set[tuple[str, str, str]] = set()
    for number, entry in enumerate(entries, start=1):
        where = f"exception {number}"
        if not isinstance(entry, dict) or set(entry) != EXCEPTION_KEYS:
            raise AuditError(f"{where} must have exactly the keys {sorted(EXCEPTION_KEYS)}", retry=False)
        if any(not isinstance(entry[k], str) or not entry[k].strip() for k in EXCEPTION_KEYS):
            raise AuditError(f"{where} has an empty or non-text value", retry=False)
        ecosystem = entry["ecosystem"]
        if ecosystem not in {"npm", "pypi"}:
            raise AuditError(f"{where}: ecosystem must be npm or pypi", retry=False)
        advisory = entry["advisory"].strip().upper()
        if ecosystem == "npm" and not GHSA.match(advisory):
            raise AuditError(f"{where}: an npm exception must name a GHSA advisory", retry=False)
        try:
            review_by = dt.date.fromisoformat(entry["review_by"])
        except ValueError as exc:
            raise AuditError(f"{where}: review_by must be a date, YYYY-MM-DD", retry=False) from exc
        package = normalise_package(ecosystem, entry["package"])
        key = (ecosystem, package, advisory)
        if key in seen:
            raise AuditError(f"{where} repeats {ecosystem} {package} {advisory}", retry=False)
        seen.add(key)
        result.append(AuditException(ecosystem, package, advisory, entry["reason"].strip(), review_by))
    return result


def parse_npm(text: str) -> list[Finding]:
    """Advisories from `npm audit --json`, one finding per package and advisory."""
    data = _load_json(text, "the npm audit output")
    if not isinstance(data, dict):
        raise AuditError("the npm audit output is not an object")
    if "error" in data:
        error = data["error"] if isinstance(data["error"], dict) else {}
        detail = data.get("message") or error.get("summary") or error.get("code") or "unknown error"
        raise AuditError(f"npm audit failed: {detail}")
    if data.get("auditReportVersion") != 2:
        raise AuditError("the npm audit output is not report version 2")
    vulnerabilities = data.get("vulnerabilities")
    metadata = data.get("metadata")
    if not isinstance(vulnerabilities, dict) or not isinstance(metadata, dict):
        raise AuditError("the npm audit output has no vulnerabilities or metadata")
    dependencies = metadata.get("dependencies")
    if not isinstance(metadata.get("vulnerabilities"), dict) or not isinstance(dependencies, dict):
        raise AuditError("the npm audit output's metadata is incomplete")
    if not isinstance(dependencies.get("prod"), int) or dependencies["prod"] <= 0:
        raise AuditError("npm audit saw no production dependencies")

    found: dict[tuple[str, str], Finding] = {}
    for key, entry in vulnerabilities.items():
        if not isinstance(entry, dict) or not isinstance(entry.get("via"), list):
            raise AuditError(f"the npm audit entry for {key} is malformed")
        for via in entry["via"]:
            if isinstance(via, str):
                continue
            if not isinstance(via, dict) or via.get("severity") not in NPM_SEVERITIES:
                raise AuditError(f"an advisory for {key} is malformed")
            url = str(via.get("url") or "")
            ghsa = url.rstrip("/").rsplit("/", 1)[-1].upper() if "/advisories/" in url else ""
            advisory = ghsa if GHSA.match(ghsa) else f"NPM-{via.get('source')}"
            package = normalise_package("npm", str(via.get("name") or key))
            nodes = ", ".join(entry.get("nodes") or [])
            fix = entry.get("fixAvailable")
            if isinstance(fix, dict):
                fix_text = f"fix: {fix.get('name')} {fix.get('version')}" + (" (major)" if fix.get("isSemVerMajor") else "")
            else:
                fix_text = "fix available" if fix else "no fix"
            found.setdefault(
                (package, advisory),
                Finding(
                    "npm",
                    package,
                    advisory,
                    severity=via["severity"],
                    title=str(via.get("title") or ""),
                    detail=f"affected {via.get('range', '?')}; {nodes}; {fix_text}",
                ),
            )
    return sorted(found.values(), key=lambda f: (f.package, f.advisory))


def read_installed(text: str) -> dict[str, str]:
    """`pip freeze --all` output as {normalised name: version}; only exact pins are accepted."""
    installed: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;]+)", line)
        if not match:
            raise AuditError(f"the installed list has a line that is not an exact pin: {line}", retry=False)
        installed[normalise_pypi(match.group(1))] = match.group(2)
    if not installed:
        raise AuditError("the installed list is empty", retry=False)
    return installed


def read_runtime_report(text: str | None) -> set[str] | None:
    """Names `pip install --dry-run --report` resolves for requirements.txt; None if unusable."""
    if not text:
        return None
    try:
        data = json.loads(text)
        return {normalise_pypi(item["metadata"]["name"]) for item in data["install"]}
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


def parse_pip_audit(text: str, installed: dict[str, str], runtime: set[str] | None) -> list[Finding]:
    """Findings from pip-audit's JSON; skipped or missing packages make the audit untrustworthy."""
    data = _load_json(text, "the pip-audit output")
    if not isinstance(data, dict) or not isinstance(data.get("dependencies"), list) or not data["dependencies"]:
        raise AuditError("the pip-audit output has no dependencies")
    skipped = [f"{d.get('name')}: {d['skip_reason']}" for d in data["dependencies"] if isinstance(d, dict) and "skip_reason" in d]
    if skipped:
        raise AuditError("pip-audit skipped packages: " + "; ".join(skipped), retry=False)
    audited = {normalise_pypi(str(d.get("name"))) for d in data["dependencies"] if isinstance(d, dict)}
    if audited != set(installed):
        missing = sorted(set(installed) - audited)
        extra = sorted(audited - set(installed))
        raise AuditError(f"pip-audit did not audit exactly the installed set (missing {missing}, extra {extra})", retry=False)

    merged: dict[tuple[str, str], dict] = {}
    for dep in data["dependencies"]:
        vulns = dep.get("vulns")
        if not isinstance(vulns, list):
            raise AuditError(f"the pip-audit entry for {dep.get('name')} has no vulns list")
        package = normalise_pypi(str(dep["name"]))
        for vuln in vulns:
            if not isinstance(vuln, dict) or not vuln.get("id"):
                raise AuditError(f"an advisory for {package} is malformed")
            slot = merged.setdefault(
                (package, str(vuln["id"]).upper()),
                {"version": dep.get("version", "?"), "aliases": set(), "fixes": set()},
            )
            slot["aliases"].update(str(a).upper() for a in vuln.get("aliases") or [])
            slot["fixes"].update(str(v) for v in vuln.get("fix_versions") or [])

    findings = []
    for (package, advisory), slot in sorted(merged.items()):
        if package in BUILD_TOOLS:
            label = LABEL_BUILD_TOOL
        elif runtime is None:
            label = LABEL_UNKNOWN
        else:
            label = LABEL_RUNTIME if package in runtime else LABEL_CI_ONLY
        fixes = ", ".join(sorted(slot["fixes"])) or "none"
        findings.append(
            Finding(
                "pypi",
                package,
                advisory,
                aliases=frozenset(slot["aliases"] - {advisory}),
                detail=f"{package} {slot['version']}; fixed in {fixes}",
                label=label,
            )
        )
    return findings


def decide(ecosystem: str, findings: list[Finding], exceptions: list[AuditException], today: dt.date) -> Decision:
    decision = Decision()
    mine = [e for e in exceptions if e.ecosystem == ecosystem]
    used: set[AuditException] = set()
    for finding in findings:
        gated = finding.severity in NPM_GATED if ecosystem == "npm" else finding.label != LABEL_BUILD_TOOL
        if not gated:
            decision.reported.append(finding)
            continue
        match = next((e for e in mine if e.package == finding.package and e.advisory in finding.ids()), None)
        if match is None:
            decision.failures.append(finding)
        else:
            used.add(match)
            decision.excepted.append((finding, match))
    for exception in mine:
        if exception.review_by < today:
            decision.expired.append(exception)
        elif exception not in used:
            decision.unused.append(exception)
    return decision


def run_with_retries(
    attempt: Callable[[], object],
    what: str,
    waits: tuple[int, ...] = RETRY_WAITS,
    sleep: Callable[[float], None] = time.sleep,
) -> object:
    last: AuditError | None = None
    for number in range(len(waits) + 1):
        try:
            return attempt()
        except AuditError as exc:
            last = exc
            if not exc.retry:
                raise
            print(f"{what}: attempt {number + 1} could not run: {exc}", file=sys.stderr)
            if number < len(waits):
                sleep(waits[number])
    raise AuditError(f"{what} could not run after {len(waits) + 1} attempts: {last}", retry=False)


def _run(command: list[str]) -> subprocess.CompletedProcess:
    try:
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", check=False)
    except OSError as exc:
        raise AuditError(f"{command[0]} could not be started ({exc})") from exc
    if result.returncode not in (0, 1):
        tail = (result.stderr or "").strip().splitlines()[-3:]
        raise AuditError(f"{command[0]} exited with {result.returncode}: {' | '.join(tail)}")
    return result


def audit_npm(output: Path) -> list[Finding]:
    def attempt() -> list[Finding]:
        output.unlink(missing_ok=True)
        result = _run(["npm", "audit", "--omit=dev", "--json"])
        output.write_text(result.stdout, encoding="utf-8")
        return parse_npm(result.stdout)

    return run_with_retries(attempt, "npm audit")  # type: ignore[return-value]


def audit_pypi(pip_audit: str, installed_file: Path, runtime_report: Path | None, output: Path) -> list[Finding]:
    installed = read_installed(installed_file.read_text(encoding="utf-8-sig"))
    report_text = runtime_report.read_text(encoding="utf-8-sig") if runtime_report and runtime_report.exists() else None
    runtime = read_runtime_report(report_text)
    if runtime is None:
        _annotate("warning", "Could not resolve requirements.txt, so findings are not labelled runtime or CI only.")

    def attempt() -> list[Finding]:
        output.unlink(missing_ok=True)
        _run([pip_audit, "-r", str(installed_file), "--no-deps", "--disable-pip",
              "--progress-spinner", "off", "--format", "json", "--output", str(output)])
        if not output.exists():
            raise AuditError("pip-audit wrote no output")
        return parse_pip_audit(output.read_text(encoding="utf-8-sig"), installed, runtime)

    return run_with_retries(attempt, "pip-audit")  # type: ignore[return-value]


def _annotate(level: str, message: str) -> None:
    print(f"::{level}::{message}")


def _line(finding: Finding) -> str:
    parts = [finding.package, finding.advisory]
    if finding.severity:
        parts.append(finding.severity)
    if finding.label:
        parts.append(f"[{finding.label}]")
    text = " ".join(parts)
    if finding.aliases:
        text += f" (also {', '.join(sorted(finding.aliases))})"
    if finding.title:
        text += f": {finding.title}"
    return f"{text} ({finding.detail})" if finding.detail else text


def report(ecosystem: str, decision: Decision) -> None:
    lines = [f"### Dependency audit: {ecosystem}", ""]
    if decision.failures:
        lines.append(f"**Failed: {len(decision.failures)} finding(s) need a fix or a reviewed exception.**")
        lines += [f"- {_line(f)}" for f in decision.failures]
        for f in decision.failures:
            _annotate("error", f"{ecosystem} audit: {_line(f)}")
    for e in decision.expired:
        lines.append(f"- **Expired exception** ({e.review_by.isoformat()}): {e.package} {e.advisory}: {e.reason}")
        _annotate("error", f"{ecosystem} audit: the exception for {e.package} {e.advisory} expired on {e.review_by.isoformat()}")
    if decision.excepted:
        lines.append("Accepted by an exception:")
        lines += [f"- {_line(f)}, until {e.review_by.isoformat()}: {e.reason}" for f, e in decision.excepted]
    if decision.reported:
        lines.append("Reported, not gated:")
        lines += [f"- {_line(f)}" for f in decision.reported]
    for e in decision.unused:
        _annotate("warning", f"{ecosystem} audit: the exception for {e.package} {e.advisory} matched nothing")
    if decision.exit_code == EXIT_PASS:
        lines.insert(2, "Passed.")
    text = "\n".join(lines) + "\n"
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--exceptions", type=Path, default=Path(".github/audit-exceptions.json"))
    parser.add_argument("--today", type=dt.date.fromisoformat, default=None, help="UTC date, YYYY-MM-DD (tests)")
    sub = parser.add_subparsers(dest="ecosystem", required=True)
    npm = sub.add_parser("npm")
    npm.add_argument("--output", type=Path, required=True)
    pypi = sub.add_parser("pypi")
    pypi.add_argument("--pip-audit", required=True)
    pypi.add_argument("--installed", type=Path, required=True)
    pypi.add_argument("--runtime-report", type=Path)
    pypi.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    today = args.today or dt.datetime.now(dt.timezone.utc).date()

    try:
        exceptions = load_exceptions(args.exceptions.read_text(encoding="utf-8-sig")) if args.exceptions.exists() else None
        if exceptions is None:
            raise AuditError(f"the exceptions file {args.exceptions} is missing", retry=False)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        if args.ecosystem == "npm":
            findings = audit_npm(args.output)
        else:
            findings = audit_pypi(args.pip_audit, args.installed, args.runtime_report, args.output)
    except AuditError as exc:
        _annotate("error", f"{args.ecosystem} audit could not be trusted: {exc}")
        return EXIT_ERROR

    decision = decide(args.ecosystem, findings, exceptions, today)
    report(args.ecosystem, decision)
    return decision.exit_code


if __name__ == "__main__":
    sys.exit(main())
