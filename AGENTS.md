# AGENTS.md — WG Paid Web

Repository-level operating contract for coding agents working in `DChuvelev/wg-paid-web`.

Read this before changing code. If a task conflicts with these rules, stop and explain the conflict rather than silently changing architecture or security semantics.

## 1. Mission and near-term order

Build a modular, typed, reproducible browser frontend while preserving the accepted WG Paid backend/network/release architecture.

Near-term order:

1. React/TypeScript Web Foundation;
2. public `access` functional parity;
3. private `admin` functional parity;
4. two-profile default/test-user readiness;
5. one controlled two-profile real-user proof;
6. small pilot + read-only operational observation;
7. later UX/product expansion.

Functional parity comes before redesign. Do not expand scope merely because a refactor makes additional changes convenient.

## 2. Repository scope and ownership boundaries

Target workspace:

```text
web/
  apps/
    access/    public user application
    admin/     trusted-network admin application
  packages/
    api/       generated typed API client/contract
    ui/        shared UI primitives
    common/    shared non-API utilities/types
```

If the repository root is already the web workspace, omit the outer `web/` directory rather than adding pointless nesting.

Preserve project ownership:

```text
User/business/profile intent = VM121
Actual peer + selector       = VM100
Provider egress/recovery     = VM101
Browser/TLS route boundary   = VM103
Release/evidence/monitoring  = VM130
```

This repo owns browser source/build tooling only. Do not move backend, provisioning, peer, selector, DNS, Caddy/network ACL, DB, SMTP or release authority into the frontend.

## 3. Accepted frontend stack

```text
React
TypeScript
Vite
React Router
TanStack Query
React Hook Form
FastAPI OpenAPI -> generated TypeScript API contract/client
CSS Modules colocated with features/components
```

State rules:

- server-owned state -> TanStack Query;
- ordinary client-owned state -> React local state;
- shared client-owned concern -> context only when justified;
- Redux is NOT a foundation dependency; add it only for a concrete complex client-owned global-state problem.

Do not mirror all server state into a global client store.

## 4. Toolchain and dependency discipline

Current P27F1 build baseline:

```text
Node.js 24.20.0
npm 11.19.0
```

Canonical installs use the committed lockfile:

```bash
npm ci
```

Do not casually run `npm update`, regenerate the lockfile, change package manager, change Node major/minor or adopt npm `latest` versions during an unrelated task.

Once committed, package manifests + lockfile are authoritative for exact package versions. Compatibility matters more than following latest tags.

## 5. Required quality gates

Before presenting a change as ready, run the accepted equivalents of:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Production-ready web source must produce separate clean static outputs for `access` and `admin`.

Do not claim PASS if a required gate failed or was skipped. Report exactly what ran.

## 6. Build/deploy boundary

Production VM103 serves static compiled assets through Caddy. Node/npm are build-time only.

Do NOT introduce a Node production server, Next.js/SSR, another reverse proxy, or runtime package installation on VM103 merely because development uses React/Vite.

Canonical release model:

```text
canonical source commit
+ lockfile
+ pinned build toolchain
+ pinned OpenAPI contract
-> clean install
-> typecheck/lint/tests
-> deterministic build
-> exact dist hashes
-> ordinary WG STEP
-> VM103 static deployment
```

Codex does not deploy directly to production. Do not SSH to or mutate VM100/101/103/121/130 during normal `wg-paid-web` work.

## 7. Public/admin separation is mandatory

```text
access.secret-studio.ru -> public access app
admin.secret-studio.ru  -> private admin app
```

`access` and `admin` are separate build targets. The public bundle must NOT contain admin pages/routes/features hidden only by React routing, permissions or CSS.

Preserve security meaning:

- public `access` exposes intended auth/account APIs only;
- `/v2/admin/*` and `/v2/agent/*` stay absent from the public vhost;
- private admin requires trusted `wg_remote 10.250.100.0/24` network access;
- application admin auth/session + CSRF remains mandatory;
- VM103/Caddy/network/API allowlists remain the real security boundary.

Never weaken this for developer convenience.

