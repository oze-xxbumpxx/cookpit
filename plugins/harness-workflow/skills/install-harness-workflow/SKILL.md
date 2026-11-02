---
name: install-harness-workflow
description: Install the reusable workflow harness layer into the current repository with collision checks. Requires harness-core first.
---

# Install harness-workflow

Run the bundled installer from the target repository root:

```bash
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}"
node "$PLUGIN_DIR/scripts/install-to-project.mjs" --target "$PWD"
```

The installer performs a full collision preflight and makes no changes when a differing destination file exists.
Inspect those files before using `--force`. After installation, review `.claude/settings.json` and commit the
generated project-local harness files. Install harness-core before this layer.

When the repository has no `AGENTS.md` or `CLAUDE.md`, copy `.claude/templates/AGENTS.md` and
`.claude/templates/CLAUDE.md` to the repository root and fill in the `<...>` placeholders with the user. Leave a
placeholder empty instead of guessing when the project has not decided it yet. Do not overwrite existing files.
