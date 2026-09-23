import assert from "node:assert/strict";
import test from "node:test";
import { calculateCashPosition } from "../gristClient.mjs";

test("calculates current cash from the latest locked close and all later vouchers", () => {
  const position = calculateCashPosition([
    { id: 1, Close_Date: "2026-08-25", Locked: true, Closing_Book_Cash: 821854 },
  ], [
    { id: 1, Voucher_Date: "2026-08-25", Voucher_Type: "Receipt", Receipt_Amount: 821854, Signed: true },
    { id: 2, Voucher_Date: "2026-08-26", Voucher_Type: "Expense", Total_Expense_Amt: 100, Signed: false },
    { id: 3, Voucher_Date: "2026-08-27", Voucher_Type: "Receipt", Receipt_Amount: 25.5, Signed: true },
  ], "2026-08-27");

  assert.deepEqual(position, {
    asOfDate: "2026-08-27",
    latestCloseDate: "2026-08-25",
    openingCash: 821854,
    receiptTotal: 25.5,
    expenseTotal: 100,
    cashAtHand: 821779.5,
    voucherCount: 2,
    signedCount: 1,
    unsignedCount: 1,
  });
});

test("starts from zero without a locked closure and excludes future vouchers", () => {
  const position = calculateCashPosition([], [
    { id: 1, Voucher_Date: "2026-09-01", Voucher_Type: "Receipt", Receipt_Amount: 500, Signed: false },
    { id: 2, Voucher_Date: "2026-09-02", Voucher_Type: "Expense", Total_Expense_Amt: 125.25, Signed: false },
    { id: 3, Voucher_Date: "2026-09-04", Voucher_Type: "Expense", Total_Expense_Amt: 50, Signed: false },
  ], "2026-09-03");

  assert.equal(position.openingCash, 0);
  assert.equal(position.receiptTotal, 500);
  assert.equal(position.expenseTotal, 125.25);
  assert.equal(position.cashAtHand, 374.75);
  assert.equal(position.voucherCount, 2);
});

test("uses the latest locked closure and ignores same-day closed vouchers", () => {
  const position = calculateCashPosition([
    { id: 1, Close_Date: "2026-08-25", Locked: true, Closing_Book_Cash: 1000 },
    { id: 2, Close_Date: "2026-08-31", Locked: false, Closing_Book_Cash: 900 },
    { id: 3, Close_Date: "2026-08-30", Locked: true, Closing_Book_Cash: 800 },
  ], [
    { id: 1, Voucher_Date: "2026-08-30", Voucher_Type: "Expense", Total_Expense_Amt: 100, Signed: false },
    { id: 2, Voucher_Date: "2026-08-31", Voucher_Type: "Receipt", Receipt_Amount: 50, Signed: false },
  ], "2026-08-31");

  assert.equal(position.latestCloseDate, "2026-08-30");
  assert.equal(position.openingCash, 800);
  assert.equal(position.receiptTotal, 50);
  assert.equal(position.expenseTotal, 0);
  assert.equal(position.cashAtHand, 850);
});
