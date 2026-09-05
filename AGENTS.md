# AGENTS.md

Instructions for coding agents working on this repository. The full rules live in
[`.cursor/rules/`](.cursor/rules) and are also read automatically by Cursor:

| Rule               | Applies to                          | Covers                                                    |
| ------------------ | ----------------------------------- | --------------------------------------------------------- |
| `project.mdc`      | always                              | repository map, commands, invariants, definition of done  |
| `typescript.mdc`   | `**/*.ts`                           | the code conventions the oxlint configuration enforces    |
| `architecture.mdc` | `packages/effect-to-openapi/src/**` | layering, dependency direction, the public API            |
| `testing.mdc`      | `**/*.test.ts`                      | vitest conventions and the generated fixtures             |
| `docs.mdc`         | `**/*.md`                           | markdownlint, textlint and cspell                         |
| `ci-release.mdc`   | workflows, manifests, configs       | action pinning, the release flow, editing the lint config |
| `playbooks.mdc`    | on request                          | step-by-step recipes for the recurring tasks              |

`.cursor/environment.json` describes how a cloud agent prepares this workspace: install pnpm,
`pnpm install --frozen-lockfile`, then `pnpm build` — the build is required because the tests,
the example and the type-aware lint all resolve `effect-to-openapi` through `dist`.

## The short version

```bash
pnpm build   # required before test / check
pnpm test
pnpm check   # types, oxlint, formatting
pnpm lint    # markdownlint, textlint, cspell, secretlint, actionlint
```

All four must pass before a change is finished. Never relax a linter to get one through, and
everything committed here is written in English.
