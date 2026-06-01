// js/registrations.js
// ============================================================================
// CONvergence Check-In Extension — Event Registration Details Page Script
// ============================================================================
//
// Activates on the eventRegDetails.do page (the "Registration Details" view
// that lists all attendees on a single registration). Scrapes each attendee's
// data and validates their check-in eligibility.
//
// WORKFLOW:
//   1. On page load, scrape all data and store in chrome.storage.local
//   2. Trigger a PENDING_ICON_UPDATE so background.js sets the icon colour
//   3. Listen for ACTION.GET_REGISTRATIONS from popup.js and respond fresh
//
// IMPORTANT — TWO DIFFERENT FIELD LAYOUTS ON THIS PAGE:
//
//   Both the standard CONvergence event and the Dealer Spaces event use the
//   same td.viewLabel / span.viewField structure, BUT the field ORDER differs:
//
//   Standard event  — "Registration Hold - Do Not Release" is the FIRST field.
//                     findFieldsTable() uses it as a sentinel to locate the table.
//                     ICE label: "In Case Of Emergency (Name and Phone)"
//
//   Dealer event    — Hold fields are at the BOTTOM of the table, not the top.
//                     ICE label: "Badge: Emergency Contact"
//                     No "Preferred Name" field.
//                     Name comes from "Badge: First Name" / "Badge: Last Name".
//
//   Because the sentinel differs, findFieldsTable() tries the standard sentinel
//   first then falls back to any nested table that contains a known common field
//   like "Number of Active Badges". readICEContact() tries both label variants.
//
// CONFIG, STATE, REG_STATUS, ACTION, STORAGE_KEY, CONDITION, EVENT_MATCH are
// injected as globals by the manifest. Do not add import statements.
//
// Injected by manifest on: /np/admin/event/eventRegDetails.do
// ============================================================================

// ── EXTENSION MODE (cached) ─────────────────────────────────────────────
// Read once on page load. The popup's GET_REGISTRATIONS listener uses the
// cached value so synchronous scrape paths don't have to re-read storage.
// Mode changes take effect on next page navigation.

let extensionMode = EXTENSION_MODE.REG;

// ── TRIGGER DATA SCRAPE AND ICON UPDATE ON PAGE LOAD ────────────────────

(async function triggerIconUpdate() {
  console.log("registrations.js: page load, triggering data scrape");
  const modeResult = await chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG });
  extensionMode    = modeResult[STORAGE_KEY.EXTENSION_MODE];
  console.log(`registrations.js: extensionMode = ${extensionMode}`);

  const data  = getRegistrationsInfo();
  const notes = getRegistrationNotes();
  await chrome.storage.local.set({
    [STORAGE_KEY.REGISTRATIONS]: { data, notes }
  });
  await chrome.storage.local.set({
    [STORAGE_KEY.PENDING_ICON_UPDATE]: { page: "registrations", ts: Date.now() }
  });
  console.log(`registrations.js: wrote registration data (${data.length} attendees, ${notes.length} notes) and triggered icon update`);

  // Manager Debug Walk -- if the walk is active, append a step entry with
  // the eventreg findings, then auto-click the first attendee's edit link
  // to advance the walk to its final stop.
  await maybeAdvanceDebugWalk(data, notes);
})();

/**
 * Debug-walk step for the eventreg page. No-op if STORAGE_KEY.DEBUG_WALK_ACTIVE
 * is not set. Otherwise: appends one step entry with event-name + validation
 * + attendee-count details, then clicks the first attendee's Edit link.
 */
