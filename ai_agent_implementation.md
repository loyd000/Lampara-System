# Lampara AI Agent — Implementation Plan

## Overview

A floating AI assistant embedded in the app that can **answer questions about your data** and **execute actions on your behalf** — creating quotes, scheduling jobs, updating project stages — then navigating you to the result.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React App (browser)                                     │
│                                                          │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │  AgentPanel  │───▶│  useAgent hook               │   │
│  │  (chat UI)   │    │  - conversation state         │   │
│  │              │    │  - calls Gemini API           │   │
│  └──────────────┘    │  - executes tool calls        │   │
│                      │  - navigates app              │   │
│                      └──────────────┬───────────────┘   │
│                                     │ tool calls         │
│                      ┌──────────────▼───────────────┐   │
│                      │  Agent Tools (src/ai/tools/)  │   │
│                      │  - reads Supabase directly    │   │
│                      │  - writes via existing APIs   │   │
│                      └──────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────┘
                                │ HTTPS
                    ┌───────────▼──────────┐
                    │  Google Gemini API   │
                    │  (gemini-2.0-flash)  │
                    │  Function Calling    │
                    └──────────────────────┘
```

**Why Gemini:**
- Native function calling (tools) — the model decides when to call a tool and what args to pass
- `gemini-2.0-flash` is fast and cheap enough for real-time chat
- Multimodal — can read ocular report photos in the future
- No separate backend needed; the API key lives in `.env`

---

## New Files

```
src/
  ai/
    agent.ts           # Gemini client wrapper, multi-turn message loop
    tools/
      index.ts         # Tool registry (all tools in one export)
      read-tools.ts    # Read-only: list projects, get schedule, etc.
      write-tools.ts   # Mutations: create quote, schedule install, etc.
      navigate-tool.ts # App navigation (triggers React router)
    prompts.ts         # System prompt template
    types.ts           # Message, ToolCall, AgentContext types

  hooks/
    use-agent.ts       # React hook: conversation state + Gemini loop

  components/
    agent-panel/
      AgentPanel.tsx       # Slide-in drawer / bottom sheet
      AgentMessage.tsx     # Chat bubble with tool-call summary cards
      AgentInput.tsx       # Text field + send button
      AgentFab.tsx         # Floating action button to open panel
      tool-cards/
        QuoteCreatedCard.tsx
        ScheduledCard.tsx
        ProjectCard.tsx
```

---

## Tool Definitions

Gemini's function calling works by giving the model a list of tools with JSON Schema parameters. The model responds with a tool call; the app runs it and sends the result back to the model.

### Read Tools

| Tool | What it does | Key params |
|---|---|---|
| `list_projects` | Returns projects matching a filter | `stage?`, `assignedRep?`, `search?` |
| `get_project` | Full detail for one project | `projectId` |
| `get_schedule` | Calendar events for a date range | `from`, `to` |
| `get_ocular_report` | Latest ocular inspection data | `projectId` |
| `get_quotes` | Current quotes for a project | `projectId` |
| `list_packages` | All available packages + prices | — |
| `get_team` | List of users/reps | `role?` |

### Write Tools

| Tool | What it does | Key params | After action |
|---|---|---|---|
| `create_quote` | Creates a draft quote with line items | `projectId`, `packageIds[]`, `customItems[]?` | Navigate → `/projects/:id?tab=quotes` |
| `schedule_inspection` | Books an ocular inspection | `projectId`, `date`, `time`, `assignedUserId?` | Navigate → `/projects/:id?tab=ocular` |
| `schedule_installation` | Schedules an installation | `projectId`, `startDate`, `endDate`, `crewIds?` | Navigate → `/projects/:id?tab=installation` |
| `update_project_stage` | Moves the project to a new stage | `projectId`, `stage`, `reason?` | Navigate → `/projects/:id` |
| `create_project` | Creates a new project | `firstName`, `lastName`, `phone`, address fields | Navigate → `/projects/:id` |
| `navigate` | Navigates the app to a URL | `path` | — |

---

## System Prompt

```
You are Lampara AI, an assistant built into the Lampara Solar CRM.
You have access to tools to read and update project data.

