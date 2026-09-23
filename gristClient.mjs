import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DOC_ID = "moe5mP3wFHp6noNdS6FYh3";

const TABLES = {
  headers: "PettyCashVouchers",
  closures: "CashClosures",
  lines: "VoucherLines",
  allocations: "LineAllocations",
  purposes: "VoucherPurposes",
  parties: "Parties",
  expenseHeads: "ExpenseHeads",
  locations: "Locations",
  heads: "Heads",
  templates: "VoucherTemplates",
  templateLines: "VoucherTemplateLines",
  purposeDescriptions: "PurposeDescriptions",
  purposeExpenseHeads: "VoucherPurposeExpenseHeads",
};

function readCodexGristConfig() {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const text = fs.readFileSync(configPath, "utf8");
  return {
    baseUrl: text.match(/GRIST_BASE_URL\s*=\s*"([^"]+)"/)?.[1],
    apiKey: text.match(/GRIST_API_KEY\s*=\s*"([^"]+)"/)?.[1],
  };
}

export function getGristConfig() {
  const codexConfig = readCodexGristConfig();
  const baseUrl = process.env.GRIST_BASE_URL || codexConfig.baseUrl;
  const apiKey = process.env.GRIST_API_KEY || codexConfig.apiKey;
  if (!baseUrl || !apiKey) {
    throw new Error("Missing GRIST_BASE_URL or GRIST_API_KEY.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function gristFetch(pathname, options = {}) {
  const { baseUrl, apiKey } = getGristConfig();
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.error || `Grist request failed with ${response.status}`);
  }
  return body;
}

export async function getRecords(tableId) {
  const body = await gristFetch(`/api/docs/${DOC_ID}/tables/${tableId}/records`);
  return body.records.map((record) => ({ id: record.id, ...record.fields }));
}

export async function addRecords(tableId, records) {
  const body = await gristFetch(`/api/docs/${DOC_ID}/tables/${tableId}/records`, {
    method: "POST",
    body: JSON.stringify({
      records: records.map((fields) => ({ fields })),
    }),
  });
  return body.records.map((record) => record.id);
}

export async function updateRecords(tableId, records) {
  await gristFetch(`/api/docs/${DOC_ID}/tables/${tableId}/records`, {
    method: "PATCH",
    body: JSON.stringify({
      records: records.map(({ id, fields }) => ({ id, fields })),
    }),
  });
}

export async function deleteRecords(tableId, ids) {
  const cleanIds = ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
  if (!cleanIds.length) return;
  await gristFetch(`/api/docs/${DOC_ID}/tables/${tableId}/records/delete`, {
    method: "POST",
    body: JSON.stringify(cleanIds),
  });
}

export async function getReferenceData() {
  const [purposes, parties, expenseHeads, locations, heads, templates, templateLines, purposeDescriptions, purposeExpenseHeads] = await Promise.all([
    getRecords(TABLES.purposes),
    getRecords(TABLES.parties),
    getRecords(TABLES.expenseHeads),
    getRecords(TABLES.locations),
    getRecords(TABLES.heads),
    getRecords(TABLES.templates),
    getRecords(TABLES.templateLines),
    getRecords(TABLES.purposeDescriptions),
    getRecords(TABLES.purposeExpenseHeads),
  ]);
  return { purposes, parties, expenseHeads, locations, heads, templates, templateLines, purposeDescriptions, purposeExpenseHeads };
}

function byId(records, id) {
  return records.find((record) => Number(record.id) === Number(id));
}

function recentVoucherSortValue(voucher) {
  return Number(voucher.Created_at || voucher.Last_updated_at || voucher.Voucher_Date || 0);
}

