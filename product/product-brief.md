# Product Brief: @bernstein/feedback

> **Status:** Building
> **Product Type:** SaaS (open-source library component)
> **Business Model:** B2B
> **Domain:** npm: @bernstein/feedback | github.com/teenne/bernstein-feedback
> **Product Slug:** bernstein-feedback
> **Platform:** Web (React)
> **Last Updated:** 2026-02-28

---

## 1. The One-Liner

> @bernstein/feedback is a drop-in React feedback widget that helps product teams collect bug reports, feature requests, and user feedback with automatic context capture — without building their own feedback system.

**Elevator pitch (30 seconds / 75 words max):**

> Your users hit a bug but can't explain what happened. Your support queue fills up with "it's broken" messages. @bernstein/feedback fixes this by automatically capturing console errors, network failures, and user actions the moment someone submits feedback. Drop it into any React app with three lines of code, and every bug report arrives with the technical context your team actually needs to fix it.

---

## 2. The Problem

### Who has this problem?
Frontend developers and product teams at startups and mid-size companies building React applications who need to collect structured user feedback with enough technical context to actually act on it.

### What triggers them to look for a solution?
They receive a vague bug report like "it's broken" with zero context, spend hours trying to reproduce it, and realize they need users to automatically share browser state, errors, and steps-to-reproduce.

### External Problem (tangible, surface-level)

- Bug reports lack technical context (browser, errors, what the user was doing)
- Building an in-app feedback form from scratch takes weeks and ongoing maintenance
- Feedback arrives through scattered channels (email, Slack, spreadsheets) with no structure

### Internal Problem (emotional, how it makes them feel)

- Feels embarrassing to ask users "can you send me your console?" every time
- Frustrating to waste engineering time reproducing issues users already encountered

### Philosophical Problem (why this matters on a deeper level)

> Teams that build great products shouldn't lose time to bad bug reports. Users shouldn't have to become QA engineers to get their issues fixed.

### The Villain (optional — the root cause personified)

> The assumption that collecting good feedback requires either a heavyweight enterprise tool or a homegrown solution that nobody maintains.

---

## 3. Target Audience

### Primary ICP (Ideal Customer Profile)

**For B2B / SaaS:**

| Attribute | Detail |
|-----------|--------|
| **Job title / role** | Frontend developer, full-stack developer, product engineer |
| **Seniority** | Mid to senior, 2-8 years experience |
| **Company size** | 2-50 person startup or product team |
| **Industry** | SaaS, web applications, developer tools |
| **Revenue/budget** | $0-$5M ARR (early to growth stage) |
| **Location** | Global, English-speaking primary |
| **Tech savviness** | High — daily React/TypeScript users |

### Psychographics

**Goals and aspirations:**
- Ship fast without sacrificing quality
- Close the loop on user feedback efficiently

**Frustrations and daily pains:**
- Spending time reproducing bugs from vague reports
- Maintaining homegrown feedback forms that nobody improves
- Switching between multiple tools to piece together what happened

**Values and priorities:**
- Developer experience over enterprise features
- Privacy-conscious defaults over data hoarding
- Open source and extensibility over vendor lock-in

**How they measure success:**
- Time from bug report to resolution
- Percentage of bug reports with actionable context
- User satisfaction with the feedback process

### Behavior

**Where they spend time online:**
- Reddit: r/reactjs, r/webdev, r/programming
- Discord/Slack: Reactiflux, various framework communities
- Other: Hacker News, Dev.to, GitHub trending

**How they discover new products:**
- GitHub discovery (stars, trending repos, dependency lists)
- Peer recommendations in developer communities
- Blog posts and "awesome-react" lists

**How they make purchasing decisions:**
- Try the free/open-source version first
- Evaluate based on bundle size, API design, and docs quality
- Decision maker: Individual developer or tech lead
- Budget approval: None needed for open-source; team lead for paid tiers

