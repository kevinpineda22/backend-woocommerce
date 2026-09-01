# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-location warehouse picking system backend (Node.js/Express) integrated with WooCommerce stores and Supabase (PostgreSQL). Deployed on Vercel as a serverless function.

**This repo is backend only.** The React frontend (picker / admin / auditor) lives in a separate repo at `Pagina-web_React` under `src/pages/ecommerce/`. It is not built, served, or deployed from here — there is no React dependency and `app.js` serves no static files.

## Commands

- **Dev server:** `npm run dev` (nodemon with auto-reload)
- **Production:** `npm start` (node app.js)
- **Run all tests (watch):** `npm test` (vitest)
- **Run tests once:** `npm run test:run`

Test files use `.test.js` suffix and live alongside the source files they test (`utils/`, `services/`, `controllers/`).

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
- `manifestPricing.js` — `calcLineCharge(item)` handles weighable pricing (KL/LB/500GR); mirrored as `ecommerce/shared/manifestPricing.js` (ESM), guarded by `utils/manifestPricing.test.js`
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
en_proceso → pendiente_auditoria → auditado → finalizado
           ↘ cancelado
```

`wc_picking_sessions.estado` drives this flow. `snapshot_pedidos` (JSONB) is written at session creation and is the source of truth during picking. `datos_salida` (JSONB) is written at audit completion and holds the final order state used for price variation analysis.

`auditado` is the "pending payment" tray (`getPendingPaymentSessions` filters on it). A session only reaches `finalizado` once **every** assignment has a non-null `metodo_pago` — and `finalizado` is what the revenue reports (`analyticsController`) and price-variation analysis (`variacionesController`) filter on. A single unresolved order therefore keeps its whole session out of the reports, including siblings that were already collected.

### Frontend (separate repo)

The React 19 + Vite app lives at `Pagina-web_React/src/pages/ecommerce/` — three role-based interfaces (`picker/`, `admin/`, `auditor/`) sharing `shared/` utilities. It calls this backend over HTTP at `https://backend-woocommerce.vercel.app/api` and is deployed independently. Edit UI there, not here.

### `ecommerce/shared/` — mirrored business rules only

This repo keeps exactly **three** files under `ecommerce/shared/`, ESM twins of backend CommonJS modules:

| Mirror | Backend twin | Guarded by |
|---|---|---|
| `weighableUnits.js` | `utils/weighableUnits.js` | `utils/weighableUnits.test.js` |
| `manifestPricing.js` | `utils/manifestPricing.js` | `utils/manifestPricing.test.js` |
| `paymentMethods.js` | `utils/paymentMethods.js` | `utils/paymentMethods.test.js` |

They exist because backend (CJS) and frontend (ESM) must agree on rules where a divergence costs money — weighable pricing already undercharged LB/500GR by half once. Each pair has a sync test that fails if the copies drift.

**The rule: nothing lives in `ecommerce/shared/` without a sync test.** Do not add UI, CSS, or components here — this repo does not build them. When you edit one of these three, edit its twin in `Pagina-web_React` too; nothing syncs automatically.

### Picking Workflow

1. Admin creates session → assigns picker + orders (max 10 active per picker) → WooCommerce data fetched and stored as `snapshot_pedidos`
2. Picker works from snapshot, scans/enters products → actions logged to `wc_log_picking` (`recolectado`, `sustituido`, `no_encontrado`, `reset`)
3. Offline mode: actions queued in localStorage (`offline_actions_queue`), applied optimistically to UI, synced when online
4. Auditor reviews picked items → calls `auditor/finalizar`
5. On audit completion → `syncWooService` sends a single batch PUT to WooCommerce updating all line items

### Database (Supabase/PostgreSQL)

No ORM — direct Supabase JS client queries. Key tables: `wc_sedes`, `wc_pickers`, `wc_picking_sessions`, `wc_asignaciones_pedidos`, `wc_log_picking`, `wc_audit_log`, `siesa_codigos_barras`, `profiles`.

### Payment Methods & Cartera (credit customers)

WooCommerce exposes payment on **two levels**, and confusing them causes real money bugs:

