#!/usr/bin/env python3
"""Read-only guardian for Anubis Pages and OpenEngine PR #1 build gates."""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
EXPECTED = ("OpenEngine build tooling", "OpenEngine Linux build")


def fetch(url, authenticated=False):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "anubis-guardian-mech"}
    token = os.environ.get("GITHUB_TOKEN", "")
    if authenticated and token:
        headers["Authorization"] = "Bearer " + token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
        return json.load(response)


def inspect():
    reports = []
    pages = fetch(f"{API}/repos/sonoxo/Anubis/actions/workflows/pages.yml/runs?per_page=10", True)
    runs = [r for r in pages.get("workflow_runs", []) if r.get("event") == "push"]
    reports.append(("Anubis", "Pages", runs[0] if runs else None))
    pr = fetch(f"{API}/repos/sonoxo/OpenEngine/pulls/1")
    sha = pr["head"]["sha"]
    raw = fetch(f"{API}/repos/sonoxo/OpenEngine/actions/runs?head_sha={sha}&per_page=100")
    for name in EXPECTED:
        found = [r for r in raw.get("workflow_runs", []) if r.get("name") == name and r.get("head_sha") == sha]
        reports.append(("OpenEngine PR #1", name, max(found, key=lambda r: r["id"]) if found else None))
    return reports


def main():
    lines = ["## Anubis Guardian Mech", "", "| Source | Check | Latest result |", "|---|---|---|"]
    failed = False
    try:
        reports = inspect()
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as exc:
        reports = []
        lines.append(f"| GitHub API | Status lookup | Error: {type(exc).__name__} |")
        failed = True
    for repo, name, run in reports:
        if run is None:
            result = "No run found"
            failed = True
        else:
            outcome = run.get("conclusion") if run.get("status") == "completed" else run.get("status", "unknown")
            url = run.get("html_url", "")
            result = f"[{outcome}]({url})" if url.startswith("https://github.com/") else str(outcome)
            if outcome in ("failure", "cancelled", "timed_out", "action_required"):
                failed = True
        lines.append(f"| {repo} | {name} | {result} |")
    report = "\n".join(lines) + "\n"
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write(report)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
