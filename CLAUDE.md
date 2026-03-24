# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-location warehouse picking system backend (Node.js/Express) integrated with WooCommerce stores and Supabase (PostgreSQL). Includes embedded React frontend components for picker, admin, and auditor interfaces. Deployed on Vercel as a serverless function.

## Commands

- **Dev server:** `npm run dev` (nodemon with auto-reload)
- **Production:** `npm start` (node app.js)
- **No test suite or linter configured**

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
- `/api/analytics/*` → `routes/analyticsRoutes.js` — picker performance, heatmaps, route optimization
- `/api/webhooks/*` → `routes/webhookRoutes.js` — WooCommerce webhook receiver with HMAC-SHA256 verification

**Controllers** (`controllers/`) handle business logic: `sessionController`, `actionController`, `webhookController`, `dashboardController`, `analyticsController`, `productController`, `sedeController`, `adminController`.

**Services** (`services/`):
- `wooService.js` — singleton WooCommerce REST client (default store)
- `wooMultiService.js` — dynamic per-sede WooCommerce clients with in-memory caching (15s response TTL)
- `sedeConfig.js` — multi-location detection from order metadata, sede cache (5min TTL)
- `supabaseClient.js` — Supabase client (ES modules, service role key)
- `syncWooService.js` — syncs picking results back to WooCommerce (quantities, substitutions, weights)
- `siesaService.js` — barcode mapping from SIESA ERP system

**Middleware** (`middleware/sedeMiddleware.js`): injects `req.sedeId`, `req.sedeName`, `req.isAllSedes` from `X-Sede-ID` header, query params (`sede_id`, `sede_slug`), or special `todas/all` super-admin mode. Applied to all order routes but NOT webhook routes.

### Multi-Sede (Multi-Location) Pattern

Core architectural concept. Each sede has a UUID, slug, optional WooCommerce sub-site URL, and metadata mapping rules (`woo_meta_match`). The system detects which sede an order belongs to by searching order `meta_data` for keys like `_sede`, `_branch`, `_pickup_location`, etc. (priority order defined in `sedeConfig.js`).

### Frontend (React, embedded in `ecommerce/`)

Three role-based interfaces sharing `ecommerce/shared/` utilities:
- **`ecommerce/picker/`** — warehouse staff picking interface with barcode scanning, offline queue (localStorage), session timer
- **`ecommerce/admin/`** — dashboard for session monitoring, order management, picker analytics, warehouse map
- **`ecommerce/auditor/`** — quality control verification of picked items

Key hooks: `usePickerSession` (session state + offline queue), `useOfflineQueue` (localStorage action queue), `useRealtimeOrders` (Supabase broadcast channel subscriptions).

API client: `ecommerce/shared/ecommerceApi.js` — Axios instances with auto cache-busting on GET requests.

### Picking Workflow

1. Admin creates session → assigns picker + orders → snapshot stored in `wc_picking_sessions.snapshot_pedidos`
2. Picker works from snapshot, scans/enters products → actions logged to `wc_log_picking`
3. Offline mode: actions queued in localStorage, synced when online
4. Auditor reviews picked items
5. On completion → `syncWooService` updates WooCommerce order line items

### Database (Supabase/PostgreSQL)

No ORM — direct Supabase JS client queries. Key tables: `wc_sedes`, `wc_pickers`, `wc_picking_sessions`, `wc_asignaciones_pedidos`, `wc_log_picking`, `siesa_codigos_barras`, `profiles`.

### Barcode System

Products linked to SIESA ERP. Supports multiple barcodes per product (EAN-13 preferred). Weighable items (fruver/carnicería) use GS1 prefix "29". Parsing logic in `ecommerce/picker/modals/utils/gs1Utils.js`.

### Aisle Routing

`tools/mapeadorPasillos.js` maps WooCommerce categories to 14 physical aisles (P1-P14) with serpentine route optimization.

## Deployment

Vercel serverless (see `vercel.json`): single function from `app.js`, 50MB max body, 60s max duration. All routes funnel through the Express app.

## Conventions

- Database columns use snake_case (`id_pedido`, `id_picker`); JS uses camelCase
- UUIDs for primary keys, ISO 8601 timestamps
- Soft deletes via `is_removed` flags
- Controllers use try-catch with console error logging and HTTP status responses
- Sede middleware fails gracefully (non-blocking)
- Language: codebase mixes Spanish naming (controllers, routes, DB fields) with English patterns
