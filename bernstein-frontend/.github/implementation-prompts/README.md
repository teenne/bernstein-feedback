# GitHub Delivery System Implementation Prompts

This directory contains reusable prompts for setting up a standardized GitHub delivery system across repositories.

## Prompt Sequence

```
Prompt 1 ──────> Prompt 2a/2b/2c ──────> Prompt 3
(Audit)          (Implement)             (Verify)
                      │
                      │
                      v
               Prompt 4 ────────> Prompt 5
               (Export)           (Bootstrap)
```

| Prompt | Purpose | When to Use |
|--------|---------|-------------|
| 1 | Repo audit and gap analysis | First step for any repo |
| 2a | Standard definitions (read-only) | Reference during implementation |
| 2b | Configuration template | Customize for each repo |
| 2c | Implementation steps | Execute the setup |
| 3 | Verification checklist | After setup to validate |
| 4 | Template pack export | Generate copy-ready templates |
| 5 | Bootstrap from brief | Turn product briefs into issues |

## Prerequisites

Before running these prompts:

1. GitHub repo exists with Issues enabled
2. GitHub Projects v2 enabled for the org/user
3. You have admin access to create projects and modify settings
4. Repository structure is defined (folders, areas)

## Quick Start Checklist

### New Repository Setup

- [ ] Run Prompt 1 to audit current state
- [ ] Customize `config-template.yml` for your repo
- [ ] Run Prompt 2c with your config to implement
- [ ] Run Prompt 3 to verify setup
- [ ] Create initial issues using Prompt 5

### Applying to Existing Repo

- [ ] Run Prompt 1 to identify gaps
- [ ] Review existing labels, templates, projects
- [ ] Customize `config-template.yml` preserving existing conventions
- [ ] Run Prompt 2c incrementally (skip what exists)
- [ ] Run Prompt 3 to verify compliance

## File Reference

| File | Purpose |
|------|---------|
| `prompt-1.md` | Repo audit and gap analysis |
| `prompt-2a-standard.md` | Immutable standard definitions |
| `prompt-2b-config.yml` | Customizable repository config |
| `prompt-2c-implementation.md` | Step-by-step implementation |
| `prompt-3.md` | Verification checklist |
| `prompt-4.md` | Template export generator |
| `prompt-5.md` | Product brief to issues |
| `config-template.yml` | Starter config for new repos |

## Customization Guide

### What to Change Per Repo

In `prompt-2b-config.yml`, customize:

```yaml
repository:
  owner: your-org-or-username
  name: your-repo-name

areas:
  # Define areas that match your folder structure
  - name: Frontend
    paths:
      - apps/web/
      - packages/ui/
  - name: Backend
    paths:
      - services/
      - packages/api/

codeowners:
  # Map paths to required reviewers
  - path: contracts/
    owners:
      - "@your-org/architects"
```

### What NOT to Change

The following are part of the standard and should remain consistent:

- Issue types (Epic, Feature, Story, Task, Bug, Spike)
- Core fields (Status, Priority, Risk)
- Value fields (Business value, Business points, Value type)
- Lifecycle stages (Idea through Exit)
- Operating rules in CONTRIBUTING.md

## Lifecycle Stages

The standard uses 11 lifecycle stages covering the full business journey:

| Stage | Description |
|-------|-------------|
| Idea | Initial concept exploration |
| Validation | Testing assumptions and market fit |
| Foundation | Core architecture and infrastructure |
| MVP | Minimum viable product development |
| Launch | Initial release and go-to-market |
| Growth | User acquisition and feature expansion |
| Scaling | Infrastructure and team scaling |
| Maturity | Stable operations and optimization |
| Maintenance | Sustaining operations |
| Sunset | Planned deprecation |
| Exit | Completion, sale, or transition |

## Related Files

These templates implement the standard defined in the prompts:

- `.github/ISSUE_TEMPLATE/*.yml` - Issue form templates
- `.github/PULL_REQUEST_TEMPLATE.md` - PR template
- `.github/settings/labels.yml` - Label definitions
- `.github/project-templates/*.yml` - Project configurations
- `CONTRIBUTING.md` - Operating rules
- `CODEOWNERS` - Code ownership

## Workflow Integration

The following GitHub Actions support this delivery system:

- `.github/workflows/pr-labeler.yml` - Auto-labels PRs by path
- `.github/workflows/pr-validation.yml` - Validates PR requirements
- `.github/workflows/stale.yml` - Manages stale issues/PRs
- `.github/labeler.yml` - Path-to-label mappings