## 8. API contract rules

VM121 FastAPI is the API/business authority.

Use FastAPI OpenAPI as the source for generated TypeScript request/response types and client bindings where practical. Do not maintain a second hand-written request/response contract that can silently drift.

Current P27F1 OpenAPI baseline:

```text
OpenAPI 3.1.0
operations = 40
schemas = 39
canonical SHA256 = e2ada374ad8e25db217380196ad2b1ae4d4050def84ef45566f28c758c6708f8
```

For an intentional backend-contract update:

1. deliberately replace the pinned OpenAPI input;
2. regenerate client/types;
3. review generated diff;
4. update call sites;
5. do not silently regenerate from an arbitrary live backend during unrelated builds.

Generated API code belongs in `packages/api` (or accepted equivalent). Do not hand-edit generated output when generator configuration can express the change.

## 9. Module and styling rules

Split by feature/responsibility, not arbitrary line counts.

Prefer cohesive units for:

- route/page composition;
- feature components;
- reusable UI primitives;
- query/mutation hooks;
- forms/validation;
- pure utilities;
- API adapters/generated client.

Avoid giant page scripts and monolithic components, but do not create meaningless one-function files solely to make files shorter.

Share code between `access` and `admin` only when it is genuinely semantically common. Avoid both duplication and premature abstraction.

Use colocated CSS Modules for component/feature styling. Global CSS is limited to design tokens, reset/normalization, typography/base defaults and truly global primitives.

Do not introduce another styling framework/design system unless the task explicitly owns that decision.

## 10. Public `access` functional parity

Migration is not a product-semantics rewrite.

Preserve routes:

```text
/                     login request
/invite               invite registration
/auth/magic#token=... magic-link consume
/account              authenticated cabinet
```

Preserve behavior:

- unknown-email normal login remains anti-enumerating;
- unknown users are created only through invite registration;
- mailbox magic link proves mailbox ownership;
- authenticated cookie/session behavior remains server-owned;
- CSRF remains required for relevant mutations;
- entitlement/quota comes from backend;
- account renders an arbitrary profile list, never fixed slots;
- each profile has its own Download config and Show QR;
- Add connection only when backend quota permits;
- Disable/Reissue/Logout semantics remain unchanged;
- polling/refetch is conditional and bounded, not permanent aggressive background polling.

### Magic-link secrecy

Keep the token in the URL fragment:

```text
/auth/magic#token=...
```

Preserve fragment consume + history/URL clearing. Do not convert the token to a query parameter or expose it to server URL logs, analytics, telemetry or public evidence.

## 11. Profile/config invariants

`ConnectionProfile` = one logical device/connection.

Reissue = credential revision of the SAME logical profile, not a new quota slot.

Quota is numeric and backend/grant-derived; never hard-code a three-slot model.

Accepted near-term baseline:

```text
standard/default test-user package = 2 WireGuard profiles
ordinary intended use = phone + computer
```

The backend already supports multiple profiles and per-profile config/QR delivery, so frontend code must remain list-based and support arbitrary valid profile counts.

Current generated config contract:

```text
filename: SecretStudio-NN.conf
media type: application/octet-stream
DNS: 10.253.1.1
authenticated delivery
no-store
```

Preserve server-provided config filenames where available.

Never put real configs, private keys, PSKs or credential material in Git, logs, fixtures, screenshots, tests or public reports.

## 12. Private `admin` functional parity

Preserve:

- admin login/session/auth;
- CSRF;
- plans;
- invites;
- users;
- WireGuard profile-limit changes;
- staged Delete User;
- P27E16C bounded deleting-user auto-refresh;
- manual Refresh fallback.

Delete User remains backend-owned and staged:

```text
admin DELETE
-> mark deletion requested
-> revoke sessions/grants and relevant magic links
-> normal disable_profile jobs
-> VM100 actual peer removal
-> completion ACK
-> final User/Domain V2 cleanup only when safe
```

Legacy dependencies may block final deletion. Never add a frontend shortcut that performs a second DELETE, direct DB deletion, or loops destructive mutations.

