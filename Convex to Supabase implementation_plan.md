# Convex → Supabase Migration Plan

Migrate the entire backend from **Convex** (serverless functions + document DB) to **Supabase** (PostgreSQL + Auth + Storage + Realtime). This is a full rewrite of the data layer.

## User Review Required

> [!IMPORTANT]
> **Supabase Project**: Do you already have a Supabase project created? If not, I'll guide you through creating one. We need the project URL and anon key.

> [!WARNING]
> **Breaking Change**: This migration completely replaces the data layer. The `convex/` directory and all Convex-specific code will be removed. There is no gradual migration path — it's a full swap.

> [!IMPORTANT]
> **Auth Strategy**: Supabase Auth supports email/password, OAuth (Google, GitHub, etc.), and magic links. Which do you want? This replaces the current Hercules OIDC flow entirely.

## Open Questions

1. **Supabase Project**: Do you already have one, or should I include setup instructions?
2. **Auth Providers**: Which login methods? Email/password, Google OAuth, magic link?
3. **Realtime**: Do you need live updates (e.g., pipeline board auto-refreshing)? Supabase Realtime can handle this but adds complexity.
4. **File Storage**: The current app uses Convex `_storage` for survey photos, contracts, permits, and installation photos. Supabase Storage will replace this — should files be public or require signed URLs?

---

## Scope Summary

| Category | Count | Details |
|----------|-------|---------|
| Backend functions to rewrite | 8 files | `convex/*.ts` → `src/lib/supabase/*.ts` |
| Frontend files to update | **31 files** | Replace `convex/react` hooks with React Query + Supabase |
| Auth components to rewrite | 5 files | Providers, callback, signin, layout guards |
| File upload patterns | 5 files | `generateUploadUrl` → Supabase Storage |
| Dependencies to swap | 8 remove, 2 add | See below |

---

## Phase 1 — Dependencies & Config

### [MODIFY] [package.json](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/package.json)

**Remove** (Convex + Hercules):
```
convex
convex-test
@convex-dev/eslint-plugin
@usehercules/auth
@usehercules/vite
@usehercules/eslint-plugin
oidc-client-ts
react-oidc-context
```

**Add** (Supabase):
```
@supabase/supabase-js    — Supabase client
@supabase/ssr            — SSR helpers (optional, useful for edge cases)
```

**Keep** (already in project, now critical):
```
@tanstack/react-query    — Replaces Convex's useQuery with React Query
```

### [MODIFY] [vite.config.ts](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/vite.config.ts)
- Remove `import hercules from "@usehercules/vite"` and `hercules()` from plugins
- Remove `@/convex` path alias (no longer needed)

### [MODIFY] [eslint.config.mjs](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/eslint.config.mjs)
- Remove `@usehercules/eslint-plugin` and `@convex-dev/eslint-plugin`

### [MODIFY] [.env.example](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/.env.example)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### [MODIFY] [pnpm-workspace.yaml](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/pnpm-workspace.yaml)
- Remove `@usehercules/*` from `minimumReleaseAgeExclude`

### [MODIFY] [tsconfig.app.json](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/tsconfig.app.json)
- Remove `@/convex/*` path alias

---

## Phase 2 — Database Schema (PostgreSQL)

### [NEW] `supabase/migrations/001_initial_schema.sql`

Convert the Convex schema to PostgreSQL. Key changes:
- Convex document IDs → PostgreSQL `uuid` with `gen_random_uuid()`
- Convex `v.union(v.literal(...))` → PostgreSQL `text CHECK` or custom `ENUM` types
- Convex `_creationTime` → `created_at timestamptz DEFAULT now()`
- Add `updated_at` column with auto-update trigger
- Add foreign key constraints (Convex has none)
- Add Row Level Security (RLS) policies

```sql
-- Tables to create:
-- 1. users           (replaces convex users table)
-- 2. leads           (with FK to users for assigned_sales_rep)
-- 3. properties      (FK to leads)
-- 4. surveys         (FK to leads, properties, users)
-- 5. quotes          (FK to leads, users)
-- 6. contracts       (FK to leads, quotes)
-- 7. permits         (FK to leads, users)
-- 8. installations   (FK to leads, with crew_ids as uuid[])
-- 9. service_tickets (FK to leads, installations, users)
-- 10. activity_log   (FK to leads, users)
```

### RLS Policies (replaces Convex auth guards)

Each table gets policies that mirror the current `getCurrentUser()` / `requireRole()` / `requireAdmin()` checks:

