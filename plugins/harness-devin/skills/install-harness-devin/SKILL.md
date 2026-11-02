---
name: install-harness-devin
description: Install the optional Devin delegation layer into the current repository with collision checks. Requires harness-core and harness-workflow first.
---

# Install harness-devin

Run the bundled installer from the target repository root:

```bash
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-}}"
node "$PLUGIN_DIR/scripts/install-to-project.mjs" --target "$PWD"
```

The installer performs a full collision preflight and makes no changes when a differing destination file exists.
Inspect those files before using `--force`. It links the skills that are already installed into `.agents/skills/`,
so install harness-core, harness-workflow, and (optionally) harness-improvement before this layer.

After installation:

- set `repository` in `.claude/config/delegation-review.json` to the GitHub `owner/name`;
- keep `cloud_launch_verified` false until the user confirms a cloud launch;
- keep the Devin section of `AGENTS.md` and add one line to `CLAUDE.md`: after handing an Issue to Devin, use
  `.claude/scripts/wait-for-pr.mjs` and the `review-devin-pr` skill;
- review `.claude/settings.json` and commit the generated files.