async function maybeAdvanceDebugWalk(data, notes) {
  const walkResult = await chrome.storage.local.get(STORAGE_KEY.DEBUG_WALK_ACTIVE);
  if (!walkResult[STORAGE_KEY.DEBUG_WALK_ACTIVE]) return;

  const eventName  = getEventName();
  const validation = validateEventName(eventName);
  const firstLink  = document.querySelector("td.textSmall a[href*='attendeeEdit']");

  // Enumerate the first attendee's custom fields and check the labels the
  // extension relies on. Presence (not value) is what matters here -- a field
  // that exists but is empty is still "found".
  const firstTextSmall = document.querySelector("td.textSmall");
  const fieldsTable    = firstTextSmall ? findFieldsTable(firstTextSmall) : null;
  const fields         = enumerateFieldsTable(fieldsTable);

  const usedSpecs = [
    { role: "registrationHold", label: CONFIG.holdMessages[0].title },
    { role: "artShowHold",      label: CONFIG.holdMessages[1].title },
    { role: "operationsHold",   label: CONFIG.holdMessages[2].title },
    { role: "iceContact",       label: CONFIG.fieldLabels.iceContact, altLabel: "Badge: Emergency Contact" },
    { role: "preferredName",    label: CONFIG.fieldLabels.preferredName },
    { role: "activeBadgeCount", label: CONFIG.fieldLabels.activeBadgeCount },
  ];
  const used = usedSpecs.map(s => ({
    role:  s.role,
    label: s.label,
    found: fields.some(f => f.label.includes(s.label)) ||
           (s.altLabel ? fields.some(f => f.label.includes(s.altLabel)) : false),
  }));
  const missing = used.filter(u => !u.found);

  // Roster audit -- inspect EVERY attendee in this registration (not just the
  // first), resolving ticket type / holds / ICE / badges per attendee so
  // ticket renames and missing data surface before the check-in line forms.
  const roster = Array.from(document.querySelectorAll("td.textSmall")).map(td => {
    const ft         = findFieldsTable(td);
    const ticketName = readTicketType(td);
    const ticketCfg  = resolveTicketConfig(ticketName);
    const holds      = readHolds(ft);
    return {
      name:           readNameAndAccountId(td).legalName || "(no name)",
      ticketName,
      ticket:         ticketCfg.ticketLabel,
      ticketResolved: ticketCfg.ticketLabel !== "Unknown",
      icePresent:     readICEContact(ft) !== "",
      badges:         parseInt(readField(ft, CONFIG.fieldLabels.activeBadgeCount) || "0", 10) || 0,
      anyHold:        holds.regHold || holds.artHold || holds.opsHold,
      layout:         ft ? (ft.textContent.includes(CONFIG.holdMessages[0].title) ? "standard" : "dealer/alt") : "none",
    };
  });

  const issues = [];
  if (validation.type === EVENT_MATCH.MISMATCH) {
    issues.push({ severity: "error",   message: `Event "${eventName}" did not match any currentEventNames or testEventNames` });
  }
  if (data.length === 0) {
    issues.push({ severity: "error",   message: "Zero attendee rows were scraped from this registration" });
  }
  if (!fieldsTable) {
    issues.push({ severity: "warning", message: "Could not locate the first attendee's custom-fields table -- field list may be incomplete" });
  }
  missing.forEach(m => {
    issues.push({ severity: "warning", message: `Extension field "${m.role}" (label "${m.label}") was not found on the eventReg page` });
  });
  roster.filter(a => !a.ticketResolved).forEach(a => {
    issues.push({ severity: "warning", message: `Attendee "${a.name}" ticket "${a.ticketName || "(none)"}" did not match any CONFIG.ticketTypes — would be UNKNOWN_TICKET` });
  });
  if (!firstLink) {
    issues.push({ severity: "error",   message: "Could not find an attendeeEdit link to click for the next walk step -- walk will halt here" });
  }

  const status = issues.some(i => i.severity === "error")   ? "error"
               : issues.some(i => i.severity === "warning") ? "warning"
               : "ok";

  await appendDebugStep("eventreg", status,
    {
      eventName,
      validationType:  validation.type,
      attendeeCount:   data.length,
      noteCount:       notes.length,
      firstAttendeeId: firstLink?.getAttribute("href")?.match(/[?&]id=(\d+)/)?.[1] ?? null,
      fields,
      used,
      missing,
      roster,
    },
    issues,
  );

  if (!firstLink) {
    // Walk halts here. Open the report anyway so the user sees the partial
    // results plus why it stopped. background.js clears DEBUG_WALK_ACTIVE.
    console.log("registrations.js: debug walk halting (no attendee link) -- opening partial report");
    chrome.runtime.sendMessage({ action: ACTION.OPEN_DEBUG_REPORT });
    return;
  }

  console.log("registrations.js: debug walk advancing to first attendee:", firstLink.href);
  firstLink.click();
}

/**
 * Local helper -- appends a step entry to STORAGE_KEY.DEBUG_REPORT.
 * Mirrors appendDebugStepIfWalkActive in accountPage.js (different
 * content-script world; can't share scope). Assumes walk is already
 * confirmed active by the caller.
 */
async function appendDebugStep(step, status, details, issues = []) {
  const result = await chrome.storage.local.get(STORAGE_KEY.DEBUG_REPORT);
  const report = result[STORAGE_KEY.DEBUG_REPORT] ?? { steps: [], startedAt: Date.now() };
  report.steps.push({ step, status, details, issues, recordedAt: new Date().toISOString() });
  await chrome.storage.local.set({ [STORAGE_KEY.DEBUG_REPORT]: report });
  console.log(`registrations.js: appended debug step "${step}" (${status})`, details, issues);
}

// ── MESSAGE LISTENER FOR POPUP REQUESTS ─────────────────────────────────

/**
 * Listens for ACTION.GET_REGISTRATIONS from popup.js.
 * Returns fresh scraped data directly (not from storage) so the popup
 * always shows the current page state.
 *
 * NOTE: `return true` keeps the response channel open — required even for
 * synchronous work to prevent Chrome from closing the channel early.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.PING) {
    sendResponse({ ok: true, script: "registrations.js" });
    return false;
  }
  if (request.action === ACTION.GET_REGISTRATIONS) {
    console.log("registrations.js: received GET_REGISTRATIONS message");
    try {
      sendResponse({
        data:  getRegistrationsInfo(),
        notes: getRegistrationNotes(),
      });
    } catch (err) {
      console.error("registrations.js: GET_REGISTRATIONS scrape failed:", err);
      sendResponse({ data: [], notes: [] });
    }
    return true; // keep channel open
  }
});

// ── PAGE-LEVEL HELPERS ───────────────────────────────────────────────────

/**
 * Extracts the overall registration status from the page header.
 * Neon renders this as uppercase text inside a <font> or <span> tag
 * (e.g., "SUCCEEDED", "PENDING", "CANCELED").
 * Returns the first all-uppercase word found, or empty string.
 */
function getRegStatus() {
  return Array.from(document.querySelectorAll("font"))
    .map(f => f.textContent.trim())
    .find(t => t.length > 0 && t === t.toUpperCase() && t.length < 30)
    ?? "";
}

/**
 * Extracts the event name from the .contentHeader breadcrumb link.
 * E.g., "CONvergence 2026: The Geek in the Machine"
 * Returns empty string if the link is not found.
 */