1. **Gateway** (`payment_method` / `payment_method_title`) — what the customer chose at checkout. Today: `cod` ("Contra entrega") and `cheque` ("Crédito"). ⚠️ The credit gateway's slug is **`cheque`** (a repurposed native Cheque Payments gateway), *not* `credito`.
2. **COD sub-mode** (`_billing_cod_payment_mode` meta) — how they'll pay at the door: `cash` / `card` / `qr`. It only makes sense inside contra-entrega; Woo writes the literal `na` when the gateway is something else.

**Gateway wins over sub-mode.** All of this lives in `utils/paymentMethods.js` (CJS) mirrored as `ecommerce/shared/paymentMethods.js` (ESM); `utils/paymentMethods.test.js` fails if the two copies diverge. Adding a gateway = one line in `GATEWAY_LABELS`, in both copies. Never read `_billing_cod_payment_mode` directly — call `resolvePaymentLabel()` / `isCreditoOrder()`.

The user-facing label is **"Cliente Crédito"**, never "Crédito" alone: a cashier reading "Crédito" interprets *credit card* and collects money on an order that is already invoiced on credit.

**Settlement model** (`utils/paymentSettlement.js`, pure/no-I/O):

| Column (`wc_asignaciones_pedidos`) | Answers |
|---|---|
| `metodo_pago` | How the charge is resolved → closes the operational session |
| `fecha_pago` | Whether the money actually arrived |

A credit order is `metodo_pago='credito'` + `fecha_pago=NULL`: session closes and enters the reports, while the debt stays live. `completeAuditSession` calls `autoResolveCreditoOrders()` (idempotent — only touches assignments with `metodo_pago IS NULL`, never overwrites a cashier). `settleSessionIfComplete()` is the single close criterion shared by the cashier path and the system path. Cartera endpoints: `GET /api/orders/cartera`, `POST /api/orders/cartera/marcar-cobrado`.

⚠️ **Landmine in `completeAuditSession`:** its `SELECT` doesn't request `snapshot_pedidos`, but the ghost-item block below does `session.snapshot_pedidos || []` — so that block is currently inert. Adding `snapshot_pedidos` to that `SELECT` wakes it up and starts inserting `no_encontrado` logs. The credit auto-resolution deliberately queries the snapshot separately to avoid this.

### Bot Order Detection

`utils/botDetection.js` (pure/no-I/O) scores every WooCommerce order against the signature of the spam orders that hit the store in August 2026 (#81334, #81339, #81375): generated names (`ganoacRfitohNzCCDwGSGxeA`), `"… LLC"` companies, non-numeric `_billing_document`, US-format phones, digit-less addresses. `evaluarRiesgoBot(order)` returns `{ sospechoso, puntaje, senales[] }`; `getPendingOrders` attaches it as `riesgo_bot`, and the admin card shows a `⚠️ POSIBLE BOT` tag.

Two rules hold this together:

1. **Weights are calibrated so no single signal reaches the 50-point threshold.** A real customer with one odd field (no cédula, a `@rogers.com` address) must never be flagged — a false positive cancels a real sale.
2. **It warns, it never blocks.** The order still lists and can still be dispatched. Cancelling is a human call.

Measured against 434 real orders (processing + completed + cancelled): 3 flagged, all 3 genuine bots, zero false positives. `utils/botDetection.test.js` pins the three real bot payloads and a set of real customer shapes; re-run it before touching any threshold.

⚠️ **The root cause is not fixed here.** The bots picked the `cheque` (Crédito) gateway precisely because it takes no payment — it is the open door of the checkout. The real fix is restricting that gateway to approved customer roles **in WooCommerce**, not in this repo.

### Barcode System

Products linked to SIESA ERP via `siesa_codigos_barras` table (keyed by `f120_id` = numeric SKU). Supports multiple barcodes per product grouped by `unidad_medida`. Barcode lookup is strict: if a product has a known presentation (P6, UND, KL), only barcodes for that exact `unidad_medida` are returned (no fallback to `_all`). Weighable items (fruver/carnicería) use GS1 prefix "29". Parsing logic lives in the frontend repo (`Pagina-web_React/src/pages/ecommerce/picker/modals/utils/gs1Utils.js`), which owns its own tests for it.

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

## Frontend

Not in this repo. UI code, styling conventions, and React rules live in `Pagina-web_React/CLAUDE.md`. The only frontend-facing files here are the three ESM mirrors in `ecommerce/shared/` described above — business rules, not UI.

One convention worth repeating because it costs money if broken: **green means collected.** Anything unpaid (credit / cartera) is amber, overdue is red.
