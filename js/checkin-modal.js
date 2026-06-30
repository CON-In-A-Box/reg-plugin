// js/checkin-modal.js
// ============================================================================
// In-page check-in modal for the eventReg page (Automated pop-up mode).
//
// Loaded by the manifest AFTER js/registrations.js on eventRegDetails.do pages,
// so it can reuse that file's content-script globals getRegistrationsInfo() /
// getRegistrationNotes(). CONFIG, STATE, ACTION, STORAGE_KEY are injected as
// globals by the manifest. Do not add import statements.
//
// Behavior:
//   - On load, in REG + Automated mode (and no debug walk in flight), the modal
//     auto-opens with the registrant list.
//   - The ✕ button closes it; clicking the toolbar icon re-opens it
//     (background.js fires ACTION.SHOW_CHECKIN_MODAL because it cleared the
//     per-tab popup). Each open re-scrapes the page for fresh data.
//   - Mirrors popup.js buildAttendeeListContent() + navigateToAttendeeEdit().
// ============================================================================

const MODAL_ID = "cvg-checkin-modal";

console.log("checkin-modal.js: script loaded");

// ── Auto-open on page load ─────────────────────────────────────────────────
(async function maybeAutoOpenModal() {
  try {
    const result = await chrome.storage.local.get({
      [STORAGE_KEY.EXTENSION_MODE]:    EXTENSION_MODE.REG,
      [STORAGE_KEY.POPUP_MODE]:        "automated",
      [STORAGE_KEY.DEBUG_WALK_ACTIVE]: null,
    });
    const regMode    = (result[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.REG;
    const automated  = (result[STORAGE_KEY.POPUP_MODE] ?? "automated") === "automated";
    const walkActive = !!result[STORAGE_KEY.DEBUG_WALK_ACTIVE];
    console.log(`checkin-modal.js: auto-open check → regMode=${regMode} automated=${automated} walkActive=${walkActive}`);

    // Manual mode keeps the classic popup; the debug walk owns the page when active;
    // merch mode has its own popup flow.
    if (!regMode || !automated || walkActive) {
      console.log("checkin-modal.js: auto-open skipped");
      return;
    }
    showCheckinModal();
  } catch (err) {
    console.error("checkin-modal.js: auto-open failed:", err);
  }
})();

// ── Toolbar re-open ─────────────────────────────────────────────────────────
// Mode-guarded: the MERCH merch-reg-modal.js also listens on this page, so only
// act when REG mode is active (the merch modal handles MERCH).
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.SHOW_CHECKIN_MODAL) {
    chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG }).then(r => {
      if ((r[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG) === EXTENSION_MODE.REG) showCheckinModal();
    });
    sendResponse({ ok: true });
    return false;
  }
});

function closeCheckinModal() {
  document.getElementById(MODAL_ID)?.remove();
}