function getEventName() {
  const eventLink = document.querySelector(".contentHeader a");
  const eventName = eventLink?.textContent?.trim() ?? "";
  console.log(`registrations.js: extracted event name: "${eventName}"`);
  return eventName;
}

/**
 * Validates the event name against the two configured lists in CONFIG:
 *   currentEventNames — the real CONvergence events this year
 *   testEventNames    — training / test events
 *
 * Returns { type: EVENT_MATCH.CURRENT | TEST | MISMATCH, eventName }
 * MISMATCH means the page is showing an event we don't recognise,
 * and check-in should be blocked for all attendees.
 */
function validateEventName(eventName) {
  if (!eventName) {
    console.warn("registrations.js: event name is empty, cannot validate");
    return { type: EVENT_MATCH.MISMATCH, eventName: "(unknown)" };
  }

  const isCurrent = CONFIG.event.currentEventNames.some(name => eventName.includes(name));
  if (isCurrent) {
    console.log(`registrations.js: event "${eventName}" matches a currentEventName`);
    return { type: EVENT_MATCH.CURRENT, eventName };
  }

  const isTest = CONFIG.event.testEventNames.some(name => eventName.includes(name));
  if (isTest) {
    console.log(`registrations.js: event "${eventName}" matches a testEventName`);
    return { type: EVENT_MATCH.TEST, eventName };
  }

  console.warn(`registrations.js: event "${eventName}" does not match any configured event`);
  return { type: EVENT_MATCH.MISMATCH, eventName };
}

// ── NOTES SCRAPING ───────────────────────────────────────────────────────

/**
 * Scrapes registration notes from the #noteLayout / #noteContent section.
 *
 * Neon renders notes as alternating children inside #noteContent:
 *   - A bold <div> with the author name and date (the "title")
 *   - A left-aligned <div> with the note text (the "body")
 *
 * Returns an array of { title, body } objects, or [] if no notes found.
 *
 * FRAGILITY NOTE: This relies on inline styles (`font-weight: bold` and
 * `text-align: left`) set by Neon's own rendering code. If Neon switches
 * to stylesheet-based styling, these selectors will stop matching. Watch
 * for "scraped 0 note(s)" in the console if notes are unexpectedly absent.
 */
function getRegistrationNotes() {
  const notes = [];

  const noteLayout = document.getElementById("noteLayout");
  if (!noteLayout || noteLayout.style.display === "none") {
    console.log("registrations.js: no note layout found or it is hidden");
    return notes;
  }

  const noteContent = document.getElementById("noteContent");
  if (!noteContent) {
    console.log("registrations.js: #noteContent not found");
    return notes;
  }

  const children = Array.from(noteContent.children);
  let currentTitle = "";
  let currentBody  = "";

  for (const child of children) {
    const text = child.textContent?.trim() ?? "";

    if (child.style?.fontWeight === "bold" || child.className?.includes("bold")) {
      // Save the previous note before starting a new one
      if (currentTitle || currentBody) {
        notes.push({ title: currentTitle || "(Note)", body: currentBody });
        currentTitle = "";
        currentBody  = "";
      }
      currentTitle = text;
    } else if (text && child.style?.textAlign === "left") {
      currentBody = text;
    }
  }

  // Save the last note
  if (currentTitle || currentBody) {
    notes.push({ title: currentTitle || "(Note)", body: currentBody });
  }

  console.log(`registrations.js: scraped ${notes.length} note(s)`);
  return notes;
}

// ── PER-ATTENDEE FIELD HELPERS ────────────────────────────────────────────

/**
 * Reads a single field value from an attendee's fields table.
 * Walks all td.viewLabel cells looking for one whose text starts with
 * labelText, then returns the text of the adjacent span.viewField.
 *
 * Both the standard event and the dealer event use td.viewLabel /
 * span.viewField, so a single implementation handles both layouts.
 *
 * @param {Element|null} fieldsTable — the <table> returned by findFieldsTable
 * @param {string}       labelText   — prefix to match against cell label text
 * @returns {string} The field value, or "" if not found
 */
function readField(fieldsTable, labelText) {
  if (!fieldsTable) return "";

  // ── Standard layout: td.viewLabel → span.viewField ──
  for (const td of fieldsTable.querySelectorAll("td.viewLabel")) {
    const raw = td.childNodes[0]?.textContent?.trim() ?? "";
    if (raw.includes(labelText)) {
      const val = td.querySelector("span.viewField")?.textContent?.trim() ?? "";
      console.log(`readField [standard] "${labelText}" → "${val || "(empty)"}"`);
      return val;
    }
  }

  // ── Dealer layout: plain <td> with inline "Label: <span>value</span>" ──
  for (const td of fieldsTable.querySelectorAll("td:not(.viewLabel):not(.viewField)")) {
    const raw = td.childNodes[0]?.textContent?.trim() ?? "";
    if (raw.includes(labelText)) {
      const val = td.querySelector("span")?.textContent?.trim() ?? "";
      console.log(`readField [dealer] "${labelText}" → "${val || "(empty)"}"`);
      return val;
    }
  }

  console.log(`readField "${labelText}" → NOT FOUND`);
  return "";
}

/**
 * DEBUG WALK: enumerates every label/value pair in an attendee's fields table.
 * Used by the debug audit to show "all fields on the page". Returns
 * [{label, value}], standard layout first, dealer layout as fallback.
 *
 * @param {Element|null} fieldsTable
 * @returns {{label: string, value: string}[]}
 */
