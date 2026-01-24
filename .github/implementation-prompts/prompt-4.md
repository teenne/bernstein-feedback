Prompt 4: Standard reuse pack (for all repos)

You are creating a reusable standardization pack that will be copied across repositories.

## Reference

See `prompt-2a-standard.md` for the complete field and template requirements.

## Files to Generate

Produce the following files exactly, as copy-ready content:

### Issue Templates (GitHub Issue Forms YAML format)

| File | Purpose |
|------|---------|
| `.github/ISSUE_TEMPLATE/epic.yml` | Epic template with JTBD, Lifecycle Stage, business value fields |
| `.github/ISSUE_TEMPLATE/feature.yml` | Feature template with Lifecycle Stage, business value fields |
| `.github/ISSUE_TEMPLATE/story.yml` | Story template with area, allowed paths, acceptance criteria |
| `.github/ISSUE_TEMPLATE/task.yml` | Task template with area, allowed paths, acceptance criteria |
| `.github/ISSUE_TEMPLATE/bug.yml` | Bug template with reproduction steps |
| `.github/ISSUE_TEMPLATE/spike.yml` | Spike template with question and timebox |
| `.github/ISSUE_TEMPLATE/config.yml` | Issue template chooser config |

### Other Templates

| File | Purpose |
|------|---------|
| `.github/PULL_REQUEST_TEMPLATE.md` | PR template with required sections |
| `CONTRIBUTING.md` | Section for "Delivery system and agent rules" |
| `CODEOWNERS` | Template with placeholder owners |

### Supporting Files

| File | Purpose |
|------|---------|
| `.github/settings/labels.yml` | Label definitions |
| `.github/labeler.yml` | Path-to-label mappings |

## Requirements

- Use YAML format for issue templates (GitHub Issue Forms)
- Each template must set appropriate `labels:` array for auto-labeling
- Templates must enforce the standard fields from prompt-2a
- Use `validations.required: true` for mandatory fields
- Do not use icons or horizontal rules
- Use clear headings in sentence case
- Keep templates practical and short, but non-optional sections must be present
- Include dropdown fields for constrained values (Priority, Risk, Area, etc.)
- Include textarea fields for free-form input (Acceptance criteria, etc.)

## Output Format

Provide each file under its own heading with a code block containing the full file content.

```yaml
# Example issue template structure
name: Template Name
description: Template description
labels: ["type:example"]
body:
  - type: markdown
    attributes:
      value: |
        Instructions for the template.

  - type: dropdown
    id: field_name
    attributes:
      label: Field Label
      options:
        - Option 1
        - Option 2
    validations:
      required: true
```
