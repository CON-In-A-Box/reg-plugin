// js/account-modal.js
// ============================================================================
// In-page modal for the Neon account About page (Automated pop-up mode).
//
// Loaded by the manifest AFTER js/accountPage.js and js/modal-drag.js on
// /admin/accounts/* pages, so it reuses those files' content-script globals
// DIRECTLY (same isolated world, no messaging):
//   - getAccountData()      (accountPage.js) — fresh scrape / Re-check.
//   - getAccountIdFromUrl() (accountPage.js) — account id from the URL.
//   - waitForElement()      (accountPage.js) — DOM-ready polling.
//   - makeDraggable()       (modal-drag.js)  — header drag.
//
// Mirrors popup.js buildAccountView() inside the same #cvg-checkin-modal
// container used by the other modals, so css/checkin-modal.css styles it.
// CONFIG, STATE, ACTION, STORAGE_KEY, EXTENSION_MODE, BRAND are injected as
// globals by the manifest. Do not add import statements.
// ============================================================================

const ACCOUNT_MODAL_ID = "cvg-checkin-modal";

console.log("account-modal.js: script loaded");

// Tiny DOM helper (mirrors popup.js's el()).
function acEl(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

// Only the account root / About page gets the modal — NOT the
// /event-registrations Attendees tab (that page auto-navigates / shows the
// no-registration modal instead).
function isAccountAboutPage() {
  return /^\/admin\/accounts\/\d+\/?($|\/about)/.test(window.location.pathname);
}

// ── Auto-open on page load ─────────────────────────────────────────────────
(async function maybeAutoOpenAccountModal() {
  try {
    if (!isAccountAboutPage()) {
      console.log("account-modal.js: not the account About page — skip");
      return;
    }
    const result = await chrome.storage.local.get({
      [STORAGE_KEY.EXTENSION_MODE]:    EXTENSION_MODE.REG,
      [STORAGE_KEY.POPUP_MODE]:        "automated",
      [STORAGE_KEY.DEBUG_WALK_ACTIVE]: null,
    });
    const regMode    = (result[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.REG;
    const automated  = (result[STORAGE_KEY.POPUP_MODE] ?? "automated") === "automated";
    const walkActive = !!result[STORAGE_KEY.DEBUG_WALK_ACTIVE];
    console.log(`account-modal.js: auto-open check → regMode=${regMode} automated=${automated} walkActive=${walkActive}`);

    if (!regMode || !automated || walkActive) {
      console.log("account-modal.js: auto-open skipped");
      return;
    }
    showAccountModal();
  } catch (err) {
    console.error("account-modal.js: auto-open failed:", err);
  }
})();

// ── Toolbar re-open ─────────────────────────────────────────────────────────
// Mode-guarded: the MERCH merch-account-modal.js also listens on this page, so
// only act when REG mode is active (the merch modal handles MERCH).
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.SHOW_CHECKIN_MODAL) {
    if (isAccountAboutPage()) {
      chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG }).then(r => {
        if ((r[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.REG) showAccountModal();
      });
      sendResponse({ ok: true });
    }
    return false;
  }
});

function closeAccountModal() {
  document.getElementById(ACCOUNT_MODAL_ID)?.remove();
}

// Scrape (waiting for the page to settle, like accountPage.js does) then render.
async function showAccountModal() {
  try {
    if (typeof getAccountData !== "function") {
      console.error("account-modal.js: getAccountData unavailable");
      return;
    }
    try {
      await waitForElement(".titan_account_detail_section_name");
      await new Promise(r => setTimeout(r, 600));
    } catch {
      console.warn("account-modal.js: account sections never appeared");
    }
    const account = await getAccountData();
    await renderAccountModal(account);
  } catch (err) {
    console.error("account-modal.js: showAccountModal failed:", err);
  }
}

// Build the modal shell (header + ✕ + body) and return { body }.
function buildAccountModalShell() {
  closeAccountModal();

  const root = acEl("div", { id: ACCOUNT_MODAL_ID });

  const header = acEl("div", { className: "cvg-modal-header" });
  header.appendChild(acEl("span", { textContent: "CONvergence Check-In" }));
  const actions = acEl("div", { className: "cvg-modal-header-actions" });
  const close = acEl("button", { className: "cvg-modal-close", textContent: "✕", title: "Close" });
  close.addEventListener("click", closeAccountModal);
  actions.appendChild(close);
  header.appendChild(actions);
  root.appendChild(header);

  const body = acEl("div", { className: "cvg-modal-body" });
  root.appendChild(body);

  document.body.appendChild(root);
  if (typeof makeDraggable === "function") makeDraggable(root, header);
  return { body };
}

// Re-scrape and re-render in place.
async function recheckAccountModal() {
  const fresh = await getAccountData();
  await chrome.storage.local.set({ [STORAGE_KEY.ACCOUNT]: fresh });
  await renderAccountModal(fresh);
}

// Set the auto-nav flag (so accountPage.js auto-clicks the registration once
// the Attendees tab loads) and navigate there. Mirrors accountPage.js's
// NAVIGATE_TO_EVENT_REG handler.
function proceedToCheckIn() {
  const accountId = getAccountIdFromUrl();
  if (!accountId) {
    console.warn("account-modal.js: no accountId — cannot proceed");
    return;
  }
  const asArray = v => (Array.isArray(v) ? v : [v]).filter(Boolean);
  chrome.storage.local.set({
    [STORAGE_KEY.ACCOUNT_AUTO_NAV]: {
      accountId,
      currentEventNames: asArray(CONFIG.event.currentEventNames),
      testEventNames:    asArray(CONFIG.event.testEventNames),
      timestamp:         Date.now(),
    },
  });
  window.location.href = `/admin/accounts/${accountId}/event-registrations?tab=Attendees`;
}

