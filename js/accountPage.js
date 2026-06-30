// js/accountPage.js
// ╔══════════════════════════════════════════════════════════════════════╗
// ║ CONvergence Check-In Extension — Account Page Script                 ║
// ║                                                                      ║
// ║ Activates on Neon CRM account detail pages (/admin/accounts/N).      ║
// ║                                                                      ║
// ║ Responsibilities:                                                    ║
// ║  1. Scrapes account notes and account holds                          ║
// ║  2. Writes state to chrome.storage for popup rendering               ║
// ║  3. Handles navigation to event registrations page                   ║
// ║  4. Auto-clicks first SUCCEEDED registration on Attendees tab        ║
// ║                                                                      ║
// ║ To disable: set ACCOUNT_PAGE_FEATURE_ENABLED = false below.          ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// CONFIG, STATE, ACTION, STORAGE_KEY are injected as globals by the manifest.

// Master kill switch for this content script. Flip to false to disable
// all account-page features without having to remove the script from the
// manifest. Useful if Neon makes a change that breaks scraping.
const ACCOUNT_PAGE_FEATURE_ENABLED = true;

// Poll interval (ms) and max attempts when waiting for an element to
// appear. 300 ms × 40 attempts ≈ 12 seconds of patience.
const POLL_MS       = 300;
const POLL_ATTEMPTS = 40;

// Shorter cap for waiting on table ROWS to populate (vs. the table shell
// existing). The shell appears fast and rows normally follow within a second
// or two; an account with genuinely no records would otherwise wait the full
// POLL_ATTEMPTS. 300 ms × 20 ≈ 6 seconds before we accept "no rows" and move on.
const ROW_POLL_ATTEMPTS = 20;

// ── DEBUG WALK: append a step entry to STORAGE_KEY.DEBUG_REPORT ─────────────
//
// Used by all content scripts in the walk chain. Each script calls this
// at its successful exit point (and at fatal failure points) so the final
// report covers every leg of the journey.
//
// Status conventions: "ok" | "warning" | "error" | "skipped"
//
// No-op when STORAGE_KEY.DEBUG_WALK_ACTIVE is not set, so it's safe to
// leave the calls in place during normal page loads.
async function appendDebugStepIfWalkActive(step, status, details, issues = []) {
  const walkResult = await chrome.storage.local.get(STORAGE_KEY.DEBUG_WALK_ACTIVE);
  if (!walkResult[STORAGE_KEY.DEBUG_WALK_ACTIVE]) return;

  const reportResult = await chrome.storage.local.get(STORAGE_KEY.DEBUG_REPORT);
  const report = reportResult[STORAGE_KEY.DEBUG_REPORT] ?? { steps: [], startedAt: walkResult[STORAGE_KEY.DEBUG_WALK_ACTIVE].startedAt };
  report.steps.push({ step, status, details, issues, recordedAt: new Date().toISOString() });

  await chrome.storage.local.set({ [STORAGE_KEY.DEBUG_REPORT]: report });
  console.log(`accountPage.js: appended debug step "${step}" (${status})`, details, issues);
}

// ── DEBUG WALK: open the report on an early halt ────────────────────────────
//
// Called at the auto-nav failure points. If the walk is active, asks
// background.js to open the report tab so the user still gets a partial
// report (background.js clears DEBUG_WALK_ACTIVE). No-op otherwise.
async function openDebugReportIfWalkActive() {
  const walkResult = await chrome.storage.local.get(STORAGE_KEY.DEBUG_WALK_ACTIVE);
  if (!walkResult[STORAGE_KEY.DEBUG_WALK_ACTIVE]) return;
  console.log("accountPage.js: debug walk halting -- opening partial report");
  chrome.runtime.sendMessage({ action: ACTION.OPEN_DEBUG_REPORT });
}

// ── DEBUG WALK: enumerate the account About-page fields ─────────────────────
//
// Lists every label/value pair in the account "about" grid and flags the
// labels the extension relies on (the three hold titles). Runs on the About
// page via ACTION.RUN_ACCOUNT_DEBUG_AUDIT, sent by popup.js BEFORE the walk
// navigates to the Attendees tab (the .neon_nest_grid_row grid only exists on
// the About view).
function enumerateAccountFields() {
  const out = [];
  for (const row of document.querySelectorAll(".neon_nest_grid_row")) {
    const label = row.querySelector(".about-field-title")?.textContent?.trim() ?? "";
    const value = row.querySelector(".neon_form_value")?.textContent?.trim() ?? "";
    if (label) out.push({ label, value });
  }
  return out;
}