function enumerateFieldsTable(fieldsTable) {
  const out = [];
  if (!fieldsTable) return out;

  const labelCells = fieldsTable.querySelectorAll("td.viewLabel");
  if (labelCells.length > 0) {
    for (const td of labelCells) {
      const label = (td.childNodes[0]?.textContent ?? "").trim();
      const value = (td.querySelector("span.viewField")?.textContent ?? "").trim();
      if (label) out.push({ label, value });
    }
    return out;
  }

  // Dealer fallback: plain <td> with inline "Label: <span>value</span>"
  for (const td of fieldsTable.querySelectorAll("td")) {
    const label = (td.childNodes[0]?.textContent ?? "").trim();
    const span  = td.querySelector("span");
    if (label && span) out.push({ label, value: span.textContent.trim() });
  }
  return out;
}

/**
 * Reads the ICE (emergency contact) field, trying both label variants:
 *   Standard event: "In Case Of Emergency (Name and Phone)"  (CONFIG.fieldLabels.iceContact)
 *   Dealer event:   "Badge: Emergency Contact"
 *
 * Returns the first non-empty match, or "" if neither is found.
 *
 * @param {Element|null} fieldsTable
 * @returns {string}
 */
function readICEContact(fieldsTable) {
  // Try the configured standard label first
  const standard = readField(fieldsTable, CONFIG.fieldLabels.iceContact);
  if (standard) return standard;

  // Dealer event fallback label
  const dealer = readField(fieldsTable, "Badge: Emergency Contact");
  if (dealer) {
    console.log("registrations.js: ICE contact found via dealer label 'Badge: Emergency Contact'");
  }
  return dealer;
}

/**
 * Reads the dealer badge name from "Badge: First Name" and "Badge: Last Name" fields.
 * Returns the combined name, or "" if neither field is present (non-dealer page).
 * Used as legalName for dealer attendees since the account link gives the business
 * owner's name, not the badge holder's name.
 *
 * @param {Element|null} fieldsTable
 * @returns {string}
 */
function readDealerBadgeName(fieldsTable) {
  const first = readField(fieldsTable, "Badge: First Name");
  const last  = readField(fieldsTable, "Badge: Last Name");
  if (first || last) {
    const name = `${first} ${last}`.trim();
    console.log(`registrations.js: dealer badge name = "${name}"`);
    return name;
  }
  return "";
}

/**
 * Reads hold status from the fields table.
 * A hold is active when the span.viewField next to the hold label is non-empty.
 * On the standard event the span contains "HOLD"; on the dealer event the exact
 * text may vary, so we treat ANY non-empty value as an active hold.
 *
 * @param {Element|null} fieldsTable
 * @returns {{ regHold: boolean, artHold: boolean, opsHold: boolean }}
 */
function readHolds(fieldsTable) {
  // Use the title strings from holdMessages as the label substrings to match.
  // This keeps the hold label text in one place (config.js) rather than
  // hardcoding it in two places.
  const REG_LABEL = CONFIG.holdMessages[0].title;  // "Registration Hold"
  const ART_LABEL = CONFIG.holdMessages[1].title;  // "Art Show Hold"
  const OPS_LABEL = CONFIG.holdMessages[2].title;  // "Operations Hold"

  const regHold = readField(fieldsTable, REG_LABEL) !== "";
  const artHold = readField(fieldsTable, ART_LABEL) !== "";
  const opsHold = readField(fieldsTable, OPS_LABEL) !== "";

  console.log(`registrations.js: holds — reg:${regHold} art:${artHold} ops:${opsHold}`);
  return { regHold, artHold, opsHold };
}

/**
 * Reads the attendee's legal name, trying the standard name link first
 * and then the dealer-specific badge name fields if the link is absent.
 *
 * Standard event: a hyperlink in td.viewField points to the account page.
 *   The link text is the legal name. The account ID is in the link href.
 *
 * Dealer event: same hyperlink structure exists (Melanie Mayer → account link),
 *   but the badge display name comes from "Badge: First Name" + "Badge: Last Name"
 *   fields. We still use the account link for accountId; legalName stays as-is
 *   (it's the registrant's name). badgeName is read separately if needed.
 *
 * @param {Element} textSmallTd — the td.textSmall containing the "Attendee N" label
 * @returns {{ accountId: string, legalName: string }}
 */
function readNameAndAccountId(textSmallTd) {
  let accountId = "";
  let legalName = "";
  let row   = textSmallTd.closest("tr")?.nextElementSibling;
  let steps = 0;

  while (row && steps < 5) {
    const anchor = row.querySelector("td.viewField a");
    if (anchor) {
      const href = anchor.getAttribute("href") ?? "";
      accountId  = new URLSearchParams(href.split("?")[1] ?? "").get("id") ?? "";
      legalName  = anchor.textContent.trim();
      break;
    }
    row = row.nextElementSibling;
    steps++;
  }

  return { accountId, legalName };
}

/**
 * Finds the nested <table> containing custom field values for one attendee.
 *
 * Walks sibling rows starting after the td.textSmall "Attendee N" row.
 * Stops if it encounters another td.textSmall (next attendee's row).
 *
 * STANDARD EVENT: "Registration Hold - Do Not Release" is the FIRST label in
 * the table. We use this as a positive sentinel.
 *
 * DEALER EVENT: Hold fields are at the BOTTOM of the table, so the first label
 * is "Business: Name". We fall back to accepting any nested table that contains
 * the "Number of Active Badges" label — a field present in both layouts.
 *
 * @param {Element} textSmallTd
 * @returns {Element|null}
 */
