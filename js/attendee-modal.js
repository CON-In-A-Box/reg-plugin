// js/attendee-modal.js
// ============================================================================
// In-page check-in modal for the attendee edit page (Automated pop-up mode).
//
// Loaded by the manifest AFTER js/attendeeContact.js, js/merch-attendee.js and
// js/modal-drag.js on attendeeEdit.do pages, so it reuses those files'
// content-script globals DIRECTLY (same isolated world, no messaging):
//   - getAttendeeInfo()   (attendeeContact.js) — fresh scrape / Re-check.
//   - incrementBadge()    (attendeeContact.js) — writes fields, arms the
//                          post-check-in redirect, submits the form.
//   - highlightICEField() (attendeeContact.js) — the "Show me the field" action.
//   - makeDraggable()     (modal-drag.js)      — header drag.
//
// Mirrors popup.js buildAttendeeView() + completeCheckIn() inside the same
// #cvg-checkin-modal container used by checkin-modal.js, so css/checkin-modal.css
// styles it. CONFIG, STATE, ACTION, STORAGE_KEY, CONDITION, EXTENSION_MODE are
// injected as globals by the manifest. Do not add import statements.
// ============================================================================

const ATTENDEE_MODAL_ID = "cvg-checkin-modal";

console.log("attendee-modal.js: script loaded");

// Tiny DOM helper (mirrors popup.js's el()).
function aEl(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

// ── Auto-open on page load ─────────────────────────────────────────────────
(async function maybeAutoOpenAttendeeModal() {
  try {
    const result = await chrome.storage.local.get({
      [STORAGE_KEY.EXTENSION_MODE]:    EXTENSION_MODE.REG,
      [STORAGE_KEY.POPUP_MODE]:        "automated",
      [STORAGE_KEY.DEBUG_WALK_ACTIVE]: null,
    });
    const regMode    = (result[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.REG;
    const automated  = (result[STORAGE_KEY.POPUP_MODE] ?? "automated") === "automated";
    const walkActive = !!result[STORAGE_KEY.DEBUG_WALK_ACTIVE];
    console.log(`attendee-modal.js: auto-open check → regMode=${regMode} automated=${automated} walkActive=${walkActive}`);

    if (!regMode || !automated || walkActive) {
      console.log("attendee-modal.js: auto-open skipped");
      return;
    }
    showAttendeeModal();
  } catch (err) {
    console.error("attendee-modal.js: auto-open failed:", err);
  }
})();

// ── Toolbar re-open ─────────────────────────────────────────────────────────
// Mode-guarded: the MERCH merch-attendee-modal.js also listens on this page, so
// only act when REG mode is active (the merch modal handles MERCH).
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.SHOW_CHECKIN_MODAL) {
    chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG }).then(r => {
      if ((r[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.REG) showAttendeeModal();
    });
    sendResponse({ ok: true });
    return false;
  }
});

function closeAttendeeModal() {
  document.getElementById(ATTENDEE_MODAL_ID)?.remove();
}

async function showAttendeeModal() {
  try {
    if (typeof getAttendeeInfo !== "function") {
      console.error("attendee-modal.js: getAttendeeInfo unavailable");
      return;
    }
    const attendee = await getAttendeeInfo();
    if (attendee) await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: attendee });
    await renderAttendeeModal(attendee);
  } catch (err) {
    console.error("attendee-modal.js: showAttendeeModal failed:", err);
  }
}

// Build the modal shell (header + ✕ + body) and return { root, body }.
function buildModalShell() {
  closeAttendeeModal();

  const root = aEl("div", { id: ATTENDEE_MODAL_ID });

  const header = aEl("div", { className: "cvg-modal-header" });
  header.appendChild(aEl("span", { textContent: "CONvergence Check-In" }));
  // Right-side header controls (optional Re-check + close). Re-check is added
  // by renderAttendeeModal only on the Badge Issued screen.
  const actions = aEl("div", { className: "cvg-modal-header-actions" });
  const close = aEl("button", { className: "cvg-modal-close", textContent: "✕", title: "Close" });
  close.addEventListener("click", closeAttendeeModal);
  actions.appendChild(close);
  header.appendChild(actions);
  root.appendChild(header);

  const body = aEl("div", { className: "cvg-modal-body" });
  root.appendChild(body);

  document.body.appendChild(root);
  if (typeof makeDraggable === "function") makeDraggable(root, header);
  return { root, body, actions };
}