async function runAccountDebugAudit() {
  const fields = enumerateAccountFields();

  const usedSpecs = [
    { role: "registrationHold", label: CONFIG.holdMessages[0].title },
    { role: "artShowHold",      label: CONFIG.holdMessages[1].title },
    { role: "operationsHold",   label: CONFIG.holdMessages[2].title },
  ];
  const used = usedSpecs.map(s => ({
    role:  s.role,
    label: s.label,
    found: fields.some(f => f.label.includes(s.label)),
  }));
  const missing = used.filter(u => !u.found);

  const issues = [];
  if (fields.length === 0) {
    issues.push({ severity: "warning", message: "No account fields (.neon_nest_grid_row) found on the About page" });
  }
  missing.forEach(m => {
    issues.push({ severity: "warning", message: `Extension field "${m.role}" (label "${m.label}") was not found on the account page` });
  });

  const status = issues.length > 0 ? "warning" : "ok";

  await appendDebugStepIfWalkActive("account", status, {
    accountId: getAccountIdFromUrl(),
    phase:     "fields",
    fields,
    used,
    missing,
  }, issues);
}

// ── HELPER: Extract account ID from URL ─────────────────────────────────────

/**
 * Returns the numeric account ID from the current page URL, or null.
 * E.g. "/admin/accounts/45844/about" → "45844".
 */
function getAccountIdFromUrl() {
  const m = window.location.pathname.match(/\/admin\/accounts\/(\d+)/);
  return m ? m[1] : null;
}

// ── HELPER: Wait for an element to appear in the DOM ────────────────────────

/**
 * Polls the DOM every `ms` milliseconds for up to `attempts` tries,
 * resolving with the first element matching `selector`. Rejects with a
 * timeout error if not found before the attempt limit.
 *
 * Used because Neon pages render asynchronously via Vue/JS, so we can't
 * rely on the element being present at content-script execution time.
 */
function waitForElement(selector, attempts, ms) {
  attempts = attempts ?? POLL_ATTEMPTS;
  ms       = ms       ?? POLL_MS;
  return new Promise((resolve, reject) => {
    let n = 0;
    const t = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(t);
        resolve(el);
      } else if (++n >= attempts) {
        clearInterval(t);
        reject(new Error("timeout: " + selector));
      }
    }, ms);
  });
}

/**
 * Polls for an el-table body that has actually populated its data rows.
 * The new Neon SPA (Element Plus / Vue 3) inserts the empty `.el-table__body`
 * shell — and briefly an empty-state/loading placeholder — long before the rows
 * arrive, so waiting on the element (or the empty-state) alone scrapes an empty
 * table (records=0) and fires the "no registration" modal prematurely.
 *
 * This resolves only when the body returned by `getBody()` has ≥1 data <tr>, or
 * on timeout (`attempts` × `ms`) — that timeout is the bounded ceiling for an
 * account that genuinely has no records (it then proceeds to the fallback /
 * modal). Resolves with the body element (or null) — never rejects, so callers
 * keep their existing null-checks / fallbacks.
 *
 * @param {() => Element|null} getBody — re-queries the body each poll.
 */
function waitForTableRows(getBody, attempts, ms) {
  attempts = attempts ?? POLL_ATTEMPTS;
  ms       = ms       ?? POLL_MS;
  return new Promise(resolve => {
    let n = 0;
    const t = setInterval(() => {
      const body = getBody();
      const rowCount = body ? body.querySelectorAll("tr.el-table__row").length : 0;
      if (rowCount > 0 || ++n >= attempts) {
        clearInterval(t);
        resolve(body || null);
      }
    }, ms);
  });
}

// ── SCRAPE: Notes badge count ───────────────────────────────────────────────

/**
 * Reads the count badge shown next to the "Notes" nav item in the
 * account's left sidebar (e.g. "Notes (3)"). Returns 0 if not found.
 *
 * We use this to know whether to look harder for note content — if
 * Neon says there are notes, but we can't find any in the DOM, that's
 * a signal to surface a "click the Notes section to load them" hint.
 */
function getNotesBadgeCount() {
  for (const el of document.querySelectorAll(".titan_account_detail_section_name")) {
    if (el.textContent.trim() === "Notes") {
      const li = el.closest("li");
      if (li) {
        const badge = li.querySelector(".el-badge__content:not(.is-dot)");
        if (badge) {
          const n = parseInt(badge.textContent.trim(), 10);
          return isNaN(n) ? 0 : n;
        }
      }
    }
  }
  return 0;
}

// ── SCRAPE: Notes already rendered in DOM ───────────────────────────────────

/**
 * Walks every visible note element on the page and returns an array of
 * { title, body } objects. Does NOT click the Notes nav item — only
 * picks up notes that have already been rendered.
 */
async function loadAndScrapeNotes() {
  const notes = [];
  for (const contentEl of document.querySelectorAll("[id^='note_content']")) {
    const card = contentEl.closest("[class*='card-grid-cell']") ||
                 contentEl.closest("[class*='diplay-in-row-notes']");
    let title = "";
    if (card) {
      const titleEl = card.querySelector(".notes-header span, .notes-header [class*='tool-tip']");
      if (titleEl) title = titleEl.textContent.trim();
    }
    const bodySpan = contentEl.querySelector("[id^='span-text-']");
    const body     = (bodySpan ?? contentEl).innerText.trim();
    if (title || body) notes.push({ title: title || "(Untitled note)", body });
  }
  return notes;
}

