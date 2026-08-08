const state = {
  refs: {
    purposes: [],
    parties: [],
    expenseHeads: [],
    locations: [],
    heads: [],
    templates: [],
    templateLines: [],
    purposeDescriptions: [],
    purposeExpenseHeads: [],
  },
  lines: [],
  multiPartyIds: [],
  combos: {},
  gristAvailable: false,
  mode: "new",
  editingVoucherId: 0,
  editingVoucherNo: "",
};

const $ = (id) => document.getElementById(id);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function optionLabel(item, labelField, index) {
  return `${index + 1}. ${item[labelField]}`;
}

function cleanOptionText(text) {
  return String(text || "").replace(/^\d+\.\s*/, "").trim();
}

function sortVoucherPurposes(purposes) {
  return [...purposes].sort((a, b) => {
    const aPinned = Number(a.Pinned_Order || 0);
    const bPinned = Number(b.Pinned_Order || 0);
    if (aPinned && bPinned && aPinned !== bPinned) return aPinned - bPinned;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    const usageDiff = Number(b.Usage_Count || 0) - Number(a.Usage_Count || 0);
    if (usageDiff) return usageDiff;
    return String(a.Purpose_Name || "").localeCompare(String(b.Purpose_Name || ""));
  });
}

function purposeMatchesVoucherType(purpose, voucherType) {
  const allowedType = purpose.Allowed_Voucher_Type || "Expense";
  return allowedType === "Both" || allowedType === voucherType;
}

function currentPurposeRecords() {
  const voucherType = $("voucherType")?.value || "Expense";
  return state.refs.purposes.filter((purpose) => purposeMatchesVoucherType(purpose, voucherType));
}

function purposeDescriptionMatchesContext(description) {
  const voucherType = $("voucherType")?.value || "Expense";
  const allowedType = description.Allowed_Voucher_Type || "Both";
  if (!(allowedType === "Both" || allowedType === voucherType)) return false;

  const purposeId = idFromText($("voucherPurposeText")?.value, currentPurposeRecords(), "Purpose_Name");
  if (purposeId && description.Voucher_Purpose && Number(description.Voucher_Purpose) !== Number(purposeId)) return false;

  const locationId = idFromText($("locationText")?.value, state.refs.locations, "Location_Name");
  if (locationId && description.Location && Number(description.Location) !== Number(locationId)) return false;

  return true;
}

function sortPurposeDescriptions(descriptions) {
  return [...descriptions].sort((a, b) => {
    const aPinned = Number(a.Pinned_Order || 0);
    const bPinned = Number(b.Pinned_Order || 0);
    if (aPinned && bPinned && aPinned !== bPinned) return aPinned - bPinned;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    const usageDiff = Number(b.Usage_Count || 0) - Number(a.Usage_Count || 0);
    if (usageDiff) return usageDiff;
    return String(a.Description_Text || "").localeCompare(String(b.Description_Text || ""));
  });
}

function currentPurposeDescriptionRecords() {
  return sortPurposeDescriptions(
    state.refs.purposeDescriptions.filter((description) => description.Active !== false && purposeDescriptionMatchesContext(description)),
  );
}

function selectedVoucherPurposeId() {
  return idFromText($("voucherPurposeText")?.value, currentPurposeRecords(), "Purpose_Name");
}

function currentSuggestedExpenseHeadMappings() {
  const purposeId = selectedVoucherPurposeId();
  if (!purposeId) return [];
  return state.refs.purposeExpenseHeads
    .filter((mapping) => (
      mapping.Active !== false
      && Number(mapping.Voucher_Purpose) === Number(purposeId)
      && recordById(state.refs.expenseHeads, mapping.Expense_Head)?.Active !== false
    ))
    .sort((a, b) => (Number(a.Sort_Order || 0) - Number(b.Sort_Order || 0)) || Number(a.id || 0) - Number(b.id || 0));
}

function currentSuggestedExpenseHeadIds() {
  return new Set(currentSuggestedExpenseHeadMappings().map((mapping) => Number(mapping.Expense_Head)));
}

function currentExpenseHeadRecords() {
  const activeHeads = state.refs.expenseHeads.filter((head) => head.Active !== false);
  const suggestedIds = currentSuggestedExpenseHeadIds();
  if (!suggestedIds.size) return activeHeads;
  const byHeadId = new Map(activeHeads.map((head) => [Number(head.id), head]));
  const suggestedHeads = [...suggestedIds].map((id) => byHeadId.get(id)).filter(Boolean);
  const otherHeads = activeHeads.filter((head) => !suggestedIds.has(Number(head.id)));
  return [...suggestedHeads, ...otherHeads];
}

function expenseHeadGroups(records) {
  const suggestedIds = currentSuggestedExpenseHeadIds();
  if (!suggestedIds.size) return [{ title: "", records }];
  const suggested = records.filter((head) => suggestedIds.has(Number(head.id)));
  const other = records.filter((head) => !suggestedIds.has(Number(head.id)));
  return [
    { title: "Suggested Expense Heads", records: suggested },
    { title: "Other Expense Heads", records: other },
  ];
}

function refreshPurposeDescriptionList() {
  fillDatalist("purposeDescriptionList", currentPurposeDescriptionRecords(), "Description_Text");
}

function refreshPurposeList({ clearInvalid = false } = {}) {
  const records = currentPurposeRecords();
  fillDatalist("purposeList", records, "Purpose_Name");
  if (clearInvalid && $("voucherPurposeText").value && !idFromText($("voucherPurposeText").value, records, "Purpose_Name")) {
    $("voucherPurposeText").value = "";
  }
  refreshPurposeDescriptionList();
}

function fillDatalist(id, records, labelField) {
  const list = $(id);
  list.innerHTML = "";
  records.filter((row) => row.Active !== false).forEach((record, index) => {
    const option = document.createElement("option");
    option.value = optionLabel(record, labelField, index);
    list.appendChild(option);
  });
}

function setupCombobox(inputId, config) {
  const input = $(inputId);
  if (!input || state.combos[inputId]) return state.combos[inputId];

  input.removeAttribute("list");
  input.setAttribute("autocomplete", "off");

  const wrapper = document.createElement("div");
  wrapper.className = "combo";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const menu = document.createElement("div");
  menu.className = "combo-menu hidden";
  menu.setAttribute("role", "listbox");
  wrapper.appendChild(menu);

  const combo = {
    input,
    menu,
    config,
    isOpen: false,
    highlightedIndex: 0,
    visibleOptions: [],
  };
  state.combos[inputId] = combo;

  input.addEventListener("focus", () => openCombobox(combo));
  input.addEventListener("input", () => {
    input.classList.remove("invalid");
    openCombobox(combo);
  });
  input.addEventListener("keydown", (event) => handleComboboxKeydown(event, combo));
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      closeCombobox(combo);
      validateCombobox(combo);
    }, 120);
  });
  menu.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const item = event.target.closest("[data-combo-index]");
    if (!item) return;
    selectComboboxOption(combo, Number(item.dataset.comboIndex));
  });

  return combo;
}

function activeComboRecords(combo) {
  return combo.config.getRecords().filter((row) => row.Active !== false);
}

function comboLabel(combo, record) {
  return String(record[combo.config.labelField] || "");
}

