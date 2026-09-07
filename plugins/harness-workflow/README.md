# harness-workflow

Portable Cookpit development-harness layer (30 project files).

Install this plugin from the repository marketplace, then invoke `install-harness-workflow` in the target
project. The installer copies the versioned payload and merges only this layer's Claude Code hooks into
`.claude/settings.json`. It refuses to overwrite differing files unless `--force` is explicitly supplied.

Dependency: install **harness-core** first.
The payload is project-local after setup, so normal harness paths such as `.claude/scripts/...` continue to work.
