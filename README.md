# Bernstein Feedback System

A comprehensive feedback collection and management system.

## Project Structure

This monorepo is divided into two main parts:

### 1. [bernstein-frontend](./bernstein-frontend)
The core feedback widget and SDK.
- **`src/`**: The library source code (React + Tailwind).
- **`example/`**: A demo application showing the widget in action with various adapters.
- **`dist/`**: Compiled output (ESM, CJS, and bundled CSS).
- **`scripts/`**: Developer utilities (e.g., license key generation).

### 2. [bernstein-backend](./bernstein-backend)
The management and ingestion layer.
- **`sql/`**: Supabase setup scripts.
  - `01_management.sql`: Tenancy, projects, and user profiles.
  - `02_feedback.sql`: Feedback report storage and context capture.

## Quick Start

### Frontend (Widget / SDK)
```bash
cd bernstein-frontend
npm install
npm run dev        # Run the demo app
npm run build      # Build the production bundle
```

### Backend (SQL / Supabase)
1. Set up a Supabase project.
2. Run the scripts in `bernstein-backend/sql/` to initialize the database schema.
3. Configure your `.env` in the frontend (use `.env.example` as a template).

## Key Features
- **Automatic Context Capture**: Console errors, network failures, and user breadcrumbs are captured automatically.
- **Manual Highlight Mode**: Users can click and highlight specific page elements.
- **Multiple Screenshots**: High-fidelity captures using `html2canvas`.
- **Flexible Adapters**: Send feedback to Supabase, Webhooks (Slack/Discord/Teams), LocalStorage, or Console.
- **Privacy First**: Sensitive data is automatically redacted; users have granular control over what's shared.
