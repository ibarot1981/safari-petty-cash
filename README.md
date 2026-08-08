# Petty Cash Voucher Entry Web Utility

Small web entry utility for the live Grist petty cash model.

The web utility writes to the live petty-cash tables in the existing `PettyCashVouchers` Grist document.

The web utility uses master-backed numbered pick lists for Voucher Purpose, Paid To, Location, Expense Head, templates, and allocation choices. New Paid To parties may be added from the entry flow; Voucher Purpose, Expense Head, and Location masters remain controlled outside the normal entry screen.

Master-backed pick lists use a custom keyboard-first combobox. The list opens on focus, supports arrow keys, Enter selection, number selection such as `4` then Enter, type-ahead filtering with highlighted matches, pinned sections where available, and invalid-value highlighting for controlled master fields.

Purpose / Description also supports reusable master-backed suggestions. Suggestions are filtered by voucher type, and when set, by voucher purpose and location. The field remains free text, so users can type or edit anything after choosing a suggestion.

Voucher lines support `Single Person`, `Multiple Persons`, and `Head Only` splits. `Multiple Persons` is an equal split across employee parties only; rounding differences are added to the last selected employee.

Expense Head suggestions are controlled by the `VoucherPurposeExpenseHeads` Grist table. When a selected Voucher Purpose has mappings, the line Expense Head picker shows `Suggested Expense Heads` first and `Other Expense Heads` below; if no mappings exist, all active expense heads are shown normally.

Keyboard shortcuts are shown in the UI:

- `Ctrl+F2`: Save Voucher
- `Ctrl+F3`: Cancel / clear form
- `Ctrl+Enter`: Add Line
- `Ctrl+F5`: Save As Template
- `Ctrl+F6`: Use Template
- `Ctrl+F7`: Refresh Recent Entries

Templates may be saved from the current voucher structure and reused later. Template use prefills voucher type, purpose, description, location, expense heads, split methods, and line descriptions. Voucher date is always today's date when a template is applied; Paid To, amounts, and single-person line targets remain day-specific.

The entry screen also shows a read-only Recent Entries panel with the last 15 vouchers, so entry users can quickly spot possible duplicates before saving.

When a known Paid To / Received From party is selected, the header shows a small collapsible party-history drawer with the last 5 vouchers for that same party.

Before saving, the web utility checks for possible duplicates using voucher date, voucher type, paid/received party, voucher purpose, and total amount. Matching vouchers show a warning; if the user cancels, nothing is saved and the current entry remains on the page.

## Run Locally On Windows

1. Install [Node.js 20 or later](https://nodejs.org/).
2. Copy `.env.example` to `.env` and enter the Grist and Authentik values. The `.env` file is intentionally excluded from Git.
3. Double-click `StartServer.bat` in Windows Explorer.
4. Open `http://localhost:5177`.
5. Double-click `StopServer.bat` when you want to stop the local server.

The start script records only its own server process in `runtime/server.pid`, and writes diagnostics to `runtime/server.log` and `runtime/server-error.log`.

## Web Utility

```powershell
npm start
```

Open the local URL printed by the server, usually:

```text
http://localhost:5177
```

Dry-run mode is controlled at server startup with `DRY_RUN=true`. When enabled, the app validates and previews saves without writing to Grist, and the UI shows a read-only dry-run banner.

## Authentication

The main Web UI uses Authentik OAuth2/OIDC. Users are not created separately in this app; the app trusts the same Authentik identity used for Grist.

For local testing, create `poc-voucher-entry/.env` using `poc-voucher-entry/.env.example` as the shape:

```text
OIDC_ISSUER_URL=http://safcost.duckdns.org/application/o/petty-cash-web/
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_CALLBACK_URL=http://localhost:5177/auth/callback
SESSION_SECRET=change-this-to-a-long-random-value
DRY_RUN=false
```

While running over HTTP, cookies are `HttpOnly` and `SameSite=Lax`, but not `Secure`. If the app is later moved to HTTPS, set:

```text
COOKIE_SECURE=true
```

A no-auth fallback copy was created separately at:

```text
C:\Users\ibaro\Documents\Codex\2026-07-08\can\poc-voucher-entry-no-auth-20260801-125102
```

To validate a sample web voucher payload without writing to Grist:

```powershell
npm run sample:web
```

## Docker

Build:

```powershell
docker build -t petty-cash-web .
```

Run:

```powershell
docker run --rm -p 5177:5177 -e GRIST_BASE_URL=http://safcost.duckdns.org:8484 -e GRIST_API_KEY=your-api-key petty-cash-web
```

## Configuration

The tools read `GRIST_BASE_URL` and `GRIST_API_KEY` from the environment first. If those are not set, they read the existing Codex Grist MCP configuration in:

```text
C:\Users\ibaro\.codex\config.toml
```

The document id is fixed to:

```text
moe5mP3wFHp6noNdS6FYh3
```
