// js/merch-attendee-modal.js
// ============================================================================
// In-page MERCH modal for the attendee edit page (Automated pop-up mode).
//
// Loaded by the manifest AFTER js/attendeeContact.js, js/merch-attendee.js,
// js/modal-drag.js and js/attendee-modal.js on attendeeEdit.do pages. It is the
// MERCH-mode counterpart to js/attendee-modal.js: both live in the same isolated
// world, so this file uses uniquely-named identifiers (MERCH_ATTENDEE_* / mamEl
// / etc.) to avoid colliding with attendee-modal.js's globals.
//
// Reuses merch-attendee.js content-script globals DIRECTLY (no messaging):
//   - scrapeAttendeeMerch() — fresh scrape of the attendee's merch state.
//   - writeMerchPickup()     — writes pickup timestamps + clicks Save. (It no
//                              longer arms a dashboard redirect, so Neon's Save
//                              lands the tab back on eventRegDetails, where
//                              merch-reg-modal.js auto-opens for the next person.)
//   - makeDraggable()        (modal-drag.js) — header drag.
//
// Mirrors popup-merch.js buildMerchAttendeeView() inside the same
// #cvg-checkin-modal container, so css/checkin-modal.css styles it.
//
// CONFIG, STATE, ACTION, STORAGE_KEY, EXTENSION_MODE, BRAND are injected as
// globals by the manifest. Do not add import statements.
// ============================================================================

const MERCH_ATTENDEE_MODAL_ID = "cvg-checkin-modal";

console.log("merch-attendee-modal.js: script loaded");

function mamEl(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

function mamCssId(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function merchAttendeeMode() {
  const r = await chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG });
  return r[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG;
}

// ── Auto-open on page load ─────────────────────────────────────────────────
(async function maybeAutoOpenMerchAttendeeModal() {
  try {
    const result = await chrome.storage.local.get({
      [STORAGE_KEY.EXTENSION_MODE]:    EXTENSION_MODE.REG,
      [STORAGE_KEY.POPUP_MODE]:        "automated",
      [STORAGE_KEY.DEBUG_WALK_ACTIVE]: null,
    });
    const merchMode  = (result[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.MERCH;
    const automated  = (result[STORAGE_KEY.POPUP_MODE] ?? "automated") === "automated";
    const walkActive = !!result[STORAGE_KEY.DEBUG_WALK_ACTIVE];
    console.log(`merch-attendee-modal.js: auto-open check → merchMode=${merchMode} automated=${automated} walkActive=${walkActive}`);

    if (!merchMode || !automated || walkActive) {
      console.log("merch-attendee-modal.js: auto-open skipped");
      return;
    }
    showMerchAttendeeModal();
  } catch (err) {
    console.error("merch-attendee-modal.js: auto-open failed:", err);
  }
})();

// ── Toolbar re-open (mode-guarded — REG's attendee-modal also listens) ──────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.SHOW_CHECKIN_MODAL) {
    merchAttendeeMode().then(mode => {
      if (mode === EXTENSION_MODE.MERCH) showMerchAttendeeModal();
    });
    sendResponse({ ok: true });
    return false;
  }
});

function closeMerchAttendeeModal() {
  document.getElementById(MERCH_ATTENDEE_MODAL_ID)?.remove();
}

function showMerchAttendeeModal() {
  try {
    if (typeof scrapeAttendeeMerch !== "function") {
      console.error("merch-attendee-modal.js: scrapeAttendeeMerch unavailable");
      return;
    }
    const merchState = scrapeAttendeeMerch();
    renderMerchAttendeeModal(merchState);
  } catch (err) {
    console.error("merch-attendee-modal.js: showMerchAttendeeModal failed:", err);
  }
}

function buildMerchAttendeeModalShell() {
  closeMerchAttendeeModal();

  const root = mamEl("div", { id: MERCH_ATTENDEE_MODAL_ID });

  const header = mamEl("div", { className: "cvg-modal-header" });
  header.appendChild(mamEl("span", { textContent: "Merch Pickup" }));
  const actions = mamEl("div", { className: "cvg-modal-header-actions" });
  const close = mamEl("button", { className: "cvg-modal-close", textContent: "✕", title: "Close" });
  close.addEventListener("click", closeMerchAttendeeModal);
  actions.appendChild(close);
  header.appendChild(actions);
  root.appendChild(header);

  const body = mamEl("div", { className: "cvg-modal-body" });
  root.appendChild(body);

  document.body.appendChild(root);
  if (typeof makeDraggable === "function") makeDraggable(root, header);
  return { body };
}

