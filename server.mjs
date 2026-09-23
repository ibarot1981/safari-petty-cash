import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addParty, findDuplicateVouchers, getCashPosition, getPartyVouchers, getRecentVouchers, getReferenceData, getVoucherForEdit, saveTemplate, saveVoucher, searchVouchers, updateVoucher } from "./gristClient.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
loadEnvFile(path.join(__dirname, ".env"));
const port = Number(process.env.PORT || 5177);
const sessions = new Map();
const authConfig = getAuthConfig();
const appConfig = {
  dryRun: process.env.DRY_RUN === "true",
};
let oidcDiscovery;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".json": "application/json; charset=utf-8",
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) return;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  });
}

function getAuthConfig() {
  const required = ["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_CALLBACK_URL", "SESSION_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  return {
    enabled: missing.length === 0,
    missing,
    issuerUrl: process.env.OIDC_ISSUER_URL?.replace(/\/$/, ""),
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    callbackUrl: process.env.OIDC_CALLBACK_URL,
    sessionSecret: process.env.SESSION_SECRET,
    cookieSecure: process.env.COOKIE_SECURE === "true",
  };
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .map((cookie) => {
      const index = cookie.indexOf("=");
      return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
    }));
}

function sign(value) {
  return crypto.createHmac("sha256", authConfig.sessionSecret).update(value).digest("base64url");
}

function signedCookieValue(value) {
  return `${value}.${sign(value)}`;
}

function verifySignedCookie(value) {
  const [sessionId, signature] = String(value || "").split(".");
  if (!sessionId || !signature) return "";
  const expected = sign(sessionId);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return "";
  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  return valid ? sessionId : "";
}