**What they're currently using / doing (the status quo):**
- Homegrown feedback forms — work but lack context capture, nobody maintains them
- Email / Slack messages — unstructured, no technical context, gets lost
- Enterprise tools (Sentry, Instabug, UserVoice) — too heavy, too expensive, too complex for small teams
- Nothing — they just hope users file GitHub issues

### Secondary Audiences (optional)
- Product managers who want structured feature request collection
- QA teams who need better bug report quality from internal users

---

## 4. Positioning

### Value Proposition
> For React developers who struggle with vague bug reports, @bernstein/feedback is a drop-in feedback widget that automatically captures console errors, network failures, and user actions alongside every submission. Unlike enterprise feedback tools, it's a lightweight open-source component you own and control.

### What makes this different?

1. **Automatic context capture** — Unlike generic feedback forms, every submission includes console errors, failed network requests, and user breadcrumbs automatically. No user effort required.
2. **Privacy-first by design** — Unlike tools that capture everything, we never capture request bodies, form data, or keystrokes. Auto-redaction strips emails, tokens, and PII from user text. Users control what's shared via consent toggles.
3. **Adapter architecture** — Unlike SaaS-only tools, you choose where data goes: your API, localStorage for dev, console for testing, or build your own adapter. No vendor lock-in.

### The "Only We" Statement
> Only @bernstein/feedback combines automatic context capture with privacy-first consent toggles and a pluggable adapter system — giving teams rich bug reports without compromising user trust.

### Category
- Entering existing category: In-app feedback widget
- Our angle: Developer-first, context-rich, privacy-respecting

---

## 5. Golden Circle (Start with Why)

### Why (belief and intended change)
> "We believe developers deserve bug reports they can actually fix. We exist to eliminate the gap between what users experience and what teams can see."

### How (differentiating approaches that make the belief real)
- Automatically intercept console errors and network failures — no user effort needed
- Give users granular consent toggles so they choose what to share
- Ship as an embeddable component, not a SaaS dependency

### What (the offering as tangible proof of the Why)
> A React component that adds a feedback button and dialog to any app, automatically enriching every submission with the technical context teams need.

### Story (Sinek style — use as sales opener, hero copy starting point, or elevator pitch)
> "Everything we do, we believe developers deserve bug reports they can actually fix. The way we do this is by automatically capturing the context that matters — errors, failed requests, user actions — while letting users control exactly what they share. We just happen to make a drop-in React feedback widget that does all of this with three lines of code. Try it in your next project."

---

## 6. The Solution

### How it works (3-step plan)

1. **Wrap your app** — Add `<FeedbackProvider>` with your project ID and an adapter (HTTP, localStorage, or custom). Three lines of code.
2. **Drop in the button** — Add `<FeedbackButton>` and `<FeedbackDialog>`. A floating feedback button appears in your app.
3. **Receive rich reports** — Every submission arrives with console errors, network failures, user breadcrumbs, viewport info, and optional screenshots.

### Key Features

| Feature | What it does | Why it matters (benefit) | Who cares most |
|---------|-------------|------------------------|---------------|
| Auto context capture | Intercepts `console.error` and `window.fetch` failures automatically | Bug reports arrive with technical details without user effort | Developers |
| User breadcrumbs | Tracks clicks and navigation as a timeline of actions | Teams can see exactly what the user did before reporting | Developers, QA |
| Screenshot capture | Takes a screenshot via html2canvas, hiding the dialog during capture | Visual context for layout/UI bugs | Developers, Designers |
| Element highlighting | Users click to select a specific element on the page | Pinpoints exactly which UI element is problematic | Users, QA |
| Privacy consent toggles | Users choose to include/exclude screenshot, technical details, email, recent steps | Builds user trust, GDPR-friendly by default | Product teams, Legal |
| Auto-redaction | Strips emails, phone numbers, API keys, tokens, credit cards, SSNs from user text | Prevents accidental PII leakage in feedback submissions | Security, Legal |
| Pluggable adapters | HTTP, batch HTTP (offline-first), localStorage, console — or build your own | No vendor lock-in, works with any backend | Developers |
| Customizable categories | Configure category dropdowns per feedback type (feedback, bug, feature request) | Structured data for triage and analytics | Product managers |
| Tabbed dialog | Three modes: Feedback, Feature Request, Bug Report — each with contextual fields | Right fields for the right feedback type | Users |
| Impact selector | Bug reports include "Blocks me / Annoying / Minor" severity from the user's perspective | Prioritization based on user impact, not just technical severity | Product managers |