| Table | SELECT | INSERT/UPDATE | DELETE |
|-------|--------|---------------|--------|
| `users` | All authenticated | Admin only (role changes) | Admin only |
| `leads` | Admin/office: all; Sales: own only | Admin/sales | Admin/sales |
| `surveys` | All authenticated | Admin/surveyor | Admin |
| `quotes` | All authenticated | Admin/sales | Admin |
| `contracts` | All authenticated | Admin/sales | Admin |
| `permits` | All authenticated | Admin/office | Admin |
| `installations` | All authenticated | Admin/installer | Admin |
| `service_tickets` | All authenticated | All authenticated | Admin |
| `activity_log` | All authenticated | System (via service role) | None |

---

## Phase 3 — Supabase Client & Data Access Layer

### [NEW] `src/lib/supabase/client.ts`
- Initialize Supabase client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Export typed client using generated types

### [NEW] `src/lib/supabase/types.ts`
- TypeScript types generated from the PostgreSQL schema (via `supabase gen types typescript`)
- Replaces `@/convex/_generated/dataModel.d.ts`

### [NEW] `src/lib/supabase/queries/leads.ts`
Replaces `convex/leads.ts` — all lead CRUD operations as async functions:
- `listLeads(filters)` → `supabase.from('leads').select('*, properties(*), users!assigned_sales_rep_id(*)')`
- `getLeadById(id)` → single lead with joins
- `createLead(data)` → insert lead + property + activity log
- `updateLead(id, data)` → patch + activity log
- `updateStage(id, stage)` → update stage + activity log
- `deleteLead(id)` → cascade delete
- `searchLeads(q)` → full-text search with `ilike`

### [NEW] `src/lib/supabase/queries/users.ts`
Replaces `convex/users.ts`:
- `getCurrentUser()` → fetch by Supabase auth user ID
- `upsertCurrentUser()` → upsert on login (replaces `updateCurrentUser` mutation)
- `listUsers()` / `updateUserRole()` / `updateUserStatus()` / `deleteUser()`

### [NEW] `src/lib/supabase/queries/surveys.ts`
### [NEW] `src/lib/supabase/queries/quotes.ts`
### [NEW] `src/lib/supabase/queries/contracts.ts`
### [NEW] `src/lib/supabase/queries/permits.ts`
### [NEW] `src/lib/supabase/queries/installations.ts`
### [NEW] `src/lib/supabase/queries/service-tickets.ts`
### [NEW] `src/lib/supabase/queries/reports.ts`

Each mirrors its `convex/*.ts` counterpart as plain async functions.

### [NEW] `src/lib/supabase/hooks.ts`
React Query hook wrappers:
```typescript
// Example pattern — replaces Convex useQuery/useMutation
export function useLeads(filters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => listLeads(filters),
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createLead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });
}
```

---

## Phase 4 — Auth Migration

### [REWRITE] `src/components/providers/auth.tsx`
- Remove `HerculesAuthProvider` / `@usehercules/auth`
- Replace with Supabase session listener (`supabase.auth.onAuthStateChange`)
- Create `AuthContext` providing `{ user, session, isLoading, signIn, signOut }`

### [DELETE] `src/components/providers/convex.tsx`
- No longer needed — Supabase client is a singleton, not a React provider

### [REWRITE] `src/components/providers/default.tsx`
- Remove `AuthProvider` (Hercules) and `ConvexProvider`
- Add `QueryClientProvider` (already exists) as the main data provider
- Add new `SupabaseAuthProvider`

### [REWRITE] `src/components/ui/signin.tsx`
- Replace `useAuth` from `@usehercules/auth/react` with Supabase auth
- `signin()` → `supabase.auth.signInWithOAuth({ provider: 'google' })` or email/password

### [REWRITE] `src/pages/auth/Callback.tsx`
- Replace Hercules OIDC callback with Supabase OAuth callback handler
- Supabase handles this automatically via URL hash, much simpler

### [REWRITE] `src/hooks/use-auth.ts`
- Export auth hooks from the new Supabase auth context

### [NEW] `src/components/auth-guard.tsx`
Replaces Convex's `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>`:
```tsx
export function Authenticated({ children }) { ... }
export function Unauthenticated({ children }) { ... }
export function AuthLoading({ children }) { ... }
```

---

## Phase 5 — Frontend Migration (31 files)

Every file that imports from `convex/react` or `@/convex/_generated/*` needs updating.

### Pattern: `useQuery(api.x.y)` → React Query hook

**Before** (Convex):
```tsx
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
const leads = useQuery(api.leads.list, { stage: "lead" });
```

**After** (Supabase + React Query):
```tsx
import { useLeads } from "@/lib/supabase/hooks";
const { data: leads, isLoading } = useLeads({ stage: "lead" });
```