// ── SCRAPE: Account-level holds ─────────────────────────────────────────────

/**
 * Scrapes account-level holds from the Holds section on the About page.
 * The Holds section appears as static text rows (not checkboxes) where
 * the "value" cell reads either "HOLD" or "—".
 *
 * Returns { operationsHold, artShowHold, registrationHold, hasAnyHolds }.
 */
function getAccountHolds() {
  const holds = {
    operationsHold:   false,
    artShowHold:      false,
    registrationHold: false,
  };

  const holdRows = document.querySelectorAll(".neon_nest_grid_row");

  if (holdRows.length === 0) {
    console.log("accountPage.js: no hold rows found");
    holds.hasAnyHolds = false;
    return holds;
  }

  // Each row has a label cell (.about-field-title) and a value cell
  // (.neon_form_value). A hold is "active" only when the value is "HOLD".
  for (const row of holdRows) {
    const titleEl = row.querySelector(".about-field-title");
    const valueEl = row.querySelector(".neon_form_value");

    if (!titleEl || !valueEl) continue;

    const titleText = titleEl.textContent?.trim() ?? "";
    const valueText = valueEl.textContent?.trim() ?? "";

    console.log(`accountPage.js: hold field "${titleText}" = "${valueText}"`);

    if (valueText === "HOLD") {
      if (titleText.includes("Operations Hold")) {
        holds.operationsHold = true;
      } else if (titleText.includes("Art Show Hold")) {
        holds.artShowHold = true;
      } else if (titleText.includes("Registration Hold")) {
        holds.registrationHold = true;
      }
    }
  }

  holds.hasAnyHolds = holds.operationsHold || holds.artShowHold || holds.registrationHold;
  console.log(`accountPage.js: holds = reg:${holds.registrationHold}, art:${holds.artShowHold}, ops:${holds.operationsHold}, any:${holds.hasAnyHolds}`);

  return holds;
}

/**
 * Reads a value from the account "About" grid by its field title.
 * Markup: .neon_nest_grid_row > .neon_nest_grid_label .about-field-title (label)
 *                              + .neon_nest_grid_value .neon_form_value (value)
 * Case-insensitive prefix match; returns "" if not present.
 *
 * @param {string} labelText
 * @returns {string}
 */
function readAboutFieldValue(labelText) {
  const needle = labelText.toLowerCase();
  for (const title of document.querySelectorAll(".about-field-title")) {
    if (!title.textContent.trim().toLowerCase().startsWith(needle)) continue;
    const row = title.closest(".neon_nest_grid_row");
    const val = row?.querySelector(".neon_nest_grid_value .neon_form_value");
    return val?.textContent?.trim() ?? "";
  }
  return "";
}

// ── BUILD: Combined account state for popup rendering ───────────────────────

/**
 * Scrapes the account page and returns a state object for the popup.
 * State priority:
 *   RED    → at least one hold is active
 *   YELLOW → no holds but at least one note present
 *   GREEN  → clean account, ready to navigate to event registration
 *
 * Returns { accountId, accountName, notes, holds, state }.
 */
