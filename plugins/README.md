# Portable Cookpit harness

This directory publishes the generic development harness as three installable layers and one optional layer:

1. **harness-core** — state paths, safety guard, quality gates, writing rules, and work logs.
2. **harness-workflow** — change classification, the single-session feature loop (`develop-feature`), the
   questions page (`ask-questions`), review agents, and review readiness.
3. **harness-improvement** — reflection, metrics, evaluations, and continuous improvement.
4. **harness-devin** (optional) — delegating approved tasks to Devin and reviewing its pull requests.

Install in that order. Each plugin exposes one setup skill (`install-harness-*`) that copies its payload into
the target repository. Installation is collision-safe by default and merges only hook entries, missing `env`
defaults, `permissions.deny` rules, and `.agents/skills/` links into the target.

Version 0.2.0 of the first three layers brings back the harness grown in Tomotabi (from 2026-09-08 to
2026-11-02): the single-session loop replaces the orchestrator and its seven subagents. ChatGPT (Codex) entry
points are not shipped.

## Use from another project

Add this repository as a plugin marketplace, install the required layers, and invoke each setup skill from the
target repository root. For the complete harness, install core, workflow, then improvement, then devin if the
project delegates work to Devin.

After setup:

- review and commit the generated `.claude/`, `.agents/`, and `docs/` files;
- create `AGENTS.md` and `CLAUDE.md` from `.claude/templates/` when the project has none, and add stack/domain
  rules locally;
- run `node --test plugins/tests/portable-harness.test.mjs` in this repository when changing packaging.

Product-specific rules, design screens, delegation history, and evaluation records are intentionally excluded.
