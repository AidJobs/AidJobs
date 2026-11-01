"""Tests for audit_gate.py, on audit outputs recorded on 1 November 2026.

npm: today's runtime audit (clean), `marked` 4.0.9 and `nanoid` 3.3.7 in throwaway projects, an
unreachable registry, and a project without a lockfile. pip-audit 2.10.1: CI's audit of `main`
(run 41289869648), the same set plus `PyJWT==2.3.0`, a package not on PyPI, and the build tools
Render's Python ships. Advisory descriptions were removed from the pip-audit files to keep them
small; nothing the gate reads was changed. `pypi-runtime-lock.txt` is an excerpt of the locked
apps/backend/requirements.txt.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

import audit_gate as gate

FIXTURES = Path(__file__).parent / "fixtures"
TODAY = dt.date(2026, 11, 1)


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8-sig")


def exceptions(*entries: dict) -> list[gate.AuditException]:
    return gate.load_exceptions(json.dumps({"version": 1, "exceptions": list(entries)}))


def entry(ecosystem: str, package: str, advisory: str, review_by: str = "2026-12-01") -> dict:
    return {"ecosystem": ecosystem, "package": package, "advisory": advisory, "reason": "test", "review_by": review_by}


def runtime(*names: str) -> set[str]:
    return gate.read_runtime_lock(fixture("pypi-runtime-lock.txt")) | set(names)


# npm


def test_npm_clean_runtime_audit_passes():
    findings = gate.parse_npm(fixture("npm-runtime-clean.json"))
    assert findings == []
    assert gate.decide("npm", findings, [], TODAY).exit_code == gate.EXIT_PASS


def test_npm_high_advisories_fail_each_on_its_own():
    findings = gate.parse_npm(fixture("npm-marked-4.0.9.json"))
    assert [(f.package, f.advisory, f.severity) for f in findings] == [
        ("marked", "GHSA-5V2H-R2CX-5XGJ", "high"),
        ("marked", "GHSA-RRRM-QJM4-V8HF", "high"),
    ]
    decision = gate.decide("npm", findings, [], TODAY)
    assert decision.exit_code == gate.EXIT_FINDINGS
    assert len(decision.failures) == 2


def test_npm_exception_covers_only_its_own_advisory():
    findings = gate.parse_npm(fixture("npm-marked-4.0.9.json"))
    decision = gate.decide("npm", findings, exceptions(entry("npm", "marked", "GHSA-rrrm-qjm4-v8hf")), TODAY)
    assert [f.advisory for f in decision.failures] == ["GHSA-5V2H-R2CX-5XGJ"]
    assert [f.advisory for f, _ in decision.excepted] == ["GHSA-RRRM-QJM4-V8HF"]

    both = exceptions(entry("npm", "marked", "GHSA-rrrm-qjm4-v8hf"), entry("npm", "marked", "GHSA-5v2h-r2cx-5xgj"))
    assert gate.decide("npm", findings, both, TODAY).exit_code == gate.EXIT_PASS


def test_npm_moderate_is_reported_not_gated():
    findings = gate.parse_npm(fixture("npm-nanoid-3.3.7.json"))
    decision = gate.decide("npm", findings, [], TODAY)
    assert sorted(f.severity for f in decision.failures) == ["high", "high", "high"]
    assert [(f.advisory, f.severity) for f in decision.reported] == [("GHSA-MWCW-C2X4-8C55", "moderate")]

    data = json.loads(fixture("npm-nanoid-3.3.7.json"))
    data["vulnerabilities"]["nanoid"]["via"] = [v for v in data["vulnerabilities"]["nanoid"]["via"] if v["severity"] == "moderate"]
    moderate_only = gate.decide("npm", gate.parse_npm(json.dumps(data)), [], TODAY)
    assert moderate_only.exit_code == gate.EXIT_PASS
    assert len(moderate_only.reported) == 1


@pytest.mark.parametrize("name", ["npm-unreachable.json", "npm-enolock.json"])
def test_npm_errors_mean_the_audit_could_not_run(name):
    with pytest.raises(gate.AuditError) as caught:
        gate.parse_npm(fixture(name))
    assert caught.value.retry


@pytest.mark.parametrize("text", ["", "   ", "not json", "[]", '{"auditReportVersion": 1}'])
def test_npm_missing_or_broken_output_could_not_run(text):
    with pytest.raises(gate.AuditError):
        gate.parse_npm(text)


def test_npm_empty_tree_is_not_a_pass():
    data = json.loads(fixture("npm-runtime-clean.json"))
    data["metadata"]["dependencies"]["prod"] = 0
    with pytest.raises(gate.AuditError):
        gate.parse_npm(json.dumps(data))


# pypi


def test_pypi_build_tools_are_gated_like_everything_else():
    installed = gate.read_installed(fixture("pypi-ci-installed.txt"))
    findings = gate.parse_pip_audit(fixture("pypi-ci-audit.json"), installed, runtime())
    assert {f.package for f in findings} == {"setuptools"}
    assert len(findings) == 5
    decision = gate.decide("pypi", findings, [], TODAY)
    assert decision.exit_code == gate.EXIT_FINDINGS
    assert {f.label for f in decision.failures} == {gate.LABEL_BUILD_TOOL}
    assert decision.reported == []


def test_pypi_any_finding_fails_with_duplicates_merged_and_labelled():
    installed = gate.read_installed(fixture("pypi-pyjwt-installed.txt"))
    findings = gate.parse_pip_audit(fixture("pypi-pyjwt-audit.json"), installed, runtime())
    pyjwt = [f for f in findings if f.package == "pyjwt"]
    assert len(pyjwt) == 14
    assert {f.label for f in pyjwt} == {gate.LABEL_CI_ONLY}
    decision = gate.decide("pypi", findings, [], TODAY)
    assert decision.exit_code == gate.EXIT_FINDINGS
    # The recorded CI set still has the runner's setuptools 65.5.0, now gated too.
    assert {f.package for f in decision.failures} == {"pyjwt", "setuptools"}

    as_runtime = gate.parse_pip_audit(fixture("pypi-pyjwt-audit.json"), installed, runtime("pyjwt"))
    assert {f.label for f in as_runtime if f.package == "pyjwt"} == {gate.LABEL_RUNTIME}


def test_pypi_exception_matches_an_alias():
    installed = gate.read_installed(fixture("pypi-pyjwt-installed.txt"))
    findings = gate.parse_pip_audit(fixture("pypi-pyjwt-audit.json"), installed, runtime())
    target = next(f for f in findings if f.advisory == "PYSEC-2022-202")
    assert "GHSA-FFQJ-6FQR-9H24" in target.aliases
    decision = gate.decide("pypi", findings, exceptions(entry("pypi", "PyJWT", "ghsa-ffqj-6fqr-9h24")), TODAY)
    assert [f.advisory for f, _ in decision.excepted] == ["PYSEC-2022-202"]
    assert len([f for f in decision.failures if f.package == "pyjwt"]) == 13


def test_pypi_without_a_runtime_lock_still_gates():
    installed = gate.read_installed(fixture("pypi-pyjwt-installed.txt"))
    findings = gate.parse_pip_audit(fixture("pypi-pyjwt-audit.json"), installed, None)
    assert {f.label for f in findings if f.package == "pyjwt"} == {gate.LABEL_UNKNOWN}
    assert gate.decide("pypi", findings, [], TODAY).exit_code == gate.EXIT_FINDINGS


def test_pypi_render_old_build_tools_fail_the_gate():
    installed = gate.read_installed(fixture("pypi-build-tools-installed.txt"))
    findings = gate.parse_pip_audit(fixture("pypi-build-tools-audit.json"), installed, runtime())
    assert {f.package for f in findings} == {"pip", "setuptools", "wheel"}
    assert {f.label for f in findings} == {gate.LABEL_BUILD_TOOL}
    decision = gate.decide("pypi", findings, [], TODAY)
    assert decision.exit_code == gate.EXIT_FINDINGS
    assert len(decision.failures) == len(findings)


def test_pypi_skipped_package_is_never_a_pass():
    installed = {"six": "1.17.0", "zz-aidjobs-no-such-package": "1.0.0"}
    with pytest.raises(gate.AuditError) as caught:
        gate.parse_pip_audit(fixture("pypi-skip-audit.json"), installed, None)
    assert not caught.value.retry
    assert "zz-aidjobs-no-such-package" in str(caught.value)


def test_pypi_audit_must_cover_exactly_the_installed_set():
    installed = gate.read_installed(fixture("pypi-ci-installed.txt"))
    installed["extra-package"] = "1.0"
    with pytest.raises(gate.AuditError) as caught:
        gate.parse_pip_audit(fixture("pypi-ci-audit.json"), installed, None)
    assert "extra-package" in str(caught.value)


@pytest.mark.parametrize("text", ["", "{}", '{"dependencies": []}', "<html>"])
def test_pypi_missing_or_broken_output_could_not_run(text):
    with pytest.raises(gate.AuditError):
        gate.parse_pip_audit(text, {"six": "1.17.0"}, None)


def test_runtime_lock_names_are_read_and_normalised():
    assert runtime() == {"certifi", "charset-normalizer", "idna", "requests", "urllib3", "uvicorn"}
    text = "uvicorn[standard]==0.32.0 \\\n    --hash=sha256:abc\nPyJWT==2.3.0\n    # via -r requirements.in\n"
    assert gate.read_runtime_lock(text) == {"uvicorn", "pyjwt"}


@pytest.mark.parametrize("text", [None, "", "# only a comment\n", "    --hash=sha256:abc\n", "six>=1.0\n"])
def test_an_unusable_runtime_lock_gives_no_labels(text):
    assert gate.read_runtime_lock(text) is None


def test_pypi_malformed_dependency_entry_could_not_run():
    with pytest.raises(gate.AuditError):
        gate.parse_pip_audit('{"dependencies": ["six"]}', {"six": "1.17.0"}, None)


def test_installed_list_names_are_normalised_and_must_be_exact_pins():
    assert gate.read_installed("PyJWT==2.3.0\nprometheus_client==0.20.0\r\n") == {"pyjwt": "2.3.0", "prometheus-client": "0.20.0"}
    with pytest.raises(gate.AuditError):
        gate.read_installed("six>=1.0\n")
    with pytest.raises(gate.AuditError):
        gate.read_installed("mypkg @ file:///tmp/mypkg\n")


# exceptions


def test_exceptions_expire_after_their_review_date_in_utc():
    findings = gate.parse_npm(fixture("npm-marked-4.0.9.json"))
    rules = exceptions(entry("npm", "marked", "GHSA-rrrm-qjm4-v8hf", "2026-11-01"), entry("npm", "marked", "GHSA-5v2h-r2cx-5xgj", "2026-11-01"))
    assert gate.decide("npm", findings, rules, TODAY).exit_code == gate.EXIT_PASS
    later = gate.decide("npm", findings, rules, TODAY + dt.timedelta(days=1))
    assert later.exit_code == gate.EXIT_FINDINGS
    assert len(later.expired) == 2


def test_a_finding_under_an_expired_exception_is_a_failure_not_accepted():
    findings = gate.parse_npm(fixture("npm-marked-4.0.9.json"))
    rules = exceptions(entry("npm", "marked", "GHSA-rrrm-qjm4-v8hf", "2026-10-01"))
    decision = gate.decide("npm", findings, rules, TODAY)
    assert decision.excepted == []
    assert len(decision.failures) == 2
    assert len(decision.expired) == 1
    assert decision.unused == []


def test_pypi_exception_names_are_trimmed_and_normalised():
    installed = gate.read_installed(fixture("pypi-pyjwt-installed.txt"))
    findings = gate.parse_pip_audit(fixture("pypi-pyjwt-audit.json"), installed, runtime())
    rules = exceptions(entry("pypi", " PyJWT ", "GHSA-ffqj-6fqr-9h24"))
    assert len(gate.decide("pypi", findings, rules, TODAY).excepted) == 1


def test_unused_exception_only_warns():
    decision = gate.decide("npm", [], exceptions(entry("npm", "marked", "GHSA-rrrm-qjm4-v8hf")), TODAY)
    assert decision.exit_code == gate.EXIT_PASS
    assert len(decision.unused) == 1
    assert gate.decide("pypi", [], exceptions(entry("npm", "marked", "GHSA-rrrm-qjm4-v8hf")), TODAY).unused == []


@pytest.mark.parametrize(
    "text",
    [
        "",
        "not json",
        "[]",
        '{"version": 2, "exceptions": []}',
        '{"version": true, "exceptions": []}',
        '{"version": 1}',
        '{"version": 1, "exceptions": [], "extra": 1}',
        json.dumps({"version": 1, "exceptions": [{**entry("npm", "marked", "GHSA-rrrm-qjm4-v8hf"), "note": "x"}]}),
        json.dumps({"version": 1, "exceptions": [{**entry("npm", "marked", "GHSA-rrrm-qjm4-v8hf"), "reason": " "}]}),
        json.dumps({"version": 1, "exceptions": [entry("cargo", "x", "GHSA-rrrm-qjm4-v8hf")]}),
        json.dumps({"version": 1, "exceptions": [entry("npm", "marked", "CVE-2022-21681")]}),
        json.dumps({"version": 1, "exceptions": [entry("pypi", "pyjwt", "PYSEC-2022-202", "1 December 2026")]}),
        json.dumps({"version": 1, "exceptions": [entry("pypi", "PyJWT", "PYSEC-2022-202"), entry("pypi", "pyjwt", "pysec-2022-202")]}),
    ],
)
def test_malformed_exceptions_file_fails_closed(text):
    with pytest.raises(gate.AuditError) as caught:
        gate.load_exceptions(text)
    assert not caught.value.retry


def test_the_committed_exceptions_file_is_valid():
    path = Path(__file__).parents[1] / "audit-exceptions.json"
    assert isinstance(gate.load_exceptions(path.read_text(encoding="utf-8")), list)


# retries


def test_retries_only_when_the_audit_could_not_run():
    calls, sleeps = [], []

    def flaky():
        calls.append(1)
        if len(calls) < 3:
            raise gate.AuditError("registry down")
        return ["ok"]

    assert gate.run_with_retries(flaky, "test", sleep=sleeps.append) == ["ok"]
    assert sleeps == [15, 45]


def test_gives_up_after_three_attempts():
    sleeps = []

    def down():
        raise gate.AuditError("registry down")

    with pytest.raises(gate.AuditError) as caught:
        gate.run_with_retries(down, "npm audit", sleep=sleeps.append)
    assert "could not run after 3 attempts" in str(caught.value)
    assert sleeps == [15, 45]


def test_untrustworthy_output_is_not_retried():
    sleeps = []

    def skipped():
        raise gate.AuditError("pip-audit skipped packages", retry=False)

    with pytest.raises(gate.AuditError):
        gate.run_with_retries(skipped, "pip-audit", sleep=sleeps.append)
    assert sleeps == []


def test_main_fails_closed_without_an_exceptions_file(tmp_path, capsys):
    code = gate.main(["--exceptions", str(tmp_path / "missing.json"), "npm", "--output", str(tmp_path / "out.json")])
    assert code == gate.EXIT_ERROR
    assert "missing" in capsys.readouterr().out


def test_main_reports_any_other_failure_as_could_not_run(tmp_path, capsys):
    rules = tmp_path / "exceptions.json"
    rules.write_text('{"version": 1, "exceptions": []}', encoding="utf-8")
    code = gate.main([
        "--exceptions", str(rules), "pypi", "--pip-audit", "pip-audit",
        "--installed", str(tmp_path / "no-installed-list.txt"), "--output", str(tmp_path / "out.json"),
    ])
    assert code == gate.EXIT_ERROR
    assert "::error::pypi audit could not run" in capsys.readouterr().out


def test_annotations_escape_line_breaks(capsys):
    gate._annotate("error", "a%b\nc")
    assert capsys.readouterr().out == "::error::a%25b%0Ac\n"