async function showCheckinModal() {
  try {
    // Fresh scrape every time (auto-open and toolbar re-open).
    const hasScraper = typeof getRegistrationsInfo === "function";
    const data  = hasScraper ? getRegistrationsInfo() : [];
    const notes = typeof getRegistrationNotes === "function" ? getRegistrationNotes() : [];
    console.log(`checkin-modal.js: showCheckinModal → scraper=${hasScraper} attendees=${data.length} notes=${notes.length}`);

    const ovr = await chrome.storage.local.get({ [STORAGE_KEY.MANAGEMENT_OVERRIDE]: false });
    renderModal({ data, notes }, ovr[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false);
    console.log("checkin-modal.js: modal rendered, present in DOM =", !!document.getElementById(MODAL_ID));
  } catch (err) {
    console.error("checkin-modal.js: showCheckinModal failed:", err);
  }
}

function renderModal(reg, managementOverride) {
  closeCheckinModal();

  const root = document.createElement("div");
  root.id = MODAL_ID;

  // Header
  const header = document.createElement("div");
  header.className = "cvg-modal-header";
  const title = document.createElement("span");
  title.textContent = "CONvergence Check-In";
  const close = document.createElement("button");
  close.className = "cvg-modal-close";
  close.textContent = "✕";
  close.title = "Close";
  close.addEventListener("click", closeCheckinModal);
  header.appendChild(title);
  header.appendChild(close);
  root.appendChild(header);

  if (managementOverride) {
    const ob = document.createElement("div");
    ob.className = "cvg-override-banner";
    ob.textContent = "⚑ MANAGER OVERRIDE ACTIVE";
    root.appendChild(ob);
  }

  const body = document.createElement("div");
  body.className = "cvg-modal-body";
  root.appendChild(body);

  const notes = reg.notes ?? [];
  if (notes.length > 0) {
    renderNoteGate(body, reg, notes, managementOverride);
  } else {
    renderAttendeeList(body, reg, managementOverride);
  }

  document.body.appendChild(root);
  if (typeof makeDraggable === "function") makeDraggable(root, header);
}

// Registration-level note gate — mirrors buildRegistrationsView()'s checkbox gate.
function renderNoteGate(body, reg, notes, managementOverride) {
  const banner = document.createElement("div");
  banner.className = "cvg-note-banner";
  const heading = document.createElement("div");
  heading.className = "cvg-note-title";
  heading.textContent = `⚠ This registration has ${notes.length} note(s) — read before proceeding:`;
  banner.appendChild(heading);

  notes.forEach((note, i) => {
    if (i > 0) banner.appendChild(document.createElement("hr"));
    if (note.title) {
      const t = document.createElement("div");
      t.className = "cvg-note-title";
      t.textContent = note.title;
      banner.appendChild(t);
    }
    if (note.body) {
      const b = document.createElement("div");
      b.textContent = note.body;
      banner.appendChild(b);
    }
  });
  body.appendChild(banner);

  const row = document.createElement("div");
  row.className = "cvg-note-row";
  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.id = "cvg-note-chk";
  const lbl = document.createElement("label");
  lbl.htmlFor = "cvg-note-chk";
  lbl.textContent = "I have read and understood the note(s) above";
  row.appendChild(chk);
  row.appendChild(lbl);
  body.appendChild(row);

  const btn = document.createElement("button");
  btn.className = "cvg-btn cvg-btn-checkin";
  btn.textContent = "Show Attendee List →";
  btn.disabled = true;
  chk.addEventListener("change", () => { btn.disabled = !chk.checked; });
  btn.addEventListener("click", () => {
    body.innerHTML = "";
    renderAttendeeList(body, reg, managementOverride);
  });
  body.appendChild(btn);
}

// Builds the displayed name: "{legalName} ({preferred})", but only appends the
// parenthetical when preferredName is a genuine nickname — i.e. NOT already
// contained in legalName. This suppresses the redundant first-name fallback
// (registrations.js falls back preferredName to legalName.split(" ")[0]) and,
// critically, a name prefix like "Mr." that the fallback would otherwise grab
// from "Mr. Nathan Lueth" → "(Mr.)". Mirrored in popup.js buildAttendeeListContent.
function formatRegName(r) {
  const pref = (r.preferredName || "").trim();
  const showPref = pref && !r.legalName.toLowerCase().includes(pref.toLowerCase());
  return showPref ? `${r.legalName} (${pref})` : r.legalName;
}

// Attendee list — mirrors buildAttendeeListContent() in js/popup.js.
function renderAttendeeList(body, reg, managementOverride) {
  const heading = document.createElement("div");
  heading.className = "cvg-heading";
  heading.textContent = "Select the attendee to check in:";
  body.appendChild(heading);

  const rows = reg.data ?? [];
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cvg-empty";
    empty.textContent = "No attendees found on this registration.";
    body.appendChild(empty);
    return;
  }

  rows.forEach(r => {
    const row = document.createElement("div");
    row.className = `cvg-reg-row ${r.state}`; // STATE values are "green"|"yellow"|"red"

    const name = document.createElement("div");
    name.className = "cvg-reg-name";
    name.textContent = formatRegName(r);
    if (r.pronouns && r.pronouns.trim()) {
      const pron = document.createElement("span");
      pron.className = "cvg-pronouns";
      pron.textContent = r.pronouns.trim();
      name.appendChild(pron);
    }
    row.appendChild(name);

    if (r.state === STATE.RED) {
      if (managementOverride) {
        const btn = document.createElement("button");
        btn.className = "cvg-btn cvg-btn-override";
        btn.textContent = "⚠ Override — Check In →";
        btn.addEventListener("click", () => goToAttendee(r));
        row.appendChild(btn);
      } else {
        const hd = document.createElement("div");
        hd.className = "cvg-helpdesk";
        hd.textContent = "Send to Help Desk";
        row.appendChild(hd);
      }
    } else {
      const ticket = document.createElement("div");
      ticket.className = "cvg-reg-ticket";
      ticket.textContent = r.ticket ?? "";
      row.appendChild(ticket);

      const btn = document.createElement("button");
      btn.className = "cvg-btn cvg-btn-checkin";
      btn.textContent = "Check In →";
      btn.addEventListener("click", () => goToAttendee(r));
      row.appendChild(btn);
    }

    body.appendChild(row);
  });
}

// Navigate to the attendee edit page — mirrors navigateToAttendeeEdit().
async function goToAttendee(reg) {
  await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: reg });
  await chrome.storage.local.remove([STORAGE_KEY.AGE_VERIFIED, STORAGE_KEY.NOTE_ACKNOWLEDGED]);
  location.href =
    `https://${CONFIG.neon.productionDomain}/np/admin/event/attendeeEdit.do?id=${reg.neonAttendeeId}&acct=${reg.accountId}`;
}
