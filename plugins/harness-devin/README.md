# harness-devin

Optional Devin delegation layer for the portable Cookpit harness (24 project files).

Claude Code turns an approved implementation-plan task into a GitHub Issue, starts a local Devin session on a
dedicated clone, waits for the pull request, reviews it, posts `must` findings automatically (at most twice), and
hands security findings and design decisions to the user. Every delegation leaves a record under
`docs/claude-code/improvements/delegations/`.

Install this plugin from the repository marketplace, then invoke `install-harness-devin` in the target project.
Dependencies: install **harness-core** and **harness-workflow** first. **harness-improvement** is optional.

Requirements on the machine: `gh` (authenticated), the Devin CLI (`devin`), and a dedicated clone of the target
repository (default `~/devin-work/<repository folder>`, override with `DEVIN_CLONE`).

The installer links the installed skills into `.agents/skills/` so that Devin reads the same procedures, and adds
`.agents/skills/devin-workflow/` for Devin itself.
