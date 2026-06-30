// js/merch-reg-modal.js
// ============================================================================
// In-page MERCH modal for the eventReg page (Automated pop-up mode).
//
// Loaded by the manifest AFTER js/registrations.js, js/modal-drag.js and
// js/checkin-modal.js on eventRegDetails.do pages. It is the MERCH-mode
// counterpart to js/checkin-modal.js: both live in the same isolated world,
// so this file uses uniquely-named identifiers (MERCH_REG_* / mrEl / etc.) to
// avoid colliding with checkin-modal.js's globals.
//
// Reuses registrations.js's content-script global getRegistrationsInfo()
// directly (no messaging). registrations.js is merch-aware: in MERCH mode each
// row carries a `merch` summary array ({ name, ordered, variant }). Mirrors
// popup-merch.js buildMerchAttendeeListView().
//
// CONFIG, STATE, ACTION, STORAGE_KEY, EXTENSION_MODE are injected as globals.
// Do not add import statements.
// ============================================================================

const MERCH_REG_MODAL_ID = "cvg-checkin-modal";

console.log("merch-reg-modal.js: script loaded");

function mrEl(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

async function merchRegMode() {
  const r = await chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG });
  return r[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG;
}

// ── Auto-open on page load ─────────────────────────────────────────────────
(async function maybeAutoOpenMerchRegModal() {
  try {
    const result = await chrome.storage.local.get({
      [STORAGE_KEY.EXTENSION_MODE]:    EXTENSION_MODE.REG,
      [STORAGE_KEY.POPUP_MODE]:        "automated",
      [STORAGE_KEY.DEBUG_WALK_ACTIVE]: null,
    });
    const merchMode  = (result[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.MERCH;
    const automated  = (result[STORAGE_KEY.POPUP_MODE] ?? "automated") === "automated";
    const walkActive = !!result[STORAGE_KEY.DEBUG_WALK_ACTIVE];
    console.log(`merch-reg-modal.js: auto-open check → merchMode=${merchMode} automated=${automated} walkActive=${walkActive}`);

    if (!merchMode || !automated || walkActive) {
      console.log("merch-reg-modal.js: auto-open skipped");
      return;
    }
    showMerchRegModal();
  } catch (err) {
    console.error("merch-reg-modal.js: auto-open failed:", err);
  }
})();

// ── Toolbar re-open (mode-guarded — REG's checkin-modal also listens) ───────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.SHOW_CHECKIN_MODAL) {
    merchRegMode().then(mode => {
      if (mode === EXTENSION_MODE.MERCH) showMerchRegModal();
    });
    sendResponse({ ok: true });
    return false;
  }
});

function closeMerchRegModal() {
  document.getElementById(MERCH_REG_MODAL_ID)?.remove();
}

function showMerchRegModal() {
  try {
    const rows = typeof getRegistrationsInfo === "function" ? getRegistrationsInfo() : [];
    console.log(`merch-reg-modal.js: showMerchRegModal → attendees=${rows.length}`);
    renderMerchRegModal(rows);
  } catch (err) {
    console.error("merch-reg-modal.js: showMerchRegModal failed:", err);
  }
}

function buildMerchRegModalShell() {
  closeMerchRegModal();

  const root = mrEl("div", { id: MERCH_REG_MODAL_ID });

  const header = mrEl("div", { className: "cvg-modal-header" });
  header.appendChild(mrEl("span", { textContent: "Merch Pickup" }));
  const actions = mrEl("div", { className: "cvg-modal-header-actions" });
  const close = mrEl("button", { className: "cvg-modal-close", textContent: "✕", title: "Close" });
  close.addEventListener("click", closeMerchRegModal);
  actions.appendChild(close);
  header.appendChild(actions);
  root.appendChild(header);

  const body = mrEl("div", { className: "cvg-modal-body" });
  root.appendChild(body);

  document.body.appendChild(root);
  if (typeof makeDraggable === "function") makeDraggable(root, header);
  return { body };
}

// Attendee list — mirrors popup-merch.js buildMerchAttendeeListView().
function renderMerchRegModal(rows) {
  const { body } = buildMerchRegModalShell();

  body.appendChild(mrEl("div", { className: "cvg-heading", textContent: "Select the attendee picking up merch:" }));

  if (!rows || rows.length === 0) {
    body.appendChild(mrEl("div", { className: "cvg-empty", textContent: "No attendees found on this registration." }));
    return;
  }

  rows.forEach(att => {
    const row = mrEl("div", { className: "cvg-reg-row green" });

    const nameText = att.preferredName ? `${att.legalName} (${att.preferredName})` : att.legalName;
    const nameDiv = mrEl("div", { className: "cvg-reg-name", textContent: nameText });
    if (att.pronouns && att.pronouns.trim()) {
      nameDiv.appendChild(mrEl("span", { className: "cvg-pronouns", textContent: att.pronouns.trim() }));
    }
    row.appendChild(nameDiv);

    const merchItems  = Array.isArray(att.merch) ? att.merch : [];
    const orderedList = merchItems.filter(m => m.ordered === true);
    const anyUnknown  = merchItems.some(m => m.ordered === null);

    if (orderedList.length === 0) {
      row.appendChild(mrEl("div", {
        className:   "cvg-reg-ticket",
        textContent: anyUnknown ? "Open to review merch" : "(no merch ordered)",
      }));
    } else {
      orderedList.forEach(m => {
        const line = mrEl("div", { textContent: m.variant ? `${m.name} (${m.variant})` : m.name });
        line.style.cssText = "font-size:14px; font-weight:bold; margin:4px 0 4px 6px;";
        row.appendChild(line);
      });
    }

    const btn = mrEl("button", { className: "cvg-btn cvg-btn-checkin", textContent: "Review Merch →" });
    btn.addEventListener("click", () => goToAttendeeMerch(att));
    row.appendChild(btn);

    body.appendChild(row);
  });
}

// Navigate to the attendee edit page — mirrors popup-merch.js navigateToAttendeeMerch().
function goToAttendeeMerch(att) {
  location.href =
    `https://${CONFIG.neon.productionDomain}/np/admin/event/attendeeEdit.do?id=${att.neonAttendeeId}&acct=${att.accountId}`;
}

// end js/merch-reg-modal.js
