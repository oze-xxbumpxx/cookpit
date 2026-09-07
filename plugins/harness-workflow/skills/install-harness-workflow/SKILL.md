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
