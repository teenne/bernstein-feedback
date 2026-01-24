# Prompt 3: Verification Checklist (Post-Setup Audit)

You are an expert GitHub governance and quality systems engineer. Verify that the repository conforms to the standard GitHub delivery system defined in `prompt-2a-standard.md`.

## Instructions

1. Check each item in the verification checklist
2. Mark each item as PASS or FAIL
3. For failures, provide specific evidence and corrective steps
4. Generate the summary report

## Verification Checklist

### 1. Labels

| Check | Status | Evidence |
|-------|--------|----------|
| Type labels exist (type:epic, type:feature, type:story, type:task, type:spike) | | |
| Kind labels exist (kind:security, kind:performance, kind:refactor, kind:docs, kind:testing) | | |
| Area labels match repo structure | | |
| Priority labels exist (priority:p0 through priority:p3) | | |
| Lifecycle labels exist (lifecycle:idea through lifecycle:exit) | | |

### 2. Issue Templates

| Check | Status | Evidence |
|-------|--------|----------|
| `.github/ISSUE_TEMPLATE/epic.yml` exists | | |
| `.github/ISSUE_TEMPLATE/feature.yml` exists | | |
| `.github/ISSUE_TEMPLATE/story.yml` exists | | |
| `.github/ISSUE_TEMPLATE/task.yml` exists | | |
| `.github/ISSUE_TEMPLATE/bug.yml` exists | | |
| `.github/ISSUE_TEMPLATE/spike.yml` exists | | |
| `.github/ISSUE_TEMPLATE/config.yml` exists | | |
| Epic template includes JTBD field | | |
| Epic template includes Lifecycle Stage field | | |
| Epic template includes Business value, Business points, Value type | | |
| Epic template auto-applies `type:epic` label | | |
| Feature template includes Lifecycle Stage field | | |
| Feature template auto-applies `type:feature` label | | |
| Story/Task templates include Area, Allowed paths, Acceptance criteria | | |
| All templates have required validations set correctly | | |

### 3. PR Template

| Check | Status | Evidence |
|-------|--------|----------|
| `.github/PULL_REQUEST_TEMPLATE.md` exists | | |
| Includes "Linked issue(s)" section | | |
| Includes "What changed" section | | |
| Includes "Why" section | | |
| Includes "How to test" section | | |
| Includes "Risks and rollback" section | | |
| Includes "Contracts updated" section | | |

### 4. CONTRIBUTING.md

| Check | Status | Evidence |
|-------|--------|----------|
| `CONTRIBUTING.md` exists | | |
| Includes "Delivery system and agent rules" section | | |
| Documents issue type descriptions | | |
| Documents "One issue per agent" rule | | |
| Documents "One branch per issue" rule | | |
| Documents "One assignee per issue" rule | | |
| Documents Definition of Ready | | |
| Documents Definition of Done | | |
| Documents approval requirements for Architecture/Security/Compliance | | |

### 5. CODEOWNERS

| Check | Status | Evidence |
|-------|--------|----------|
| `CODEOWNERS` file exists | | |
| Covers critical paths (contracts, security, shared components) | | |
| Matches repository folder structure | | |
| Uses valid GitHub usernames/teams | | |

### 6. Branch Protection

| Check | Status | Evidence |
|-------|--------|----------|
| Default branch has protection rule | | |
| Requires pull request before merging | | |
| Requires at least 1 approval | | |
| Requires CODEOWNERS review (if supported) | | |
| Dismisses stale reviews on new commits | | |

### 7. Projects v2

| Check | Status | Evidence |
|-------|--------|----------|
| Portfolio - Epics project exists | | |
| Delivery project(s) exist | | |
| Status field has correct options (Backlog, Ready, In progress, Review, Blocked, Done) | | |
| Priority field has correct options (P0-P3) | | |
| Risk field has correct options (Low, Medium, High) | | |
| Area field matches repo areas | | |
| Lifecycle Stage field has all 11 stages | | |
| Business value/points/Value type fields exist | | |
| JTBD field exists (Portfolio project) | | |
| Agent field exists with correct options | | |

### 8. Project Views

| Check | Status | Evidence |
|-------|--------|----------|
| Portfolio: Roadmap view exists | | |
| Portfolio: Epic Priority Table view exists | | |
| Portfolio: Architecture and Platform view exists | | |
| Portfolio: Quality Control view exists | | |
| Portfolio: Business Lifecycle view exists | | |
| Delivery: Board by Status view exists | | |
| Delivery: Execution by Epic view exists | | |
| Delivery: Sprint View exists | | |
| Delivery: Blocked Work view exists | | |

### 9. Workflows (Optional)

| Check | Status | Evidence |
|-------|--------|----------|
| PR labeler workflow exists | | |
| `.github/labeler.yml` exists with path mappings | | |
| Stale issue workflow exists (optional) | | |

## Summary Report

### Compliance Score

| Category | Pass | Fail | Total |
|----------|------|------|-------|
| Labels | | | |
| Issue Templates | | | |
| PR Template | | | |
| CONTRIBUTING.md | | | |
| CODEOWNERS | | | |
| Branch Protection | | | |
| Projects v2 | | | |
| Project Views | | | |
| Workflows | | | |
| **TOTAL** | | | |

### Failed Items Requiring Action

| Item | Issue | Fix | Enforceable Natively? |
|------|-------|-----|----------------------|
| | | | |

### Top 5 Risks

1.
2.
3.
4.
5.

### Recommended Next Actions

1.
2.
3.
