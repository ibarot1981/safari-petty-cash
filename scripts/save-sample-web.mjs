import { getReferenceData, saveVoucher } from "../gristClient.mjs";

function firstByName(records, field, text) {
  const lowered = text.toLowerCase();
  return records.find((row) => String(row[field] || "").toLowerCase().includes(lowered)) || records[0];
}

const refs = await getReferenceData();
const party = firstByName(refs.parties, "Party_Name", "office");
const purpose = firstByName(refs.purposes, "Purpose_Name", "office");
const expenseHead = firstByName(refs.expenseHeads, "Expense_Head_Name", "telephone");
const location = firstByName(refs.locations, "Location_Name", "local");
const head = firstByName(refs.heads, "Head_Name", "admin");

const result = await saveVoucher({
  voucherType: "Expense",
  voucherDate: new Date().toISOString().slice(0, 10),
  voucherPurposeId: purpose.id,
  paidToPartyId: party.id,
  locationId: location.id,
  purpose: "Web utility sample voucher",
  remarks: "Created by npm run sample:web",
  lines: [
    {
      expenseHeadId: expenseHead.id,
      amount: 123,
      splitMethod: "Head Only",
      headId: head.id,
      description: "Web utility verification line",
    },
  ],
}, { prefix: "WEB-DRYRUN-", dryRun: true });

console.log(JSON.stringify(result, null, 2));