// renderAttendeeModal — mirrors buildAttendeeView() in js/popup.js.
async function renderAttendeeModal(attendee) {
  const { body, actions } = buildModalShell();

  if (!attendee) {
    body.appendChild(aEl("div", { className: "cvg-empty", textContent: "No attendee data found on this page." }));
    return;
  }

  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;
  const ageVerifiedResult  = await chrome.storage.local.get(STORAGE_KEY.AGE_VERIFIED);
  const ageVerified        = ageVerifiedResult[STORAGE_KEY.AGE_VERIFIED] ?? false;

  if (managementOverride) {
    body.appendChild(aEl("div", { className: "cvg-override-banner", textContent: "⚑ MANAGER OVERRIDE ACTIVE" }));
  }

  const reasons       = attendee.reasons ?? [];
  const redReasons    = reasons.filter(r => r.isRed);
  const yellowReasons = reasons.filter(r => !r.isRed && r.key !== "ageVerification");

  const isBlocked = attendee.state === STATE.RED && !managementOverride;
  const needsAgeStep = !ageVerified &&
    reasons.some(r => r.key === "ageVerification") &&
    (redReasons.length === 0 || managementOverride);
  const hasBlockingYellow = (attendee.missingRequiredFields?.length ?? 0) > 0;
  const hasRed            = redReasons.length > 0;
  const canIssueBadge     = !isBlocked && !hasRed && !hasBlockingYellow;

  // ── "Back to ID Check" link (top-left) ──
  // Shown on ANY screen that can appear after the ID check (badge-issued,
  // missing-ICE, red/override) for attendees who went through age verification.
  // Placed before the needsAgeStep block, so it never shows on the ID step.
  const wasAgeChecked = ageVerified && reasons.some(r => r.key === "ageVerification");
  if (wasAgeChecked) {
    const backLink = aEl("a", { className: "cvg-back-idcheck", href: "#", textContent: "← Back to ID Check" });
    backLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await chrome.storage.local.set({ [STORAGE_KEY.AGE_VERIFIED]: false });
      renderAttendeeModal(attendee);
    });
    body.appendChild(backLink);
  }

  // ── AGE VERIFICATION STEP (replaces the whole view) ──
  if (needsAgeStep) {
    const table = aEl("div", { className: "kv-table" });
    addInfoRow(table, "Legal Name", makeNameSpan(attendee.legalName));
    addInfoRow(table, "ID Required", makeCutoffSpan());
    body.appendChild(table);

    const btn = aEl("button", { className: "btn-age-verify", textContent: "Age Verified, ID Returned ✓" });
    btn.addEventListener("click", async () => {
      await chrome.storage.local.set({ [STORAGE_KEY.AGE_VERIFIED]: true });
      renderAttendeeModal(attendee);
    });
    body.appendChild(btn);
    return;
  }

  // ── RED BANNER (override only) ──
  if (redReasons.length > 0 && managementOverride) {
    const banner = aEl("div", { className: "banner banner-red" });
    banner.appendChild(aEl("div", { className: "banner-stop", textContent: "⛔ DO NOT ISSUE BADGE" }));
    appendReasons(banner, redReasons);
    body.appendChild(banner);
  }

  // ── YELLOW WARNINGS BANNER ──
  if (yellowReasons.length > 0) {
    const banner = aEl("div", { className: "banner banner-yellow" });
    appendReasons(banner, yellowReasons);
    body.appendChild(banner);
  }

  // ── BADGE NUMBER + TICKET CELL vs placeholder ──
  if (canIssueBadge) {
    // Badge Issued screen: a Re-check ↺ button in the top-right of the header
    // (next to ✕) so staff can re-scrape without leaving the issued view.
    const headerRecheck = aEl("button", { className: "cvg-modal-recheck", textContent: "Re-check ↺", title: "Re-check" });
    headerRecheck.addEventListener("click", async () => {
      const fresh = await getAttendeeInfo();
      if (fresh) {
        await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: fresh });
        renderAttendeeModal(fresh);
      }
    });
    actions.insertBefore(headerRecheck, actions.firstChild);

    const cell = aEl("div", { className: "badge-number-cell" });
    cell.appendChild(aEl("div", { className: "badge-number-label", textContent: "BADGE NUMBER" }));
    cell.appendChild(aEl("div", { className: "badge-number-value", textContent: attendee.accountId ?? "—" }));
    if (attendee.badgePrintStatus) {
      const statusEl = aEl("div", { className: "badge-print-status", textContent: attendee.badgePrintStatus });
      statusEl.classList.add(`badge-print-${attendee.badgePrintStatus.replace(/[^\w]/g, "").toLowerCase()}`);
      cell.appendChild(statusEl);
    }
    cell.appendChild(aEl("div", { className: "badge-ticket-value", textContent: attendee.ticket ?? "—" }));
    body.appendChild(cell);
  } else {
    body.appendChild(aEl("div", {
      className: "cvg-badge-placeholder",
      textContent: "Badge info will appear once all issues are resolved.",
    }));
  }

  // ── INFO TABLE ──
  const table = aEl("div", { className: "kv-table" });
  const preferred  = (attendee.preferredName ?? "").trim();
  const legalFirst = (attendee.legalName ?? "").split(" ")[0] ?? "";
  if (canIssueBadge) {
    // Badge-issued view: a large "Welcome to CONvergence <name>" greeting in
    // place of the labeled name row (name on its own line for long names).
    const welcome = aEl("div", { className: "cvg-welcome" });
    welcome.appendChild(aEl("div", { className: "cvg-welcome-greeting", textContent: "Welcome to CONvergence" }));
    const welcomeName = aEl("div", { className: "cvg-welcome-name", textContent: preferred || legalFirst || "—" });
    const welcomePron = aPronounSpan(attendee.pronouns);
    if (welcomePron) welcomeName.appendChild(welcomePron);
    welcome.appendChild(welcomeName);
    body.appendChild(welcome);
  } else if (!hasBlockingYellow) {
    // Missing-required-field screen (hasBlockingYellow, e.g. missing ICE) shows
    // NO name/ID rows — just the alert + the field to fix. Other non-issue
    // views keep the legal name.
    let pronounsAttached = false;
    if (preferred && preferred.toLowerCase() !== legalFirst.toLowerCase()) {
      const prefSpan = makeNameSpan(preferred);
      const prefPron = aPronounSpan(attendee.pronouns);
      if (prefPron) { prefSpan.appendChild(prefPron); pronounsAttached = true; }
      addInfoRow(table, "Preferred", prefSpan);
    }
    const legalSpan = makeNameSpan(attendee.legalName);
    if (!pronounsAttached) {
      const legalPron = aPronounSpan(attendee.pronouns);
      if (legalPron) legalSpan.appendChild(legalPron);
    }
    addInfoRow(table, "Legal Name", legalSpan);
    if (reasons.some(r => r.key === "ageVerification")) {
      addInfoRow(table, "ID Required", makeCutoffSpan());
    }
  }
  if (reasons.some(r => r.key === "alreadyIssued")) {
    addInfoRow(table, "Badges", String(attendee.activeBadges ?? 0));
  }
  body.appendChild(table);

  // ── BLOCKED (no override) ──
  if (isBlocked && !managementOverride) {
    body.appendChild(aEl("button", { className: "btn-no-issue", textContent: "NOT ALLOWED — SEND TO HELP DESK", disabled: true }));
    body.appendChild(aEl("div", { className: "helpdesk-note", textContent: "Please send attendee to the Help Desk." }));
    return;
  }

  // ── Re-check section ──
  const fixableReasons = reasons.filter(r =>
    r.fixable && !(r.key === CONDITION.AGE_VERIFICATION && ageVerified)
  );
  if (fixableReasons.length > 0) {
    const section = aEl("div", { className: "recheck-section" });
    const block   = aEl("div", { className: "recheck-block" });

    if (fixableReasons.some(r => r.key === CONDITION.MISSING_ICE)) {
      const showBtn = aEl("button", { className: "btn-show-field", textContent: "Show me the field ↓" });
      showBtn.addEventListener("click", () => {
        if (typeof highlightICEField === "function") highlightICEField();
      });
      block.appendChild(showBtn);
    }

    const recheckBtn = aEl("button", { className: "btn-recheck", textContent: "Re-check ↺" });
    recheckBtn.addEventListener("click", async () => {
      const fresh = await getAttendeeInfo();
      if (fresh) {
        await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: fresh });
        renderAttendeeModal(fresh);
      }
    });
    block.appendChild(recheckBtn);
    section.appendChild(block);
    body.appendChild(section);
  }

  // ── Action buttons ──
  const hasNoAccountId = reasons.some(r => r.key === CONDITION.NO_ACCOUNT_ID);
  const hasActiveHold  = reasons.some(r =>
    r.key === CONDITION.REG_HOLD || r.key === CONDITION.ART_HOLD || r.key === CONDITION.OPS_HOLD
  );

  if (hasNoAccountId) {
    // Can't proceed at all — no button.
  } else if (hasActiveHold) {
    const btn = aEl("button", { className: "btn-no-issue", textContent: "⛔ DO NOT ISSUE BADGE", disabled: true });
    body.appendChild(btn);
  } else if ((fixableReasons.length === 0 || managementOverride) && !hasBlockingYellow) {
    // hasBlockingYellow guard: a missing REQUIRED field (today: emergency
    // contact / ICE) suppresses BOTH the first-time ribbon and the Badge
    // Issued button even under Manager Override. Fill ICE + Re-check first.
    const pendingMerch    = Array.isArray(attendee.merch) ? attendee.merch : [];
    const hasPendingMerch = pendingMerch.length > 0;

    // First-time-attendee guide (purely visual). Set on the account Attendees
    // tab by accountPage.js, keyed by accountId so a stale flag can't leak.
    const ftResult = await chrome.storage.local.get(STORAGE_KEY.FIRST_TIME);
    const ft = ftResult[STORAGE_KEY.FIRST_TIME];
    if (ft && ft.isFirstTime && String(ft.accountId) === String(attendee.accountId)) {
      const ribbon = aEl("div", { className: "cvg-first-time" });
      ribbon.appendChild(aEl("img", { src: chrome.runtime.getURL("assets/FirstTimeRibbon.png"), alt: "" }));
      ribbon.appendChild(document.createTextNode("First Time? Badge Ribbon!"));
      body.appendChild(ribbon);
    }

    pendingMerch.forEach(m => {
      const line = aEl("div", { className: "cvg-merch-line" });
      const cfgItem = (CONFIG.merch?.items || []).find(i => i.name === m.name);
      if (cfgItem && cfgItem.image) {
        line.appendChild(aEl("img", { src: chrome.runtime.getURL(cfgItem.image), alt: "" }));
      }
      line.appendChild(document.createTextNode(`${m.name} Ordered`));
      body.appendChild(line);
    });

    const btn = aEl("button", { className: "btn-checkin" });
    btn.appendChild(document.createTextNode("Badge Issued"));
    if (hasPendingMerch) {
      btn.appendChild(aEl("br"));
      btn.appendChild(document.createTextNode("Send to Merchandise"));
    }
    btn.addEventListener("click", () => completeCheckInModal(attendee, btn, body));
    body.appendChild(btn);
  }
}

