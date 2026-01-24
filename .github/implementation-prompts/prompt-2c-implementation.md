# Prompt 2c: Implementation Steps

You are an expert GitHub delivery architect. Implement the standard GitHub delivery system using the definitions from `prompt-2a-standard.md` and the configuration from `prompt-2b-config.yml`.

## Hard Constraints

- Do not use icons
- Do not use horizontal rules
- Do not add external dependencies
- Do not make speculative code changes unrelated to the delivery system
- All changes must be reversible

## Pre-Implementation Checklist

Before executing, verify:

- [ ] You have read `prompt-2a-standard.md` for definitions
- [ ] You have a customized `prompt-2b-config.yml` for this repo
- [ ] You have admin access to create projects
- [ ] You have write access to modify repo files

## Implementation Steps

Execute these steps in order. Report completion status for each.

### Step 1: Create Labels

Create all labels defined in the standard and config.

**Standard type labels:**
```bash
gh label create "type:epic" --description "Epic - large outcome-focused initiative" --color "8b5cf6" --force
gh label create "type:feature" --description "Feature - deliverable capability" --color "6366f1" --force
gh label create "type:story" --description "Story - user-focused work" --color "3b82f6" --force
gh label create "type:task" --description "Task - technical work" --color "06b6d4" --force
gh label create "type:spike" --description "Spike - time-boxed research" --color "f59e0b" --force
```

**Standard kind labels:**
```bash
gh label create "kind:security" --description "Security-related work" --color "d93f0b" --force
gh label create "kind:performance" --description "Performance-related work" --color "f9d0c4" --force
gh label create "kind:refactor" --description "Code refactoring" --color "c2e0c6" --force
gh label create "kind:docs" --description "Documentation work" --color "0075ca" --force
gh label create "kind:testing" --description "Testing work" --color "bfd4f2" --force
```

Create area labels from config, lifecycle labels, priority labels, and status labels per `labels.yml`.

### Step 2: Create Issue Templates

Create or update issue templates in `.github/ISSUE_TEMPLATE/`:

| File | Type Label | Required Fields |
|------|------------|-----------------|
| `epic.yml` | `type:epic` | JTBD, Lifecycle Stage, Business value, Business points, Value type |
| `feature.yml` | `type:feature` | Lifecycle Stage, Business value, Business points, Value type |
| `story.yml` | `type:story` | Area, Allowed paths, Acceptance criteria |
| `task.yml` | `type:task` | Area, Allowed paths, Acceptance criteria |
| `bug.yml` | `bug` | Steps to reproduce, Expected/Actual behavior |
| `spike.yml` | `type:spike` | Question, Timebox, Expected outputs |
| `config.yml` | - | Blank issue disabled message |

Ensure each template:
- Sets the appropriate `labels:` array
- Includes all required fields from the standard
- Uses `validations.required: true` for mandatory fields

### Step 3: Create PR Template

Create `.github/PULL_REQUEST_TEMPLATE.md` with sections:
- Linked issue(s)
- What changed
- Why
- How to test
- Risks and rollback
- Contracts updated

### Step 4: Update CONTRIBUTING.md

Add "Delivery System and Agent Rules" section containing:
- Issue type descriptions
- Operating rules (one issue per agent, one branch per issue, etc.)
- Definition of Ready
- Definition of Done
- Approval requirements for Architecture/Security/Compliance work

### Step 5: Create or Update CODEOWNERS

Create `CODEOWNERS` file with paths from config:
```
# CODEOWNERS
# Paths and owners from prompt-2b-config.yml

/inventory/*.yaml @teenne
/security/ @teenne
/ansible/roles/ @teenne
* @teenne
```

### Step 6: Create Projects v2

If Projects v2 is available, create:

1. **Portfolio - Epics**
   - Add custom fields per standard
   - Create views: Roadmap, Epic Priority Table, Architecture and Platform, Quality Control, Business Lifecycle

2. **Delivery - Platform** (or single Delivery project)
   - Add custom fields per standard
   - Create views: Board by Status, Execution by Epic, Execution by Feature, Sprint View, Blocked Work

3. **Delivery - Apps** (optional, or merge with Platform)
   - Same structure as Delivery - Platform

Link each project to the repository.

### Step 7: Configure Workflows

Verify or create:

- `.github/workflows/pr-labeler.yml` - Auto-label PRs by path
- `.github/labeler.yml` - Path-to-label mappings for labeler
- `.github/workflows/stale.yml` - Mark stale issues/PRs (optional)

### Step 8: Document Branch Protection

If you have permissions, configure branch protection on main:
- Require pull requests
- Require 1 approval
- Require CODEOWNERS review
- Dismiss stale reviews on new commits

If you cannot configure via API, document manual steps:
```
Settings > Branches > Add rule for "main":
- [x] Require a pull request before merging
- [x] Require approvals (1)
- [x] Require review from Code Owners
- [x] Dismiss stale pull request approvals when new commits are pushed
```

## Output Requirements

After implementation, report:

1. **Changes Made**
   - List every file created or modified
   - List projects created
   - List labels created

2. **Verification Checklist**
   - [ ] Labels exist and match standard
   - [ ] Issue templates create valid issues
   - [ ] PR template renders correctly
   - [ ] CONTRIBUTING.md includes operating rules
   - [ ] CODEOWNERS matches config
   - [ ] Projects exist with correct fields/views

3. **Manual Steps Required**
   - List any steps that could not be automated
   - Provide exact navigation paths for manual configuration

4. **Known Gaps**
   - Document anything that differs from the standard
   - Explain reason for deviation

Execute now.