### Pattern: `useMutation(api.x.y)` → React Query mutation

**Before**:
```tsx
const createLead = useMutation(api.leads.create);
await createLead({ firstName: "John", ... });
```

**After**:
```tsx
const { mutateAsync: createLead } = useCreateLead();
await createLead({ firstName: "John", ... });
```

### Pattern: File uploads (`generateUploadUrl`)

**Before** (Convex _storage):
```tsx
const uploadUrl = await generateUploadUrl();
await fetch(uploadUrl, { method: "POST", body: file });
```

**After** (Supabase Storage):
```tsx
const { data, error } = await supabase.storage
  .from('documents')
  .upload(`permits/${permitId}/${file.name}`, file);
```

### Files to migrate:

| File | Changes |
|------|---------|
| [AppLayout.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/layout/AppLayout.tsx) | Replace `Authenticated/Unauthenticated/AuthLoading` |
| [Index.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/Index.tsx) | Replace auth guards + `useQuery` |
| [Callback.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/auth/Callback.tsx) | Full rewrite for Supabase OAuth |
| [AppSidebar.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/layout/_components/AppSidebar.tsx) | Replace `useQuery` for current user |
| [MobileNavbar.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/layout/_components/MobileNavbar.tsx) | Replace `useQuery` for current user |
| [AdminDashboard.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/_components/AdminDashboard.tsx) | Replace all `useQuery` calls |
| [SalesDashboard.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/_components/SalesDashboard.tsx) | Replace `useQuery` |
| [SurveyorDashboard.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/_components/SurveyorDashboard.tsx) | Replace `useQuery` |
| [InstallerDashboard.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/_components/InstallerDashboard.tsx) | Replace `useQuery` |
| [EditLeadDialog.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/_components/EditLeadDialog.tsx) | Replace `useQuery` + `useMutation` |
| [leads/page.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/leads/page.tsx) | Replace `useQuery` |
| [leads/[id]/page.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/leads/%5Bid%5D/page.tsx) | Replace `useQuery` + `useMutation` |
| [pipeline/page.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/pipeline/page.tsx) | Replace `useQuery` + `useMutation` |
| [reports/page.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/reports/page.tsx) | Replace `useQuery` |
| [team/page.tsx](file:///c:/Users/deguz/OneDrive/Pictures/PROJECTS/Lampara%20System/src/pages/team/page.tsx) | Replace `useQuery` + `useMutation` |
| 15 lead sub-components | Replace `useQuery`/`useMutation` + file uploads |

---

## Phase 6 — Cleanup

### [DELETE] Entire `convex/` directory
- `convex/schema.ts`, `convex/leads.ts`, `convex/users.ts`, etc.
- `convex/_generated/` stubs
- `convex/auth.config.ts`, `convex/lib/auth.ts`
- `convex.json`, `convex/tsconfig.json`

### [DELETE] `vitest.config.ts` Convex test config
- Remove `edge-runtime` environment (was for Convex backend tests)
- Simplify to jsdom-only for React component tests

### [MODIFY] `src/hooks/use-service-worker.ts`
- Remove Convex-specific HMR token workaround (no longer relevant)

---

## Execution Order

| Priority | Phase | Effort | Description |
|----------|-------|--------|-------------|
| 🔴 P0 | Phase 1 | ~30 min | Swap dependencies, update configs |
| 🔴 P0 | Phase 2 | ~1 hr | Create PostgreSQL schema + RLS |
| 🔴 P0 | Phase 3 | ~2 hr | Build Supabase data access layer + React Query hooks |
| 🔴 P0 | Phase 4 | ~1 hr | Auth migration (Hercules OIDC → Supabase Auth) |
| 🟡 P1 | Phase 5 | ~3 hr | Migrate all 31 frontend files |
| 🟢 P2 | Phase 6 | ~30 min | Delete Convex directory, cleanup |

**Total estimated effort: ~8 hours**

---

## Verification Plan

### Automated Tests
```bash
pnpm run build     # TypeScript compiles with no convex imports
pnpm run lint      # No convex eslint plugin errors
```

### Manual Verification
- [ ] Create a Supabase project and run the migration SQL
- [ ] Sign in via Supabase Auth (email or OAuth)
- [ ] Create a lead → verify it appears in Supabase dashboard
- [ ] Upload a file (survey photo) → verify in Supabase Storage
- [ ] Change a lead stage → verify activity log entry
- [ ] Test role-based access (admin vs sales)
- [ ] Verify no remaining `convex` imports in codebase