// ── CHECK-IN COMPLETION (mirrors popup.js completeCheckIn) ──
async function completeCheckInModal(attendee, btn, body) {
  btn.disabled    = true;
  btn.textContent = "Processing…";

  // Step 1 — badge printer CSV.
  const csvResult = saveBadgeCSVModal(attendee);
  if (!csvResult.ok) {
    showModalError(body, `Badge CSV download failed: ${csvResult.error}\n\nDo NOT issue badge. Please contact Registration Head.`);
    return;
  }

  // Step 2 — write fields + submit (same isolated world; sync return).
  const response = (typeof incrementBadge === "function") ? incrementBadge() : { ok: false, error: "incrementBadge unavailable" };
  if (!response?.ok) {
    showModalError(body, `Check-in could not be completed: ${response?.error ?? "Unknown error"}\n\nDo NOT hand out the badge. Please contact Registration Head.`);
    return;
  }

  // Success — clear the age-verified flag for the next attendee. The form
  // submit above navigates the page; the confirmation may only flash briefly.
  await chrome.storage.local.remove([STORAGE_KEY.AGE_VERIFIED]);
  showModalConfirmation(body, attendee);
}

// saveBadgeCSV — copied from popup.js:925 (pure, content-script-safe).
function saveBadgeCSVModal(attendee) {
  try {
    const headers = ["Badge Type", "Badge Image", "Account ID", "Print Number"];
    const values  = [attendee.ticket, attendee.badgeImage, attendee.accountId, attendee.activeBadges + 1];
    const csvRow  = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv     = [headers.map(csvRow).join(","), values.map(csvRow).join(",")].join("\n");
    const blob     = new Blob([csv], { type: "text/csv" });
    const filename = `${attendee.accountId} - ${(attendee.preferredName || attendee.legalName).replace(/[^\w\s]/g, "")}.csv`;
    const link     = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
    link.click();
    URL.revokeObjectURL(link.href);
    console.log("attendee-modal.js: saveBadgeCSV wrote", filename);
    return { ok: true };
  } catch (err) {
    console.error("attendee-modal.js: saveBadgeCSV failed:", err);
    return { ok: false, error: err.message };
  }
}