function dateKey(value) {
  if (!value) return "";
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function currentDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Calcutta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function calculateCashPosition(closures = [], vouchers = [], asOfDate = currentDateKey()) {
  const lockedClosures = closures
    .filter((closure) => closure.Locked && dateKey(closure.Close_Date) && dateKey(closure.Close_Date) <= asOfDate)
    .sort((a, b) => dateKey(a.Close_Date).localeCompare(dateKey(b.Close_Date)) || Number(a.id || 0) - Number(b.id || 0));
  const latestClosure = lockedClosures.at(-1);
  const latestCloseDate = latestClosure ? dateKey(latestClosure.Close_Date) : "";
  const currentVouchers = vouchers.filter((voucher) => {
    const voucherDate = dateKey(voucher.Voucher_Date);
    return voucherDate
      && voucherDate <= asOfDate
      && (!latestCloseDate || voucherDate > latestCloseDate)
      && ["Expense", "Receipt"].includes(voucher.Voucher_Type);
  });
  const receiptCents = currentVouchers.reduce((sum, voucher) => sum + amountKey(voucher.Receipt_Amount), 0);
  const expenseCents = currentVouchers.reduce((sum, voucher) => sum + amountKey(voucher.Total_Expense_Amt), 0);
  const openingCents = amountKey(latestClosure?.Closing_Book_Cash);

  return {
    asOfDate,
    latestCloseDate: latestCloseDate || null,
    openingCash: openingCents / 100,
    receiptTotal: receiptCents / 100,
    expenseTotal: expenseCents / 100,
    cashAtHand: (openingCents + receiptCents - expenseCents) / 100,
    voucherCount: currentVouchers.length,
    signedCount: currentVouchers.filter((voucher) => voucher.Signed).length,
    unsignedCount: currentVouchers.filter((voucher) => !voucher.Signed).length,
  };
}

export async function getCashPosition(asOfDate = currentDateKey()) {
  const [closures, vouchers] = await Promise.all([
    getRecords(TABLES.closures),
    getRecords(TABLES.headers),
  ]);
  return {
    ...calculateCashPosition(closures, vouchers, asOfDate),
    calculatedAt: new Date().toISOString(),
  };
}

function amountKey(value) {
  return Math.round(Number(value || 0) * 100);
}

function dateInputValue(value) {
  return dateKey(value);
}

export async function getRecentVouchers(limit = 15) {
  const [vouchers, purposes, parties, locations] = await Promise.all([
    getRecords(TABLES.headers),
    getRecords(TABLES.purposes),
    getRecords(TABLES.parties),
    getRecords(TABLES.locations),
  ]);

  return vouchers
    .sort((a, b) => recentVoucherSortValue(b) - recentVoucherSortValue(a))
    .slice(0, limit)
    .map((voucher) => voucherSummary(voucher, { purposes, parties, locations }));
}

function voucherEditableStatus(voucher) {
  if (!voucher) return { editable: false, reason: "Voucher was not found." };
  if (voucher.Signed) return { editable: false, reason: "Voucher is signed." };
  if (voucher.Locked_By_Close) return { editable: false, reason: "Voucher is locked by a cash closure." };
  return { editable: true, reason: "" };
}

function voucherSummary(voucher, refs) {
  const isReceipt = voucher.Voucher_Type === "Receipt";
  const status = voucherEditableStatus(voucher);
  return {
    id: voucher.id,
    voucherNo: voucher.Voucher_No_ || "",
    voucherDate: dateInputValue(voucher.Voucher_Date),
    voucherType: voucher.Voucher_Type || "",
    purposeName: byId(refs.purposes, voucher.Voucher_Purpose)?.Purpose_Name || "",
    partyLabel: isReceipt ? "Received From" : "Paid To",
    partyName: byId(refs.parties, voucher.Paid_To_Party)?.Party_Name || "",
    locationName: byId(refs.locations, voucher.Location)?.Location_Name || "",
    amount: Number(isReceipt ? voucher.Receipt_Amount || 0 : voucher.Total_Expense_Amt || 0),
    description: voucher.Purpose || "",
    createdAt: voucher.Created_at || "",
    createdBy: voucher.Created_by || "",
    signed: Boolean(voucher.Signed),
    lockedByClose: Boolean(voucher.Locked_By_Close),
    editable: status.editable,
    editBlockedReason: status.reason,
  };
}

export async function searchVouchers(filters = {}, limit = 25) {
  const [vouchers, purposes, parties, locations] = await Promise.all([
    getRecords(TABLES.headers),
    getRecords(TABLES.purposes),
    getRecords(TABLES.parties),
    getRecords(TABLES.locations),
  ]);

  const voucherNo = String(filters.voucherNo || "").trim().toLowerCase();
  const voucherDate = dateKey(filters.voucherDate);
  const voucherMonth = String(filters.voucherMonth || "").trim();
  const partyId = Number(filters.partyId || 0);

  return vouchers
    .filter((voucher) => {
      const currentDate = dateKey(voucher.Voucher_Date);
      if (voucherNo && !String(voucher.Voucher_No_ || "").toLowerCase().includes(voucherNo)) return false;
      if (voucherDate && currentDate !== voucherDate) return false;
      if (voucherMonth && currentDate.slice(0, 7) !== voucherMonth) return false;
      if (partyId && Number(voucher.Paid_To_Party) !== partyId) return false;
      return true;
    })
    .sort((a, b) => recentVoucherSortValue(b) - recentVoucherSortValue(a))
    .slice(0, limit)
    .map((voucher) => voucherSummary(voucher, { purposes, parties, locations }));
}

export async function getVoucherForEdit(voucherId) {
  const id = Number(voucherId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Choose a valid voucher.");

  const [vouchers, lines, allocations, purposes, parties, locations] = await Promise.all([
    getRecords(TABLES.headers),
    getRecords(TABLES.lines),
    getRecords(TABLES.allocations),
    getRecords(TABLES.purposes),
    getRecords(TABLES.parties),
    getRecords(TABLES.locations),
  ]);
  const voucher = byId(vouchers, id);
  if (!voucher) throw new Error("Voucher was not found.");

  const voucherLines = lines
    .filter((line) => Number(line.Voucher) === id)
    .sort((a, b) => Number(a.Line_No || 0) - Number(b.Line_No || 0));
  const allocationsByLine = new Map();
  allocations.forEach((allocation) => {
    const lineId = Number(allocation.Voucher_Line);
    if (!allocationsByLine.has(lineId)) allocationsByLine.set(lineId, []);
    allocationsByLine.get(lineId).push(allocation);
  });

  return {
    ...voucherEditableStatus(voucher),
    header: {
      id: voucher.id,
      voucherNo: voucher.Voucher_No_ || "",
      voucherDate: dateInputValue(voucher.Voucher_Date),
      voucherType: voucher.Voucher_Type || "Expense",
      voucherPurposeId: Number(voucher.Voucher_Purpose || 0),
      paidToPartyId: Number(voucher.Paid_To_Party || 0),
      locationId: Number(voucher.Location || 0),
      purpose: voucher.Purpose || "",
      receiptAmount: Number(voucher.Receipt_Amount || 0),
      signed: Boolean(voucher.Signed),
      lockedByClose: Boolean(voucher.Locked_By_Close),
      summary: voucherSummary(voucher, { purposes, parties, locations }),
    },
    lines: voucherLines.map((line) => ({
      id: line.id,
      expenseHeadId: Number(line.Expense_Head || 0),
      amount: Number(line.Amount || 0),
      splitMethod: line.Split_Method || "Single Person",
      singlePartyId: Number(line.Single_Party || 0) || undefined,
      participantPartyIds: (allocationsByLine.get(Number(line.id)) || [])
        .map((allocation) => Number(allocation.Party || 0))
        .filter((partyId) => Number.isInteger(partyId) && partyId > 0),
      headId: Number(line.Head_Only_Head || 0) || undefined,
      description: line.Description || "",
    })),
  };
}

export async function getPartyVouchers(partyId, limit = 5) {
  const id = Number(partyId);
  if (!Number.isInteger(id) || id <= 0) {
    return [];
  }

  const [vouchers, purposes, parties, locations] = await Promise.all([
    getRecords(TABLES.headers),
    getRecords(TABLES.purposes),
    getRecords(TABLES.parties),
    getRecords(TABLES.locations),
  ]);

  return vouchers
    .filter((voucher) => Number(voucher.Paid_To_Party) === id)
    .sort((a, b) => recentVoucherSortValue(b) - recentVoucherSortValue(a))
    .slice(0, limit)
    .map((voucher) => voucherSummary(voucher, { purposes, parties, locations }));
}

function duplicateInputTotal(input) {
  const voucherType = input.voucherType || input.Voucher_Type || "Expense";
  if (voucherType === "Receipt") {
    return Number(input.receiptAmount ?? input.cashReceivedAmount ?? input.Receipt_Amount ?? 0);
  }
  return (input.lines || []).reduce((sum, line) => sum + Number(line.amount ?? line.Amount ?? 0), 0);
}

export async function findDuplicateVouchers(input, limit = 5) {
  const voucherType = input.voucherType || input.Voucher_Type || "Expense";
  const check = {
    voucherDate: dateKey(input.voucherDate || input.Voucher_Date),
    voucherType,
    voucherPurposeId: Number(input.voucherPurposeId ?? input.Voucher_Purpose ?? 0),
    paidToPartyId: Number(input.paidToPartyId ?? input.Paid_To_Party ?? 0),
    amount: amountKey(duplicateInputTotal(input)),
    description: String(input.purpose || input.Purpose || "").trim().toLowerCase(),
    excludeVoucherId: Number(input.excludeVoucherId || input.voucherId || 0),
  };

  if (!check.voucherDate || !check.voucherType || !check.voucherPurposeId || !check.paidToPartyId || !check.amount) {
    return [];
  }

  const [vouchers, purposes, parties] = await Promise.all([
    getRecords(TABLES.headers),
    getRecords(TABLES.purposes),
    getRecords(TABLES.parties),
  ]);

  return vouchers
    .filter((voucher) => {
      const amount = voucher.Voucher_Type === "Receipt" ? voucher.Receipt_Amount : voucher.Total_Expense_Amt;
      return Number(voucher.id) !== check.excludeVoucherId
        && dateKey(voucher.Voucher_Date) === check.voucherDate
        && voucher.Voucher_Type === check.voucherType
        && Number(voucher.Voucher_Purpose) === check.voucherPurposeId
        && Number(voucher.Paid_To_Party) === check.paidToPartyId
        && amountKey(amount) === check.amount;
    })
    .sort((a, b) => recentVoucherSortValue(b) - recentVoucherSortValue(a))
    .slice(0, limit)
    .map((voucher) => ({
      id: voucher.id,
      voucherNo: voucher.Voucher_No_ || "",
      voucherDate: voucher.Voucher_Date || "",
      voucherType: voucher.Voucher_Type || "",
      purposeName: byId(purposes, voucher.Voucher_Purpose)?.Purpose_Name || "",
      partyName: byId(parties, voucher.Paid_To_Party)?.Party_Name || "",
      amount: Number(voucher.Voucher_Type === "Receipt" ? voucher.Receipt_Amount || 0 : voucher.Total_Expense_Amt || 0),
      description: voucher.Purpose || "",
      matchStrength: String(voucher.Purpose || "").trim().toLowerCase() === check.description ? "Likely duplicate" : "Possible duplicate",
      createdAt: voucher.Created_at || "",
    }));
}

export async function addParty(input) {
  const partyName = String(input.partyName || input.Party_Name || "").trim();
  if (!partyName) {
    throw new Error("Party name is required.");
  }
  if (partyName.length > 120) {
    throw new Error("Party name must be 120 characters or less.");
  }
  if (!/[a-z0-9]/i.test(partyName)) {
    throw new Error("Party name must contain letters or numbers.");
  }

  const partyType = input.partyType || input.Party_Type || "Other Person";
  if (!["Employee", "Vendor", "Transporter", "Shop", "Bank", "Customer", "Other Person", "Other Organization"].includes(partyType)) {
    throw new Error("Choose a valid party type.");
  }

  const fields = {
    Party_Name: partyName,
    Party_Type: partyType,
    Location: input.locationId ? requireId(input.locationId, "Party location") : null,
    Active: true,
    Notes: input.notes || "Created from petty cash web utility",
  };

  const [id] = await addRecords(TABLES.parties, [fields]);
  return { id, ...fields };
}

function normalizeTemplateLine(line, index, templateId) {
  const splitMethod = line.splitMethod || line.Split_Method || "Single Person";
  if (!["Single Person", "Participants Equal", "Head Only"].includes(splitMethod)) {
    throw new Error(`Template line ${index + 1}: split method must be Single Person, Multiple Persons, or Head Only.`);
  }

  const fields = {
    Template: templateId,
    Line_No: index + 1,
    Expense_Head: requireId(line.expenseHeadId ?? line.Expense_Head, `Template line ${index + 1} expense head`),
    Split_Method: splitMethod,
    Description: String(line.description ?? line.Description ?? ""),
  };

  if (splitMethod === "Head Only") {
    fields.Head_Only_Head = requireId(line.headId ?? line.Head_Only_Head, `Template line ${index + 1} head`);
  }

  return fields;
}

export async function saveTemplate(input) {
  const templateName = String(input.templateName || input.Template_Name || "").trim();
  if (!templateName) {
    throw new Error("Template name is required.");
  }
  if (templateName.length > 120) {
    throw new Error("Template name must be 120 characters or less.");
  }

  const voucherType = input.voucherType || input.Voucher_Type || "Expense";
  if (!["Expense", "Receipt"].includes(voucherType)) {
    throw new Error("Template voucher type must be Expense or Receipt.");
  }

  const template = {
    Template_Name: templateName,
    Voucher_Type: voucherType,
    Voucher_Purpose: requireId(input.voucherPurposeId ?? input.Voucher_Purpose, "Voucher purpose"),
    Location: requireId(input.locationId ?? input.Location, "Location"),
    Purpose: requiredText(input.purpose || input.Purpose, "Purpose / description"),
    Active: true,
    Notes: input.notes || "Created from petty cash web utility template save",
  };

  const linesInput = input.lines || [];
  if (voucherType === "Receipt" && linesInput.length > 0) {
    throw new Error("Receipt templates cannot have expense lines.");
  }
  if (voucherType === "Expense" && linesInput.length === 0) {
    throw new Error("Expense templates need at least one line.");
  }
  await validateTemplateReferences(template, linesInput);
  const existingTemplates = await getRecords(TABLES.templates);
  if (existingTemplates.some((template) => template.Active !== false && String(template.Template_Name || "").trim().toLowerCase() === templateName.toLowerCase())) {
    throw new Error(`Template "${templateName}" already exists.`);
  }

  const [templateId] = await addRecords(TABLES.templates, [template]);
  const lines = linesInput.map((line, index) => normalizeTemplateLine(line, index, templateId));
  if (lines.length > 0) {
    await addRecords(TABLES.templateLines, lines);
  }

  return { templateId, templateName, lineCount: lines.length };
}

function voucherMonthPrefix(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Calcutta",
    year: "2-digit",
    month: "short",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value.toUpperCase();
  return `${year}-${month}`;
}

export function createVoucherNo(existingVouchers = [], date = new Date()) {
  const prefix = voucherMonthPrefix(date);
  const matcher = new RegExp(`^${prefix}-(\\d{4})$`);
  const maxSerial = existingVouchers.reduce((max, voucher) => {
    const match = String(voucher.Voucher_No_ || "").match(matcher);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  if (maxSerial >= 9999) {
    throw new Error(`Voucher number sequence exhausted for ${prefix}.`);
  }

  return `${prefix}-${String(maxSerial + 1).padStart(4, "0")}`;
}

function requireId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label} is required.`);
  }
  return id;
}

function requiredText(value, label, maxLength = 500) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  if (text.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less.`);
  }
  return text;
}

