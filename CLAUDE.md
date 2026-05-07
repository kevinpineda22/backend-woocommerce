# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-location warehouse picking system backend (Node.js/Express) integrated with WooCommerce stores and Supabase (PostgreSQL). Includes embedded React frontend components for picker, admin, and auditor interfaces. Deployed on Vercel as a serverless function.

## Commands

- **Dev server:** `npm run dev` (nodemon with auto-reload)
- **Production:** `npm start` (node app.js)
- **Run all tests (watch):** `npm test` (vitest)
- **Run tests once:** `npm run test:run`

Test files use `.test.js` suffix and live alongside the source files they test (`utils/`, `services/`, `controllers/`, `ecommerce/picker/modals/utils/`).

## Environment Variables

Required in `.env` (no `.env.example` exists):
- `PORT` — Server port (default 3000)
- `WC_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET` — WooCommerce OAuth 1.0a
- `WC_WEBHOOK_SECRET` — HMAC-SHA256 webhook verification
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_JWT_SECRET` — Supabase credentials

## Architecture

### Backend (Express 5)

**Entry point:** `app.js` — sets up CORS, JSON parsing, raw body capture for webhooks, and mounts three routers.

**Route structure:**
- `/api/orders/*` → `routes/orderRoutes.js` — picking sessions, actions, products, dashboard, admin, sede management
- `/api/analytics/*` → `routes/analyticsRoutes.js` — picker performance, heatmaps, route optimization, price variations
- `/api/webhooks/*` → `routes/webhookRoutes.js` — WooCommerce webhook receiver with HMAC-SHA256 verification

**Controllers** (`controllers/`):
- `sessionController` — create/get/complete/cancel picking sessions; enforces the 10-order-per-picker limit
- `actionController` — register picking actions (recolectado/sustituido/no_encontrado/reset), barcode validation
- `productController` — product search, EAN fruver lookup
- `dashboardController` — active sessions, pending orders, pickers list, payment flows, audit completion; also contains debug endpoints `espiarPedido` and `diagnosticoWoo`
- `adminController` — admin overrides (remove/restore/force-pick items, cancel/restore orders)
- `sedeController` — CRUD for sedes, picker/user assignment, sede diagnostics
- `auditLogController` — read-only access to `wc_audit_log` timeline
- `analyticsController` — performance stats, heatmaps, route history
- `variacionesController` — price variation analysis between snapshot and final orders
- `pickingUtils.js` — shared helper: `agruparItemsParaPicking()` groups line items across orders into picking cards, keyed as `${productId}-${variationId}-${orderId}` to prevent cross-order merging

**Services** (`services/`):
- `wooService.js` — singleton WooCommerce REST client (default store)
- `wooMultiService.js` — dynamic per-sede WooCommerce clients with in-memory caching (15s response TTL); `getOrderFromAnySede()` scans all sedes when the seat of an order is unknown
- `sedeConfig.js` — multi-location detection from order metadata, sede cache (5min TTL); exports `resolveSedeId`, `getSedeFromWooOrder`, `extractSedeFromOrder`
- `supabaseClient.js` — Supabase client (service role key)
- `syncWooService.js` — syncs picking results back to WooCommerce via a single batch PUT on `orders/{id}` line items
- `siesaService.js` — barcode mapping from SIESA ERP system
- `auditService.js` — fire-and-forget logger (`logAuditEvent`); **never use `await`**; writes to `wc_audit_log`; resolves picker names from an in-memory cache (10min TTL)

**Utilities** (`utils/`):
- `manifestPricing.js` — `calcLineCharge(item)` handles weighable pricing (KL/LB/500GR); **this file is duplicated in `ecommerce/shared/manifestPricing.js` (ESM) and must be kept in sync**
- `barcode.js`, `barcodeFilter.js` — barcode validation and filtering logic
- `weighableUnits.js` — unit classification helpers
- `shippingMethod.js` — shipping method detection

**Middleware** (`middleware/sedeMiddleware.js`): injects `req.sedeId`, `req.sedeName`, `req.isAllSedes` from `X-Sede-ID` header, query params (`sede_id`, `sede_slug`), or special `todas/all` super-admin mode. Applied to all order and analytics routes but NOT webhook routes. Fails gracefully (non-blocking).

### Multi-Sede (Multi-Location) Pattern

Core architectural concept. Each sede has a UUID, slug, optional WooCommerce sub-site URL, and metadata mapping rules (`woo_meta_match`). The system detects which sede an order belongs to by searching order `meta_data` for keys like `_sede`, `_branch`, `_pickup_location`, etc. (priority order defined in `sedeConfig.js`). `resolveSedeId` matches against `woo_meta_match.meta_value`, slug, or sede name (partial).

### Picker Resolution Pattern

Pickers can be looked up by email or UUID throughout all controllers. The pattern is: if `id_picker` contains `@`, query by `email`; otherwise query by `id`. Always prefer `picker_email` field over `id_picker` when both are available. The resolved UUID is stored as `targetPickerId` and used for all DB writes.

### Session State Machine

```
en_proceso → pendiente_auditoria → finalizado
           ↘ cancelado
```

`wc_picking_sessions.estado` drives this flow. `snapshot_pedidos` (JSONB) is written at session creation and is the source of truth during picking. `datos_salida` (JSONB) is written at audit completion and holds the final order state used for price variation analysis.

### Frontend (React, embedded in `ecommerce/`)

Three role-based interfaces sharing `ecommerce/shared/` utilities:
- **`ecommerce/picker/`** — warehouse staff picking interface with barcode scanning, offline queue (localStorage), session timer
- **`ecommerce/admin/`** — dashboard for session monitoring, order management, picker analytics, warehouse map, price variations tab
- **`ecommerce/auditor/`** — quality control verification of picked items

Key hooks: `usePickerSession` (session state + offline queue), `useOfflineQueue` (localStorage action queue), `useRealtimeOrders` (Supabase broadcast channel subscriptions).

API client: `ecommerce/shared/ecommerceApi.js` — Axios instances hardcoded to `https://backend-woocommerce.vercel.app/api` with auto cache-busting on GET requests. The frontend `supabase` client is imported from `../../../../supabaseClient` (outside this repo).

### Picking Workflow

1. Admin creates session → assigns picker + orders (max 10 active per picker) → WooCommerce data fetched and stored as `snapshot_pedidos`
2. Picker works from snapshot, scans/enters products → actions logged to `wc_log_picking` (`recolectado`, `sustituido`, `no_encontrado`, `reset`)
3. Offline mode: actions queued in localStorage (`offline_actions_queue`), applied optimistically to UI, synced when online
4. Auditor reviews picked items → calls `auditor/finalizar`
5. On audit completion → `syncWooService` sends a single batch PUT to WooCommerce updating all line items

### Database (Supabase/PostgreSQL)

No ORM — direct Supabase JS client queries. Key tables: `wc_sedes`, `wc_pickers`, `wc_picking_sessions`, `wc_asignaciones_pedidos`, `wc_log_picking`, `wc_audit_log`, `siesa_codigos_barras`, `profiles`.

### Barcode System

Products linked to SIESA ERP via `siesa_codigos_barras` table (keyed by `f120_id` = numeric SKU). Supports multiple barcodes per product grouped by `unidad_medida`. Barcode lookup is strict: if a product has a known presentation (P6, UND, KL), only barcodes for that exact `unidad_medida` are returned (no fallback to `_all`). Weighable items (fruver/carnicería) use GS1 prefix "29". Parsing logic in `ecommerce/picker/modals/utils/gs1Utils.js`.

### Aisle Routing

`tools/mapeadorPasillos.js` maps WooCommerce categories to physical aisles per sede with serpentine route optimization. Each sede defines its own aisle layout; the `sedeSlug` is passed to `obtenerInfoPasillo(categories, name, sedeSlug)` to get the correct aisle and priority.

## Deployment

Vercel serverless (see `vercel.json`): single function from `app.js`, 50MB max body, 60s max duration. All routes funnel through the Express app.

## Conventions

- Database columns use snake_case (`id_pedido`, `id_picker`); JS uses camelCase
- UUIDs for primary keys, ISO 8601 timestamps
- Soft deletes via `is_removed` flags on line items inside JSONB snapshots; `activa` flag on `wc_sedes`
- Controllers use try-catch with `console.error` logging and HTTP status responses
- Audit events use dot-namespaced actions: `session.created`, `item.picked`, `payment.marked`, etc.
- Language: codebase mixes Spanish naming (controllers, routes, DB fields) with English patterns

## Frontend Style Rules (ecommerce/)

### React 19

- **No manual memoization.** Never use `useMemo` or `useCallback` — the React Compiler handles optimization automatically.
- **Named imports only.** `import { useState, useEffect } from "react"` — never `import React from "react"` or `import * as React`.
- **`ref` as a plain prop.** No `forwardRef` — pass `ref` directly like any other prop.
- **Prefer `use()` hook** over `useContext` when reading context conditionally, and over `.then()` when unwrapping promises inside components.
- **`useActionState`** for form submissions with pending state instead of manual `useState` + `try/catch` in handlers.

### TypeScript

- **Const types pattern** — always define a `const` object first, then derive the type with `(typeof X)[keyof typeof X]`. Never write raw union strings (`"active" | "inactive"`).
- **Flat interfaces** — one level of depth per interface; nest by reference, not inline.
- **Never `any`** — use `unknown` for truly opaque values, generics for flexible types.
- **`import type`** for type-only imports: `import type { User } from "./types"`.
- Use utility types (`Pick`, `Omit`, `Partial`, `Record`, `ReturnType`, etc.) instead of re-declaring shapes.

### Tailwind CSS 4

Styling decision order:
1. Tailwind class exists → `className="..."`
2. Conditional/conflicting classes → `cn("base", condition && "variant")`
3. Truly dynamic value → `style={{ width: \`${x}%\` }}`
4. Third-party lib that can't accept `className` → constant object with `var(--token)` used in the `style`/prop

Rules:
- **Never `var()` inside `className`** — use semantic Tailwind classes (`bg-primary`, not `bg-[var(--color-primary)]`).
- **Never hex colors in `className`** — use Tailwind color classes (`text-white`, not `text-[#fff]`).
- **`cn()` only when needed** — static classes use plain `className="..."` without wrapping in `cn()`.
- Arbitrary values (`w-[327px]`) are fine for one-off layout values; never for colors.

### Zustand 5

- Stores are typed with a dedicated interface: `create<MyStore>((set) => ({ ... }))`.
- **Select specific fields** to avoid unnecessary re-renders: `useStore((s) => s.field)`.
- **Multiple fields** → use `useShallow`: `useStore(useShallow((s) => ({ a: s.a, b: s.b })))`. Never destructure the whole store.
- **Async actions** live inside the store (set loading/error state around the fetch).
- Split large stores into **slices** (`createUserSlice`, `createCartSlice`) composed in a single `create` call.
- Use `persist` middleware for data that must survive page reload (replaces raw `localStorage` access in new code).
- Access state outside components via `useStore.getState()`; subscribe with `useStore.subscribe()`.