function showModalConfirmation(body, attendee) {
  body.innerHTML = "";
  const screen = aEl("div", { className: "confirm-screen" });
  screen.appendChild(aEl("div", { className: "confirm-icon",  textContent: "✓" }));
  screen.appendChild(aEl("div", { className: "confirm-title", textContent: "Check-In Complete" }));
  const confirmName = aEl("div", { className: "confirm-name",  textContent: attendee.preferredName || attendee.legalName });
  const confirmPron = aPronounSpan(attendee.pronouns);
  if (confirmPron) confirmName.appendChild(confirmPron);
  screen.appendChild(confirmName);
  body.appendChild(screen);
}

function showModalError(body, message) {
  body.innerHTML = "";
  const screen = aEl("div", { className: "error-screen" });
  screen.appendChild(aEl("div", { className: "error-icon",    textContent: "✗" }));
  screen.appendChild(aEl("div", { className: "error-message", textContent: message }));
  body.appendChild(screen);
}

// ── small shared builders ──
// `container` is a .kv-table div; each row is a flex .kv-row (label baseline-
// aligned to value, regardless of their differing font sizes).
function addInfoRow(container, label, valueEl) {
  const row = aEl("div", { className: "kv-row" });
  row.appendChild(aEl("span", { className: "kv-label", textContent: label }));
  const val = aEl("span", { className: "kv-val" });
  if (typeof valueEl === "string") val.textContent = valueEl;
  else val.appendChild(valueEl);
  row.appendChild(val);
  container.appendChild(row);
}

