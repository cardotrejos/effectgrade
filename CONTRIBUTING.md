# Contributing to EffectGrade

Thank you for helping keep EffectGrade a trustworthy brownfield tool. Please read this file before opening a pull request.

## Principles

- Prefer existing TypeScript repositories over greenfield generation.
- Domain contracts stay JSON-serializable and adapter-free.
- Plans are deterministic. Tests must prove that, not just snapshot it.
- Do not execute target-repository code from inventory or planning.
- Do not add a capability because one fixture or one request looked interesting.

## Environment

- Node.js 22.16 or newer
- pnpm 11
- TypeScript 5.9.3 in this repository

```bash
pnpm install
pnpm check
```

Useful scripts:

| Script             | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `pnpm test`        | Unit and contract tests                  |
| `pnpm typecheck`   | Project-reference typecheck              |
| `pnpm lint`        | Oxlint plus architecture-boundary checks |
| `pnpm format`      | Oxfmt                                    |
| `pnpm build`       | Compile workspace packages               |
| `pnpm effectgrade` | Run the built CLI                        |

## Architecture map

```text
domain
  ↑
catalog / inventory / resolution / planning / transformation / verification
  ↑
application workflows
  ↑
cli / json / mcp / node adapters
```

Hard rules, also enforced by `scripts/check-boundaries.mjs`:

- `packages/domain` cannot import Node built-ins, the CLI, or other workspace packages.
- `node:child_process` is only allowed in adapter packages.
- Capability definitions cannot import the filesystem.
- Application workflows must not import terminal UI.

## Adding work

1. Open or reference an issue first for capabilities, profiles, operations, or security-model changes.
2. Write or extend tests before the implementation when the change has behavior.
3. Keep diffs minimal. Do not reformat unrelated files.
4. Add a changeset when the published CLI or a public schema changes.
5. If the change affects plan/apply identity, sandbox isolation, or verification evidence, add an ADR under `docs/adr/`.

## Tests

- Unit tests live next to the source as `*.test.ts`.
- CLI stdout is for machine or human results; stderr is for diagnostics. Do not mix them.
- Security-sensitive behavior belongs in the dedicated security suite.
- Fixtures belong under `fixtures/` and must contain only fake data.

## Pull requests

Use the pull-request template. CI must stay green. Protected `main` should not receive direct feature work.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