### What it does NOT do

- Does NOT capture request/response bodies (privacy)
- Does NOT capture form data or keystrokes
- Does NOT provide a backend dashboard — it sends data to your endpoint
- Does NOT replace error monitoring tools like Sentry — it captures user-initiated feedback, not automated crash reporting
- Does NOT work outside React 18+ applications

---

## 7. Outcomes & Transformation

### Before vs. After

| Before (without product) | After (with product) |
|--------------------------|---------------------|
| Bug reports say "it's broken" with no context | Every report includes console errors, network failures, and user actions |
| Engineers spend hours reproducing issues | Engineers see exactly what happened and fix faster |
| Building a feedback form takes weeks | Drop-in component works in minutes |
| Users have no way to report issues in-app | Floating button is always available, frictionless |
| Sensitive data accidentally included in reports | Auto-redaction and consent toggles protect PII |

### Measurable Outcomes

- Reduce average bug reproduction time by capturing context automatically
- Eliminate "can't reproduce" tickets by including browser state with every report
- Set up in-app feedback collection in under 10 minutes

### Success Stories (fill in when available)

*No success stories yet — product is in building phase.*

---

## 8. Pricing

### Pricing Strategy
- **Model:** Open source (Apache-2.0 license)
- **Billing:** Free — open source core
- **Free tier:** Yes — the full widget is free and open source
- **Trial:** N/A
- **Refund policy:** N/A

### Price Points

The core widget is fully open source. Potential future monetization:

| | Open Source | Hosted (Future) |
|---|-----------|-----------------|
| **Price** | $0 | TBD |
| **Includes** | Full widget, all adapters, all features | Managed backend, dashboard, analytics |
| **Limits** | None — self-hosted | TBD |

### Pricing Rationale
- Open source builds trust and adoption in the developer community
- Revenue opportunity is in a hosted backend/dashboard layer (not yet built)
- Aligns with developer expectations: library is free, managed service is paid

---

## 9. Distribution & Platform (skip if SaaS web-only)

### Where customers get the product

| Channel | Relevant? | Details |
|---------|-----------|---------|
| **npm** | Yes | `npm install @bernstein/feedback` — primary distribution |
| **GitHub** | Yes | Source code, issues, docs at github.com/teenne/bernstein-feedback |
| **Your website** | No | Not yet — could add a landing page later |

---

## 10. StoryBrand Elements

### Character (Hero = Customer)
- **Who:** A React developer building a SaaS product
- **Want:** Actionable feedback from users without building a feedback system from scratch

### Problem
- **Villain:** The information gap between what users experience and what developers can see
- **External:** Bug reports lack technical context; building a feedback system is time-consuming
- **Internal:** Feels wasteful spending engineering time on feedback infrastructure instead of product features
- **Philosophical:** Users who take the time to report issues deserve to have them fixed quickly

### Guide (Your Brand)
- **Empathy:** "We've been the developers staring at 'it doesn't work' tickets with zero context. We built this so you don't have to."
- **Authority:**
  - Built on battle-tested libraries (Radix UI, Zod, html2canvas)
  - Privacy-first design with auto-redaction and consent controls
  - Open source — inspect every line of code

### Plan
1. Install the package and wrap your app with `FeedbackProvider`
2. Add the `FeedbackButton` and `FeedbackDialog` components
3. Configure an adapter to send feedback wherever you want

### Call to Action
- **Direct CTA:** "Install Now" / `npm install @bernstein/feedback`
- **Transitional CTA:** "View the Docs" / "See the Example App"

### Failure (Stakes)
If they don't act:
- Keep wasting hours reproducing bugs from vague reports
- Continue maintaining a homegrown feedback form that nobody improves
- Miss user feedback because there's no in-app channel for it

