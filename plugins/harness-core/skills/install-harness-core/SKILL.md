---
name: install-harness-core
description: Install the reusable core harness layer into the current repository with collision checks.
---

# Install harness-core

Run the bundled installer from the target repository root:

```bash
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}"
node "$PLUGIN_DIR/scripts/install-to-project.mjs" --target "$PWD"
```

The installer performs a full collision preflight and makes no changes when a differing destination file exists.
Inspect those files before using `--force`. After installation, review `.claude/settings.json` and commit the
generated project-local harness files. 
