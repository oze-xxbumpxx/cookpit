# harness-core

Portable Cookpit development-harness layer (27 project files).

Install this plugin from the repository marketplace, then invoke `install-harness-core` in the target
project. The installer copies the versioned payload and merges only this layer's Claude Code hooks into
`.claude/settings.json`. It refuses to overwrite differing files unless `--force` is explicitly supplied.

The installer also sets `env.HARNESS_NAMESPACE` to `<repository folder>-harness` when it is missing, and adds
`permissions.deny` rules for dotenv files and private keys.

The payload is project-local after setup, so normal harness paths such as `.claude/scripts/...` continue to work.