function findFieldsTable(textSmallTd) {
  let row = textSmallTd.closest("tr")?.nextElementSibling;

  // Sentinel: first label in the standard layout.
  // Derived from the first holdMessages entry so it stays in sync with config.
  const STANDARD_SENTINEL = CONFIG.holdMessages[0].title; // "Registration Hold"

  // Fallback: a field present in BOTH layouts at a stable position.
  const FALLBACK_SENTINEL = CONFIG.fieldLabels.activeBadgeCount; // "Number of Active Badges"

  while (row) {
    // Reaching another attendee row means we've gone too far — stop.
    if (row.querySelector("td.textSmall")) break;

    const nestedTable = row.querySelector("table");
    if (nestedTable) {
      const tableText = nestedTable.textContent ?? "";

      // Standard layout: "Registration Hold" appears in the table somewhere
      if (tableText.includes(STANDARD_SENTINEL)) {
        console.log("registrations.js: found fields table (standard sentinel)");
        return nestedTable;
      }

      // Dealer / alternate layout: "Number of Active Badges" is present
      if (tableText.includes(FALLBACK_SENTINEL)) {
        console.log("registrations.js: found fields table (fallback sentinel)");
        return nestedTable;
      }
    }
    row = row.nextElementSibling;
  }

  console.warn("registrations.js: findFieldsTable could not locate fields table for this attendee");
  return null;
}

/**
 * Extracts the ticket type name for one attendee.
 * Neon renders this below the fields table as:
 *   <td><b>Event Admission:</b> <span>(Adult (Age 18+) until ... - $115.00)</span></td>
 *
 * Walks sibling rows looking for "Event Admission" and extracts the text
 * inside the parentheses. Returns the ticket type string, e.g. "Adult".
 *
 * @param {Element} textSmallTd
 * @returns {string}
 */
function readTicketType(textSmallTd) {
  let row   = textSmallTd.closest("tr")?.nextElementSibling;
  let steps = 0;
  while (row && steps < 30) {
    if (row.querySelector("td.textSmall")) break;

    const label = row.querySelector("td.viewLabel, b");
    if (label?.textContent?.includes("Event Admission")) {
      const raw   = label.textContent.trim().replace(/\s+/g, " ");
      const match = raw.match(/\((.+)\)\s*$/);
      return match ? match[1].trim() : raw;
    }
    row = row.nextElementSibling;
    steps++;
  }
  return "";
}

// ── DATE HELPERS ─────────────────────────────────────────────────────────

/**
 * Returns today's adult age-cutoff date as a localised string.
 * Adults must be born on or before this date.
 */
function adultCutoffDateString() {
  const today  = new Date();
  const cutoff = new Date(
    today.getFullYear() - CONFIG.adultMinimumAge,
    today.getMonth(),
    today.getDate()
  );
  return cutoff.toLocaleDateString();
}

// ── TICKET TYPE HELPERS ───────────────────────────────────────────────────

/**
 * Looks up the badge config for a ticket type name string.
 * E.g., "Adult (Age 18+) until June 15, 2026" → { ticketLabel: "Adult", ... }
 * Returns an "Unknown" config if no match found.
 */
function resolveTicketConfig(ticketTypeName) {
  // First try a non-empty nameIncludes match (e.g. "Adult", "Teen").
  // Empty-string nameIncludes acts as a catch-all fallback (e.g. for Dealer
  // registrations that have no ticket row and return ticketTypeName = "").
  // We separate the two passes so a real match always wins over the catch-all.
  const match = CONFIG.ticketTypes.find(t => t.nameIncludes !== "" && ticketTypeName.includes(t.nameIncludes))
    ?? CONFIG.ticketTypes.find(t => t.nameIncludes === "");
  if (match) {
    console.log(`registrations.js: resolveTicketConfig("${ticketTypeName}") → "${match.ticketLabel}" (nameIncludes="${match.nameIncludes}")`);
    return match;
  }
  console.warn(`registrations.js: resolveTicketConfig("${ticketTypeName}") → no match, returning Unknown`);
  return { ticketLabel: "Unknown", badgeImage: "NONE.tif", requiresAgeCheck: false };
}

/**
 * Validates that a day pass is being used on the correct day of the week.
 * E.g., a "Friday" pass can only be used on Fridays.
 * Returns { valid: boolean }
 */
function validateDayPass(ticketTypeName) {
  const dayName = Object.keys(CONFIG.conDays).find(d => ticketTypeName.includes(d));
  if (!dayName || new Date().getDay() !== CONFIG.conDays[dayName]) {
    return { valid: false };
  }
  return { valid: true };
}

// ── MAIN SCRAPE FUNCTION ──────────────────────────────────────────────────

/**
 * Main scraper for the eventRegDetails page.
 * Extracts all attendees and their eligibility state.
 *
 * FLOW:
 * 1. Get event name and validate it matches config (CURRENT or TEST event)
 * 2. Get registration status
 * 3. For each attendee row, extract: name, ticket type, holds, badges, ICE
 * 4. Call buildRegistrantState() to determine if they can check in
 * 5. Return array of attendee state objects
 *
 * If event name doesn't match config, ALL attendees are marked RED.
 */