function validateIsoDate(value, label) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${label} must be a valid date.`);
  }
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new Error(`${label} must be a valid date.`);
  }
  return text;
}

function validateMoney(value, label) {
  const raw = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`${label} must be a positive number with maximum 2 decimal places.`);
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
}

function normalizeLine(line, index, voucherId) {
  const splitMethod = line.splitMethod || line.Split_Method;
  if (!["Single Person", "Participants Equal", "Head Only"].includes(splitMethod)) {
    throw new Error(`Line ${index + 1}: only Single Person, Multiple Persons, and Head Only are supported.`);
  }

  const fields = {
    Voucher: voucherId,
    Line_No: index + 1,
    Expense_Head: requireId(line.expenseHeadId ?? line.Expense_Head, `Line ${index + 1} expense head`),
    Amount: validateMoney(line.amount ?? line.Amount, `Line ${index + 1} amount`),
    Description: String(line.description ?? line.Description ?? ""),
    Split_Method: splitMethod,
  };

  if (splitMethod === "Single Person") {
    fields.Single_Party = requireId(line.singlePartyId ?? line.Single_Party, `Line ${index + 1} single party`);
  } else if (splitMethod === "Head Only") {
    fields.Head_Only_Head = requireId(line.headId ?? line.Head_Only_Head, `Line ${index + 1} head`);
  }

  return fields;
}

function normalizeAllocation(line, lineId, lineIndex) {
  const partyIds = [...new Set((line.participantPartyIds || line.Participant_Parties || []).map(Number))]
    .filter((id) => Number.isInteger(id) && id > 0);
  if (partyIds.length < 2) {
    throw new Error(`Line ${lineIndex + 1}: choose at least two employees for Multiple Persons.`);
  }

  const totalCents = Math.round(validateMoney(line.amount ?? line.Amount, `Line ${lineIndex + 1} amount`) * 100);
  const baseCents = Math.floor(totalCents / partyIds.length);
  let allocatedCents = 0;

  return partyIds.map((partyId, index) => {
    const cents = index === partyIds.length - 1 ? totalCents - allocatedCents : baseCents;
    allocatedCents += cents;
    return {
      Voucher_Line: lineId,
      Party: partyId,
      Allocated_Amount: cents / 100,
      Allocated_Percent: totalCents ? Math.round((cents / totalCents) * 10000) / 100 : 0,
      Notes: "Equal split from petty cash web utility",
    };
  });
}

async function validateEqualSplitEmployees(linesInput) {
  const participantIds = [...new Set(linesInput
    .filter((line) => (line.splitMethod || line.Split_Method) === "Participants Equal")
    .flatMap((line) => line.participantPartyIds || line.Participant_Parties || [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];

  if (!participantIds.length) return;

  const parties = await getRecords(TABLES.parties);
  const invalidIds = participantIds.filter((id) => {
    const party = byId(parties, id);
    return party?.Active === false || party?.Party_Type !== "Employee";
  });
  if (invalidIds.length > 0) {
    throw new Error("Multiple Persons split can include employees only.");
  }
}

function validateActiveRecord(records, id, label) {
  const record = byId(records, id);
  if (!record || record.Active === false) {
    throw new Error(`${label} must be selected from active master records.`);
  }
  return record;
}

async function validateVoucherReferences(header, linesInput) {
  const [purposes, parties, locations, expenseHeads, heads] = await Promise.all([
    getRecords(TABLES.purposes),
    getRecords(TABLES.parties),
    getRecords(TABLES.locations),
    getRecords(TABLES.expenseHeads),
    getRecords(TABLES.heads),
  ]);

  const purpose = validateActiveRecord(purposes, header.Voucher_Purpose, "Voucher purpose");
  const allowedType = purpose.Allowed_Voucher_Type || "Expense";
  if (!(allowedType === "Both" || allowedType === header.Voucher_Type)) {
    throw new Error(`Voucher purpose "${purpose.Purpose_Name}" is not allowed for ${header.Voucher_Type} vouchers.`);
  }
  validateActiveRecord(parties, header.Paid_To_Party, header.Voucher_Type === "Receipt" ? "Received from" : "Paid to");
  validateActiveRecord(locations, header.Location, "Location");

  linesInput.forEach((line, index) => {
    const splitMethod = line.splitMethod || line.Split_Method;
    validateActiveRecord(expenseHeads, line.expenseHeadId ?? line.Expense_Head, `Line ${index + 1} expense head`);
    if (splitMethod === "Single Person") {
      validateActiveRecord(parties, line.singlePartyId ?? line.Single_Party, `Line ${index + 1} person`);
    }
    if (splitMethod === "Head Only") {
      validateActiveRecord(heads, line.headId ?? line.Head_Only_Head, `Line ${index + 1} head`);
    }
  });
}

async function validateTemplateReferences(template, linesInput) {
  const [purposes, locations, expenseHeads, heads] = await Promise.all([
    getRecords(TABLES.purposes),
    getRecords(TABLES.locations),
    getRecords(TABLES.expenseHeads),
    getRecords(TABLES.heads),
  ]);

  const purpose = validateActiveRecord(purposes, template.Voucher_Purpose, "Voucher purpose");
  const allowedType = purpose.Allowed_Voucher_Type || "Expense";
  if (!(allowedType === "Both" || allowedType === template.Voucher_Type)) {
    throw new Error(`Voucher purpose "${purpose.Purpose_Name}" is not allowed for ${template.Voucher_Type} templates.`);
  }
  validateActiveRecord(locations, template.Location, "Location");

  linesInput.forEach((line, index) => {
    const splitMethod = line.splitMethod || line.Split_Method;
    validateActiveRecord(expenseHeads, line.expenseHeadId ?? line.Expense_Head, `Template line ${index + 1} expense head`);
    if (splitMethod === "Head Only") {
      validateActiveRecord(heads, line.headId ?? line.Head_Only_Head, `Template line ${index + 1} head`);
    }
  });
}

export function buildVoucherPayload(input) {
  const voucherType = input.voucherType || input.Voucher_Type || "Expense";
  if (!["Expense", "Receipt"].includes(voucherType)) {
    throw new Error("Voucher type must be Expense or Receipt.");
  }

  const header = {
    Voucher_No_: input.voucherNo || input.Voucher_No_,
    Voucher_Date: validateIsoDate(input.voucherDate || input.Voucher_Date, "Voucher date"),
    Voucher_Type: voucherType,
    Voucher_Purpose: requireId(input.voucherPurposeId ?? input.Voucher_Purpose, "Voucher purpose"),
    Paid_To_Party: requireId(input.paidToPartyId ?? input.Paid_To_Party, "Paid-to party"),
    Location: requireId(input.locationId ?? input.Location, "Location"),
    Purpose: requiredText(input.purpose || input.Purpose, "Purpose / description"),
    Receipt_Amount: voucherType === "Receipt" ? validateMoney(input.receiptAmount ?? input.cashReceivedAmount ?? input.Receipt_Amount, "Receipt amount") : null,
    Remarks: input.remarks || "Created by petty cash web utility",
  };

  if (!header.Voucher_No_) {
    throw new Error("Voucher number is required.");
  }
  const linesInput = input.lines || [];
  if (voucherType === "Receipt" && linesInput.length > 0) {
    throw new Error("Receipt vouchers cannot have expense lines.");
  }
  if (voucherType === "Expense" && linesInput.length === 0) {
    throw new Error("Expense vouchers need at least one line.");
  }

  return { header, linesInput };
}

export async function saveVoucher(input, options = {}) {
  const preparedInput = { ...input };
  if (!preparedInput.voucherNo && !preparedInput.Voucher_No_) {
    preparedInput.voucherNo = createVoucherNo(await getRecords(TABLES.headers));
  }
  const { header, linesInput } = buildVoucherPayload(preparedInput);
  await validateVoucherReferences(header, linesInput);
  await validateEqualSplitEmployees(linesInput);

  if (options.dryRun) {
    const dryRunLines = linesInput.map((line, index) => normalizeLine(line, index, 999999));
    return {
      dryRun: true,
      header,
      lines: dryRunLines,
      allocations: linesInput.flatMap((line, index) =>
        (line.splitMethod || line.Split_Method) === "Participants Equal"
          ? normalizeAllocation(line, 999999 + index, index)
          : [],
      ),
    };
  }

  const [voucherId] = await addRecords(TABLES.headers, [header]);
  const lines = linesInput.map((line, index) => normalizeLine(line, index, voucherId));
  if (lines.length > 0) {
    const lineIds = await addRecords(TABLES.lines, lines);
    const allocations = linesInput.flatMap((line, index) =>
      (line.splitMethod || line.Split_Method) === "Participants Equal"
        ? normalizeAllocation(line, lineIds[index], index)
        : [],
    );
    if (allocations.length > 0) {
      await addRecords(TABLES.allocations, allocations);
    }
  }

  return { dryRun: false, voucherId, voucherNo: header.Voucher_No_, lineCount: lines.length };
}

export async function updateVoucher(voucherId, input, options = {}) {
  const id = Number(voucherId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Choose a valid voucher to update.");

  const existingVouchers = await getRecords(TABLES.headers);
  const existing = byId(existingVouchers, id);
  const status = voucherEditableStatus(existing);
  if (!status.editable) {
    throw new Error(`${status.reason} It cannot be edited from the web utility.`);
  }

  const { header, linesInput } = buildVoucherPayload({
    ...input,
    voucherNo: existing.Voucher_No_,
  });
  await validateVoucherReferences(header, linesInput);
  await validateEqualSplitEmployees(linesInput);

  if (options.dryRun) {
    const dryRunLines = linesInput.map((line, index) => normalizeLine(line, index, 999999));
    return {
      dryRun: true,
      voucherId: id,
      voucherNo: existing.Voucher_No_,
      header,
      lines: dryRunLines,
      allocations: linesInput.flatMap((line, index) =>
        (line.splitMethod || line.Split_Method) === "Participants Equal"
          ? normalizeAllocation(line, 999999 + index, index)
          : [],
      ),
    };
  }

  await updateRecords(TABLES.headers, [{
    id,
    fields: {
      Voucher_Date: header.Voucher_Date,
      Voucher_Type: header.Voucher_Type,
      Voucher_Purpose: header.Voucher_Purpose,
      Paid_To_Party: header.Paid_To_Party,
      Location: header.Location,
      Purpose: header.Purpose,
      Receipt_Amount: header.Receipt_Amount,
      Remarks: input.remarks || "Updated by petty cash web utility",
    },
  }]);

  const existingLines = (await getRecords(TABLES.lines)).filter((line) => Number(line.Voucher) === id);
  const existingLineIds = existingLines.map((line) => Number(line.id));
  const existingAllocations = (await getRecords(TABLES.allocations))
    .filter((allocation) => existingLineIds.includes(Number(allocation.Voucher_Line)));
  await deleteRecords(TABLES.allocations, existingAllocations.map((allocation) => allocation.id));
  await deleteRecords(TABLES.lines, existingLineIds);

  const lines = linesInput.map((line, index) => normalizeLine(line, index, id));
  if (lines.length > 0) {
    const lineIds = await addRecords(TABLES.lines, lines);
    const allocations = linesInput.flatMap((line, index) =>
      (line.splitMethod || line.Split_Method) === "Participants Equal"
        ? normalizeAllocation(line, lineIds[index], index)
        : [],
    );
    if (allocations.length > 0) {
      await addRecords(TABLES.allocations, allocations);
    }
  }

  return { dryRun: false, voucherId: id, voucherNo: existing.Voucher_No_, lineCount: lines.length };
}
