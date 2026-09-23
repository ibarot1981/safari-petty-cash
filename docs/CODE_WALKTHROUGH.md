# Code Walkthrough

Update this document in the same pull request whenever a code path, UI workflow, configuration value, or file responsibility changes.

## Repository map

| Path | Responsibility |
| --- | --- |
| `public/index.html` | Single-page voucher-entry screen structure, forms, dialogs, tabs, and accessible labels. |
| `public/styles.css` | Safari visual system, responsive layout, combobox presentation, line-entry and status styling. |
| `public/app.js` | Browser state, custom keyboard comboboxes, validation, line construction, templates, duplicate warnings, recent/history displays, and API calls. |
| `server.mjs` | Node HTTP server, static-file delivery, environment loading, Authentik OIDC flow, sessions, and protected JSON API routes. |
| `gristClient.mjs` | Grist API adapter: reference data, searches, duplicate checks, parties, templates, voucher-number creation, validation, and transactional-style voucher writes. |
| `scripts/save-sample-web.mjs` | Developer sample payload for exercising the save path, preferably with `DRY_RUN=true`. |
| `StartServer.bat` / `StopServer.bat` | Double-click Windows server lifecycle helpers; runtime state is stored in `runtime/`. |
| `.env.example` | Safe configuration template. The actual `.env` must remain local. |
| `docs/INSTALL.md` | Detailed fresh-Windows-machine installation, configuration, verification, update, and troubleshooting guide. |
| `PettyCashVouchers-access-rules.md` | Human-readable Grist role and ACL reference. |

## Grist review pages

The live Grist document contains operational review pages alongside the web utility. `Receipt Vouchers` is permanently filtered to `PettyCashVouchers.Is_Current_Period_Receipt`, a formula that is true only when the voucher is a receipt and has no later locked cash closure. This means the register shows receipts dated after the latest locked closure, or all receipts when there is no locked closure. The header register visibly includes `Signed`; selecting a header filters the linked `VoucherLines` grid. This view does not write or transform voucher data.

## Runtime sequence

1. `StartServer.bat` first detects whether its server is already running. Before every new start, it verifies that the checkout is clean, on `main`, and not ahead of GitHub. It fetches `origin/main` and applies any fast-forward update before starting the server.
2. `StartServer.bat` starts `node server.mjs` in the background and records the process ID in `runtime/server.pid`.
3. `server.mjs` loads `.env`, reads the port (default `5177`), builds OIDC settings, and starts the HTTP server.
4. A browser requests `/`. Unauthenticated requests are redirected to `/login`; static assets are served only after authentication.
5. `/login` obtains OIDC discovery metadata, creates a state/nonce/PKCE verifier, and redirects to Authentik.
6. `/auth/callback` exchanges the authorization code, validates identity-token claims, and creates an HttpOnly signed session cookie.
7. `public/app.js` loads `/api/me`, `/api/health`, and reference data. It shows the entry form only while Grist is reachable.
8. On save or update, the browser validates the entry and posts a complete voucher payload to the server.
9. The server calls `gristClient.mjs`, which validates against current Grist records immediately before writing headers, lines, participants, and allocations.

## Browser application: `public/app.js`

The browser keeps transient form data in a single `state` object. It never talks directly to Grist and never receives the Grist API key.

### Reference-data entry controls

`setupCombobox` creates the custom master-data controls used for Voucher Purpose, party, location, Expense Head, employee selection, and templates. The control supports focus-to-open, arrow navigation, Enter, numeric selection, type-ahead matching, highlighted results, and scrolling the active option into view.

Voucher Purpose records are filtered by `Allowed_Voucher_Type`. Expense Head options are assembled from active master data and `VoucherPurposeExpenseHeads`: mapped heads are displayed in a suggested group above other active heads.

### Header and line model

`selectedHeader` reads the voucher header fields. `lineDraft` reads the line editor. `validateHeader`, `validateLine`, and numeric/date helpers reject missing, invalid, or inconsistent data before any request is sent.