// Checkbox-per-item view — mirrors popup-merch.js buildMerchAttendeeView().
function renderMerchAttendeeModal(merchState) {
  const { body } = buildMerchAttendeeModalShell();

  if (!merchState) {
    body.appendChild(mamEl("div", { className: "cvg-empty", textContent: "No attendee merch data found on this page." }));
    return;
  }

  const nameText = merchState.preferredName
    ? `${merchState.legalName} (${merchState.preferredName})`
    : merchState.legalName;
  const heading = mamEl("div", { className: "cvg-heading", textContent: nameText });
  if (merchState.pronouns && merchState.pronouns.trim()) {
    heading.appendChild(mamEl("span", { className: "cvg-pronouns", textContent: merchState.pronouns.trim() }));
  }
  body.appendChild(heading);

  const orderedItems = (merchState.items ?? []).filter(i => i.ordered);

  if (orderedItems.length === 0) {
    body.appendChild(mamEl("div", { className: "cvg-empty", textContent: "This attendee has not ordered any merchandise." }));
    return;
  }

  const newlyChecked = new Set();

  const submitBtn = mamEl("button", { className: "cvg-btn cvg-btn-checkin", textContent: "Confirm Pickup" });
  submitBtn.disabled = true;

  orderedItems.forEach(item => {
    const row = mamEl("div", { className: `cvg-reg-row ${item.alreadyPickedUp ? "green" : "yellow"}` });

    const checkboxRow = mamEl("div");
    checkboxRow.style.cssText = "display:flex; align-items:center; gap:8px;";

    const chk = mamEl("input");
    chk.type = "checkbox";
    chk.id   = `merch-modal-chk-${mamCssId(item.name)}`;
    chk.style.cssText = "width:18px; height:18px; cursor:pointer; flex-shrink:0;";
    if (item.alreadyPickedUp) {
      chk.checked  = true;
      chk.disabled = true;
    } else {
      chk.addEventListener("change", () => {
        if (chk.checked) newlyChecked.add(item.name);
        else             newlyChecked.delete(item.name);
        submitBtn.disabled = newlyChecked.size === 0;
      });
    }
    checkboxRow.appendChild(chk);

    const labelText = item.variant ? `${item.name} (${item.variant})` : item.name;
    const lbl = mamEl("label", { htmlFor: chk.id, textContent: labelText });
    lbl.style.cssText = "cursor:pointer; font-weight:bold;";
    if (item.alreadyPickedUp) lbl.style.cursor = "default";
    checkboxRow.appendChild(lbl);

    row.appendChild(checkboxRow);

    if (item.alreadyPickedUp) {
      row.appendChild(mamEl("div", {
        className:   "cvg-reg-ticket",
        textContent: `Already picked up: ${item.pickedUpAt}`,
      }));
    }

    body.appendChild(row);
  });

  submitBtn.addEventListener("click", () => {
    submitBtn.disabled    = true;
    submitBtn.textContent = "Recording…";

    let response;
    try {
      response = (typeof writeMerchPickup === "function")
        ? writeMerchPickup(Array.from(newlyChecked))
        : { ok: false, error: "writeMerchPickup unavailable" };
    } catch (err) {
      response = { ok: false, error: err?.message ?? String(err) };
    }

    if (!response?.ok) {
      submitBtn.disabled    = false;
      submitBtn.textContent = "Retry";
      showMerchModalError(body, response?.error ?? "Unknown error");
      return;
    }
    // Success: writeMerchPickup wrote the fields and clicked Save. Neon's Save
    // navigates the tab back to eventRegDetails (no dashboard bounce in merch),
    // where merch-reg-modal.js auto-opens. Show a brief confirmation meanwhile.
    showMerchModalConfirmation(body, merchState);
  });

  body.appendChild(submitBtn);
}

function showMerchModalConfirmation(body, merchState) {
  body.innerHTML = "";
  const screen = mamEl("div", { className: "confirm-screen" });
  screen.appendChild(mamEl("div", { className: "confirm-icon",  textContent: "✓" }));
  screen.appendChild(mamEl("div", { className: "confirm-title", textContent: "Pickup Recorded" }));
  const confirmName = mamEl("div", { className: "confirm-name",  textContent: merchState.preferredName || merchState.legalName });
  if (merchState.pronouns && merchState.pronouns.trim()) {
    confirmName.appendChild(mamEl("span", { className: "cvg-pronouns", textContent: merchState.pronouns.trim() }));
  }
  screen.appendChild(confirmName);
  body.appendChild(screen);
}

function showMerchModalError(body, message) {
  const screen = mamEl("div", { className: "error-screen" });
  screen.appendChild(mamEl("div", { className: "error-icon",    textContent: "✗" }));
  screen.appendChild(mamEl("div", { className: "error-message", textContent: `Could not record pickup: ${message}` }));
  body.appendChild(screen);
}

// end js/merch-attendee-modal.js
