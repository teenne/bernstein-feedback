# Bernstein feedback

Bernstein feedback is a drop-in feedback component for web apps.

It is designed to be:
- simple to adopt across many projects
- backend-agnostic through adapters
- privacy-safe by default
- compatible with the Bernstein event contract

The widget captures enough context to make feedback actionable, then submits structured events to an HTTP endpoint.

## What it provides

- UI component that opens a panel and submits feedback
- Two modes
  - Feedback mode for product feedback
  - Bug mode for reproducible issues
- Automatic context capture
  - url and route
  - environment and app version (if provided)
  - viewport
  - recent console errors
  - network request summary (no bodies by default)
  - user journey breadcrumbs (basic navigation history)

## Backends

Supported backend adapters:
- HTTP endpoint (recommended)
- Local storage for development with JSON export

You can point it at:
- your own backend
- the Bernstein local API included in `bernstein-sdk`
- the commercial Bernstein Cloud service later

## Quick start

Install the package and render the widget at app root. Configure an endpoint that accepts Bernstein events.

Example configuration:
- endpoint: `/api/coord/events` or `/api/coord/events/batch`
- project id: your project identifier
- optional API key header if required by your backend

## Privacy defaults

Defaults are conservative:
- no request bodies
- no response bodies
- no form field capture
- no keystroke capture

Redaction hooks are provided so projects can remove sensitive fields before sending.

## Relationship to Bernstein SDK

This repo consumes:
- the Bernstein event schema
- shared types

The backend contract is defined in the SDK repo. This widget is an implementation of that contract focused on feedback capture.

## Licence

Apache 2.0.