async function getAccountData() {
  const accountId = getAccountIdFromUrl();

  const nameEl      = document.querySelector(".titan_account_detail_user_name .tool-tip, .titan_account_detail_user_name");
  // Neon renders the name and account number with no whitespace between them
  // ("Mark Sauntry#47859"); insert a space before the # so the displayed name
  // reads "Mark Sauntry #47859".
  const accountName = nameEl
    ? nameEl.textContent.trim().split("\n")[0].trim().replace(/\s*#/, " #")
    : "";

  // Pronouns from the About grid (blank when not set).
  const pronouns = readAboutFieldValue(CONFIG.fieldLabels.pronouns);

  // Holds first — they outrank notes in determining state color.
  const holds = getAccountHolds();

  // Highlight hold rows on the page if Management Override is on, so the
  // override-using staff member can see WHICH holds are present even
  // though they're allowed to bypass them.
  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  if (holds.hasAnyHolds) {
    // Tiny delay lets the page settle before we start mutating styles.
    await new Promise(r => setTimeout(r, 100));
    highlightHoldRows(holds, managementOverride);
  }

  // Notes second — only scrape if the badge says there are any. This
  // avoids unnecessary DOM traversal on accounts with no notes at all.
  const noteCount = getNotesBadgeCount();
  let notes = [];

  if (noteCount > 0) {
    try {
      notes = await loadAndScrapeNotes();
    } catch {
      notes = [{
        title: "Note loading failed",
        body:  `This account has ${noteCount} note(s) but they could not be loaded automatically.\nPlease check the Notes section manually before proceeding.`,
      }];
    }
  }

  // Decide overall state. RED > YELLOW > GREEN.
  let state = STATE.GREEN;
  if (holds.hasAnyHolds) {
    state = STATE.RED;
  } else if (notes.length > 0) {
    state = STATE.YELLOW;
  }

  console.log(`accountPage.js: accountId=${accountId} holds=${holds.hasAnyHolds} notes=${notes.length} state=${state}`);

  return { accountId, accountName, pronouns, notes, holds, state };
}

// ── HIGHLIGHT: Hold rows when override is active ────────────────────────────

/**
 * Adds a red highlight to every active hold row on the Account About
 * page when Management Override is on. Acts as a visual warning that
 * "yes, holds are present — you're choosing to bypass them".
 *
 * No-op when override is off (regular staff get a plain "Send to Help
 * Desk" message instead and never see the highlighting).
 */
function highlightHoldRows(holds, managementOverride) {
  if (!managementOverride || !holds || !holds.hasAnyHolds) {
    console.log("accountPage.js: skipping hold highlighting (override=" + managementOverride + ", holds=" + (holds?.hasAnyHolds || false) + ")");
    return;
  }

  console.log("accountPage.js: highlighting hold rows for management override");

  const holdRows = document.querySelectorAll(".neon_nest_grid_row");

  for (const row of holdRows) {
    const titleEl = row.querySelector(".about-field-title");
    const valueEl = row.querySelector(".neon_form_value");

    if (!titleEl || !valueEl) continue;

    const titleText = titleEl.textContent?.trim() ?? "";
    const valueText = valueEl.textContent?.trim() ?? "";

    // Only highlight if value is "HOLD" AND it matches an active hold.
    if (valueText === "HOLD") {
      let shouldHighlight = false;

      if (titleText.includes("Registration Hold") && holds.registrationHold) {
        shouldHighlight = true;
      } else if (titleText.includes("Art Show Hold") && holds.artShowHold) {
        shouldHighlight = true;
      } else if (titleText.includes("Operations Hold") && holds.operationsHold) {
        shouldHighlight = true;
      }

      if (shouldHighlight) {
        console.log(`accountPage.js: highlighting hold row: ${titleText}`);
        const labelCol = row.querySelector(".neon_nest_grid_label");
        const valueCol = row.querySelector(".neon_nest_grid_value");

        if (labelCol) {
          labelCol.style.background  = "#ffcccc";
          labelCol.style.borderLeft  = `4px solid ${BRAND.red}`;
          labelCol.style.paddingLeft = "8px";
        }
        if (valueCol) {
          valueCol.style.background = "#ffcccc";
        }
      }
    }
  }
}

// ── AUTO-CLICK HELPERS ──────────────────────────────────────────────────────

// Neon has reordered the Attendees-table columns at least once. Discover
// the columns we care about by their header text rather than relying on
// positional indexes that silently drift.
function findColumnIndexes(tableBody) {
  const root = tableBody.closest(".el-table") ?? tableBody.parentElement;
  const headerCells = root?.querySelectorAll(".el-table__header thead th") ?? [];
  const map = {};
  headerCells.forEach((th, i) => {
    const label = th.textContent?.trim().toLowerCase() ?? "";
    if (!label) return;
    if (map.event  == null && label.includes("event"))  map.event  = i;
    if (map.status == null && label.includes("status")) map.status = i;
    if (map.amount == null && (label.includes("amount") || label.startsWith("$"))) map.amount = i;
  });
  return map;
}

// Yellow banner pinned to the top of the Neon page so the volunteer sees
// when auto-navigate has given up. The popup itself is already closed by
// the time these failure paths fire, so without this banner the failure
// is silent.
function showAutoNavFailureBanner(message) {
  if (document.getElementById("cvg-autonav-failure")) return;
  const bar = document.createElement("div");
  bar.id = "cvg-autonav-failure";
  bar.textContent = `CONvergence Check-In: ${message}`;
  bar.style.cssText =
    "position:fixed; top:0; left:0; right:0; z-index:99999; padding:10px 14px; " +
    "background:#fff3cd; color:#7a5d00; border-bottom:2px solid #ffc107; " +
    "font:14px/1.4 sans-serif; text-align:center;";
  document.body.appendChild(bar);
}

// ── MODAL: No valid event registration found ────────────────────────────────

/**
 * Centered modal injected on the account Attendees tab when the account has
 * no usable registration to check in (no records at all, only cancelled/
 * failed/refunded ones, or none matching the current/test event list).
 *
 * Self-styled because this page does not load css/checkin-modal.css or
 * css/brand.css — colors come from the BRAND global (constants-base.js).
 */
function showNoRegistrationModal() {
  if (document.getElementById("cvg-no-reg-modal")) return;
  const tpl = ERROR_MESSAGES.NO_VALID_REGISTRATION ?? ERROR_MESSAGES.NO_SUCCEEDED_REGISTRATION;

  const overlay = document.createElement("div");
  overlay.id = "cvg-no-reg-modal";
  overlay.style.cssText =
    "position:fixed; inset:0; z-index:100000; background:rgba(0,0,0,0.45); " +
    "display:flex; align-items:center; justify-content:center; font-family:Arial,sans-serif;";

  const card = document.createElement("div");
  card.style.cssText =
    "max-width:420px; width:90%; background:#fff; border-radius:8px; " +
    "overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.3);";

  const header = document.createElement("div");
  header.textContent = tpl.title;
  header.style.cssText = `background:${BRAND.red}; color:#fff; padding:14px 18px; font-size:17px; font-weight:bold;`;

  const bodyEl = document.createElement("div");
  bodyEl.style.cssText = "padding:18px; color:#333; font-size:14px; line-height:1.5;";
  const detail = document.createElement("p");
  detail.textContent = tpl.detail;
  detail.style.cssText = "margin:0 0 12px;";
  const action = document.createElement("p");
  action.textContent = tpl.action;
  action.style.cssText = "margin:0; font-weight:bold;";
  bodyEl.appendChild(detail);
  bodyEl.appendChild(action);

  const footer = document.createElement("div");
  footer.style.cssText = "padding:0 18px 18px; text-align:right;";
  const btn = document.createElement("button");
  btn.textContent = "Dismiss";
  btn.style.cssText =
    `background:${BRAND.purple}; color:#fff; border:none; border-radius:4px; ` +
    "padding:8px 16px; font-size:14px; font-weight:bold; cursor:pointer;";
  btn.addEventListener("click", () => overlay.remove());
  footer.appendChild(btn);

  card.appendChild(header);
  card.appendChild(bodyEl);
  card.appendChild(footer);
  overlay.appendChild(card);
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ── ANALYZE: One pass over the Attendees-tab registration rows ──────────────

/**
 * Single sweep of the Attendees table that serves two features at once:
 *   1. First-time-attendee guide — counts records whose status is NOT
 *      cancelled/failed/refunded (REG_STATUS.EXCLUDED_FROM_HISTORY). More
 *      than one non-excluded record => attended before. Exactly one, for a
 *      valid event => first time.
 *   2. Auto-nav click target — the first SUCCEEDED row for a valid event,
 *      preferring currentEventNames over testEventNames (so we never check
 *      someone into a training event when a real registration also exists).
 *
 * Returns { records, nonExcludedCount, isFirstTime, firstValidLink,
 *           matchedEventName, matchedEventSource }.
 */
function analyzeAttendeeRecords(tableBody, cols, currentNames, testNames) {
  const rows = tableBody.querySelectorAll("tr");
  const records = [];
  let currentLink = null, currentEvt = "";
  let testLink    = null, testEvt    = "";

  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length <= Math.max(cols.event, cols.status)) continue;

    const status    = cells[cols.status]?.textContent?.trim() ?? "";
    const eventName = cells[cols.event]?.textContent?.trim()  ?? "";
    if (!status && !eventName) continue;

    const lowerStatus = status.toLowerCase();
    const excluded    = REG_STATUS.EXCLUDED_FROM_HISTORY.some(s => lowerStatus.includes(s));
    const inCurrent   = currentNames.some(n => eventName.toLowerCase().includes(n.toLowerCase()));
    const inTest      = testNames.some(n => eventName.toLowerCase().includes(n.toLowerCase()));

    console.log(`accountPage.js: row - event: "${eventName}", status: "${status}", excluded=${excluded}`);
    records.push({ eventName, status, excluded, isValidEvent: inCurrent || inTest });

    if (status === REG_STATUS.SUCCEEDED && (inCurrent || inTest)) {
      // Prefer eventRegDetails link, then the amount cell's link, then any link.
      const link = row.querySelector("a[href*='eventRegDetails']")
                ?? (cols.amount != null ? cells[cols.amount]?.querySelector("a") : null)
                ?? row.querySelector("a");
      if (link) {
        if (inCurrent && !currentLink) { currentLink = link; currentEvt = eventName; }
        else if (inTest && !testLink)  { testLink    = link; testEvt    = eventName; }
      }
    }
  }

  const nonExcluded = records.filter(r => !r.excluded);
  // First time: exactly one record that isn't cancelled/failed/refunded AND
  // it's for an event we recognise. More than one => returning attendee.
  const isFirstTime = nonExcluded.length === 1 && nonExcluded[0].isValidEvent;

  return {
    records,
    nonExcludedCount:   nonExcluded.length,
    isFirstTime,
    firstValidLink:     currentLink ?? testLink,
    matchedEventName:   currentLink ? currentEvt : testEvt,
    matchedEventSource: currentLink ? "currentEventNames" : (testLink ? "testEventNames" : ""),
  };
}