Rules:
1. Always confirm destructive actions (stage → cancelled / active_customer) before executing.
2. After any write action, call navigate() to show the user the result.
3. Answer concisely using fetched data — never make up numbers.
4. When creating quotes, summarise what you're about to add and confirm first.
5. Current user: {name}, role: {role}. Only suggest actions their role permits.
6. Today's date: {date}. Use this for "today", "this week", relative dates.
```

---

## The `useAgent` Hook

```ts
function useAgent(): {
    messages: AgentMessage[];
    send: (text: string) => Promise<void>;
    clear: () => void;
    isThinking: boolean;
}
```

**Multi-turn loop:**
1. User sends message → appended to `messages`
2. Call `gemini.generateContent({ contents, tools })`
3. If response is text → append assistant message, done
4. If response contains `functionCall` → run the matching tool, send result back as `functionResponse`, loop back to step 2
5. Model chains multiple tool calls in one turn (e.g. `list_projects` → `get_ocular_report` → `create_quote` → `navigate`)

**Dependency:**
```bash
pnpm add @google/generative-ai
```

---

---

## UI

### AgentFab
- Fixed `bottom-right`, sits above the mobile nav bar
- Sparkles ✦ icon
- Pulsing ring animation when AI is thinking
- Opens `AgentPanel`

### AgentPanel
- **Desktop:** Right-side slide-in drawer, 380px, pushes the main layout
- **Mobile:** Bottom sheet, 70vh, swipe-down to dismiss
- Conversation history scrollable area
- `AgentInput` pinned at the bottom

### AgentMessage bubbles
- User → right-aligned, primary colour
- AI text → left-aligned with Lampara icon
- Tool call summary → compact card below the message

### Tool Result Cards

After a write action, the AI message includes an inline action card:

```
╔══════════════════════════════╗
║ ✓ Quote Created              ║
║ Juan Dela Cruz               ║
║ 3 items · ₱148,500 total     ║
║ [View Quote →]               ║
╚══════════════════════════════╝
```

```
╔══════════════════════════════╗
║ 📅 Installation Scheduled    ║
║ Sep 18–20, 2026              ║
║ Crew: Mark Reyes, Carlo Tan  ║
║ [View Installation →]        ║
╚══════════════════════════════╝
```

---

## Data Access Strategy

The AI tools call the **same Supabase query functions** already in `src/lib/supabase/queries/`. No new backend required. No new RLS rules — the user's Supabase session is active in the browser, so every tool call runs under the same auth as the rest of the app.

```ts
// read-tools.ts
import { getLead } from "@/lib/supabase/queries/leads";

export async function get_project({ projectId }: { projectId: string }) {
    const lead = await getLead(projectId);
    if (!lead) return { error: "Project not found" };
    return {
        id: lead._id,
        name: `${lead.firstName} ${lead.lastName}`,
        stage: lead.stage,
        phone: lead.phone,
        address: lead.property?.address ?? null,
        assignedRep: lead.assignedRepName ?? "Unassigned",
        lastActivity: lead.lastActivityAt,
    };
}
```

After write tools, they **invalidate React Query cache** so the page the user lands on shows fresh data immediately:

```ts
// write-tools.ts
import { queryClient } from "@/lib/query-client";

export async function create_quote({ projectId, packageIds }) {
    const quote = await createQuoteFn({ leadId: projectId });
    // add line items from packageIds...
    await queryClient.invalidateQueries({ queryKey: ["quotes", "lead", projectId] });
    return { quoteId: quote._id, navigateTo: `/projects/${projectId}?tab=quotes` };
}
```

---

## Environment Config

Add to `.env`:
```
VITE_GEMINI_API_KEY=your_key_here
```

> [!CAUTION]
> `VITE_*` variables are embedded in the client bundle and visible in browser devtools. For an **internal CRM** (accessed only by your team), restrict the key to your domain in Google AI Studio — this is sufficient protection. If the app becomes public-facing, wrap the Gemini call in a Supabase Edge Function proxy instead.

---

## Phased Rollout

### Phase 1 — Read-only Q&A *(~2 days)*
- Gemini client + `useAgent` hook
- `list_projects`, `get_project`, `get_schedule` tools
- Basic `AgentPanel` chat UI
- FAB button + system prompt

**Demo:** *"What projects are scheduled for installation this week?"* → AI calls `get_schedule`, answers with names and dates.

---

### Phase 2 — Write Actions *(~2–3 days)*
- `create_quote`, `schedule_installation`, `schedule_inspection`, `update_project_stage`
- Confirmation step for destructive actions in chat
- Tool result cards
- Auto-navigate after every write

**Demo:** *"Make a draft quote for Juan Dela Cruz using the Residential Basic package"* → AI confirms, creates quote, navigates to quote tab.

---

### Phase 3 — Smart Summaries *(~1 day)*
- `get_ocular_report` tool
- AI reads roof type, area, current usage → suggests matching packages
- *"Summarise the ocular report for Santos"* → readable paragraph with recommendations

---

## Example Conversations

**Q&A:**
> "What's Juan Santos' installation schedule?"
> → AI calls `list_projects({search:"Juan Santos"})` then `get_project` → *"Juan Santos is scheduled Sep 18–20, 2026. Crew: Mark Reyes, Carlo Tan."*

**Quote creation:**
> "Create a quote for project [name] with the Residential Pro 10kW package"
> → AI: *"I'll add the Residential Pro 10kW (₱95,000) to Juan Santos' quote. Proceed?"*
> → "Yes"
> → AI creates quote, navigates → shows QuoteCreatedCard

**Stage update:**
> "Close the Santos project as active customer"
> → AI: *"Are you sure you want to mark Juan Santos as Active Customer? This sets them as a converted client."*
> → "Yes" → AI calls `update_project_stage`, navigates



## Open Questions

> [!IMPORTANT]
> **API key exposure:** Is this app accessed only by your internal team? If yes, restricting the key by domain in Google AI Studio is sufficient. If it'll be accessible publicly, we need a Supabase Edge Function proxy (1 extra day of work).

> [!IMPORTANT]
> **Who can use the AI agent?** Should field technicians be able to use it (e.g. mark their own installation complete via chat)? Or admin/superadmin only? This affects the system prompt role guard and which write tools are exposed.

> [!NOTE]
> **Confirmation UX for destructive actions:** Should the AI ask in chat (*"Are you sure?"*) or open the existing AlertDialog? Chat is simpler; AlertDialog is more consistent with the rest of the UI.

> [!NOTE]
> **Context window management:** Long conversations grow the token count. The hook will cap history at the last 20 messages to keep responses fast and costs low.
