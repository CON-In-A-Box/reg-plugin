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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.SHOW_CHECKIN_MODAL) {
    showAttendeeModal();
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
  const close = aEl("button", { className: "cvg-modal-close", textContent: "✕", title: "Close" });
  close.addEventListener("click", closeAttendeeModal);
  header.appendChild(close);
  root.appendChild(header);

  const body = aEl("div", { className: "cvg-modal-body" });
  root.appendChild(body);

  document.body.appendChild(root);
  if (typeof makeDraggable === "function") makeDraggable(root, header);
  return { root, body };
}

// renderAttendeeModal — mirrors buildAttendeeView() in js/popup.js.
async function renderAttendeeModal(attendee) {
  const { body } = buildModalShell();

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

  // ── AGE VERIFICATION STEP (replaces the whole view) ──
  if (needsAgeStep) {
    const table = aEl("table");
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
    const cell = aEl("div", { className: "badge-number-cell" });
    cell.appendChild(aEl("div", { className: "badge-number-label", textContent: "BADGE NUMBER" }));
    cell.appendChild(aEl("div", { className: "badge-number-value", textContent: attendee.accountId ?? "—" }));
    cell.appendChild(aEl("div", { className: "badge-ticket-value", textContent: attendee.ticket ?? "—" }));
    body.appendChild(cell);
  } else {
    body.appendChild(aEl("div", {
      className: "cvg-badge-placeholder",
      textContent: "Badge info will appear once all issues are resolved.",
    }));
  }

  // ── INFO TABLE ──
  const table = aEl("table");
  const preferred  = (attendee.preferredName ?? "").trim();
  const legalFirst = (attendee.legalName ?? "").split(" ")[0] ?? "";
  if (preferred && preferred.toLowerCase() !== legalFirst.toLowerCase()) {
    addInfoRow(table, "Preferred", makeNameSpan(preferred));
  }
  addInfoRow(table, "Legal Name", makeNameSpan(attendee.legalName));
  if (reasons.some(r => r.key === "ageVerification")) {
    addInfoRow(table, "ID Required", makeCutoffSpan());
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
  } else if (fixableReasons.length === 0 || managementOverride) {
    const pendingMerch    = Array.isArray(attendee.merch) ? attendee.merch : [];
    const hasPendingMerch = pendingMerch.length > 0;
    pendingMerch.forEach(m => {
      body.appendChild(aEl("div", { className: "cvg-merch-line", textContent: `${m.name} Ordered` }));
    });

    const btn = aEl("button", { className: "btn-checkin" });
    btn.textContent = hasPendingMerch ? "Badge Issued - Send to Merchandise" : "Badge Issued";
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
  screen.appendChild(aEl("div", { className: "confirm-name",  textContent: attendee.preferredName || attendee.legalName }));
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
function addInfoRow(table, label, valueEl) {
  const tr  = aEl("tr");
  const tdL = aEl("td", { className: "label", textContent: label });
  const tdR = aEl("td");
  if (typeof valueEl === "string") tdR.textContent = valueEl;
  else tdR.appendChild(valueEl);
  tr.appendChild(tdL);
  tr.appendChild(tdR);
  table.appendChild(tr);
}

function makeNameSpan(text) {
  return aEl("span", { className: "legal-name-value", textContent: text ?? "—" });
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
    if (lines.length > 1) block.appendChild(aEl("div", { className: "reason-body", textContent: lines.slice(1).join("\n") }));
    banner.appendChild(block);
  });
}
