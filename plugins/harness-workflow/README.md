# harness-workflow

Portable Cookpit development-harness layer (39 project files).

Install this plugin from the repository marketplace, then invoke `install-harness-workflow` in the target
project. The installer copies the versioned payload and merges only this layer's Claude Code hooks into
`.claude/settings.json`. It refuses to overwrite differing files unless `--force` is explicitly supplied.

Dependency: install **harness-core** first.

Features are developed in one session with the `develop-feature` skill. Only `reviewer`, `security-reviewer`, and
wide searches run as subagents. `.claude/templates/AGENTS.md` and `CLAUDE.md` are starting points for the target
project's rule files; copy them to the repository root when the project has none, then fill in the placeholders.
The payload is project-local after setup, so normal harness paths such as `.claude/scripts/...` continue to work.

Upgrading from 0.1.0: the installer never deletes files. Remove the agents that 0.2.0 no longer ships (listed in
`plugins/README.md`) by hand.