// ── PROCESS: Attendees tab — capture first-time status, then auto-click ─────

/**
 * Runs on every load of the account Attendees tab. ALWAYS computes and stores
 * the first-time-attendee flag (keyed by accountId) so it's available even on
 * manual navigation. THEN, only when popup.js set the auto-nav flag, clicks
 * the first valid SUCCEEDED registration — or shows the "no valid event
 * registration found" modal when there isn't one.
 */
async function processAttendeesTab() {
  const accountId = getAccountIdFromUrl();

  const stored = await new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY.ACCOUNT_AUTO_NAV, (result) => {
      resolve(result[STORAGE_KEY.ACCOUNT_AUTO_NAV] ?? null);
    });
  });
  const autoNav = !!stored;

  const asArray = v => (Array.isArray(v) ? v : [v]).filter(Boolean);
  const currentNames = asArray(CONFIG.event.currentEventNames);
  const testNames    = asArray(CONFIG.event.testEventNames);

  console.log(`accountPage.js: Attendees tab. autoNav=${autoNav} valid=[${[...currentNames, ...testNames].join(", ")}]`);

  try {
    // Wait for the rows to actually populate (the empty .el-table__body shell
    // appears well before the SPA fills it — see waitForTableRows).
    const tableBody = await waitForTableRows(
      () => document.querySelector("#accountEventAttendeesList .el-table__body"),
      ROW_POLL_ATTEMPTS
    );
    if (!tableBody) {
      console.warn("accountPage.js: could not find table body");
      if (autoNav) {
        // No Attendees record/table → try the Registrations tab before giving up.
        if (!stored.regFallback && await goToRegistrationsFallback(stored)) return;
        showAutoNavFailureBanner("Could not find the Attendees table — refresh and try again.");
        await appendDebugStepIfWalkActive("account", "error", { accountId }, [
          { severity: "error", message: "Could not find #accountEventAttendeesList .el-table__body on the page" },
        ]);
        await openDebugReportIfWalkActive();
        chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
      }
      return;
    }

    // Column indexes are discovered from the header at runtime — Neon has
    // reordered these before, so positional assumptions go stale silently.
    const cols = findColumnIndexes(tableBody);
    if (cols.event == null || cols.status == null) {
      console.warn("accountPage.js: could not locate Event/Status columns in header", cols);
      if (autoNav) {
        if (!stored.regFallback && await goToRegistrationsFallback(stored)) return;
        showAutoNavFailureBanner("Could not read the Attendees table layout. Click the registration manually.");
        await appendDebugStepIfWalkActive("account", "error", { accountId, columnsFound: cols }, [
          { severity: "error", message: "Could not locate Event/Status columns in the Attendees table header" },
        ]);
        await openDebugReportIfWalkActive();
        chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
      }
      return;
    }

    const analysis = analyzeAttendeeRecords(tableBody, cols, currentNames, testNames);
    console.log(`accountPage.js: analysis → records=${analysis.records.length} nonExcluded=${analysis.nonExcludedCount} firstTime=${analysis.isFirstTime}`);

    // Always store the first-time flag (keyed by accountId) so popup.js /
    // attendee-modal.js can show the ribbon, even on manual navigation.
    await chrome.storage.local.set({
      [STORAGE_KEY.FIRST_TIME]: {
        accountId,
        isFirstTime: analysis.isFirstTime,
        recordCount: analysis.nonExcludedCount,
        ts:          Date.now(),
      },
    });

    if (!autoNav) return; // manual nav: first-time captured, nothing to click

    if (analysis.firstValidLink) {
      console.log(`accountPage.js: clicking SUCCEEDED registration: ${analysis.matchedEventName} (from ${analysis.matchedEventSource})`);
      await appendDebugStepIfWalkActive("account", "ok", {
        accountId,
        rowCount:           analysis.records.length,
        matchedEventName:   analysis.matchedEventName,
        matchedEventSource: analysis.matchedEventSource,
        isFirstTime:        analysis.isFirstTime,
      });
      analysis.firstValidLink.click();
      chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
      return;
    }

    // No valid SUCCEEDED registration in the Attendees table — covers "no
    // attendee record at all", cancelled/failed/refunded-only, and wrong-event
    // accounts. Before giving up, fall back to the Registrations tab: some
    // accounts carry a current/test-event SUCCEEDED registration there with no
    // Attendees record. processRegistrationsTab() takes the top (most recent) row.
    if (!stored.regFallback && await goToRegistrationsFallback(stored)) return;

    console.log("accountPage.js: no valid SUCCEEDED registration found — showing modal");
    showNoRegistrationModal();
    await appendDebugStepIfWalkActive("account", "error", { accountId, rowCount: analysis.records.length }, [
      { severity: "error", message: "No SUCCEEDED registration matching currentEventNames or testEventNames was found in the Attendees table" },
    ]);
    await openDebugReportIfWalkActive();
    chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);

  } catch (err) {
    console.error("accountPage.js: processAttendeesTab failed:", err.message);
    if (autoNav) {
      // Attendees table never appeared (often: account has no Attendees tab at
      // all) → try the Registrations tab before surfacing the failure banner.
      if (!stored.regFallback && await goToRegistrationsFallback(stored)) return;
      showAutoNavFailureBanner("Could not find the Attendees table — refresh and try again.");
      await appendDebugStepIfWalkActive("account", "error", { accountId }, [
        { severity: "error", message: `processAttendeesTab threw: ${err.message}` },
      ]);
      await openDebugReportIfWalkActive();
      chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
    }
  }
}

