#!/usr/bin/env python3
"""Read-only guardian for the Anubis gallery and OpenEngine build gates."""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
REPOS = (
    ("sonoxo/Anubis", "pages.yml"),
    ("sonoxo/OpenEngine", "openengine-build-tooling.yml"),
    ("sonoxo/OpenEngine", "openengine-linux-build.yml"),
)


def fetch(url):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "anubis-guardian-mech"}
    token = os.environ.get("GITHUB_TOKEN", "")
    # The current repository token must not be sent to a different repository.
    if token and "/repos/sonoxo/Anubis/" in url:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


def inspect(repo, filename):
    data = fetch(f"{API}/repos/{repo}/actions/workflows/{filename}/runs?per_page=10")
    runs = [r for r in data.get("workflow_runs", []) if r.get("event") != "pull_request"]
    if not runs:
        return "unknown", "-", "No eligible runs"
    run = runs[0]
    status = run.get("status", "unknown")
    outcome = run.get("conclusion") if status == "completed" else status
    return outcome or "unknown", run.get("html_url", "-"), run.get("head_sha", "-")[:12]


def main():
    rows = ["## Anubis Guardian Mech", "", "| Repository | Workflow | Result | Head |", "|---|---|---|---|"]
    bad = False
    for repo, filename in REPOS:
        try:
            outcome, url, sha = inspect(repo, filename)
            if outcome == "failure":
                bad = True
            label = f"[{outcome}]({url})" if url.startswith("https://github.com/") else outcome
            rows.append(f"| {repo} | {filename} | {label} | {sha} |")
        except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as exc:
            rows.append(f"| {repo} | {filename} | unavailable | {type(exc).__name__} |")
            bad = True
    report = "\n".join(rows) + "\n"
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write(report)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
