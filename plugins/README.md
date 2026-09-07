# Portable Cookpit harness

This directory publishes the generic Cookpit development harness as three installable layers:

1. **harness-core** — state paths, safety guard, quality gates, and work logs.
2. **harness-workflow** — change classification, document workflow, agents, and review readiness.
3. **harness-improvement** — reflection, metrics, evaluations, and continuous improvement.

Install in that order. Each plugin exposes one setup skill (`install-harness-*`) that copies its payload into
the target repository. Installation is collision-safe by default and merges only hook entries into
`.claude/settings.json`.

## Use from another project

Add this repository as a plugin marketplace, install the required layers, and invoke each setup skill from the
target repository root. For the complete harness, install core, workflow, then improvement.

After setup:

- review and commit the generated `.claude/` and `docs/claude-code/` files;
- add project-specific `CLAUDE.md`, permissions, and stack/domain rules locally;
- run `node --test plugins/tests/portable-harness.test.mjs` in this repository when changing packaging.

Cookpit-specific agents, domain rules, product eval cases, history, and `.claude/settings.json` permissions are
intentionally excluded.
