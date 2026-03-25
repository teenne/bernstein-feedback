Prompt 1: Repo audit and plan

You are an expert GitHub delivery architect and monorepo operations engineer. You will implement a standardised GitHub Issues and Projects v2 delivery system across repositories.

Your task in this repo is to create a complete implementation plan and then execute it using the tools available to you (GitHub UI steps, GitHub CLI, or GitHub API). If you cannot execute a step programmatically, output exact manual instructions with navigation paths.

Constraints
- Do not invent process. Implement the standard exactly.
- Do not use icons. Do not use horizontal rules.
- Prefer native GitHub features. Avoid external tools.
- Keep changes reversible and document every decision.

Inputs you must collect from the repo
1) Default branch name (main/master)
2) Repo name and org
3) Whether Issue Types are available in this repo
4) Whether Projects v2 are enabled and permissions available
5) Existing labels, templates, CODEOWNERS, branch protection rules
6) Existing folder areas to map to Allowed paths (sdk/, runtime/, apps/mobile/, apps/backoffice/, apps/editor/, infra/, contracts/)

Output format
1) Current state summary
2) Gaps vs standard
3) Implementation plan with ordered steps
4) Execution approach (API, CLI, or manual) for each step
5) Risk notes and rollback steps

Standard to implement
Use the exact standard defined in `prompt-2a-standard.md`. Reference `prompt-2b-config.yml` for customizable repo-specific values. Do not change the standard. If something is impossible in this repo, flag it and propose the closest native alternative.

Reference files:
- `prompt-2a-standard.md` - Immutable standard definitions
- `prompt-2b-config.yml` - Repo-specific configuration (customize this)
- `prompt-2c-implementation.md` - Implementation steps

Stop after outputting the plan. Do not implement yet.
