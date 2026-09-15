# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two groups, both first-class:

- **Office/sales staff** (`admin`/`superadmin` roles) — run the sales pipeline at a desk: create and assign leads, build and approve quotes, generate and track contracts, manage the team and packages.
- **Field technicians** (`field` role — surveyors and installers) — work on-site, often on a phone: fill out the ocular inspection report at the property, and manage their own installation jobs (materials checklist, completion photos, status).

No customer-facing login exists — everything is staff-managed on behalf of the customer.

## Product Purpose

A CRM for Lampara Electrical Installation Services, a Philippine solar installation company, to run one customer end to end: first inquiry → site ocular inspection → quote → signed contract → installation → active customer (with post-install service tickets and warranty tracking after that).

## Positioning

Built specifically for Philippine solar installation workflows, not a generic CRM bent to fit the domain: the real PH administrative address hierarchy (barangay / city-municipality / province), peso pricing, an ocular inspection report format that mirrors the company's actual paper form, and the exact pipeline stages this business runs. A role-scoped AI assistant (admin/superadmin only) can look up and act on project data through natural language on top of that same workflow.

## Operating Context

- Pipeline stages: `lead → survey_scheduled → survey_completed → proposal_sent → contract_signed → installation_scheduled → installation_complete → active_customer`, with a separate `cancelled` exit — stage advances automatically from the work itself (completing an inspection, approving a quote, signing a contract, finishing an install), forward-only, rather than being hand-nudged.
- The ocular inspection report is filled in against the printed form it mirrors (`public/Ocular report sample.pdf`).
- Quotes are versioned and revisable pre-approval; approving one locks it. A lead can carry several quote versions over time.
- Contracts are generated as PDFs (payment details included) — one per quote version, not one per lead, so a revised quote can get its own contract without disturbing an earlier version's.
- Installations run over a date range (not a single day), with a materials checklist and completion photos.
- Post-install: service tickets with warranty tracking, staff-managed (no customer self-service).
- Field staff work primarily on mobile: the app installs as a PWA to the home screen and has offline-aware handling.

## Capabilities and Constraints

- Three roles only: `superadmin`, `admin`, `field` — an earlier separate "sales" role was consolidated away.
- No customer-facing account or portal anywhere in the product.
- The AI assistant is Anthropic-powered, gated to `superadmin`/`admin`, proxied through a server-side endpoint so the API key never reaches the browser; every write action it can take requires an explicit, code-enforced confirmation step, not just a prompt instruction.
- Backend is Supabase (Postgres + Row Level Security) — every query is scoped by the signed-in user's role at the database layer, not just hidden in the UI.
- Deployed single-tenant today (one company: Lampara). A plan exists (`docs/plans/`) for offering the same codebase to other companies via separate per-company deployments later; not yet built.

## Brand Commitments

- Name: **Lampara** (full form: Lampara Electrical Installation Services).
- Mark: a solar-lamp icon (black on light backgrounds, inverted for dark mode).
- Visual language already in place: an Apple-liquid-glass-inspired frosted/translucent treatment on nav bars, modals, and popovers; full light/dark theme support.
- Contracts display the company's real bank payment details (BDO account) — this is live financial information, not placeholder copy.

## Evidence on Hand

- Live production deployment (Vercel) backed by a live Supabase project — real usage, not a demo.
- A reference PDF for the ocular inspection report's expected layout: `public/Ocular report sample.pdf`.
- No user research, testimonials, case studies, or usage metrics on file — future work must not fabricate any of these.

## Product Principles

1. **Match the business's real paper process exactly**, not a generic CRM abstraction — the PH address fields, the ocular report layout, and the contract clauses all mirror the actual documents this company already uses.
2. **Office staff and field technicians are equally first-class users of the same tool.** Field workflows (touch interactions, PWA install, offline handling) get real engineering investment, not a bolted-on mobile afterthought.
3. **Never trust a system-prompt instruction alone for anything that mutates data or money.** Write actions — including the AI assistant's — are enforced in code (confirmation gates, RLS, database constraints/triggers), not just described to the UI or the model.
4. **Money and legal documents never silently show a wrong or placeholder value.** A quote, contract, or generated PDF must not print ₱0, a drifting "today's" date, or a hardcoded page count in place of the real number — these are documents a customer signs.
5. **Single-tenant today, built to not require a rewrite to become multi-company.** Company-specific values belong in configuration, not hardcoded in components — even while only one company uses the product.