function makeNameSpan(text) {
  return aEl("span", { className: "legal-name-value", textContent: text ?? "—" });
}

// Small inline pronoun span (.cvg-pronouns), or null when empty.
function aPronounSpan(pronouns) {
  const p = (pronouns ?? "").trim();
  return p ? aEl("span", { className: "cvg-pronouns", textContent: p }) : null;
}

function makeCutoffSpan() {
  const today  = new Date();
  const cutoff = new Date(today.getFullYear() - CONFIG.adultMinimumAge, today.getMonth(), today.getDate());
  return aEl("span", { className: "age-cutoff-date", textContent: `DOB on or before ${cutoff.toLocaleDateString()}` });
}

function appendReasons(banner, reasons) {
  reasons.forEach((r, i) => {
    if (i > 0) banner.appendChild(aEl("hr", { className: "reason-divider" }));
    const block = aEl("div", { className: "reason-block" });
    const lines = r.text.split("\n");
    block.appendChild(aEl("div", { className: "reason-title", textContent: lines[0] }));
    if (lines.length > 1) block.appendChild(buildReasonBody(lines.slice(1).join("\n")));
    banner.appendChild(block);
  });
}

// Build a .reason-body whose text is split into per-line divs so bullet lines
// ("• ...") get a hanging indent (wrapped text aligns under the text, not the
// bullet). Mirrors buildReasonBody() in popup.js.
function buildReasonBody(text) {
  const wrap = aEl("div", { className: "reason-body" });
  String(text).split("\n").forEach(line => {
    const isBullet = line.startsWith("• ");
    wrap.appendChild(aEl("div", {
      className: isBullet ? "reason-line bullet" : "reason-line",
      textContent: line,
    }));
  });
  return wrap;
}