function filteredComboRecords(combo) {
  const query = cleanOptionText(combo.input.value).toLowerCase();
  const records = activeComboRecords(combo);
  if (!query || /^\d+$/.test(query)) return records;
  return records.filter((record) => comboLabel(combo, record).toLowerCase().includes(query));
}

function groupedComboOptions(combo) {
  const records = filteredComboRecords(combo);
  if (combo.config.getGroups) {
    return combo.config.getGroups(records)
      .map((group) => ({ ...group, records: group.records.slice(0, combo.config.maxOptions || 30) }))
      .filter((group) => group.records.length);
  }
  const pinned = [];
  const normal = [];
  records.forEach((record) => {
    if (Number(record.Pinned_Order || 0) > 0) pinned.push(record);
    else normal.push(record);
  });
  if (!combo.config.groupPinned || !pinned.length) {
    return [{ title: "", records: records.slice(0, combo.config.maxOptions || 30) }];
  }
  return [
    { title: "Pinned", records: pinned },
    { title: normal.length ? "Frequently Used / All" : "", records: normal },
  ];
}

function renderHighlightedLabel(label, query) {
  const cleanQuery = cleanOptionText(query);
  if (!cleanQuery || /^\d+$/.test(cleanQuery)) return escapeHtml(label);
  const index = label.toLowerCase().indexOf(cleanQuery.toLowerCase());
  if (index < 0) return escapeHtml(label);
  return `${escapeHtml(label.slice(0, index))}<mark>${escapeHtml(label.slice(index, index + cleanQuery.length))}</mark>${escapeHtml(label.slice(index + cleanQuery.length))}`;
}

function renderCombobox(combo) {
  const groups = groupedComboOptions(combo);
  const query = combo.input.value;
  let visibleIndex = 0;
  combo.visibleOptions = [];

  const html = groups.map((group) => {
    const limitedRecords = group.records.slice(0, combo.config.maxOptions || 30);
    if (!limitedRecords.length) return "";
    const rows = limitedRecords.map((record) => {
      const index = visibleIndex++;
      combo.visibleOptions.push(record);
      const label = comboLabel(combo, record);
      const selected = index === combo.highlightedIndex ? " active" : "";
      return `
        <div class="combo-option${selected}" role="option" data-combo-index="${index}">
          <span class="combo-number">${index + 1}</span>
          <span class="combo-label">${renderHighlightedLabel(label, query)}</span>
        </div>
      `;
    }).join("");
    return `${group.title ? `<div class="combo-group">${escapeHtml(group.title)}</div>` : ""}${rows}`;
  }).join("");

  combo.menu.innerHTML = html || '<div class="combo-empty">No matching options</div>';
}

function scrollHighlightedOptionIntoView(combo) {
  const activeOption = combo.menu.querySelector(".combo-option.active");
  if (!activeOption) return;
  activeOption.scrollIntoView({ block: "nearest" });
}

function openCombobox(combo) {
  combo.isOpen = true;
  combo.highlightedIndex = 0;
  renderCombobox(combo);
  combo.menu.classList.remove("hidden");
  scrollHighlightedOptionIntoView(combo);
}

function closeCombobox(combo) {
  combo.isOpen = false;
  combo.menu.classList.add("hidden");
}

function selectComboboxOption(combo, index) {
  const record = combo.visibleOptions[index];
  if (!record) return;
  const records = activeComboRecords(combo);
  combo.input.value = optionLabel(record, combo.config.labelField, records.indexOf(record));
  combo.input.classList.remove("invalid");
  closeCombobox(combo);
  combo.config.onSelect?.(record);
  combo.input.dispatchEvent(new Event("change", { bubbles: true }));
}

function handleComboboxKeydown(event, combo) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!combo.isOpen) openCombobox(combo);
    combo.highlightedIndex = Math.min(combo.highlightedIndex + 1, Math.max(combo.visibleOptions.length - 1, 0));
    renderCombobox(combo);
    scrollHighlightedOptionIntoView(combo);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    if (!combo.isOpen) openCombobox(combo);
    combo.highlightedIndex = Math.max(combo.highlightedIndex - 1, 0);
    renderCombobox(combo);
    scrollHighlightedOptionIntoView(combo);
    return;
  }
  if (event.key === "Enter") {
    if (!combo.isOpen) return;
    event.preventDefault();
    const numericIndex = /^\d+$/.test(combo.input.value.trim()) ? Number(combo.input.value.trim()) - 1 : null;
    selectComboboxOption(combo, numericIndex ?? combo.highlightedIndex);
    return;
  }
  if (event.key === "Tab" && combo.isOpen && combo.visibleOptions.length) {
    const hasExactValue = idFromText(combo.input.value, activeComboRecords(combo), combo.config.labelField);
    const shouldSelect = /^\d+$/.test(combo.input.value.trim()) || (!combo.config.allowFree && !hasExactValue);
    if (shouldSelect) {
      const numericIndex = /^\d+$/.test(combo.input.value.trim()) ? Number(combo.input.value.trim()) - 1 : combo.highlightedIndex;
      selectComboboxOption(combo, numericIndex);
    }
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeCombobox(combo);
  }
}

function validateCombobox(combo) {
  if (combo.config.allowFree || !combo.input.value.trim()) return true;
  const id = idFromText(combo.input.value, activeComboRecords(combo), combo.config.labelField);
  combo.input.classList.toggle("invalid", !id);
  return Boolean(id);
}

function refreshCombobox(inputId) {
  const combo = state.combos[inputId];
  if (!combo) return;
  if (combo.isOpen) renderCombobox(combo);
  validateCombobox(combo);
}

function refreshAllComboboxes() {
  Object.keys(state.combos).forEach(refreshCombobox);
}

function idFromText(text, records, labelField) {
  const activeRecords = records.filter((row) => row.Active !== false);
  const match = String(text || "").match(/^\s*(\d+)\.\s+/);
  if (match) {
    return activeRecords[Number(match[1]) - 1]?.id || 0;
  }
  const lowered = cleanOptionText(text).toLowerCase();
  return activeRecords.find((row) => String(row[labelField]).toLowerCase() === lowered)?.id || 0;
}

