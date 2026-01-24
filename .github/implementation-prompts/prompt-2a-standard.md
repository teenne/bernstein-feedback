# Prompt 2a: Standard Definitions (Reference)

This document defines the immutable standard for the GitHub delivery system. Do not modify these definitions. They ensure consistency across all repositories.

## Issue Types

| Type | Purpose |
|------|---------|
| Epic | Large outcome-focused initiative containing multiple features |
| Feature | Deliverable capability that contributes to an epic |
| Story | User-focused unit of work that delivers value |
| Task | Technical unit of work not directly user-facing |
| Bug | Defect or unexpected behavior |
| Spike | Time-boxed research or investigation |

## Projects (Projects v2)

### 1. Portfolio - Epics

- **Contains**: Epics only
- **Purpose**: Outcomes, prioritization, roadmap

### 2. Delivery - Platform

- **Contains**: Features, Stories, Tasks, Bugs, Spikes
- **Purpose**: Platform and infrastructure work

### 3. Delivery - Apps

- **Contains**: Features, Stories, Tasks, Bugs, Spikes
- **Purpose**: Application-level work

## Standard Fields

### Core Flow Fields

| Field | Type | Options |
|-------|------|---------|
| Status | Single select | Backlog, Ready, In progress, Review, Blocked, Done |
| Priority | Single select | P0, P1, P2, P3 |
| Risk | Single select | Low, Medium, High |
| Sprint | Text | Convention: Sprint 2026-03 or Sprint 12 |
| Release | Text | Target version or milestone |

### Hierarchy Fields

| Field | Type | Purpose |
|-------|------|---------|
| Epic | Relation | Links to parent epic |
| Feature | Relation | Links to parent feature |

### Agent Control

| Field | Type | Options |
|-------|------|---------|
| Agent | Single select | Human, Codex, Claude-impl-1, Claude-impl-2, Claude-impl-3, Claude-review, Claude-qa, Claude-docs |

### Value Fields (Epics and Features)

| Field | Type | Purpose |
|-------|------|---------|
| Business value | Text | Description of value delivered |
| Business points | Number (1-10) | Relative business value |
| Value type | Single select | See options below |
| JTBD | Single select | Jobs to be done (Epics only) |

**Value Type Options:**
- Business feature
- Architecture
- Platform capability
- Technical debt
- Security
- Compliance / regulatory
- Reliability / resilience
- Performance / scalability
- Developer experience
- Research / spike

### Lifecycle Stage

Required for Epics and Features. Tracks position in business journey.

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

### Safety Fields

| Field | Type | Purpose |
|-------|------|---------|
| Allowed paths | Text/Multi-select | Directories that may be modified |
| Contracts touched | Text | Interfaces or APIs affected |

## Standard Labels

### Type Labels

- `type:epic`
- `type:feature`
- `type:story`
- `type:task`
- `type:spike`

### Kind Labels

- `kind:security`
- `kind:performance`
- `kind:refactor`
- `kind:docs`
- `kind:testing`

## Views

### Portfolio - Epics Views

| View | Purpose | Configuration |
|------|---------|---------------|
| Roadmap | Release planning | Filter: epics, Group: Release, Sort: Business points desc |
| Epic Priority Table | Value ranking | Filter: epics, Sort: Business points desc |
| Architecture and Platform | Technical initiatives | Filter: Value type in (Architecture, Platform capability, Security, Compliance) |
| Quality Control | Missing fields | Filter: Business value/points/Value type empty |
| Business Lifecycle | Journey tracking | Filter: epics, Group: Lifecycle Stage |

### Delivery Project Views

| View | Purpose | Configuration |
|------|---------|---------------|
| Board by Status | Sprint execution | Exclude epics, Group: Status |
| Execution by Epic | Epic progress | Filter: Story, Task, Bug; Group: Epic |
| Execution by Feature | Feature progress | Filter: Story; Group: Feature |
| Sprint View | Current work | Filter: Sprint = current |
| Blocked Work | Impediments | Filter: Status = Blocked |

## Operating Rules

These rules must be included in CONTRIBUTING.md:

1. One issue per agent at a time unless explicitly authorized
2. One branch per issue
3. One assignee per issue
4. No cross-cutting refactors without explicit issue
5. Contract-first for interface changes
6. Architecture, Platform, Security, Compliance work requires explicit human approval
7. CODEOWNERS required for contracts and shared components

## Definition of Ready

### Epics and Features

- Business value defined
- Business points assigned
- Value type selected
- JTBD selected (Epics only)
- Lifecycle Stage selected

### Stories and Tasks

- Acceptance criteria defined
- Area assigned
- Allowed paths specified

## Definition of Done

- Acceptance criteria met
- Tests pass
- Contracts validated (if applicable)
- PR merged and issue closed

## Template Requirements

### Epic/Feature Templates Must Include

- Business value
- Business points (1-10)
- Value type
- JTBD (Epics only)
- Lifecycle Stage
- Success criteria
- Non-goals
- Risks and dependencies
- Target release

### Story/Task Templates Must Include

- Area
- Allowed paths
- Contracts touched
- Interfaces affected
- Acceptance criteria
- Tests required
- Out of scope
- How to verify

### Bug Templates Must Include

- Steps to reproduce
- Expected behavior
- Actual behavior
- Scope and impact
- Suggested fix (optional)

### Spike Templates Must Include

- Question to answer
- Timebox
- Expected outputs

### PR Template Must Include

- Linked issue(s)
- What changed
- Why
- How to test
- Risks and rollback
- Contracts updated (yes/no)