### Success (Transformation)
- **Status:** Known as the team that fixes bugs fast because they actually understand what users experience
- **Self-actualization:** Spending time on product features instead of feedback infrastructure
- **Completeness:** Every bug report has the context needed to fix it on the first try

---

## 11. User Stories

### Must-have (core value)
- As a developer, I want to add a feedback widget to my React app in minutes so that users can report issues without leaving the app.
- As a developer, I want bug reports to automatically include console errors and network failures so that I can reproduce issues faster.
- As a user, I want to control what data is shared with my feedback so that I feel safe reporting issues.
- As a developer, I want to send feedback data to my own backend so that I'm not locked into a third-party service.

### Should-have (important but not critical for launch)
- As a user, I want to take a screenshot and highlight a specific element so that I can show exactly what's wrong.
- As a product manager, I want feedback categorized (bug, feature request, general) so that I can triage efficiently.
- As a developer, I want to programmatically open the bug report dialog with prefilled data so that I can trigger it from error boundaries.

### Nice-to-have (future)
- As a developer, I want a hosted dashboard to view and triage feedback so that I don't have to build my own.
- As a product manager, I want analytics on feedback trends so that I can prioritize the roadmap.

---

## 12. Competitive Landscape

### Direct Competitors

| Competitor | Price | Best for | Weakness (our opportunity) |
|-----------|-------|---------|---------------------------|
| Sentry User Feedback | Included with Sentry ($26+/mo) | Teams already using Sentry | Tied to Sentry ecosystem, limited customization, no feature request flow |
| Instabug | $249+/mo | Mobile-first teams | Expensive, heavy, mobile-focused, overkill for web apps |
| Userback | $49+/mo | Design teams | SaaS dependency, no self-hosted option, not developer-first |
| Canny | $79+/mo | Product teams wanting a public roadmap | Feature voting tool, not a bug report widget; no context capture |

### Indirect Competitors / Alternatives
- Homegrown feedback forms — Free but lack context capture, nobody maintains them
- Email/Slack support channels — Free but unstructured, technical context lost
- GitHub Issues — Free but requires users to leave the app, no automatic context
- Doing nothing — Cost of inaction: slower bug fixes, frustrated users, lost trust

### Competitive Position Map

```
                    Simple
                      |
                      |   @bernstein/feedback
                      |
      Free ───────────┼────────── Expensive
                      |
          Instabug    |   Userback
                      |         Canny
                    Complex
```

---

## 13. Voice & Tone for This Product

| Attribute | Description | Example |
|-----------|-------------|---------|
| **Personality** | Developer-to-developer, practical, no-nonsense | "Three lines of code. That's it." |
| **Formality** | Casual technical — contractions, direct language | "Drop it in and you're done." |
| **Humor** | Dry, relatable developer humor | "Because 'it's broken' isn't a bug report." |
| **Confidence** | Quietly confident — shows don't tell | "Every report includes the context you need." |

**Words we use:**
- "drop-in" not "seamlessly integrate"
- "captures" not "leverages"
- "your backend" not "our platform"

**Words we avoid:**
- "enterprise-grade," "leverage," "synergy," "empower"
- "AI-powered" (unless we actually add AI)
- "revolutionary," "game-changing"

**Customer language to mirror:**
- "I just need to know what happened"
- "I don't want to build this from scratch"
- "Can't they just send me the console?"

---

## 14. Validation Data (fill in during/after validation)

*Not yet validated — product is in building phase.*

### Verdict
- [ ] Problem validated
- [ ] Willingness to pay validated
- [ ] Price point validated
- [ ] Audience found
- [ ] **GO / NO-GO decision:** Pending validation

---

## 15. Research Links

| Source | Link | Key Finding |
|--------|------|-------------|
| Pain points research | *Not yet conducted* | — |
| Community research | *Not yet conducted* | — |
| Competitor research | *Not yet conducted* | — |
| Language bank | *Not yet conducted* | — |
| Personas | *Not yet conducted* | — |