For deletion polling, use bounded GET/refetch behavior only while deletion is active and stop on disappearance/terminal error/timeout/unmount. Manual Refresh remains available.

## 13. Server-state and polling rules

Prefer TanStack Query invalidation/refetch/polling over bespoke global timers.

Polling must be conditional and bounded:

- transitional profile/provisioning state only while transitional;
- deleting user only while deletion is active;
- stop on success, terminal error, timeout, logout/unmount or loss of relevance.

Do not add a new backend endpoint merely to satisfy a frontend-library preference when an existing endpoint is sufficient.

## 14. Secrets and sensitive data

Never commit or expose:

- passwords;
- private keys / WireGuard private keys / PSKs;
- real client configs;
- magic tokens;
- admin secrets;
- SMTP credentials;
- production session cookies;
- raw credential material;
- secret `.env` files.

Use synthetic fixtures only. Do not add analytics/logging that captures URL fragments, config bodies or credential-bearing responses.

## 15. Git/change discipline

Keep changes narrow and reviewable.

Before a non-trivial change, establish:

```text
WHAT CHANGES?
WHAT DOES NOT CHANGE?
WHICH OWNER/SURFACE OWNS IT?
WHAT NEW RISK IS INTRODUCED?
```

Do not mix unrelated classes of work, for example:

- framework migration + redesign;
- dependency upgrade + feature;
- access migration + admin security change;
- frontend refactor + backend schema mutation;
- formatting sweep + functional change.

Change summaries must include files/behavior changed, behavior intentionally unchanged, checks run/results, and remaining manual validation/risk.

## 16. Testing philosophy

Test newly introduced risk; do not re-prove unrelated accepted infrastructure invariants without an invalidation trigger.

A browser-only change normally does not require repeating:

- five-egress topology/recovery;
- zero-healthy recovery;
- active-only selector stress;
- production SMTP proof;
- Android filename/import proof;
- VM100 DNS/split-DNS proof.

For Web Foundation work focus on:

- reproducible build;
- routing;
- generated API compatibility;
- auth/session/CSRF;
- token secrecy;
- profile/config actions;
- public/admin separation;
- bounded polling;
- functional parity.

## 17. No direct production work from Codex

Normal agent work ends at source, tests, build output and reviewable Git changes.

Do NOT directly:

- deploy to VM103;
- restart Caddy/backend;
- edit VM121 DB/source;
- create/delete real users;
- issue/revoke real profiles;
- touch VM100/VM101 runtime;
- change DNS/firewall/routing;
- run destructive production E2E tests.

Production validation/deployment goes through the ordinary VM130 STEP/release workflow.

## 18. Pilot-ready direction

Do not block first controlled users on unrelated future features.

After functional parity:

```text
2-profile default
-> onboarding bootstraps two when quota permits
-> cabinet shows both
-> each downloads distinct config/QR
-> controlled real phone/computer proof
-> small pilot
-> regular read-only provisioning/runtime/resource observation
```

Per-profile expiry and automatic expiry follow the pilot-ready baseline. Initial controlled access can still be manually disabled.

Future AmneziaWG must reuse the existing User -> Grant -> ConnectionProfile -> credential -> provisioning model; do not create a parallel account, device-slot or selector system.

## 19. Out of scope unless explicitly requested

Do not spontaneously add/rewrite:

- payments/referrals/file storage;
- AmneziaWG;
- per-profile expiry;
- admin auth;
- backend framework/microservices;
- Next.js/SSR;
- Redux;
- Node production server;
- Caddy/network ACLs;
- VM100/VM101 selector/recovery;
- CLIENT001 infrastructure.

## 20. When uncertain

Do not guess across security or ownership boundaries.

If repository source + pinned OpenAPI + task do not establish a needed fact:

1. identify the missing fact precisely;
2. inspect canonical source/contract before probing production;
3. do not invent a new API or ownership model;
4. choose the smallest safe assumption or stop condition.

Goal: a boring, typed, modular frontend that preserves working product semantics and makes future expansion easier without weakening backend/network/release boundaries.
