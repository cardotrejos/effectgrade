# Security policy

## Supported versions

EffectGrade is an internal preview. There is no supported public release yet.
Security reports against this repository are still welcome.

## Reporting a vulnerability

Do not open a public issue for a vulnerability.

Report it through GitHub Security Advisories on this repository. Include:

- a description of the issue
- the affected command or package
- reproduction steps or a minimal fixture
- the impact on repository files, secrets, or host process execution

We will acknowledge reports as quickly as possible and keep the reporter
updated while a fix is prepared.

## Trust model in brief

EffectGrade is designed to change existing repositories. The following defaults
are part of the security model, not optional polish:

- inventory and planning do not execute project code
- install lifecycle scripts are denied by default
- child processes are started with `shell: false` and structured arguments
- path operations must stay inside the selected repository root
- apply requires a non-stale verified plan
- logs and reports must redact secrets
- local copy-sandbox verification is evidence, not host isolation

A successful `verify` run means the planned patch passed the declared checks in
an isolated working copy. It does not mean the target repository or its
dependencies are safe to execute on a developer machine.

## Scope we care about most

- path traversal and symlink escape
- command injection
- secret leakage into plans, reports, logs, or telemetry
- unexpected install-script execution
- stale-plan overwrite of user edits
- profile or capability digest mismatch
- agent or MCP flows that skip verification or confirmation