// ── FALLBACK: Attendees tab → Registrations tab ─────────────────────────────

/**
 * Re-arms the auto-nav flag with `regFallback: true` and navigates to the
 * Registrations tab of the same event-registrations page. Called from
 * processAttendeesTab() when the Attendees tab yields no clickable valid
 * SUCCEEDED registration (no Attendees record, no table, or unreadable layout).
 *
 * `regFallback` prevents an infinite Attendees⇄Registrations bounce: the
 * Registrations branch (processRegistrationsTab) gives up for real instead of
 * looping back. Returns true if navigation was kicked off.
 */
async function goToRegistrationsFallback(stored) {
  const accountId = getAccountIdFromUrl();
  if (!accountId) return false;
  await chrome.storage.local.set({
    [STORAGE_KEY.ACCOUNT_AUTO_NAV]: {
      ...(stored || {}),
      accountId,
      regFallback: true,
      timestamp:   Date.now(),
    },
  });
  console.log("accountPage.js: Attendees tab had no valid registration — falling back to Registrations tab");
  window.location.href = `/admin/accounts/${accountId}/event-registrations?tab=Registrations`;
  return true;
}

/**
 * Locate the Registrations-tab table body. The event-registrations page does
 * not reload when switching tabs, so the Attendees list may still be in the
 * DOM. Prefer the mirror id, else the first visible el-table body that isn't
 * inside the Attendees list.
 */
