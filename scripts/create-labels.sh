#!/bin/bash
# Script to create standard GitHub labels for the project
# Requires: GitHub CLI (gh) installed and authenticated

set -e

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

echo "Creating labels for repository: $REPO"

# Type labels
gh label create "type:epic" --description "A large outcome-focused initiative" --color "7057ff" --force
gh label create "type:feature" --description "A deliverable capability" --color "0075ca" --force
gh label create "type:bug" --description "Something isn't working" --color "d73a4a" --force
gh label create "type:spike" --description "Research or investigation" --color "fbca04" --force
gh label create "type:story" --description "User-facing story" --color "a2eeef" --force
gh label create "type:task" --description "Technical task" --color "c5def5" --force

# Priority labels
gh label create "priority:p0" --description "Critical - drop everything" --color "b60205" --force
gh label create "priority:p1" --description "High - do next" --color "d93f0b" --force
gh label create "priority:p2" --description "Medium - plan for soon" --color "fbca04" --force
gh label create "priority:p3" --description "Low - nice to have" --color "0e8a16" --force

# Lifecycle labels
gh label create "lifecycle:idea" --description "Early concept stage" --color "bfdadc" --force
gh label create "lifecycle:validation" --description "Testing feasibility" --color "c2e0c6" --force
gh label create "lifecycle:foundation" --description "Building base" --color "a2e0a2" --force
gh label create "lifecycle:mvp" --description "Minimum viable product" --color "7ed07e" --force
gh label create "lifecycle:launch" --description "Ready for release" --color "5adc5a" --force
gh label create "lifecycle:growth" --description "Expanding features" --color "36d836" --force
gh label create "lifecycle:scaling" --description "Performance optimization" --color "28a428" --force
gh label create "lifecycle:maturity" --description "Stable maintenance" --color "1a7a1a" --force
gh label create "lifecycle:sunset" --description "Deprecating" --color "cccccc" --force

# Status labels
gh label create "status:blocked" --description "Blocked by dependency" --color "fef2c0" --force
gh label create "status:needs-review" --description "Awaiting review" --color "d4c5f9" --force
gh label create "status:in-progress" --description "Currently being worked on" --color "ededed" --force

echo "✅ All labels created successfully!"