function getRegistrationsInfo() {
  console.log("getRegistrationsInfo: scraping registration page");

  // ── STEP 1: Validate event name ──
  const eventName       = getEventName();
  const eventValidation = validateEventName(eventName);
  console.log(`Event validation: ${eventValidation.type} | "${eventValidation.eventName}"`);

  if (eventValidation.type === EVENT_MATCH.MISMATCH) {
    console.warn(`getRegistrationsInfo: event mismatch — got "${eventName}"`);
    return [{
      accountId:             "",
      neonAttendeeId:        "",
      legalName:             "Wrong Event",
      preferredName:         "",
      state:                 STATE.RED,
      reasons: [{
        key:     CONDITION.WRONG_EVENT,
        text:    `This event is not configured for check-in.\nExpected: ${CONFIG.event.currentEventNames[0]}\nFound: ${eventName}`,
        isRed:   true,
        fixable: false,
      }],
      missingRequiredFields: [],
    }];
  }

  // ── STEP 2: Get registration status ──
  const regStatus = getRegStatus();
  console.log(`Reg Status: ${regStatus} | Event: ${eventValidation.type}`);

  // ── STEP 3: Find all attendee rows ──
  const attendeeRows = document.querySelectorAll("td.textSmall");
  if (attendeeRows.length === 0) {
    console.warn("getRegistrationsInfo: no attendee rows found");
    return [{
      accountId:             "",
      neonAttendeeId:        "",
      legalName:             "Page Error",
      preferredName:         "",
      state:                 STATE.RED,
      reasons: [{
        key:     null,
        text:    "Could not read attendee data from this page. The Neon page structure may have changed — please contact Registration Head.",
        isRed:   true,
        fixable: false,
      }],
      missingRequiredFields: [],
    }];
  }

  // ── STEP 4: Process each attendee ──
  const results = Array.from(attendeeRows).map((td, i) => {
    // Extract attendee ID from the edit link
    const editLink     = td.querySelector("a[href*='attendeeEdit']");
    const editHref     = editLink?.getAttribute("href") ?? "";
    const neonAttendeeId = new URLSearchParams(editHref.split("?")[1] ?? "").get("id") ?? "";

    // Extract account ID and legal name from the name link row
    const { accountId, legalName } = readNameAndAccountId(td);

    // Locate the custom fields table and read all fields
    const fieldsTable = findFieldsTable(td);

    // Preferred name: use configured label; falls back to first name portion of legalName.
    // Dealer attendees typically have no preferred name field, so this gracefully
    // falls back without any special-casing.
    const preferredName = readField(fieldsTable, CONFIG.fieldLabels.preferredName)
      || legalName.split(" ")[0];

    const activeBadgesRaw = readField(fieldsTable, CONFIG.fieldLabels.activeBadgeCount);
    const activeBadges    = activeBadgesRaw === "" ? 0 : parseInt(activeBadgesRaw, 10);

    // ICE contact: try standard label, then dealer label (see readICEContact)
    const iceContact = readICEContact(fieldsTable);

    // Holds: any non-empty span next to the hold label = hold is active
    const { regHold, artHold, opsHold } = readHolds(fieldsTable);

    const ticketTypeName = readTicketType(td);
    const ticketConfig   = resolveTicketConfig(ticketTypeName);

    // For dealer registrations, the account link gives the business owner's name
    // (e.g. "Melanie Mayer"), but the badge holder is identified by the
    // "Badge: First Name" / "Badge: Last Name" custom fields (e.g. "Mallory Glass").
    // Override legalName with the badge name when this is a dealer ticket.
    const effectiveLegalName = (ticketConfig.ticketLabel === "Dealer")
      ? (readDealerBadgeName(fieldsTable) || legalName)
      : legalName;

    console.log(
      `registrations.js Attendee ${i}: "${effectiveLegalName}" | ` +
      `accountId: ${accountId || "MISSING"} | attendeeId: ${neonAttendeeId || "MISSING"} | ` +
      `ticket: "${ticketTypeName || "NOT FOUND"}" | badges: ${activeBadges} | ` +
      `ice: ${iceContact ? "present" : "MISSING"} | holds: reg=${regHold} art=${artHold} ops=${opsHold} | ` +
      `fieldsTable: ${fieldsTable ? "found" : "NOT FOUND"}`
    );

    // In MERCH mode, skip badge-eligibility validation entirely and return
    // a simpler record annotated with the per-attendee merch summary.
    // popup-merch.js renders directly from these records.
    if (extensionMode === EXTENSION_MODE.MERCH) {
      return {
        accountId,
        neonAttendeeId,
        legalName:     effectiveLegalName,
        preferredName: preferredName || effectiveLegalName.split(" ")[0],
        ticket:        ticketConfig.ticketLabel,
        merch:         scrapeAttendeeMerchSummary(fieldsTable, td),
        state:         STATE.GREEN,
        reasons:       [],
        missingRequiredFields: [],
      };
    }

    return buildRegistrantState({
      accountId, neonAttendeeId,
      legalName: effectiveLegalName,
      preferredName: preferredName || effectiveLegalName.split(" ")[0],
      ticketTypeName, regStatus,
      activeBadges, iceContact,
      regHold, artHold, opsHold,
    });
  });

  console.log(`registrations.js: processed ${results.length} attendee(s)`);
  return results;
}

// ── BUILD REGISTRANT STATE ────────────────────────────────────────────────

