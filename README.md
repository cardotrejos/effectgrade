# EffectGrade

Add Effect to an existing TypeScript repo, prove the change works, then apply
the patch. First target: a Node + Hono app already in production.

Nothing here is usable yet. The CLI only prints help and version.

```bash
pnpm install
pnpm check
pnpm build && pnpm effectgrade --help
```

Node 22.16+, pnpm 11. Engine: Effect `4.0.0-rc.108`. License: Apache-2.0.
