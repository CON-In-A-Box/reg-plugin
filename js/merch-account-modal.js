// js/merch-account-modal.js
// ============================================================================
// In-page MERCH modal for the Neon account About page (Automated pop-up mode).
//
// Loaded by the manifest AFTER js/accountPage.js, js/modal-drag.js and
// js/account-modal.js on /admin/accounts/* pages. It is the MERCH-mode
// counterpart to js/account-modal.js: both live in the same isolated world,
// so this file uses uniquely-named identifiers (MERCH_ACCOUNT_* / maEl / etc.)
// to avoid colliding with account-modal.js's globals.
//
// Reuses accountPage.js content-script globals DIRECTLY (no messaging):
//   - getAccountData()      — fresh scrape (used here only for the name).
//   - getAccountIdFromUrl() — account id from the URL.
//   - waitForElement()      — DOM-ready polling.
//   - makeDraggable()       (modal-drag.js) — header drag.
//
// Merch skips holds/notes entirely (we're not gating check-in here). The modal
// shows the account name + a "Proceed to Merch Pickup →" button that navigates
// to the Attendees tab; accountPage.js's existing ACCOUNT_AUTO_NAV handler then
// auto-clicks the first SUCCEEDED registration.
//
// CONFIG, STATE, ACTION, STORAGE_KEY, EXTENSION_MODE, BRAND are injected as
// globals by the manifest. Do not add import statements.
// ============================================================================

const MERCH_ACCOUNT_MODAL_ID = "cvg-checkin-modal";

console.log("merch-account-modal.js: script loaded");

function maEl(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

// Only the account root / About page gets the modal (mirrors account-modal.js).
function isMerchAccountAboutPage() {
  return /^\/admin\/accounts\/\d+\/?($|\/about)/.test(window.location.pathname);
}

// Resolve the active extension mode (defaults to REG).
async function merchAccountMode() {
  const r = await chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG });
  return r[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG;
}

// ── Auto-open on page load ─────────────────────────────────────────────────
(async function maybeAutoOpenMerchAccountModal() {
  try {
    if (!isMerchAccountAboutPage()) {
      console.log("merch-account-modal.js: not the account About page — skip");
      return;
    }
    const result = await chrome.storage.local.get({
      [STORAGE_KEY.EXTENSION_MODE]:    EXTENSION_MODE.REG,
      [STORAGE_KEY.POPUP_MODE]:        "automated",
      [STORAGE_KEY.DEBUG_WALK_ACTIVE]: null,
    });
    const merchMode  = (result[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.MERCH;
    const automated  = (result[STORAGE_KEY.POPUP_MODE] ?? "automated") === "automated";
    const walkActive = !!result[STORAGE_KEY.DEBUG_WALK_ACTIVE];
    console.log(`merch-account-modal.js: auto-open check → merchMode=${merchMode} automated=${automated} walkActive=${walkActive}`);

    if (!merchMode || !automated || walkActive) {
      console.log("merch-account-modal.js: auto-open skipped");
      return;
    }
    showMerchAccountModal();
  } catch (err) {
    console.error("merch-account-modal.js: auto-open failed:", err);
  }
})();

// ── Toolbar re-open (mode-guarded — REG's account-modal also listens) ───────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.SHOW_CHECKIN_MODAL) {
    if (isMerchAccountAboutPage()) {
      merchAccountMode().then(mode => {
        if (mode === EXTENSION_MODE.MERCH) showMerchAccountModal();
      });
      sendResponse({ ok: true });
    }
    return false;
  }
});

function closeMerchAccountModal() {
  document.getElementById(MERCH_ACCOUNT_MODAL_ID)?.remove();
}

// Scrape (waiting for the page to settle, like accountPage.js does) then render.
async function showMerchAccountModal() {
  try {
    if (typeof getAccountData !== "function") {
      console.error("merch-account-modal.js: getAccountData unavailable");
      return;
    }
    try {
      await waitForElement(".titan_account_detail_section_name");
      await new Promise(r => setTimeout(r, 600));
    } catch {
      console.warn("merch-account-modal.js: account sections never appeared");
    }
    const account = await getAccountData();
    renderMerchAccountModal(account);
  } catch (err) {
    console.error("merch-account-modal.js: showMerchAccountModal failed:", err);
  }
}

// Build the modal shell (header + ✕ + body) and return { body }.
function buildMerchAccountModalShell() {
  closeMerchAccountModal();

  const root = maEl("div", { id: MERCH_ACCOUNT_MODAL_ID });

  const header = maEl("div", { className: "cvg-modal-header" });
  header.appendChild(maEl("span", { textContent: "Merch Pickup" }));
  const actions = maEl("div", { className: "cvg-modal-header-actions" });
  const close = maEl("button", { className: "cvg-modal-close", textContent: "✕", title: "Close" });
  close.addEventListener("click", closeMerchAccountModal);
  actions.appendChild(close);
  header.appendChild(actions);
  root.appendChild(header);

  const body = maEl("div", { className: "cvg-modal-body" });
  root.appendChild(body);

  document.body.appendChild(root);
  if (typeof makeDraggable === "function") makeDraggable(root, header);
  return { body };
}

// Set the auto-nav flag (so accountPage.js auto-clicks the first SUCCEEDED
// registration once the Attendees tab loads) and navigate there. Mirrors
// account-modal.js's proceedToCheckIn().
function proceedToMerchPickup() {
  const accountId = getAccountIdFromUrl();
  if (!accountId) {
    console.warn("merch-account-modal.js: no accountId — cannot proceed");
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

// renderMerchAccountModal — name + Proceed button. No holds/notes (merch skips
// the reg-flow gating entirely).
function renderMerchAccountModal(account) {
  const { body } = buildMerchAccountModalShell();

  const banner = maEl("div", { className: "banner banner-green", textContent: "✓ Ready for merch pickup" });
  body.appendChild(banner);

  const accountName = account?.accountName;
  if (accountName) {
    const nameEl = maEl("div", { className: "cvg-account-name", textContent: accountName });
    if (account.pronouns && account.pronouns.trim()) {
      nameEl.appendChild(maEl("span", { className: "cvg-pronouns", textContent: account.pronouns.trim() }));
    }
    body.appendChild(nameEl);
  }

  const proceedBtn = maEl("button", { className: "btn-checkin", textContent: "Proceed to Merch Pickup →" });
  proceedBtn.addEventListener("click", proceedToMerchPickup);
  body.appendChild(proceedBtn);
}

// end js/merch-account-modal.js