/**
 * Evaluates ALL conditions for one attendee and collects them into a map.
 * The map is sorted by CONFIG.conditionOrder to produce the `reasons` array
 * shown in the popup, so every problem is visible at once.
 *
 * STATE DETERMINATION:
 *   any red condition    → STATE.RED
 *   any yellow + no red  → STATE.YELLOW
 *   none                 → STATE.GREEN
 *
 * NOTE: Event name validation happens upstream in getRegistrationsInfo().
 * If we reach this function, the event has already been validated.
 */
function buildRegistrantState({
  accountId, neonAttendeeId, legalName, preferredName,
  ticketTypeName, regStatus,
  activeBadges, iceContact,
  regHold, artHold, opsHold,
}) {
  const ticketConfig = resolveTicketConfig(ticketTypeName);
  const isDayPass    = ticketTypeName.includes("Day Pass");
  const adultCutoff  = adultCutoffDateString();

  // Collect every triggered condition: CONDITION key → { text, isRed }
  // Red conditions block check-in; yellow conditions are warnings.
  const conditionsMap = {};

  // ── Ticket-type conditions ──
  if (ticketConfig.ticketLabel === "Unknown") {
    conditionsMap[CONDITION.UNKNOWN_TICKET] = {
      text:  "UNKNOWN TICKET TYPE\nPlease review and see a Sub or Co Head for assistance.",
      isRed: true,
    };
  }

  if (isDayPass && !validateDayPass(ticketTypeName).valid) {
    conditionsMap[CONDITION.INCORRECT_DAY] = {
      text:  "INCORRECT DAY\nDay Pass purchased for a different day than today. Please send attendee to Help Desk.",
      isRed: true,
    };
  }

  // Age verification: shown as a yellow warning whenever the ticket requires it,
  // unless the day-pass check already blocked them (avoids stacking messages).
  if (ticketConfig.requiresAgeCheck && !conditionsMap[CONDITION.INCORRECT_DAY]) {
    conditionsMap[CONDITION.AGE_VERIFICATION] = {
      text: CONFIG.attendeeMessages.ageVerification
        .replace("{age}",    CONFIG.adultMinimumAge)
        .replace("{cutoff}", adultCutoff),
      isRed: false,
    };
  }

  // ── Blocking conditions ──
  if (regStatus !== REG_STATUS.SUCCEEDED) {
    conditionsMap[CONDITION.NOT_PAID] = {
      text:  "NOT PAID\nThis badge has not been paid for. Please direct attendee to cashier.",
      isRed: true,
    };
  }

  if (activeBadges > 0) {
    conditionsMap[CONDITION.ALREADY_ISSUED] = {
      text:  CONFIG.attendeeMessages.alreadyIssued,
      isRed: true,
    };
  }

  if (regHold) {
    conditionsMap[CONDITION.REG_HOLD] = {
      text:  CONFIG.holdMessages[0].title + "\n" + CONFIG.holdMessages[0].body,
      isRed: true,
    };
  }

  if (artHold) {
    conditionsMap[CONDITION.ART_HOLD] = {
      text:  CONFIG.holdMessages[1].title + "\n" + CONFIG.holdMessages[1].body,
      isRed: true,
    };
  }

  if (opsHold) {
    conditionsMap[CONDITION.OPS_HOLD] = {
      text:  CONFIG.holdMessages[2].title + "\n" + CONFIG.holdMessages[2].body,
      isRed: true,
    };
  }

  if (!accountId) {
    conditionsMap[CONDITION.NO_ACCOUNT_ID] = {
      text:  "NO ACCOUNT ID — Please direct attendee to Help Desk.",
      isRed: true,
    };
  }

  if (!neonAttendeeId) {
    conditionsMap[CONDITION.NO_ATTENDEE_ID] = {
      text:  "NO ATTENDEE ID — Please direct attendee to Help Desk.",
      isRed: true,
    };
  }

  if (!legalName) {
    conditionsMap[CONDITION.NO_NAME] = {
      text:  "NO NAME — Please direct attendee to Help Desk.",
      isRed: true,
    };
  }

  if (!iceContact) {
    conditionsMap[CONDITION.MISSING_ICE] = {
      text:  CONFIG.attendeeMessages.missingIce,
      isRed: false,
    };
  }

  // ── Determine overall state ──
  const hasRed    = Object.values(conditionsMap).some(c => c.isRed);
  const hasYellow = Object.values(conditionsMap).some(c => !c.isRed);
  const state     = hasRed ? STATE.RED : hasYellow ? STATE.YELLOW : STATE.GREEN;

  // ── Sort by CONFIG.conditionOrder ──
  const reasons = CONFIG.conditionOrder
    .filter(entry => conditionsMap[entry.key])
    .map(entry => ({
      key:     entry.key,
      text:    conditionsMap[entry.key].text,
      isRed:   conditionsMap[entry.key].isRed,
      fixable: entry.fixableOnAttendeePage,
    }));

  // Safety net: include any conditions not yet listed in conditionOrder
  for (const [key, cond] of Object.entries(conditionsMap)) {
    if (!reasons.find(r => r.key === key)) {
      reasons.push({ key, text: cond.text, isRed: cond.isRed, fixable: false });
    }
  }

  const missingIce = !!conditionsMap[CONDITION.MISSING_ICE];
  const redKeys    = reasons.filter(r => r.isRed).map(r => r.key);
  const yellowKeys = reasons.filter(r => !r.isRed).map(r => r.key);

  // Detailed state summary — look for ▶ REGISTRANT lines in the console
  console.log(
    `%c▶ REGISTRANT: ${legalName || "(no name)"} | Account: ${accountId || "(none)"} | ` +
    `Ticket: "${ticketTypeName || "(none)"}" → "${ticketConfig.ticketLabel}" | ` +
    `RegStatus: ${regStatus || "(none)"} | Badges: ${activeBadges} | ` +
    `ICE: ${iceContact ? "✓" : "✗ MISSING"} | Holds: reg=${regHold} art=${artHold} ops=${opsHold}`,
    "font-weight:bold"
  );
  if (redKeys.length > 0)    console.log(`  🔴 RED: [${redKeys.join(", ")}]`);
  if (yellowKeys.length > 0) console.log(`  🟡 YELLOW: [${yellowKeys.join(", ")}]`);
  if (redKeys.length === 0 && yellowKeys.length === 0) console.log("  ✅ No conditions → GREEN");
  console.log(`  → Final state: ${state.toUpperCase()}`);

  return {
    accountId,
    neonAttendeeId,
    attendeeId: accountId,
    legalName,
    preferredName,
    badgeImage:            ticketConfig.badgeImage,
    ticket:                `${ticketConfig.ticketLabel}${isDayPass ? " Day Pass" : " Weekend"}`,
    activeBadges,
    regStatus,
    state,
    reasons,
    missingRequiredFields: missingIce ? [CONFIG.fieldLabels.iceContact] : [],
  };
}