function findRegistrationsTableBody() {
  const direct = document.querySelector("#accountEventRegistrationsList .el-table__body");
  if (direct) return direct;
  const attendees = document.querySelector("#accountEventAttendeesList");
  for (const body of document.querySelectorAll(".el-table__body")) {
    if (attendees && attendees.contains(body)) continue;
    if (body.offsetParent === null) continue; // hidden tab pane
    return body;
  }
  return null;
}

/**
 * Runs on the Registrations tab when we arrived there via goToRegistrationsFallback.
 * Reuses analyzeAttendeeRecords() (which prefers currentEventNames over
 * testEventNames and takes the FIRST matching row top-down = the most recent /
 * top row the user asked for) and clicks that registration's eventRegDetails
 * link. If nothing matches, shows the no-registration modal — the real give-up.
 */
async function processRegistrationsTab(stored) {
  const accountId = getAccountIdFromUrl();
  const asArray = v => (Array.isArray(v) ? v : [v]).filter(Boolean);
  const currentNames = asArray(CONFIG.event.currentEventNames);
  const testNames    = asArray(CONFIG.event.testEventNames);

  console.log("accountPage.js: Registrations-tab fallback — scanning for SUCCEEDED registration");

  const giveUp = async (issueMsg, extra = {}) => {
    console.log(`accountPage.js: ${issueMsg} — showing modal`);
    showNoRegistrationModal();
    await appendDebugStepIfWalkActive("account", "error", { accountId, source: "registrations-tab", ...extra }, [
      { severity: "error", message: issueMsg },
    ]);
    await openDebugReportIfWalkActive();
    chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
  };

  try {
    // Wait for data rows to populate, not just the empty table shell.
    const tableBody = await waitForTableRows(findRegistrationsTableBody, ROW_POLL_ATTEMPTS);
    if (!tableBody) return giveUp("Registrations-tab fallback: could not find the Registrations table body");

    const cols = findColumnIndexes(tableBody);
    if (cols.event == null || cols.status == null) {
      return giveUp("Registrations-tab fallback: could not locate Event/Status columns", { columnsFound: cols });
    }

    const analysis = analyzeAttendeeRecords(tableBody, cols, currentNames, testNames);
    console.log(`accountPage.js: registrations analysis → records=${analysis.records.length}`);

    if (analysis.firstValidLink) {
      console.log(`accountPage.js: clicking SUCCEEDED registration (Registrations tab): ${analysis.matchedEventName} (from ${analysis.matchedEventSource})`);
      await appendDebugStepIfWalkActive("account", "ok", {
        accountId,
        source:             "registrations-tab",
        rowCount:           analysis.records.length,
        matchedEventName:   analysis.matchedEventName,
        matchedEventSource: analysis.matchedEventSource,
      });
      analysis.firstValidLink.click();
      chrome.storage.local.remove(STORAGE_KEY.ACCOUNT_AUTO_NAV);
      return;
    }

    return giveUp("Registrations-tab fallback: no SUCCEEDED registration matched current/test events", { rowCount: analysis.records.length });
  } catch (err) {
    return giveUp(`Registrations-tab fallback threw: ${err.message}`);
  }
}