function cookieOptions({ maxAge = 8 * 60 * 60 } = {}) {
  const parts = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (authConfig.cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

function setCookie(response, name, value, options = {}) {
  const existing = response.getHeader("Set-Cookie");
  const next = `${name}=${encodeURIComponent(value)}; ${cookieOptions(options)}`;
  response.setHeader("Set-Cookie", existing ? [...(Array.isArray(existing) ? existing : [existing]), next] : next);
}

function clearCookie(response, name) {
  setCookie(response, name, "", { maxAge: 0 });
}

function currentUser(request) {
  if (!authConfig.enabled) return null;
  const sessionId = verifySignedCookie(parseCookies(request).pc_session);
  return sessionId ? sessions.get(sessionId)?.user || null : null;
}

function isPublicPath(pathname) {
  return pathname === "/login"
    || pathname === "/auth/callback"
    || pathname === "/auth/status"
    || pathname.startsWith("/assets/")
    || pathname === "/styles.css"
    || pathname === "/app.js";
}

function requireAuth(request, response, pathname) {
  if (!authConfig.enabled) {
    if (pathname.startsWith("/api/")) {
      sendJson(response, 503, { error: `Authentication is not configured. Missing: ${authConfig.missing.join(", ")}` });
      return null;
    }
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Authentication is not configured. Missing: ${authConfig.missing.join(", ")}`);
    return null;
  }

  const user = currentUser(request);
  if (user) return user;

  if (pathname.startsWith("/api/")) {
    sendJson(response, 401, { error: "Authentication required." });
    return null;
  }
  redirect(response, `/login?returnTo=${encodeURIComponent(request.url || "/")}`);
  return null;
}

async function getDiscovery() {
  if (!oidcDiscovery) {
    const response = await fetch(`${authConfig.issuerUrl}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw new Error(`Could not load Authentik OIDC discovery document (${response.status}).`);
    }
    oidcDiscovery = await response.json();
  }
  return oidcDiscovery;
}

function randomValue() {
  return crypto.randomBytes(32).toString("base64url");
}

function normalizeReturnTo(value) {
  if (!value || !String(value).startsWith("/") || String(value).startsWith("//")) return "/";
  return value;
}

async function beginLogin(request, response) {
  if (!authConfig.enabled) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Authentication is not configured. Missing: ${authConfig.missing.join(", ")}`);
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const discovery = await getDiscovery();
  const state = randomValue();
  const nonce = randomValue();
  const verifier = randomValue();
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const loginId = randomValue();
  sessions.set(`login:${loginId}`, {
    state,
    nonce,
    verifier,
    returnTo: normalizeReturnTo(requestUrl.searchParams.get("returnTo")),
    createdAt: Date.now(),
  });
  setCookie(response, "pc_login", signedCookieValue(loginId), { maxAge: 10 * 60 });

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", authConfig.clientId);
  url.searchParams.set("redirect_uri", authConfig.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  redirect(response, url.toString());
}

async function exchangeCodeForUser(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const loginId = verifySignedCookie(parseCookies(request).pc_login);
  const login = sessions.get(`login:${loginId}`);
  sessions.delete(`login:${loginId}`);
  clearCookie(response, "pc_login");

  if (!login || login.state !== requestUrl.searchParams.get("state")) {
    throw new Error("Login session expired or did not match.");
  }
  if (requestUrl.searchParams.get("error")) {
    throw new Error(requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error"));
  }

  const discovery = await getDiscovery();
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${authConfig.clientId}:${authConfig.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: requestUrl.searchParams.get("code") || "",
      redirect_uri: authConfig.callbackUrl,
      code_verifier: login.verifier,
    }),
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(tokenBody.error_description || tokenBody.error || "Token exchange failed.");
  }

  const userInfoResponse = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  const userInfo = await userInfoResponse.json();
  if (!userInfoResponse.ok) {
    throw new Error(userInfo.error_description || userInfo.error || "Could not load user profile.");
  }

  const sessionId = randomValue();
  sessions.set(sessionId, {
    user: {
      sub: userInfo.sub,
      email: userInfo.email || "",
      name: userInfo.name || userInfo.preferred_username || userInfo.email || "Authenticated user",
      username: userInfo.preferred_username || "",
      groups: userInfo.groups || [],
    },
    createdAt: Date.now(),
  });
  setCookie(response, "pc_session", signedCookieValue(sessionId));
  redirect(response, login.returnTo || "/");
}

function logout(request, response) {
  const sessionId = verifySignedCookie(parseCookies(request).pc_session);
  if (sessionId) sessions.delete(sessionId);
  clearCookie(response, "pc_session");
  redirect(response, "/login");
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requestedPath));
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (request.method === "GET" && pathname === "/login") {
      await beginLogin(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/auth/callback") {
      await exchangeCodeForUser(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/logout") {
      logout(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/auth/status") {
      sendJson(response, 200, { enabled: authConfig.enabled, missing: authConfig.enabled ? [] : authConfig.missing });
      return;
    }

    if (!isPublicPath(pathname) && !requireAuth(request, response, pathname)) {
      return;
    }

    if (request.method === "GET" && pathname === "/api/me") {
      sendJson(response, 200, { user: currentUser(request) });
      return;
    }

    if (request.method === "GET" && pathname === "/api/config") {
      sendJson(response, 200, { dryRun: appConfig.dryRun });
      return;
    }

    if (request.method === "GET" && pathname === "/api/health") {
      try {
        await getReferenceData();
        sendJson(response, 200, { gristAvailable: true, checkedAt: new Date().toISOString() });
      } catch (error) {
        sendJson(response, 503, {
          gristAvailable: false,
          checkedAt: new Date().toISOString(),
          error: error.message,
        });
      }
      return;
    }

    if (request.method === "GET" && request.url === "/api/reference-data") {
      sendJson(response, 200, await getReferenceData());
      return;
    }

    if (request.method === "GET" && request.url.startsWith("/api/recent-vouchers")) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      sendJson(response, 200, await getRecentVouchers(Number(url.searchParams.get("limit") || 15)));
      return;
    }

    if (request.method === "GET" && pathname === "/api/cash-position") {
      sendJson(response, 200, await getCashPosition());
      return;
    }

    if (request.method === "GET" && request.url.startsWith("/api/voucher-search")) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      sendJson(response, 200, await searchVouchers({
        voucherNo: url.searchParams.get("voucherNo"),
        voucherDate: url.searchParams.get("voucherDate"),
        voucherMonth: url.searchParams.get("voucherMonth"),
        partyId: url.searchParams.get("partyId"),
      }, Number(url.searchParams.get("limit") || 25)));
      return;
    }

    if (request.method === "GET" && request.url.startsWith("/api/vouchers/")) {
      const voucherId = pathname.split("/").pop();
      sendJson(response, 200, await getVoucherForEdit(voucherId));
      return;
    }

    if (request.method === "GET" && request.url.startsWith("/api/party-vouchers")) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      sendJson(response, 200, await getPartyVouchers(url.searchParams.get("partyId"), Number(url.searchParams.get("limit") || 5)));
      return;
    }

    if (request.method === "POST" && request.url === "/api/vouchers") {
      const payload = await readJson(request);
      const result = await saveVoucher(payload, {
        prefix: "WEB-",
        dryRun: appConfig.dryRun,
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "PUT" && request.url.startsWith("/api/vouchers/")) {
      const voucherId = pathname.split("/").pop();
      const payload = await readJson(request);
      const result = await updateVoucher(voucherId, payload, {
        dryRun: appConfig.dryRun,
      });
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && request.url === "/api/duplicate-check") {
      const payload = await readJson(request);
      sendJson(response, 200, { matches: await findDuplicateVouchers(payload) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/parties") {
      const payload = await readJson(request);
      const result = await addParty(payload);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && request.url === "/api/templates") {
      const payload = await readJson(request);
      const result = await saveTemplate(payload);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "GET") {
      serveStatic(request, response);
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Petty cash web utility running at http://localhost:${port}`);
  console.log(authConfig.enabled ? "Authentication enabled with Authentik OIDC." : `Authentication not configured. Missing: ${authConfig.missing.join(", ")}`);
  console.log(appConfig.dryRun ? "Server dry-run mode enabled. Voucher saves will not write to Grist." : "Server dry-run mode disabled. Voucher saves will write to Grist.");
});
