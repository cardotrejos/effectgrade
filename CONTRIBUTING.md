# Contributing

Node 22.16+, pnpm 11.

```bash
pnpm install
pnpm check
```

`packages/domain` cannot import Node, the CLI, or other workspace packages.
Tests live next to source as `*.test.ts`.
