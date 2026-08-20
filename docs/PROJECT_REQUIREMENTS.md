# Project Requirements

## Purpose

Safari Petty Cash is a keyboard-friendly web utility for recording petty-cash receipts and expenses in the live Grist `PettyCashVouchers` document. It complements Grist entry and review pages; it does not replace Grist as the system of record.

## Core business model

- A voucher is either an `Expense` (cash going out) or a `Receipt` (cash coming in).
- Each voucher has one header: voucher number, date, type, voucher purpose, paid-to/received-from party, location, and description.
- One voucher can have one or more expense lines.
- Each expense line has an Expense Head, amount, description, and allocation method.
- Allocation supports `Single Person`, `Multiple Persons`, and `Head Only`.
- Multiple-person allocation is an equal split among selected employee parties; any rounding difference is applied to the last participant.
- A single-person line automatically uses the header party when that party is an employee. The user can still choose a different valid person where appropriate.

## Master-data rules

- Voucher Purposes, Expense Heads, and Locations are controlled master data maintained in Grist by authorized users.
- Paid To / Received From normally comes from the Parties master. The web utility may add a new party after user confirmation, including a near-match warning to reduce duplicate names.
- Voucher Purpose filtering respects the voucher type: expense purposes for expenses and receipt purposes for receipts.
- Expense Head suggestions are driven by `VoucherPurposeExpenseHeads`. Mapped heads are shown first; remaining active heads remain available. If a purpose has no mapping, all active Expense Heads are shown.
- Purpose/description suggestions are reusable, context-aware entry aids. A user may still enter free text.

## Voucher lifecycle and controls

- Voucher numbers are assigned at save time in entry sequence, using `YY-MMM-0001` through `YY-MMM-9999`; the voucher date does not determine the sequence.
- Voucher number must be present, unique, and match the required format.
- The browser warns about potential duplicates using date, type, party, voucher purpose, and total amount. A warning is not an automatic rejection because legitimate repeats exist.
- Saved vouchers may be edited only while unsigned and not locked by a cash closure. The server rechecks this restriction immediately before update.
- Signing and cash-closure authority remain governed by Grist access rules. The web utility must not bypass them.

## Entry experience

- Entry must be usable mainly with a keyboard: Tab/Shift+Tab, arrow navigation, Enter selection, numeric item selection, type-ahead filtering, and visible shortcuts.
- Master-data pickers open on focus, provide numbered choices, highlight matches, and keep pinned/frequently used items near the top where configured.
- Users can add lines, review the voucher, save, cancel, save a reusable template, or apply an existing template.
- Applying a template fills its reusable header and line structure. Voucher date is today; party, amounts, and day-specific person choices remain for the user to enter.
- Recent vouchers and party history are compact, collapsible read-only aids intended to prevent duplicate entry.

## Authentication and deployment

- Users authenticate with the existing Authentik OIDC provider. The web utility does not maintain a separate user directory.
- Production authorization remains aligned with Grist users and roles.
- Local Windows operation is supported with `StartServer.bat` and `StopServer.bat`.
- Docker packaging is a future deployment option, not the current release path.
- Secrets and environment-specific settings are supplied through `.env`, never Git.

## Reporting and review context

Grist remains responsible for closure, signing review, detailed voucher review, and reports such as who spent how much, at which location, for which purpose, and under which Expense Head. Supporting page and access-rule design is recorded in `PettyCashVouchers-access-rules.md` and the Grist document itself.

The Grist `Receipt Vouchers` page provides a receipt-only register through a voucher-type selector. Its receipt register includes the `Signed` status and opens linked voucher lines for the selected receipt.
