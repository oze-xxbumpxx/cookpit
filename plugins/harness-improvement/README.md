# harness-improvement

Portable Cookpit development-harness layer (32 project files).

Install this plugin from the repository marketplace, then invoke `install-harness-improvement` in the target
project. The installer copies the versioned payload and merges only this layer's Claude Code hooks into
`.claude/settings.json`. It refuses to overwrite differing files unless `--force` is explicitly supplied.

Dependency: install **harness-core and harness-workflow** first.
The payload is project-local after setup, so normal harness paths such as `.claude/scripts/...` continue to work.