The line editor creates local line records. `renderLines` displays entered lines above the editor so the current voucher remains visible while adding more. A single-person line defaults to the selected employee party. A multiple-person line uses the selected employee list and is saved as equal allocations.

### Save, edit, and templates

New voucher save posts the complete form. Edit mode retrieves an existing unsigned, unlocked voucher via the server, fills the same entry form, and changes save to update. Templates retain reusable header structure and line metadata, but do not retain the current date, paid-to party, amount, or day-specific single-person target.

Before save, the application requests possible duplicates. The user can cancel and remain on the populated form or explicitly continue.

### User aids

The Recent Entries rail, party-history drawer, purpose-description suggestions, pinned/frequent sort order, near-party warning, and Expected Cash at Hand card are read-only entry aids. They must not change the financial result of a voucher. The cash card sits beside the New/Edit controls, shows the latest locked closure as its opening amount, and adds all saved receipts and subtracts all saved expenses after that close through today, regardless of signing status. It refreshes on load, after successful voucher creates and updates, on window focus, every 60 seconds, and with manual refresh actions. Refresh failures retain the last successful value and mark it stale.

## Server: `server.mjs`

The server uses Node built-in modules rather than a framework. It owns authentication and protects non-public routes using `requireAuth`.

Key responsibilities:

- Reads environment values from `.env` only when not already supplied by the process.
- Implements signed session cookies with `SESSION_SECRET`.
- Uses OIDC Authorization Code with PKCE for Authentik.
- Exposes health, current-user, reference-data, cash-position, search, party-history, duplicate-check, party-create, template, save, and update endpoints.
- Serves static files from `public/` with a restrictive path check.

Any new API endpoint must remain authenticated unless it is deliberately required before login. Never send Grist credentials to the browser.

## Grist integration: `gristClient.mjs`

`getGristConfig` obtains `GRIST_BASE_URL` and `GRIST_API_KEY` from the process environment. It has a legacy local-Codex configuration fallback; portable installations should configure both environment values in `.env`.

The fixed document ID is `moe5mP3wFHp6noNdS6FYh3`. `TABLES` is the central mapping of live Grist table IDs. Update it carefully if the Grist schema is renamed.

### Read paths

- `getReferenceData` reads master tables for form choices.
- `getRecentVouchers`, `searchVouchers`, and `getPartyVouchers` build read-only entry aids.
- `getCashPosition` calculates current expected cash from the latest locked closure and all saved current-period vouchers through today. `calculateCashPosition` contains the independently tested calculation logic.
- `findDuplicateVouchers` identifies possible, not certain, duplicates.
- `getVoucherForEdit` retrieves a header with its lines and allocations, then checks whether it remains editable.

### Write paths

- `addParty` adds a confirmed unknown party to `Parties`.
- `saveTemplate` writes a template header and template lines.
- `saveVoucher` assigns the next voucher number, validates header/lines/references, then writes the header, participants, lines, and allocations.
- `updateVoucher` repeats the editability check immediately before replacing mutable voucher detail rows and updating the header.

The validation helpers verify controlled references, dates, monetary values, active records, permitted split methods, and equal-split employee participation. Changes here must be tested with special care because they safeguard the live tables.

## Configuration

Required Authentik values are `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_CALLBACK_URL`, and `SESSION_SECRET`. `GRIST_BASE_URL` and `GRIST_API_KEY` are recommended for portable use. `DRY_RUN=true` prevents writes at the server level. `PORT` defaults to `5177`.

Use `COOKIE_SECURE=true` only once the deployment is served over HTTPS.

## Change checklist

1. Begin from a clean, up-to-date `main` and create a new branch.
2. Identify whether the change affects browser behavior, server authorization, Grist writes, configuration, or documentation.
3. Keep validation at both browser and server/Grist-client layers for data-integrity rules.
4. Test the affected workflow, using `DRY_RUN=true` before real writes where suitable.
5. Update this walkthrough and the requirements document when applicable.
6. Open a pull request; do not merge directly into `main`.