// ── MERCH MODE: PER-ATTENDEE MERCH SUMMARY ───────────────────────────────
//
// Best-effort scrape of merch source fields from the eventreg page for
// each attendee row. Uses the existing readField() helper which handles
// both standard and dealer layouts via viewLabel/viewField pairs.
//
// If a source field isn't visible in the eventreg DOM (Neon admin choice
// not to show it), the entry's `ordered` is null -- popup-merch.js shows
// "Review on attendee page" in that case rather than guessing.
//
// matcher logic is duplicated here from js/merch-attendee.js because the
// two scripts live in different content-script worlds (different URL
// patterns). The duplication is ~10 lines and kept in lockstep by hand.

function scrapeAttendeeMerchSummary(fieldsTable, attendeeTd) {
  return (CONFIG.merch?.items ?? []).map(item => {
    if (item.source?.type !== "customField") {
      // Phase B2 only implements customField source matching.
      return { name: item.name, ordered: false, variant: null };
    }

    // Try the per-attendee customDataList-style table first (e.g.,
    // "Pre-order Souvenir Guide" appears as a regular custom field).
    let sourceVal = readField(fieldsTable, item.source.label);

    // Fall back to shopping cart line items (e.g., "Preorder your 2026
    // T-shirt" appears as a <b>label:</b><span class="viewField">(value
    // - $price)</span> row OUTSIDE the customDataList-style table).
    let fromCartLine = false;
    if (sourceVal === "") {
      sourceVal = readCartLineValue(attendeeTd, item.source.label);
      if (sourceVal !== "") fromCartLine = true;
    }

    const ordered = isMerchItemOrdered(item, sourceVal);
    let variant = null;
    if (ordered && item.source.matchMode === "anyExcept") {
      variant = fromCartLine ? cleanCartLineValue(sourceVal) : sourceVal;
    }
    return { name: item.name, ordered, variant };
  });
}

/**
 * Walks <tr> siblings AFTER the attendee header row (the row containing
 * the td.textSmall "Attendee N" header), stopping at the next attendee
 * header, looking for a <b> whose text contains labelText. Returns the
 * adjacent <span class="viewField"> text, or "" if not found.
 *
 * Shopping cart line items (Event Admission, T-shirt preorder, etc.)
 * appear in this region rather than in the per-attendee customDataList
 * table, so this is the only way to read them.
 */
function readCartLineValue(attendeeTd, labelText) {
  if (!attendeeTd) return "";
  const startTr = attendeeTd.closest("tr");
  if (!startTr) return "";

  let row = startTr.nextElementSibling;
  while (row) {
    // Stop at the next attendee block.
    if (row.querySelector("td.textSmall")) break;

    const bold = row.querySelector("b");
    if (bold && bold.textContent.trim().includes(labelText)) {
      const val = row.querySelector("span.viewField")?.textContent?.trim() ?? "";
      console.log(`readCartLineValue "${labelText}" → "${val || "(empty)"}"`);
      return val;
    }
    row = row.nextElementSibling;
  }
  return "";
}

/**
 * Strips Neon's shopping-cart formatting from a cart-line value.
 *   "(Unisex XXXXXL - $25.00)"                          -> "Unisex XXXXXL"
 *   "(Adult (Age 18+) until June 15, 2026 - $115.00)"   -> "Adult (Age 18+) until June 15, 2026"
 * If the formatting doesn't match, returns the input unchanged.
 */
function cleanCartLineValue(raw) {
  const m = raw.match(/^\((.*?)\s*-\s*\$[\d,]+(?:\.\d+)?\)$/);
  return m ? m[1].trim() : raw;
}

function isMerchItemOrdered(item, fieldValue) {
  const src = item.source ?? {};
  if (src.matchMode === "anyExcept") {
    return fieldValue !== "" && fieldValue !== src.notOrderedValue;
  }
  if (src.matchMode === "substring") {
    return fieldValue.includes(src.matchValue ?? "");
  }
  return false;
}

// end js/registrations.js