// renderAccountModal — mirrors buildAccountView() in js/popup.js.
async function renderAccountModal(account) {
  const { body } = buildAccountModalShell();

  if (!account) {
    body.appendChild(acEl("div", { className: "cvg-empty", textContent: "No account data found on this page." }));
    return;
  }

  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  if (managementOverride) {
    body.appendChild(acEl("div", { className: "cvg-override-banner", textContent: "⚑ MANAGER OVERRIDE ACTIVE" }));
  }

  // ── Account holds banner (RED — blocks check-in) ──
  const holds = account.holds ?? { operationsHold: false, artShowHold: false, registrationHold: false, hasAnyHolds: false };

  if (holds.hasAnyHolds) {
    const banner = acEl("div", { className: "banner banner-red" });

    if (managementOverride) {
      banner.appendChild(acEl("div", { className: "banner-stop", textContent: "⛔ ACCOUNT HOLDS" }));

      const holdsList = [];
      if (holds.registrationHold) holdsList.push({ title: CONFIG.holdMessages[0].title.toUpperCase(), body: CONFIG.holdMessages[0].body });
      if (holds.artShowHold)      holdsList.push({ title: CONFIG.holdMessages[1].title.toUpperCase(), body: CONFIG.holdMessages[1].body });
      if (holds.operationsHold)   holdsList.push({ title: CONFIG.holdMessages[2].title.toUpperCase(), body: CONFIG.holdMessages[2].body });

      holdsList.forEach((hold, i) => {
        if (i > 0) banner.appendChild(acEl("hr", { className: "reason-divider" }));
        const block = acEl("div", { className: "reason-block" });
        block.appendChild(acEl("div", { className: "reason-title", textContent: hold.title }));
        block.appendChild(buildAccountReasonBody(hold.body));
        banner.appendChild(block);
      });
      body.appendChild(banner);

      const recheckBtn = acEl("button", { className: "btn-recheck", textContent: "Re-check ↺" });
      recheckBtn.addEventListener("click", recheckAccountModal);
      body.appendChild(recheckBtn);
    } else {
      // Regular staff: no detail, just send them onward.
      banner.appendChild(acEl("div", { className: "banner-stop", textContent: "⛔ SEND TO HELP DESK" }));
      body.appendChild(banner);
    }
    return;
  }

  // ── Account notes banner (YELLOW — requires acknowledgment) ──
  const hasNotes = account.notes && account.notes.length > 0;

  if (hasNotes) {
    const banner  = acEl("div", { className: "banner banner-yellow" });
    banner.appendChild(acEl("div", {
      className: "reason-title",
      textContent: `⚠ This account has ${account.notes.length} note(s) — read before proceeding:`,
    }));

    account.notes.forEach((note, i) => {
      if (i > 0) banner.appendChild(acEl("hr", { className: "reason-divider" }));
      const block = acEl("div", { className: "reason-block" });
      if (note.title) block.appendChild(acEl("div", { className: "reason-title", textContent: note.title }));
      if (note.body)  block.appendChild(buildAccountReasonBody(note.body));
      banner.appendChild(block);
    });
    body.appendChild(banner);

    const checkRow = acEl("div", { className: "cvg-notes-confirm" });
    const chk = acEl("input", { type: "checkbox", id: "cvg-notes-confirm-chk" });
    const lbl = acEl("label", { htmlFor: "cvg-notes-confirm-chk", textContent: "I have read and understood the note(s) above" });
    checkRow.appendChild(chk);
    checkRow.appendChild(lbl);
    body.appendChild(checkRow);

    const proceedBtn = acEl("button", { className: "btn-checkin", textContent: "Proceed to Check-In →" });
    proceedBtn.disabled = true;
    chk.addEventListener("change", () => { proceedBtn.disabled = !chk.checked; });
    proceedBtn.addEventListener("click", proceedToCheckIn);
    body.appendChild(proceedBtn);
    return;
  }

  // ── Clean account (no holds, no notes) — full name + Proceed button ──
  const banner = acEl("div", { className: "banner banner-green" });
  banner.textContent = account.accountName
    ? "✓ Ready for check-in"
    : "✓ Account ready for check-in";
  body.appendChild(banner);

  if (account.accountName) {
    const nameEl = acEl("div", { className: "cvg-account-name", textContent: account.accountName });
    if (account.pronouns && account.pronouns.trim()) {
      nameEl.appendChild(acEl("span", { className: "cvg-pronouns", textContent: account.pronouns.trim() }));
    }
    body.appendChild(nameEl);
  }

  const proceedBtn = acEl("button", { className: "btn-checkin", textContent: "Proceed to Check-In →" });
  proceedBtn.addEventListener("click", proceedToCheckIn);
  body.appendChild(proceedBtn);
}

// Build a .reason-body whose text is split into per-line divs so bullet lines
// ("• ...") get a hanging indent. Mirrors buildReasonBody() in popup.js.
function buildAccountReasonBody(text) {
  const wrap = acEl("div", { className: "reason-body" });
  String(text).split("\n").forEach(line => {
    const isBullet = line.startsWith("• ");
    wrap.appendChild(acEl("div", {
      className: isBullet ? "reason-line bullet" : "reason-line",
      textContent: line,
    }));
  });
  return wrap;
}

// end js/account-modal.js
