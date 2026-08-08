# Safari Petty Cash: Contributor Guide

## Project purpose

This repository contains the authenticated web utility used to enter and edit petty-cash vouchers in the live Grist document `PettyCashVouchers`.

The application writes to live financial-operational data. Treat any change to voucher validation, save/update logic, authentication, or Grist table interaction as high impact.

## Mandatory Git workflow

Every code change and every documentation change must be delivered through a new pull request. Do not commit directly to `main` and do not push directly to `main`.

At the beginning of every new chat or task:

1. Inspect `git status --short`, the current branch, remotes, and recent commits.
2. Fetch `origin` and confirm that local `main` is clean and aligned with `origin/main`.
3. If `main` is dirty, behind, ahead, or diverged, stop and explain the condition before editing anything.
4. Create a new descriptive branch from the verified `main` branch.
5. Keep the pull request focused on one purpose and include validation evidence in its description.
6. When creating a pull request, provide a ready-to-paste PR description. It must state what changed, why it changed, user or operational impact, validation performed, and any remaining risks, assumptions, or follow-up work.

Suggested branch names: `fix/...`, `feature/...`, `docs/...`, or `chore/...`.

## Required documentation maintenance

For every change, update the relevant project documentation in the same pull request:

- Update `docs/CODE_WALKTHROUGH.md` when files, data flow, architecture, user workflow, or configuration behavior changes.
- Update `docs/PROJECT_REQUIREMENTS.md` when a user-facing requirement or business rule changes.
- Update `README.md` when installation, startup, configuration, or operator instructions change.

## Safety rules

- Never commit `.env`, API keys, OIDC secrets, session secrets, logs, runtime PID files, or temporary no-auth copies.
- Do not modify Grist schema, live records, formulas, ACLs, or production configuration unless the task explicitly authorizes it.
- Preserve existing data and unrelated working-tree changes. Do not use destructive Git commands such as `git reset --hard`.
- Do not weaken authentication or add a no-auth fallback to the repository.
- Keep `DRY_RUN` controlled at server startup, not as an ordinary entry-user setting.

## Verification expectations

Run the narrowest relevant checks before opening a pull request. At minimum, perform JavaScript syntax checks where the environment permits them and test the affected browser workflow. For changes that can write to Grist, prefer `DRY_RUN=true` first; use live writes only when explicitly requested.

Record any validation that could not be run and why in the pull request.

## Key references

- `README.md`: install and run instructions.
- `docs/PROJECT_REQUIREMENTS.md`: agreed product and operating requirements.
- `docs/CODE_WALKTHROUGH.md`: maintained technical map of the codebase.
- `PettyCashVouchers-access-rules.md`: Grist-role and access-rule reference.
