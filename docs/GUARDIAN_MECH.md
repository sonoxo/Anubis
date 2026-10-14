# Anubis Guardian Mech

Read-only cross-repository monitoring for the Anubis browser gallery and
[OpenEngine](https://github.com/sonoxo/OpenEngine) build workflows.

The GitHub Actions workflow runs every six hours, on manual dispatch, and when
its own code changes. It produces a job summary and fails on detected failures
or unavailable GitHub API responses. It does not merge pull requests, deploy
devices, control robots, or copy assets between repositories.

This is a monitoring integration, **not** a source-code merger. Anubis demo
assets remain in Anubis. Respect the original project's CC BY-NC 4.0
license and attribution when reusing any gallery material.

Run locally: `python3 tools/guardian_mech.py`.

Workflow-name keys should be updated if OpenEngine renames its workflow files.
