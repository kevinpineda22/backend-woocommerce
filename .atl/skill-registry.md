# Skill Registry

**Generated**: 2026-03-31
**Project**: backend-woocommerce

## User Skills (Global)

### PR Workflow
- **Skill**: `branch-pr`
- **Trigger**: Creating pull requests or preparing changes for review
- **Applies to**: All code changes, especially multi-file refactors
- **Key rules**: Every PR must link an approved issue, one `type:*` label, conventional commits

### Issue Workflow
- **Skill**: `issue-creation`
- **Trigger**: Creating GitHub issues, reporting bugs, or requesting features
- **Applies to**: Initial problem statements before implementation
- **Key rules**: Use templates (bug report or feature request), requires maintainer approval

### Code Review
- **Skill**: `judgment-day`
- **Trigger**: Complex code review or validation of implementation
- **Applies to**: Multi-file changes, architectural decisions, critical logic
- **Key rules**: Parallel independent review via sub-agents, synthesis of findings

### Skill Creation
- **Skill**: `skill-creator`
- **Trigger**: Creating new AI agent skills
- **Applies to**: Establishing new patterns or conventions for future sessions

### Go Testing (User-level, not used in Node.js project)
- **Skill**: `go-testing`
- **Trigger**: Go test writing, Bubbletea TUI testing
- **Applies to**: N/A — Node.js project, skip this

## Project Conventions

### CLAUDE.md
- **Path**: `C:\Users\1\Desktop\BACKEND\backend-woocommerce\CLAUDE.md`
- **Type**: Project conventions and architecture documentation
- **Key content**:
  - Multi-location warehouse picking system (Node.js/Express + React + Supabase)
  - Multi-sede architecture with dynamic WooCommerce clients
  - No test suite or linter configured
  - Environment: npm run dev (dev), npm start (prod)
  - Barcode system with GS1 prefix parsing
  - Picking workflow with offline queue support

## Compact Rules (for sub-agents)

### Code Style & Conventions
- Use camelCase for JS variables/functions
- Use snake_case for database columns
- Mix of Spanish and English in naming (controllers/routes use Spanish)
- Controllers use try-catch with console.error logging
- No ORM — direct Supabase JS client queries

### Architecture & Patterns
- **Multi-sede pattern**: Core architectural concept — dynamic WooCommerce clients per location
- **Middleware**: `sedeMiddleware.js` injects `req.sedeId`, `req.sedeName`, `req.isAllSedes`
- **Frontend patterns**: Container-presentational (picker, admin, auditor interfaces)
- **Offline support**: localStorage queue + sync on online via `useOfflineQueue`
- **Real-time updates**: Supabase broadcast channels via `useRealtimeOrders`

### Database & Queries
- Supabase/PostgreSQL (no ORM)
- Soft deletes via `is_removed` flags
- UUID primary keys, ISO 8601 timestamps
- Key tables: `wc_sedes`, `wc_pickers`, `wc_picking_sessions`, `wc_asignaciones_pedidos`, `wc_log_picking`, `siesa_codigos_barras`

### Testing
- **Status**: No test runner configured
- **Recommendation**: For SDD to work optimally, project needs Jest, Vitest, or Mocha configured
- **Strict TDD Mode**: Disabled (no test infrastructure available)

## Skill Injection Rules

| Context | Skills to Inject |
|---------|-----------------|
| Creating PR or branch | `branch-pr` |
| Creating issue or bug report | `issue-creation` |
| Code review of multi-file changes | `judgment-day` |
| Creating new SDD skills | `skill-creator` |
| Go code (not applicable to this project) | `go-testing` — skip |

## Notes for Sub-Agents

- This is a Node.js + React + Supabase stack with NO linting/testing configured
- Multi-sede architecture is the core business logic — understand this before proposing changes
- Frontend is embedded in `ecommerce/` with role-based interfaces (picker, admin, auditor)
- Backend follows Express 5 patterns with direct Supabase queries (no ORM)
- Offline-first design for the picking interface — localStorage + sync is critical
- Barcode system uses SIESA ERP with GS1 prefix parsing for weighable items
