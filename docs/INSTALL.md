# Fresh Machine Installation Guide

This guide installs Safari Petty Cash on a Windows machine for local use. The application runs locally at `http://localhost:5177` and writes to the existing live Grist `PettyCashVouchers` document.

## Before you begin

You need:

1. A Windows user account with permission to run local applications.
2. Access to the Safari Grist server over the relevant network or ZeroTier connection.
3. An Authentik user who is already permitted to use the Petty Cash Web application and Grist.
4. The Grist base URL and a Grist API key with the permissions required by the web utility.
5. The Authentik OIDC application settings: issuer URL, client ID, and client secret.

Keep the API key, OIDC client secret, and session secret private. They belong only in the local `.env` file.

## 1. Install prerequisites

Install these once on the Windows machine:

1. [Git for Windows](https://git-scm.com/download/win)
2. [Node.js 20 LTS or later](https://nodejs.org/)

Open PowerShell and confirm both are available:

```powershell
git --version
node --version
```

The project currently has no third-party npm dependencies. Therefore, no `requirements.txt`, `npm install`, or Python installation is needed. `package.json` is the Node project manifest; if dependencies are added in the future, the project will include a `package-lock.json` and the guide will be updated.

## 2. Clone the repository

Choose a folder for local applications, then clone the repository:

```powershell
cd C:\Applications
git clone git@github.com:ibarot1981/safari-petty-cash.git
cd safari-petty-cash
```

If GitHub SSH has not been set up on that machine, use the HTTPS clone address instead:

```powershell
git clone https://github.com/ibarot1981/safari-petty-cash.git
```

Confirm that you are on the released branch and that the clone is clean:

```powershell
git switch main
git pull --ff-only origin main
git status --short
```

The last command should show no output.

## 3. Configure Authentik

The application uses the existing Authentik login. It does not have separate web-utility user accounts.

In the existing Authentik provider/application for Petty Cash Web, make sure this redirect URI is allowed for a local installation:

```text
http://localhost:5177/auth/callback
```

If the application will run on a different port, use that same port in both the redirect URI and the `.env` `PORT` value. Do not use a local callback URL from another machine.

The person performing this step needs access to the existing Authentik provider configuration. No new user or separate provider is required for normal local testing.

## 4. Create the local configuration file

From the project folder, copy the safe template:

```powershell
Copy-Item .env.example .env
```

Open `.env` in a text editor and set each value. Example shape only:

```text
OIDC_ISSUER_URL=http://your-authentik-server/application/o/petty-cash-web/
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_CALLBACK_URL=http://localhost:5177/auth/callback
SESSION_SECRET=create-a-long-random-private-value
DRY_RUN=false
PORT=5177
GRIST_BASE_URL=http://your-grist-server:8484
GRIST_API_KEY=your-grist-api-key
```

Generate a unique, long `SESSION_SECRET` for this installation. It signs browser sessions and must not be shared or committed.

`.env` is intentionally ignored by Git. Never commit, email, or upload it.

For a first non-writing check, set `DRY_RUN=true`. The application will validate a voucher without saving it to Grist. Set it back to `false` only after the check is successful.

## 5. Start the application

In Windows Explorer, open the cloned folder and double-click:

```text
StartServer.bat
```

The script starts the server in the background and records its process in `runtime\server.pid`. It also writes diagnostics to:

```text
runtime\server.log
runtime\server-error.log
```

Open this URL in a browser on the same machine:

```text
http://localhost:5177
```

You should be redirected to Authentik if you are not already signed in. After login, the Petty Cash entry page shows a green Grist-availability indicator before the form becomes usable.

## 6. Verify safely

1. Confirm the logged-in user is the expected Authentik user.
2. Confirm the Grist indicator is green.
3. With `DRY_RUN=true`, enter a small test voucher and confirm that the screen completes validation without writing data.
4. Change `DRY_RUN=false`, restart the server, and make one authorized test voucher if required by the rollout plan.
5. Confirm the voucher and its lines appear correctly in Grist.

Use `StopServer.bat` before changing `.env` or upgrading the project. Then use `StartServer.bat` again.

## 7. Stop the application

Double-click:

```text
StopServer.bat
```

It stops only the server process recorded for this project folder.

## Updating the application

From the project folder:

```powershell
git status --short
git switch main
git pull --ff-only origin main
```

If `git status --short` shows files, do not discard them automatically. Check whether `.env`, runtime logs, or an intentional local change is involved before proceeding. `.env` should remain local and is not changed by `git pull`.

After an update, restart the server. If a future update introduces npm dependencies, its release notes and `README.md` will state whether `npm install` is required.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Node.js was not found` | Install Node.js 20 LTS, close and reopen Windows Explorer or PowerShell, then run `node --version`. |
| Browser cannot open `localhost:5177` | Check `runtime\server-error.log`; make sure `StartServer.bat` was started from the correct folder. |
| Authentik reports redirect URI mismatch | Ensure `OIDC_CALLBACK_URL` exactly matches the redirect URI configured in Authentik, including `http`, host, port, and path. |
| Login works but Grist is unavailable | Confirm the machine can reach `GRIST_BASE_URL`, confirm ZeroTier/network access, and recheck `GRIST_API_KEY`. |
| Voucher saves fail | Check that `DRY_RUN` is set as intended, inspect `runtime\server-error.log`, then confirm the user’s Grist permissions and master-data selections. |
| Start script says server is already running | Open `http://localhost:5177` or run `StopServer.bat` before starting again. |

## Future network deployment

This guide is for local `localhost` use. If the server is later exposed through a ZeroTier IP or DuckDNS name, update the Authentik redirect URI and `OIDC_CALLBACK_URL` together. When HTTPS is introduced, set `COOKIE_SECURE=true` and retest login.