function normalizePartyName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactPartyName(value) {
  return normalizePartyName(value).replace(/\s+/g, "");
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function partyNearMatchReason(newName, existingName) {
  const normalizedNew = normalizePartyName(newName);
  const normalizedExisting = normalizePartyName(existingName);
  const compactNew = compactPartyName(newName);
  const compactExisting = compactPartyName(existingName);
  if (!normalizedNew || !normalizedExisting) return "";
  if (compactNew === compactExisting) return "same name after removing spaces/punctuation";
  if (compactNew.length >= 5 && compactExisting.length >= 5 && editDistance(compactNew, compactExisting) <= 2) {
    return "very similar spelling";
  }
  if (
    compactNew.length >= 5
    && compactExisting.length >= 5
    && (compactNew.includes(compactExisting) || compactExisting.includes(compactNew))
  ) {
    return "one name contains the other";
  }
  const newTokens = new Set(normalizedNew.split(" ").filter((token) => token.length > 2));
  const existingTokens = normalizedExisting.split(" ").filter((token) => token.length > 2);
  const commonTokens = existingTokens.filter((token) => newTokens.has(token));
  if (commonTokens.length >= 2) return `common words: ${commonTokens.slice(0, 3).join(", ")}`;
  return "";
}

function nearPartyMatches(partyName) {
  return state.refs.parties
    .filter((party) => party.Active !== false)
    .map((party) => ({
      party,
      reason: partyNearMatchReason(partyName, party.Party_Name),
    }))
    .filter((match) => match.reason)
    .slice(0, 5);
}

function confirmNewPartyNearMatches(partyName) {
  const matches = nearPartyMatches(partyName);
  if (!matches.length) return true;
  const lines = matches.map((match) => `- ${match.party.Party_Name} (${match.party.Party_Type || "Party"}): ${match.reason}`);
  return window.confirm([
    `${partyFieldName()} "${partyName}" looks similar to existing party name(s):`,
    "",
    ...lines,
    "",
    "Press OK to create it as a new party anyway.",
    "Press Cancel to stop saving and choose/correct the existing party.",
  ].join("\n"));
}

function validateNewPartyName(partyName) {
  if (!partyName) throw new Error(`${partyFieldName()} name is required.`);
  if (partyName.length > 120) throw new Error(`${partyFieldName()} name must be 120 characters or less.`);
  if (!/[a-z0-9]/i.test(partyName)) throw new Error(`${partyFieldName()} name must contain letters or numbers.`);
}

function nameById(records, id, field) {
  return records.find((row) => row.id === Number(id))?.[field] || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function recordById(records, id) {
  return records.find((row) => row.id === Number(id));
}

function valueById(records, id, field) {
  const record = recordById(records, id);
  return record ? optionLabel(record, field, records.indexOf(record)) : "";
}

function paidToEmployeeId() {
  const header = selectedHeader();
  const party = recordById(state.refs.parties, header.paidToPartyId);
  return party?.Party_Type === "Employee" ? party.id : 0;
}

function employeePartyRecords() {
  return state.refs.parties.filter((party) => party.Active !== false && party.Party_Type === "Employee");
}

function syncSinglePersonFromPaidTo({ overwrite = false } = {}) {
  if ($("lineSplit").value !== "Single Person") return;
  const employeeId = paidToEmployeeId();
  if (!employeeId) return;
  if (!overwrite && $("lineSinglePartyText").value) return;
  $("lineSinglePartyText").value = valueById(state.refs.parties, employeeId, "Party_Name");
}

function syncMultiPersonsFromPaidTo() {
  if ($("lineSplit").value !== "Participants Equal") return;
  const employeeId = paidToEmployeeId();
  if (employeeId && !state.multiPartyIds.includes(employeeId)) {
    state.multiPartyIds.unshift(employeeId);
    renderSelectedMultiParties();
  }
}

function renderSelectedMultiParties() {
  const container = $("selectedMultiParties");
  if (!state.multiPartyIds.length) {
    container.innerHTML = '<span class="empty-state">No employees selected.</span>';
    return;
  }

  container.innerHTML = state.multiPartyIds.map((id) => `
    <span class="party-chip">
      ${escapeHtml(nameById(state.refs.parties, id, "Party_Name"))}
      <button type="button" class="remove-multi-party" data-party-id="${id}" aria-label="Remove ${escapeHtml(nameById(state.refs.parties, id, "Party_Name"))}">x</button>
    </span>
  `).join("");
}

function addSelectedMultiParty() {
  const partyId = idFromText($("lineMultiPartyText").value, employeePartyRecords(), "Party_Name");
  if (!partyId) {
    $("message").textContent = "Choose an employee to add to the split.";
    return;
  }
  if (!state.multiPartyIds.includes(partyId)) {
    state.multiPartyIds.push(partyId);
  } else {
    $("message").textContent = `${nameById(state.refs.parties, partyId, "Party_Name")} is already added to this split.`;
  }
  $("lineMultiPartyText").value = "";
  renderSelectedMultiParties();
}

function parseAmountText(rawValue, label) {
  const raw = String(rawValue || "").trim();
  if (!raw) throw new Error(`${label} is required.`);
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`${label} must be a positive number with maximum 2 decimal places.`);
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
}

function readAmount(inputId, label) {
  return parseAmountText($(inputId).value, label);
}

function validateAmountValue(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  if (Math.round(amount * 100) !== amount * 100) {
    throw new Error(`${label} can have maximum 2 decimal places.`);
  }
  return amount;
}

function validateVoucherDate(value) {
  if (!value) throw new Error("Choose a voucher date.");
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid voucher date.");
  return date;
}

function confirmFutureVoucherDate(value) {
  const date = validateVoucherDate(value);
  const todayDate = new Date(`${today()}T00:00:00`);
  if (date > todayDate) {
    return window.confirm("Voucher date is in the future. Do you still want to continue?");
  }
  return true;
}

function validateHeader(header) {
  validateHeaderBeforeParty(header);
  if (!header.paidToPartyId) throw new Error(`Choose ${partyFieldName().toLowerCase()}.`);
}

function validateHeaderBeforeParty(header) {
  validateVoucherDate(header.voucherDate);
  if (!header.voucherPurposeId) throw new Error("Choose a voucher purpose.");
  if (!header.locationId) throw new Error("Choose a location.");
  if (!header.purpose) throw new Error("Enter purpose / description.");
  if (header.voucherType === "Receipt") {
    header.receiptAmount = readAmount("receiptAmount", "Receipt amount");
  }
}

function selectedHeader() {
  const voucherType = $("voucherType").value;
  return {
    voucherType,
    voucherDate: $("voucherDate").value,
    voucherPurposeId: idFromText($("voucherPurposeText").value, currentPurposeRecords(), "Purpose_Name"),
    paidToPartyId: idFromText($("paidToPartyText").value, state.refs.parties, "Party_Name"),
    locationId: idFromText($("locationText").value, state.refs.locations, "Location_Name"),
    purpose: cleanTypedDescription($("purpose").value),
    receiptAmount: voucherType === "Receipt" ? Number($("receiptAmount").value || 0) : 0,
    remarks: state.mode === "edit" ? "Updated from petty cash web utility" : "Created from petty cash web utility",
  };
}

function lineDraft() {
  const splitMethod = $("lineSplit").value;
  const singlePartyId = idFromText($("lineSinglePartyText").value, state.refs.parties, "Party_Name") || paidToEmployeeId();
  return {
    expenseHeadId: idFromText($("lineExpenseHeadText").value, currentExpenseHeadRecords(), "Expense_Head_Name"),
    amount: readAmount("lineAmount", "Line amount"),
    splitMethod,
    singlePartyId: splitMethod === "Single Person" ? singlePartyId : undefined,
    participantPartyIds: splitMethod === "Participants Equal" ? [...state.multiPartyIds] : [],
    headId: splitMethod === "Head Only" ? idFromText($("lineHeadText").value, state.refs.heads, "Head_Name") : undefined,
    description: $("lineDescription").value,
  };
}

function validateLine(line, index = 0) {
  const prefix = index ? `Line ${index}: ` : "";
  if (!line.expenseHeadId) throw new Error(`${prefix}choose an expense head.`);
  line.amount = validateAmountValue(line.amount, `${prefix}amount`);
  if (line.splitMethod === "Single Person" && !line.singlePartyId) throw new Error(`${prefix}choose a person.`);
  if (line.splitMethod === "Participants Equal" && (!line.participantPartyIds || line.participantPartyIds.length < 2)) {
    throw new Error(`${prefix}choose at least two employees.`);
  }
  if (line.splitMethod === "Participants Equal") {
    const employeeIds = new Set(employeePartyRecords().map((party) => Number(party.id)));
    if (line.participantPartyIds.some((id) => !employeeIds.has(Number(id)))) {
      throw new Error(`${prefix}multiple-person split can include employees only.`);
    }
  }
  if (line.splitMethod === "Head Only" && !line.headId) throw new Error(`${prefix}choose a head.`);
}

function renderLines() {
  const rows = $("lineRows");
  rows.innerHTML = "";
  state.lines.forEach((line, index) => {
    const targetValue = line.splitMethod === "Single Person"
      ? valueById(state.refs.parties, line.singlePartyId || paidToEmployeeId(), "Party_Name")
      : line.splitMethod === "Participants Equal"
        ? line.participantPartyIds.map((id) => nameById(state.refs.parties, id, "Party_Name")).join(", ")
        : valueById(state.refs.heads, line.headId, "Head_Name");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${nameById(state.refs.expenseHeads, line.expenseHeadId, "Expense_Head_Name")}</td>
      <td class="amount"><input class="line-row-amount" data-index="${index}" data-field="amount" type="number" min="0" step="0.01" value="${line.amount > 0 ? line.amount : ""}"></td>
      <td>${splitMethodLabel(line.splitMethod)}</td>
      <td>
        <input class="line-row-target" data-index="${index}" data-field="target" ${line.splitMethod === "Participants Equal" ? "readonly" : `list="${line.splitMethod === "Single Person" ? "partyList" : "headList"}"`} value="${targetValue}">
      </td>
      <td><input class="line-row-description" data-index="${index}" data-field="description" type="text" value="${line.description || ""}"></td>
      <td><button class="remove-line" type="button" data-index="${index}">Remove</button></td>
    `;
    rows.appendChild(row);
  });
  updateReview();
}

function updateReview() {
  const header = selectedHeader();
  const total = header.voucherType === "Receipt"
    ? header.receiptAmount
    : state.lines.reduce((sum, line) => sum + line.amount, 0);
  $("reviewType").textContent = header.voucherType;
  $("reviewTotal").textContent = total.toFixed(2);
  $("reviewLines").textContent = String(state.lines.length);
}

function formatDate(value) {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function splitMethodLabel(splitMethod) {
  return splitMethod === "Participants Equal" ? "Multiple Persons" : splitMethod;
}

function duplicateMessage(matches) {
  const lines = matches.slice(0, 5).map((match) => {
    const date = formatDate(match.voucherDate);
    return `${match.matchStrength}: ${match.voucherNo} | ${date} | ${match.purposeName} | ${match.partyName} | ${formatAmount(match.amount)}`;
  });
  return [
    "Possible duplicate voucher found.",
    "",
    ...lines,
    "",
    "Do you still want to save this voucher?",
  ].join("\n");
}

async function confirmNoDuplicate(header, lines) {
  const response = await fetch("/api/duplicate-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...header, lines }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Duplicate check failed.");
  if (!result.matches?.length) return true;
  return window.confirm(duplicateMessage(result.matches));
}

function renderRecentVouchers(vouchers) {
  const container = $("recentVouchers");
  if (!vouchers.length) {
    container.innerHTML = '<div class="empty-state">No recent vouchers found.</div>';
    return;
  }

  container.innerHTML = vouchers.map((voucher) => `
    <div class="recent-item">
      <div class="recent-main">
        <strong>${escapeHtml(voucher.voucherNo || "No voucher no")}</strong>
        <span>${escapeHtml(formatDate(voucher.voucherDate))}</span>
        <span>${escapeHtml(voucher.voucherType)}</span>
        <span>${escapeHtml(voucher.purposeName)}</span>
        <span>${escapeHtml(voucher.partyLabel)}: ${escapeHtml(voucher.partyName)}</span>
      </div>
      <div class="recent-side">
        <strong>${formatAmount(voucher.amount)}</strong>
        <span>${voucher.signed ? "Signed" : "Unsigned"}</span>
      </div>
      ${voucher.description ? `<div class="recent-description">${escapeHtml(voucher.description)}</div>` : ""}
    </div>
  `).join("");
}

function renderPartyHistory(vouchers, partyName) {
  const panel = $("partyHistoryPanel");
  const summary = $("partyHistorySummary");
  const list = $("partyHistoryList");
  panel.classList.remove("hidden");
  summary.textContent = `Past vouchers for ${partyName}: ${vouchers.length} found`;

  if (!vouchers.length) {
    list.innerHTML = '<div class="empty-state">No previous vouchers for this party.</div>';
    return;
  }

  list.innerHTML = `
    <div class="party-history-item party-history-heading">
      <span>Voucher</span>
      <span>Date</span>
      <span>Type</span>
      <span>Voucher Purpose</span>
      <span>Amount</span>
      <span>Status</span>
    </div>
  ` + vouchers.map((voucher) => `
    <div class="party-history-item">
      <strong>${escapeHtml(voucher.voucherNo || "No voucher no")}</strong>
      <span>${escapeHtml(formatDate(voucher.voucherDate))}</span>
      <span>${escapeHtml(voucher.voucherType)}</span>
      <span>${escapeHtml(voucher.purposeName)}</span>
      <strong>${formatAmount(voucher.amount)}</strong>
      <span>${voucher.signed ? "Signed" : "Unsigned"}</span>
    </div>
  `).join("");
}

function renderEditSearchResults(vouchers) {
  const container = $("editSearchResults");
  if (!vouchers.length) {
    container.innerHTML = '<div class="empty-state">No vouchers found for this search.</div>';
    return;
  }

  container.innerHTML = vouchers.map((voucher) => {
    const status = voucher.editable ? "Editable" : voucher.editBlockedReason || "View only";
    const button = voucher.editable
      ? `<button class="small-button edit-voucher" type="button" data-voucher-id="${voucher.id}">Edit</button>`
      : `<button class="secondary small-button" type="button" disabled>${escapeHtml(status)}</button>`;
    return `
      <div class="edit-result">
        <div class="edit-result-main">
          <strong>${escapeHtml(voucher.voucherNo || "No voucher no")}</strong>
          <span>${escapeHtml(formatDate(voucher.voucherDate))}</span>
          <span>${escapeHtml(voucher.voucherType)}</span>
          <span>${escapeHtml(voucher.purposeName)}</span>
          <span>${escapeHtml(voucher.partyLabel)}: ${escapeHtml(voucher.partyName)}</span>
          <strong>${formatAmount(voucher.amount)}</strong>
          <span>${escapeHtml(status)}</span>
        </div>
        <div>${button}</div>
        ${voucher.description ? `<div class="edit-result-note">${escapeHtml(voucher.description)}</div>` : ""}
      </div>
    `;
  }).join("");
}

async function searchEditableVouchers() {
  const params = new URLSearchParams();
  const voucherNo = $("editSearchVoucherNo").value.trim();
  const voucherDate = $("editSearchDate").value;
  const voucherMonth = $("editSearchMonth").value;
  const partyId = idFromText($("editSearchPartyText").value, state.refs.parties, "Party_Name");
  if (voucherNo) params.set("voucherNo", voucherNo);
  if (voucherDate) params.set("voucherDate", voucherDate);
  if (voucherMonth) params.set("voucherMonth", voucherMonth);
  if (partyId) params.set("partyId", partyId);
  params.set("limit", "25");

  $("editSearchResults").innerHTML = '<div class="empty-state">Searching vouchers...</div>';
  try {
    const response = await fetch(`/api/voucher-search?${params.toString()}`);
    const vouchers = await response.json();
    if (!response.ok) throw new Error(vouchers.error || "Voucher search failed.");
    renderEditSearchResults(vouchers);
  } catch (error) {
    $("editSearchResults").innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function clearVoucherSearch() {
  $("editSearchVoucherNo").value = "";
  $("editSearchDate").value = "";
  $("editSearchMonth").value = "";
  $("editSearchPartyText").value = "";
  $("editSearchResults").innerHTML = "";
  $("editSearchVoucherNo").focus();
}

function loadVoucherIntoForm(voucher) {
  const header = voucher.header;
  $("voucherType").value = header.voucherType || "Expense";
  $("voucherDate").value = header.voucherDate || today();
  refreshPurposeList();
  $("voucherPurposeText").value = valueById(currentPurposeRecords(), header.voucherPurposeId, "Purpose_Name");
  $("paidToPartyText").value = valueById(state.refs.parties, header.paidToPartyId, "Party_Name");
  $("locationText").value = valueById(state.refs.locations, header.locationId, "Location_Name");
  $("purpose").value = header.purpose || "";
  $("receiptAmount").value = header.voucherType === "Receipt" && header.receiptAmount ? header.receiptAmount : "";
  state.lines = (voucher.lines || []).map((line) => ({
    expenseHeadId: line.expenseHeadId,
    amount: Number(line.amount || 0),
    splitMethod: line.splitMethod || "Single Person",
    singlePartyId: line.singlePartyId || undefined,
    participantPartyIds: line.participantPartyIds || [],
    headId: line.headId || undefined,
    description: line.description || "",
  }));
  state.multiPartyIds = [];
  state.editingVoucherId = header.id;
  state.editingVoucherNo = header.voucherNo;
  setEntryMode("edit");
  toggleVoucherType();
  renderSelectedMultiParties();
  renderLines();
  $("reviewVoucherNo").textContent = header.voucherNo;
  $("message").textContent = `Loaded ${header.voucherNo} for editing. Save will update this voucher.`;
  $("voucherDate").focus();
}

async function loadVoucherForEdit(voucherId) {
  $("message").textContent = "";
  try {
    const response = await fetch(`/api/vouchers/${encodeURIComponent(voucherId)}`);
    const voucher = await response.json();
    if (!response.ok) throw new Error(voucher.error || "Could not load voucher.");
    if (!voucher.editable) {
      throw new Error(voucher.reason || "This voucher cannot be edited.");
    }
    loadVoucherIntoForm(voucher);
  } catch (error) {
    $("editSearchResults").insertAdjacentHTML("afterbegin", `<div class="empty-state">${escapeHtml(error.message)}</div>`);
  }
}

async function refreshPartyHistory() {
  const partyId = idFromText($("paidToPartyText").value, state.refs.parties, "Party_Name");
  const party = recordById(state.refs.parties, partyId);
  const panel = $("partyHistoryPanel");
  const list = $("partyHistoryList");

  if (!partyId || !party) {
    panel.classList.add("hidden");
    panel.open = false;
    list.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  $("partyHistorySummary").textContent = `Past vouchers for ${party.Party_Name}: loading...`;
  list.innerHTML = '<div class="empty-state">Loading party history...</div>';

  try {
    const response = await fetch(`/api/party-vouchers?partyId=${encodeURIComponent(partyId)}&limit=5`);
    const vouchers = await response.json();
    if (!response.ok) throw new Error(vouchers.error || "Could not load party history.");
    renderPartyHistory(vouchers, party.Party_Name);
  } catch (error) {
    $("partyHistorySummary").textContent = `Past vouchers for ${party.Party_Name}`;
    list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function refreshRecentVouchers() {
  const container = $("recentVouchers");
  container.innerHTML = '<div class="empty-state">Loading recent vouchers...</div>';
  try {
    const response = await fetch("/api/recent-vouchers?limit=15");
    const vouchers = await response.json();
    if (!response.ok) throw new Error(vouchers.error || "Could not load recent vouchers.");
    renderRecentVouchers(vouchers);
  } catch (error) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function partyFieldName() {
  return $("voucherType").value === "Receipt" ? "Received From" : "Paid To";
}

function updatePartyFieldText() {
  const label = partyFieldName();
  $("partyFieldLabel").textContent = label;
  $("newPartyNote").textContent = `${label} is not in the master list. Add it once here, then it will be available next time.`;
}

function clearLineEditor() {
  $("lineExpenseHeadText").value = "";
  $("lineAmount").value = "";
  $("lineDescription").value = "";
  $("lineExpenseHeadText").focus();
}

function setEntryMode(mode) {
  state.mode = mode;
  if (mode === "new") {
    state.editingVoucherId = 0;
    state.editingVoucherNo = "";
  }

  $("newVoucherTab").classList.toggle("active", mode === "new");
  $("editVoucherTab").classList.toggle("active", mode === "edit");
  $("newVoucherTab").setAttribute("aria-selected", mode === "new" ? "true" : "false");
  $("editVoucherTab").setAttribute("aria-selected", mode === "edit" ? "true" : "false");
  $("editSearchPanel").classList.toggle("hidden", mode !== "edit");
  $("entrySections").classList.toggle("hidden", mode === "edit" && !state.editingVoucherId);
  $("saveVoucher").innerHTML = mode === "edit"
    ? 'Update Voucher <span class="shortcut-key">Ctrl+F2</span>'
    : 'Save Voucher <span class="shortcut-key">Ctrl+F2</span>';
  $("saveTemplate").classList.toggle("hidden", mode === "edit");
  $("entryModeBanner").classList.toggle("hidden", mode !== "edit" || !state.editingVoucherId);
  if (mode === "edit" && state.editingVoucherId) {
    $("entryModeBanner").textContent = `Editing existing voucher ${state.editingVoucherNo}. Voucher number will not change.`;
  } else {
    $("entryModeBanner").textContent = "";
  }
}

function switchToNewMode() {
  setEntryMode("new");
  resetForm({ keepMode: true });
}

function switchToEditMode() {
  state.editingVoucherId = 0;
  state.editingVoucherNo = "";
  setEntryMode("edit");
  resetForm({ keepMode: true, focusFirst: false });
  $("editSearchVoucherNo").focus();
}

function closeEditedVoucher(message = "") {
  state.editingVoucherId = 0;
  state.editingVoucherNo = "";
  setEntryMode("edit");
  resetForm({ focusFirst: false });
  $("message").textContent = message;
  $("editSearchVoucherNo").focus();
}

function resetForm({ focusFirst = true } = {}) {
  $("voucherForm").reset();
  $("voucherDate").value = today();
  setDefaultLocation();
  state.lines = [];
  state.multiPartyIds = [];
  $("message").textContent = "";
  $("reviewVoucherNo").textContent = "Generated on save";
  $("newPartyPanel").classList.add("hidden");
  $("partyHistoryPanel").classList.add("hidden");
  $("partyHistoryPanel").open = false;
  $("partyHistoryList").innerHTML = "";
  renderSelectedMultiParties();
  toggleVoucherType();
  renderLines();
  if (focusFirst) $("voucherType").focus();
}

function confirmAndResetForm() {
  if (!window.confirm("Cancel this voucher entry and clear the form?")) return;
  if (state.mode === "edit") {
    state.editingVoucherId = 0;
    state.editingVoucherNo = "";
    setEntryMode("edit");
    resetForm({ focusFirst: false });
    $("editSearchVoucherNo").focus();
    return;
  }
  resetForm();
}

function toggleVoucherType() {
  const isReceipt = $("voucherType").value === "Receipt";
  if (isReceipt && state.lines.length > 0) {
    if (!window.confirm("Changing to Receipt will remove the entered expense lines. Continue?")) {
      $("voucherType").value = "Expense";
      return;
    }
    state.lines = [];
    renderLines();
  }
  $("lineSection").classList.toggle("hidden", isReceipt);
  $("receiptAmountWrap").classList.toggle("hidden", !isReceipt);
  refreshPurposeList({ clearInvalid: true });
  updatePartyFieldText();
  updateReview();
}

function toggleSplitMethod() {
  const splitMethod = $("lineSplit").value;
  const isHeadOnly = splitMethod === "Head Only";
  const isMultiple = splitMethod === "Participants Equal";
  $("singlePartyWrap").classList.toggle("hidden", isHeadOnly || isMultiple);
  $("multiPartyWrap").classList.toggle("hidden", !isMultiple);
  $("headWrap").classList.toggle("hidden", !isHeadOnly);
  syncSinglePersonFromPaidTo();
  syncMultiPersonsFromPaidTo();
  if (isMultiple) {
    $("lineMultiPartyText").focus();
  }
}

function addLineFromEditor() {
  try {
    const line = lineDraft();
    validateLine(line);
    state.lines.push(line);
    renderLines();
    clearLineEditor();
  } catch (error) {
    $("message").textContent = error.message;
  }
}

async function saveVoucher(event) {
  event.preventDefault();
  try {
    const isEdit = state.mode === "edit" && state.editingVoucherId;
    const draftHeader = selectedHeader();
    validateHeaderBeforeParty(draftHeader);
    if (!confirmFutureVoucherDate(draftHeader.voucherDate)) {
      $("message").textContent = "Save cancelled. Correct the voucher date or save again if the future date is intentional.";
      return;
    }
    const header = await selectedHeaderWithParty();
    validateHeader(header);
    if (header.voucherType === "Receipt" && state.lines.length > 0) {
      throw new Error("Receipt vouchers cannot have expense lines. Change to Expense or remove the lines.");
    }
    if (header.voucherType === "Expense" && state.lines.length === 0) {
      throw new Error("Add at least one expense line.");
    }
    const lines = prepareLinesForSave(header);
    const duplicateHeader = isEdit ? { ...header, excludeVoucherId: state.editingVoucherId } : header;
    const shouldSave = await confirmNoDuplicate(duplicateHeader, lines);
    if (!shouldSave) {
      $("message").textContent = `${isEdit ? "Update" : "Save"} cancelled. Your entries are still on the page so you can review or change them.`;
      return;
    }

    const response = await fetch(isEdit ? `/api/vouchers/${encodeURIComponent(state.editingVoucherId)}` : "/api/vouchers", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...header,
        lines,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Save failed.");

    $("reviewVoucherNo").textContent = result.voucherNo || result.header?.Voucher_No_ || "Dry run";
    $("message").textContent = JSON.stringify(result, null, 2);
    if (result.dryRun) {
      $("message").textContent = "Dry-run validation passed. No voucher was written to Grist.";
    } else if (isEdit) {
      await refreshRecentVouchers();
      await searchEditableVouchers();
      closeEditedVoucher(`Updated ${result.voucherNo}. The voucher is closed from edit mode.`);
    } else {
      $("message").textContent = `Saved ${result.voucherNo}. Preparing a new entry...`;
      window.setTimeout(() => window.location.reload(), 900);
    }
  } catch (error) {
    $("message").textContent = error.message;
  }
}

function prepareLinesForSave(header) {
  const paidTo = recordById(state.refs.parties, header.paidToPartyId);
  return state.lines.map((line, index) => {
    const prepared = { ...line };
    if (prepared.splitMethod === "Single Person" && !prepared.singlePartyId && paidTo?.Party_Type === "Employee") {
      prepared.singlePartyId = paidTo.id;
    }
    validateLine(prepared, index + 1);
    return prepared;
  });
}

function cleanTypedName(text) {
  return cleanOptionText(text);
}

function cleanTypedDescription(text) {
  return cleanOptionText(text);
}

async function selectedHeaderWithParty() {
  const header = selectedHeader();
  if (header.paidToPartyId) {
    return header;
  }

  const partyName = cleanTypedName($("paidToPartyText").value);
  if (!partyName) {
    return header;
  }
  validateNewPartyName(partyName);

  $("newPartyPanel").classList.remove("hidden");
  const partyLocationId = idFromText($("newPartyLocationText").value, state.refs.locations, "Location_Name") || header.locationId;
  if (!partyLocationId) {
    throw new Error(`${partyFieldName()} is new. Choose a party location, then save again.`);
  }

  if (!confirmNewPartyNearMatches(partyName)) {
    throw new Error(`New ${partyFieldName().toLowerCase()} was not added. Choose an existing party or correct the typed name, then save again.`);
  }

  const response = await fetch("/api/parties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partyName,
      partyType: $("newPartyType").value,
      locationId: partyLocationId,
    }),
  });
  const newParty = await response.json();
  if (!response.ok) throw new Error(newParty.error || `Could not add new ${partyFieldName().toLowerCase()} party.`);

  state.refs.parties.push(newParty);
  fillDatalist("partyList", state.refs.parties, "Party_Name");
  fillDatalist("employeePartyList", employeePartyRecords(), "Party_Name");
  $("paidToPartyText").value = optionLabel(newParty, "Party_Name", state.refs.parties.length - 1);
  refreshCombobox("paidToPartyText");
  refreshCombobox("lineSinglePartyText");
  refreshCombobox("lineMultiPartyText");
  $("newPartyPanel").classList.add("hidden");
  return { ...header, paidToPartyId: newParty.id };
}

function templateLinesFor(templateId) {
  return state.refs.templateLines
    .filter((line) => Number(line.Template) === Number(templateId))
    .sort((a, b) => (a.Line_No || 0) - (b.Line_No || 0));
}

function applyTemplate() {
  const templateId = idFromText($("templateText").value, state.refs.templates, "Template_Name");
  const template = recordById(state.refs.templates, templateId);
  if (!template) {
    $("message").textContent = "Choose a saved template.";
    return;
  }

  $("voucherType").value = template.Voucher_Type || "Expense";
  $("voucherDate").value = today();
  refreshPurposeList();
  $("voucherPurposeText").value = valueById(currentPurposeRecords(), template.Voucher_Purpose, "Purpose_Name");
  $("locationText").value = valueById(state.refs.locations, template.Location, "Location_Name");
  $("purpose").value = template.Purpose || "";
  $("receiptAmount").value = "";
  state.lines = templateLinesFor(templateId).map((line) => ({
    expenseHeadId: line.Expense_Head,
    amount: 0,
    splitMethod: line.Split_Method || "Single Person",
    singlePartyId: line.Split_Method === "Single Person" ? paidToEmployeeId() || undefined : undefined,
    participantPartyIds: [],
    headId: line.Split_Method === "Head Only" ? line.Head_Only_Head : undefined,
    description: line.Description || "",
  }));
  $("message").textContent = `Template "${template.Template_Name}" applied. Enter ${partyFieldName()}, amounts, and person where needed.`;
  toggleVoucherType();
  renderLines();
  $("paidToPartyText").focus();
}

async function saveAsTemplate() {
  try {
    const header = selectedHeader();
    validateVoucherDate(header.voucherDate);
    if (!header.voucherPurposeId) throw new Error("Choose a voucher purpose before saving template.");
    if (!header.locationId) throw new Error("Choose a location before saving template.");
    if (!header.purpose) throw new Error("Enter purpose / description before saving template.");
    if (header.voucherType === "Expense" && state.lines.length === 0) throw new Error("Add at least one line before saving template.");

    const templateName = cleanOptionText(window.prompt("Enter the template name you want to associate with this voucher pattern:"));
    if (!templateName) return;
    if (templateName.length > 120) throw new Error("Template name must be 120 characters or less.");
    const existingTemplate = state.refs.templates.find((template) => template.Active !== false && String(template.Template_Name || "").trim().toLowerCase() === templateName.toLowerCase());
    if (existingTemplate) throw new Error(`Template "${templateName}" already exists. Choose a different template name.`);
    if (!window.confirm(`Save "${templateName}" as a reusable template? Amounts and people will not be saved.`)) return;

    state.lines.forEach((line, index) => validateLine({ ...line }, index + 1));
    const templateLines = state.lines.map((line) => ({
      expenseHeadId: line.expenseHeadId,
      splitMethod: line.splitMethod,
      headId: line.headId,
      description: line.description || "",
    }));

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateName,
        voucherType: header.voucherType,
        voucherPurposeId: header.voucherPurposeId,
        locationId: header.locationId,
        purpose: header.purpose,
        lines: templateLines,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save template.");
    $("message").textContent = `Template saved: ${result.templateName}`;
    await refreshReferenceData();
  } catch (error) {
    $("message").textContent = error.message;
  }
}

function handleKeyboardShortcuts(event) {
  if (event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.key === "Enter") {
    event.preventDefault();
    addLineFromEditor();
    return;
  }

  if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;

  const actions = {
    F2: () => $("voucherForm").requestSubmit(),
    F3: confirmAndResetForm,
    F6: applyTemplate,
    F7: refreshRecentVouchers,
    F8: saveAsTemplate,
  };

  const action = actions[event.key];
  if (!action) return;
  event.preventDefault();
  action();
}

function setupComboboxes() {
  setupCombobox("templateText", {
    getRecords: () => state.refs.templates,
    labelField: "Template_Name",
    groupPinned: false,
    allowFree: false,
  });
  setupCombobox("voucherPurposeText", {
    getRecords: currentPurposeRecords,
    labelField: "Purpose_Name",
    groupPinned: true,
    allowFree: false,
    onSelect: () => {
      refreshPurposeDescriptionList();
      refreshCombobox("lineExpenseHeadText");
    },
  });
  setupCombobox("paidToPartyText", {
    getRecords: () => state.refs.parties,
    labelField: "Party_Name",
    groupPinned: false,
    allowFree: true,
    onSelect: () => {
      $("newPartyPanel").classList.add("hidden");
      refreshPartyHistory();
      syncSinglePersonFromPaidTo({ overwrite: true });
      syncMultiPersonsFromPaidTo();
      if (state.lines.length > 0) renderLines();
    },
  });
  setupCombobox("editSearchPartyText", {
    getRecords: () => state.refs.parties,
    labelField: "Party_Name",
    groupPinned: false,
    allowFree: true,
  });
  setupCombobox("locationText", {
    getRecords: () => state.refs.locations,
    labelField: "Location_Name",
    groupPinned: false,
    allowFree: false,
    onSelect: () => refreshPurposeDescriptionList(),
  });
  setupCombobox("purpose", {
    getRecords: currentPurposeDescriptionRecords,
    labelField: "Description_Text",
    groupPinned: true,
    allowFree: true,
  });
  setupCombobox("lineExpenseHeadText", {
    getRecords: currentExpenseHeadRecords,
    labelField: "Expense_Head_Name",
    getGroups: expenseHeadGroups,
    allowFree: false,
  });
  setupCombobox("lineSinglePartyText", {
    getRecords: () => state.refs.parties,
    labelField: "Party_Name",
    groupPinned: false,
    allowFree: false,
  });
  setupCombobox("lineMultiPartyText", {
    getRecords: employeePartyRecords,
    labelField: "Party_Name",
    groupPinned: false,
    allowFree: false,
  });
  setupCombobox("lineHeadText", {
    getRecords: () => state.refs.heads,
    labelField: "Head_Name",
    groupPinned: false,
    allowFree: false,
  });
  setupCombobox("newPartyLocationText", {
    getRecords: () => state.refs.locations,
    labelField: "Location_Name",
    groupPinned: false,
    allowFree: false,
  });
}

async function refreshReferenceData() {
  const response = await fetch("/api/reference-data");
  state.refs = await response.json();
  state.refs.purposes = sortVoucherPurposes(state.refs.purposes);
  refreshPurposeList();
  refreshPurposeDescriptionList();
  fillDatalist("partyList", state.refs.parties, "Party_Name");
  fillDatalist("employeePartyList", employeePartyRecords(), "Party_Name");
  fillDatalist("expenseHeadList", currentExpenseHeadRecords(), "Expense_Head_Name");
  fillDatalist("locationList", state.refs.locations, "Location_Name");
  fillDatalist("headList", state.refs.heads, "Head_Name");
  fillDatalist("templateList", state.refs.templates, "Template_Name");
  refreshAllComboboxes();
}

async function refreshCurrentUser() {
  const badge = $("userBadge");
  if (!badge) return;
  try {
    const response = await fetch("/api/me");
    if (!response.ok) throw new Error("Could not load signed-in user.");
    const result = await response.json();
    const user = result.user || {};
    badge.textContent = user.name || user.email || "Signed in";
    badge.title = user.email || user.username || user.name || "";
  } catch {
    badge.textContent = "Signed in";
  }
}

async function refreshAppConfig() {
  const banner = $("dryRunBanner");
  if (!banner) return;
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("Could not load app config.");
    const config = await response.json();
    banner.classList.toggle("hidden", !config.dryRun);
  } catch {
    banner.classList.add("hidden");
  }
}

function setGristStatus({ available, message = "" }) {
  state.gristAvailable = Boolean(available);
  const status = $("gristStatus");
  const text = $("gristStatusText");
  const form = $("voucherForm");
  const unavailablePanel = $("gristUnavailablePanel");
  const unavailableMessage = $("gristUnavailableMessage");
  if (!status || !text) return;

  status.classList.toggle("grist-status-ok", state.gristAvailable);
  status.classList.toggle("grist-status-error", !state.gristAvailable);
  status.classList.toggle("grist-status-checking", false);
  text.textContent = state.gristAvailable ? "Grist available" : "Grist not available";

  form?.classList.toggle("hidden", !state.gristAvailable);
  unavailablePanel?.classList.toggle("hidden", state.gristAvailable);
  if (unavailableMessage && message) {
    unavailableMessage.textContent = message;
  }
}

async function checkGristHealth({ showChecking = false } = {}) {
  const status = $("gristStatus");
  const text = $("gristStatusText");
  if (showChecking && status && text) {
    status.classList.remove("grist-status-ok", "grist-status-error");
    status.classList.add("grist-status-checking");
    text.textContent = "Checking Grist...";
  }

  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    if (!response.ok || !health.gristAvailable) {
      throw new Error(health.error || "Grist is not reachable.");
    }
    setGristStatus({ available: true });
    return true;
  } catch (error) {
    setGristStatus({
      available: false,
      message: `The voucher entry form is paused because Grist is not reachable. ${error.message}`,
    });
    return false;
  }
}

function setDefaultLocation() {
  const local = state.refs.locations.find((row) => row.Location_Name === "Local") || state.refs.locations[0];
  if (local) {
    $("locationText").value = optionLabel(local, "Location_Name", state.refs.locations.indexOf(local));
    refreshPurposeDescriptionList();
  }
}

function scrollLinesIntoView(event) {
  const lineSection = $("lineSection");
  if (!lineSection || lineSection.classList.contains("hidden")) return;
  if (event.relatedTarget && lineSection.contains(event.relatedTarget)) return;
  lineSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusNextEntrySection() {
  const lineSection = $("lineSection");
  if (lineSection && !lineSection.classList.contains("hidden")) {
    $("lineExpenseHeadText").focus();
    return;
  }
  $("saveVoucher").focus();
}

function skipRecentEntriesInTabOrder(event) {
  if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  focusNextEntrySection();
}

async function init() {
  await refreshCurrentUser();
  await refreshAppConfig();
  const gristOk = await checkGristHealth({ showChecking: true });
  $("retryGristHealth").addEventListener("click", async () => {
    if (await checkGristHealth({ showChecking: true })) {
      await refreshReferenceData();
      setDefaultLocation();
      await refreshRecentVouchers();
    }
  });
  window.setInterval(() => checkGristHealth(), 30000);
  if (!gristOk) return;

  await refreshReferenceData();
  setupComboboxes();
  refreshAllComboboxes();
  await refreshRecentVouchers();
  setEntryMode("new");

  $("voucherDate").value = today();
  setDefaultLocation();
  $("voucherType").addEventListener("change", () => {
    toggleVoucherType();
    refreshCombobox("voucherPurposeText");
    refreshCombobox("purpose");
    refreshCombobox("lineExpenseHeadText");
  });
  $("voucherPurposeText").addEventListener("change", () => {
    refreshPurposeDescriptionList();
    refreshCombobox("purpose");
    refreshCombobox("lineExpenseHeadText");
  });
  $("locationText").addEventListener("change", () => {
    refreshPurposeDescriptionList();
    refreshCombobox("purpose");
  });
  $("purpose").addEventListener("keydown", (event) => {
    if (!$("newPartyPanel").classList.contains("hidden")) return;
    skipRecentEntriesInTabOrder(event);
  });
  $("newPartyLocationText").addEventListener("keydown", skipRecentEntriesInTabOrder);
  $("lineSplit").addEventListener("change", toggleSplitMethod);
  $("lineSection").addEventListener("focusin", scrollLinesIntoView);
  ["voucherType", "receiptAmount"].forEach((id) => $(id).addEventListener("input", updateReview));
  $("paidToPartyText").addEventListener("input", () => {
    $("newPartyPanel").classList.toggle("hidden", Boolean(idFromText($("paidToPartyText").value, state.refs.parties, "Party_Name")));
  });
  $("paidToPartyText").addEventListener("change", () => {
    $("newPartyPanel").classList.toggle("hidden", Boolean(idFromText($("paidToPartyText").value, state.refs.parties, "Party_Name")));
    refreshPartyHistory();
    syncSinglePersonFromPaidTo({ overwrite: true });
    syncMultiPersonsFromPaidTo();
    if (state.lines.length > 0) renderLines();
  });
  $("voucherForm").addEventListener("submit", saveVoucher);
  $("newVoucherTab").addEventListener("click", switchToNewMode);
  $("editVoucherTab").addEventListener("click", switchToEditMode);
  $("searchVouchers").addEventListener("click", searchEditableVouchers);
  $("clearVoucherSearch").addEventListener("click", clearVoucherSearch);
  ["editSearchVoucherNo", "editSearchDate", "editSearchMonth", "editSearchPartyText"].forEach((id) => {
    $(id).addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      searchEditableVouchers();
    });
  });
  $("editSearchResults").addEventListener("click", (event) => {
    const button = event.target.closest("button.edit-voucher");
    if (!button) return;
    loadVoucherForEdit(button.dataset.voucherId);
  });
  $("refreshRecent").addEventListener("click", refreshRecentVouchers);
  $("applyTemplate").addEventListener("click", applyTemplate);
  $("saveTemplate").addEventListener("click", saveAsTemplate);
  $("cancelVoucher").addEventListener("click", confirmAndResetForm);
  $("addMultiParty").addEventListener("click", addSelectedMultiParty);
  $("lineMultiPartyText").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSelectedMultiParty();
    }
  });
  $("selectedMultiParties").addEventListener("click", (event) => {
    const button = event.target.closest("button.remove-multi-party");
    if (!button) return;
    state.multiPartyIds = state.multiPartyIds.filter((id) => id !== Number(button.dataset.partyId));
    renderSelectedMultiParties();
  });
  $("addLine").addEventListener("click", addLineFromEditor);
  document.addEventListener("keydown", handleKeyboardShortcuts);
  $("lineRows").addEventListener("click", (event) => {
    const button = event.target.closest("button.remove-line");
    if (!button) return;
    state.lines.splice(Number(button.dataset.index), 1);
    renderLines();
  });
  $("lineRows").addEventListener("input", (event) => {
    const input = event.target.closest("[data-index]");
    if (!input) return;
    const line = state.lines[Number(input.dataset.index)];
    if (!line) return;
    if (input.dataset.field === "amount") {
      try {
        line.amount = parseAmountText(input.value, `Line ${Number(input.dataset.index) + 1} amount`);
        input.classList.remove("invalid");
        $("message").textContent = "";
      } catch (error) {
        line.amount = Number(input.value || 0);
        input.classList.add("invalid");
        $("message").textContent = error.message;
      }
    } else if (input.dataset.field === "description") {
      line.description = input.value;
    } else if (input.dataset.field === "target") {
      if (line.splitMethod === "Single Person") {
        line.singlePartyId = idFromText(input.value, state.refs.parties, "Party_Name");
      } else if (line.splitMethod === "Head Only") {
        line.headId = idFromText(input.value, state.refs.heads, "Head_Name");
      }
    }
    updateReview();
  });

  toggleVoucherType();
  toggleSplitMethod();
  syncSinglePersonFromPaidTo();
  renderSelectedMultiParties();
  updateReview();
  $("voucherType").focus();
}

init().catch((error) => {
  $("message").textContent = error.message;
});
