# EffectGrade

**Adopt Effect. Keep it production-grade.**

EffectGrade safely introduces Effect into existing TypeScript repositories, verifies capability combinations, and keeps them upgradeable.

This is not another starter template, fixed Effect scaffold, or greenfield stack generator. The product inspects a real repository, produces a deterministic plan, verifies the result in isolation, and applies only the verified patch.

## Status

Internal preview. The public command surface is reserved, but inspect/plan/verify/apply are not implemented yet.

Initial package: `@aclabs/effectgrade`
Binary: `effectgrade`
Engine baseline: Effect `4.0.0-rc.108`
First supported path: add a production-grade Effect runtime boundary to an existing Node + Hono application

Local verification is evidence that the planned patch works in a copied workspace. It is not a security sandbox.

## Lifecycle

```text
inspect → plan → verify → apply → status
```

```bash
pnpm dlx @aclabs/effectgrade inspect
pnpm dlx @aclabs/effectgrade plan add core hono-bridge
pnpm dlx @aclabs/effectgrade verify --plan .effectgrade/plans/<id>.json
pnpm dlx @aclabs/effectgrade apply --plan .effectgrade/plans/<id>.json
pnpm dlx @aclabs/effectgrade status
```

See the current CLI stub with `pnpm build && pnpm effectgrade --help`.

## Non-goals

- Replacing Better-T-Stack or official `create-effect-app`
- A broad plugin marketplace
- A hosted dashboard before repeat CLI usage exists
- Executing project install scripts by default

## Repository

This is a pnpm + Turbo monorepo.

```text
apps/cli                 public @aclabs/effectgrade binary
packages/domain          serializable contracts and product identity
packages/test-kit        shared test helpers
```

Requirements: Node.js 22.16+ and pnpm 11.

```bash
pnpm install
pnpm check
```

Architecture and implementation detail live in `effectgrade-plan.md`.

## License

Apache-2.0. See [LICENSE](./LICENSE).