// ── INIT: Scrape and store on page load ─────────────────────────────────────

(async function triggerIconUpdate() {
  if (!ACCOUNT_PAGE_FEATURE_ENABLED) return;

  const path = window.location.pathname;

  // Only run on account root / about page, not sub-pages like
  // /event-registrations or /timeline.
  if (!/^\/admin\/accounts\/\d+\/?($|\/about)/.test(path)) return;

  try {
    await waitForElement(".titan_account_detail_section_name", POLL_ATTEMPTS, POLL_MS);
  } catch {
    return;
  }

  // Wait a touch longer for the section content (hold rows, note count
  // badges) to populate after the nav itself appears.
  await new Promise(r => setTimeout(r, 600));

  const data = await getAccountData();
  await chrome.storage.local.set({ [STORAGE_KEY.ACCOUNT]: data });
  await chrome.storage.local.set({
    [STORAGE_KEY.PENDING_ICON_UPDATE]: { page: "account", ts: Date.now() }
  });
  console.log("accountPage.js: wrote account data and triggered icon update");
})();

// ── INIT: Check for auto-nav flag on Attendees tab ──────────────────────────

(async function checkForAutoNav() {
  if (!ACCOUNT_PAGE_FEATURE_ENABLED) return;

  const path = window.location.pathname;

  // Detect if we're on the event-registrations page with Attendees tab.
  const isEventRegPage      = /^\/admin\/accounts\/\d+\/event-registrations/.test(path);
  const hasAttendeesTab     = window.location.search.includes("tab=Attendees");
  const hasRegistrationsTab = window.location.search.includes("tab=Registrations");

  if (isEventRegPage && hasAttendeesTab) {
    console.log("accountPage.js: on Attendees tab — capturing first-time status / auto-nav");
    await processAttendeesTab();
  } else if (isEventRegPage && hasRegistrationsTab) {
    // Only act when we arrived here via the Attendees→Registrations fallback
    // (regFallback flag), so manual visits to the Registrations tab are inert.
    const stored = await new Promise(resolve => {
      chrome.storage.local.get(STORAGE_KEY.ACCOUNT_AUTO_NAV, (result) => {
        resolve(result[STORAGE_KEY.ACCOUNT_AUTO_NAV] ?? null);
      });
    });
    if (stored && stored.regFallback) {
      console.log("accountPage.js: on Registrations tab via fallback — scanning for SUCCEEDED registration");
      await processRegistrationsTab(stored);
    }
  }
})();

// ── MESSAGE LISTENERS ───────────────────────────────────────────────────────

/**
 * IMPORTANT: any branch that calls an async function MUST `return true`
 * to keep the sendResponse channel open until the promise resolves.
 * Otherwise the caller's callback receives `undefined`.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === ACTION.PING) {
    sendResponse({ ok: true, script: "accountPage.js" });
    return false;
  }

  if (request.action === ACTION.GET_ACCOUNT_DATA) {
    getAccountData()
      .then(sendResponse)
      .catch(err => {
        console.error("accountPage.js: GET_ACCOUNT_DATA failed:", err);
        sendResponse(null);
      });
    return true; // async response
  }

  if (request.action === ACTION.RUN_ACCOUNT_DEBUG_AUDIT) {
    runAccountDebugAudit()
      .then(() => sendResponse({ ok: true }))
      .catch(err => {
        console.error("accountPage.js: RUN_ACCOUNT_DEBUG_AUDIT failed:", err);
        sendResponse({ ok: false });
      });
    return true; // async response
  }

  if (request.action === ACTION.NAVIGATE_TO_EVENT_REG) {
    const accountId = getAccountIdFromUrl();
    if (accountId) {
      chrome.storage.local.set({
        [STORAGE_KEY.ACCOUNT_AUTO_NAV]: {
          accountId,
          currentEventNames: Array.isArray(CONFIG.event.currentEventNames)
            ? CONFIG.event.currentEventNames
            : [CONFIG.event.currentEventNames],
          testEventNames: Array.isArray(CONFIG.event.testEventNames)
            ? CONFIG.event.testEventNames
            : [CONFIG.event.testEventNames],
          timestamp: Date.now(),
        },
      });
      window.location.href = `/admin/accounts/${accountId}/event-registrations?tab=Attendees`;
    }
    sendResponse({ ok: true });
    return false; // sync response, channel already used
  }
});

// end js/accountPage.js