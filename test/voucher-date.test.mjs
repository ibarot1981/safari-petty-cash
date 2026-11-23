import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

function openPage(storage = new Map(), userSub = "user-a", blocked = false) {
  const input = { value: "" };
  const context = vm.createContext({
    document: { getElementById: () => input },
    window: {
      localStorage: {
        getItem(key) {
          if (blocked) throw new Error("Storage blocked");
          return storage.get(key) ?? null;
        },
        setItem(key, value) {
          if (blocked) throw new Error("Storage blocked");
          storage.set(key, value);
        },
      },
    },
  });
  // Load the production functions without starting network requests or UI setup.
  vm.runInContext(source.slice(0, source.lastIndexOf("\ninit().catch")) + `
    globalThis.app = { state, today, defaultVoucherDate,
      restoreVoucherDatePreference, rememberVoucherDate };
  `, context);
  const app = context.app;
  app.state.userSub = userSub;
  app.restoreVoucherDatePreference();
  return { ...app, input };
}

test("uses today until a valid selection, then restores it on a fresh page", () => {
  const storage = new Map();
  const page = openPage(storage);
  assert.equal(page.defaultVoucherDate(), page.today());
  page.input.value = "2026-08-26";
  page.rememberVoucherDate();
  assert.equal(page.defaultVoucherDate(), "2026-08-26");
  assert.equal(openPage(storage).defaultVoucherDate(), "2026-08-26");
  assert.equal(openPage(storage, "user-b").defaultVoucherDate(), page.today());
});

test("edit-mode date changes cannot replace the new-voucher preference", () => {
  const page = openPage();
  page.input.value = "2026-08-26";
  page.rememberVoucherDate();
  page.state.mode = "edit";
  page.input.value = "2026-07-01";
  page.rememberVoucherDate();
  page.state.mode = "new";
  assert.equal(page.defaultVoucherDate(), "2026-08-26");
});

test("rejects empty, malformed and impossible stored or selected dates", () => {
  for (const value of ["", "2026-02-30", "2025-02-29", "2026-13-01", "not-a-date", "0000-01-01"]) {
    const storage = new Map([["safari-petty-cash:voucher-date:user-a", value]]);
    const page = openPage(storage);
    assert.equal(page.defaultVoucherDate(), page.today());
    page.input.value = "2024-02-29";
    page.rememberVoucherDate();
    page.input.value = value;
    page.rememberVoucherDate();
    assert.equal(openPage(storage).defaultVoucherDate(), "2024-02-29");
  }
});

test("storage failures and missing identity allow an in-memory preference", () => {
  for (const [userSub, blocked] of [["user-a", true], ["", false]]) {
    const storage = new Map();
    const page = openPage(storage, userSub, blocked);
    page.input.value = "2026-08-26";
    page.rememberVoucherDate();
    assert.equal(page.defaultVoucherDate(), "2026-08-26");
    assert.equal(storage.size, 0);
    assert.equal(openPage(storage, userSub, blocked).defaultVoucherDate(), page.today());
  }
});
