// js/popup.js
//
// ============================================================================
// CONvergence Check-In Extension — Popup UI Script
// ============================================================================
//
// This file controls what staff see when they click the extension's toolbar
// icon. It reads cached data from chrome.storage.local (written by the
// content scripts) and renders one of several views depending on which
// Neon page is currently open in the active tab.
//
// Views rendered by this file:
//   1. Account page view       — shown on /admin/accounts/NNN pages
//   2. Registrations view      — shown on eventRegDetails.do pages
//   3. Attendee view           — shown on attendeeEdit.do pages (main check-in)
//   4. Confirmation / Error    — shown after a check-in attempt
//   5. Not-Found view          — shown when data can't be read or page is wrong
//
// Globals injected by popup.html before this file loads:
//   CONFIG       — annual configuration (from config.js)
//   STATE        — green/yellow/red constants (from constants.js)
//   ACTION       — message action names (from constants.js)
//   STORAGE_KEY  — chrome.storage.local key names (from constants.js)
//   CONDITION    — condition key names (from constants.js)
//
// ============================================================================
// MAINTENANCE NOTES
// ============================================================================
// - The "Badge Number" cell is intentionally HIDDEN until ALL red conditions
//   are cleared AND no required fields are missing. This prevents staff from
//   reflexively reading out a badge number before resolving the problem.
//   The same rule enables/disables the "Badge Delivered" button — the two
//   signals are intentionally coupled.
// - To change this behavior, edit the `canIssueBadge` computation near the
//   top of buildAttendeeView().
// ============================================================================

document.addEventListener("DOMContentLoaded", displayPopup);


// ── OVERRIDE BANNER ────────────────────────────────────────────────────
// Red bar shown at top of every view while Manager Override is active.
// Set by the Options page; stored in chrome.storage.local.

// ── OVERRIDE BANNER ────────────────────────────────────────────────────────
function buildOverrideBanner() {
  const bar = el("div", { className: "override-bar" });
  bar.textContent = "MANAGER OVERRIDE ACTIVE";
  return bar;
}


// ── ENTRY POINT ────────────────────────────────────────────────────────
// Figures out which Neon page is active and routes to the right view.
// The `document.body.dataset.rendered` guard prevents double-render in
// case the popup is somehow opened twice quickly.

// ── ENTRY POINT ────────────────────────────────────────────────────────────
async function displayPopup() {
  if (document.body.dataset.rendered) return;
  document.body.dataset.rendered = "1";

  const activeTab = await getActiveTab();
  const url = activeTab?.url ?? "";

  // Mode + manager-debug dispatch. Read all three flags up front.
  const flagResult = await chrome.storage.local.get({
    [STORAGE_KEY.EXTENSION_MODE]:      EXTENSION_MODE.REG,
    [STORAGE_KEY.MANAGEMENT_OVERRIDE]: false,
    [STORAGE_KEY.DEBUG_MODE]:          false,
  });
  const mode             = flagResult[STORAGE_KEY.EXTENSION_MODE];
  const managerOverride  = flagResult[STORAGE_KEY.MANAGEMENT_OVERRIDE];
  const debugMode        = flagResult[STORAGE_KEY.DEBUG_MODE];
  console.log("popup.js: displayPopup mode =", mode, "manager =", managerOverride, "debug =", debugMode, "url =", url);

  // Manager Debug walk -- only fires from an account page when both
  // Management Override and Debug Mode are on. Initiates an automated
  // walk through account → eventreg → attendee that audits field-label
  // resolution and opens a report tab at the end. Takes precedence over
  // the merch dispatch + the normal account view below.
  if (managerOverride && debugMode && url.includes("/admin/accounts/")) {
    return initiateDebugWalk(activeTab, url);
  }

  if (mode === EXTENSION_MODE.MERCH) {
    return displayMerchPopup(activeTab, url);
  }

  if (url.includes("/admin/accounts/")) {
    // Account overview page — just shows notes and a "Proceed" button
    buildAccountLoadingView();
    const result  = await chrome.storage.local.get(STORAGE_KEY.ACCOUNT);
    const account = result[STORAGE_KEY.ACCOUNT];
    account
      ? buildAccountView(account, activeTab)
      : buildNotFoundView(
          "Could not read account data.",
          "The page may still be loading. Please wait a moment and try again."
        );

  } else if (url.includes("attendeeEdit")) {
    // Main check-in page
    const result   = await chrome.storage.local.get(STORAGE_KEY.ATTENDEE);
    const attendee = result[STORAGE_KEY.ATTENDEE];
    attendee
      ? buildAttendeeView(attendee, activeTab)
      : buildNotFoundView(
          "No attendee data found.",
          "Navigate to an attendee page first, then try again."
        );

  } else if (url.includes("eventRegDetails")) {
    // Registration details page — list of attendees on one registration
    const result        = await chrome.storage.local.get(STORAGE_KEY.REGISTRATIONS);
    const registrations = result[STORAGE_KEY.REGISTRATIONS];
    registrations
      ? buildRegistrationsViewOrNote(registrations, activeTab)
      : buildNotFoundView(
          "No registration data found.",
          "Navigate to a registration page first, then try again."
        );

  } else {
    // Not on any recognized Neon page
    buildNotFoundView(
      "Wrong page.",
      "To use this tool:\n1. Search for the attendee in Neon\n2. Click their name to open the account page\n3. Click the extension icon"
    );
  }
}


// ── ACCOUNT PAGE VIEW ──────────────────────────────────────────────────

function buildAccountLoadingView() {
  document.body.innerHTML = "";
  const d = el("div", { className: "not-found-detail", textContent: "Reading account…" });
  document.body.appendChild(d);
}

// NOTE: account-page scraping is performed by js/accountPage.js, which
// runs as a content script directly on the account page. The popup just
// reads the cached result from chrome.storage.local. Do not re-scrape here.

// ── REGISTRATIONS: NOTE GATE ───────────────────────────────────────────────
// If the registration has a note, show it first and require acknowledgment
// before proceeding to the normal attendee list.
async function buildRegistrationsViewOrNote(registrationData, tab) {
  const note = registrationData.note ?? "";
  if (!note) {
    buildRegistrationsView(registrationData, tab);
    return;
  }

  const ackResult = await chrome.storage.local.get(STORAGE_KEY.NOTE_ACKNOWLEDGED);
  const acknowledged = ackResult[STORAGE_KEY.NOTE_ACKNOWLEDGED] ?? false;
  if (acknowledged) {
    buildRegistrationsView(registrationData, tab);
    return;
  }

  // Show note screen
  const overrideResult = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  const body = document.body;
  body.innerHTML = "";

  if (managementOverride) body.appendChild(buildOverrideBanner());

  const screen = el("div", { className: "note-screen" });
  screen.appendChild(el("div", { className: "note-heading", textContent: "📋 Registration Note" }));
  const noteText = el("div", { className: "note-text" });
  noteText.textContent = note;
  screen.appendChild(noteText);

  const ackBtn = el("button", { className: "btn-note-ack" });
  ackBtn.textContent = "Note Read ✓";
  ackBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ [STORAGE_KEY.NOTE_ACKNOWLEDGED]: true });
    buildRegistrationsView(registrationData, tab);
  });
  screen.appendChild(ackBtn);

  body.appendChild(screen);
}

async function buildAccountView(account, tab) {
  const body = document.body;
  body.innerHTML = "";

  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  if (managementOverride) body.appendChild(buildOverrideBanner());

  // ── Navigation error state ──
  if (account.navError) {
    const banner = el("div", { className: "banner banner-red" });
    const stop   = el("div", { className: "banner-stop", textContent: "⛔ Registration Not Found" });
    const msg    = el("div", { className: "reason-body", textContent: account.navError });
    banner.appendChild(stop);
    banner.appendChild(msg);
    body.appendChild(banner);

    const retryBtn = el("button", { className: "btn-checkin", textContent: "Try Again →" });
    retryBtn.addEventListener("click", () => {
      chrome.storage.local.remove([STORAGE_KEY.ACCOUNT]);
      chrome.tabs.update(tab.id, { url: tab.url });
      window.close();
    });
    body.appendChild(retryBtn);
    return;
  }

  // ── Account holds banner (RED — blocks check-in) ──
  const holds = account.holds ?? { operationsHold: false, artShowHold: false, registrationHold: false, hasAnyHolds: false };

  if (holds.hasAnyHolds) {
    const banner = el("div", { className: "banner banner-red" });
    
    if (managementOverride) {
      // ── MANAGER OVERRIDE: Show detailed holds with resolution instructions ──
      banner.appendChild(el("div", { className: "banner-stop", textContent: "⛔ ACCOUNT HOLDS" }));
      
      // holdMessages order is [0]=reg, [1]=art, [2]=ops (see config.js).
      const holdsList = [];
      if (holds.registrationHold) {
        holdsList.push({
          title: CONFIG.holdMessages[0].title.toUpperCase(),
          body: CONFIG.holdMessages[0].body
        });
      }
      if (holds.artShowHold) {
        holdsList.push({
          title: CONFIG.holdMessages[1].title.toUpperCase(),
          body: CONFIG.holdMessages[1].body
        });
      }
      if (holds.operationsHold) {
        holdsList.push({
          title: CONFIG.holdMessages[2].title.toUpperCase(),
          body: CONFIG.holdMessages[2].body
        });
      }

      holdsList.forEach((hold, i) => {
        if (i > 0) banner.appendChild(el("hr", { className: "reason-divider" }));
        const block = el("div", { className: "reason-block" });
        block.appendChild(el("div", { 
          className: "reason-title", 
          textContent: hold.title 
        }));
        block.appendChild(buildReasonBody(hold.body));
        banner.appendChild(block);
      });

      body.appendChild(banner);

      // Re-check button for manager override
      const recheckBtn = el("button", { 
        className: "btn-recheck-large",
        textContent: "Re-check ↺" 
      });
      recheckBtn.addEventListener("click", async () => {
        const result = await chrome.tabs.sendMessage(tab.id, { action: ACTION.GET_ACCOUNT_DATA });
        if (result) {
          await chrome.storage.local.set({ [STORAGE_KEY.ACCOUNT]: result });
          body.innerHTML = "";
          if (managementOverride) body.appendChild(buildOverrideBanner());
          await buildAccountView(result, tab);
        }
      });
      body.appendChild(recheckBtn);

} else {
      // ── REGULAR STAFF: Just show "SEND TO HELP DESK" ──
      banner.appendChild(el("div", { className: "banner-stop", textContent: "⛔ SEND TO HELP DESK" }));
      body.appendChild(banner);
    }

    return;
  }

  // ── Account notes banner (YELLOW — requires acknowledgment) ──
  const hasNotes = account.notes && account.notes.length > 0;

  if (hasNotes) {
    const banner  = el("div", { className: "banner banner-yellow" });
    const heading = el("div", { className: "reason-title" });
    heading.textContent = `⚠ This account has ${account.notes.length} note(s) — read before proceeding:`;
    banner.appendChild(heading);

    account.notes.forEach((note, i) => {
      if (i > 0) banner.appendChild(el("hr", { className: "reason-divider" }));
      const block = el("div", { className: "reason-block" });
      if (note.title) block.appendChild(el("div", { className: "reason-title", textContent: note.title }));
      if (note.body)  block.appendChild(el("div", { className: "reason-body",  textContent: note.body  }));
      banner.appendChild(block);
    });
    body.appendChild(banner);

    const checkRow = el("div");
    checkRow.style.cssText = "display:flex; align-items:center; gap:8px; margin:8px 0; font-size:13px;";
    const chk = el("input"); chk.type = "checkbox"; chk.id = "notes-confirm-chk";
    chk.style.cssText = "width:16px; height:16px; cursor:pointer; flex-shrink:0;";
    const lbl = el("label"); lbl.htmlFor = "notes-confirm-chk";
    lbl.textContent = "I have read and understood the note(s) above";
    lbl.style.cursor = "pointer";
    checkRow.appendChild(chk);
    checkRow.appendChild(lbl);
    body.appendChild(checkRow);

    const proceedBtn = el("button", { className: "btn-checkin", textContent: "Proceed to Check-In →" });
    proceedBtn.disabled = true;
    chk.addEventListener("change", () => { proceedBtn.disabled = !chk.checked; });
    proceedBtn.addEventListener("click", () => navigateToEventReg(tab, account));
    body.appendChild(proceedBtn);

  } else {
    // No notes, no holds — auto-navigate to event registration
    const banner = el("div", { className: "banner banner-green" });
    banner.textContent = account.accountName
      ? `✓ ${account.accountName} — Ready for check-in`
      : "✓ Account ready for check-in";
    body.appendChild(banner);

    // AUTO-NAVIGATE immediately
    navigateToEventReg(tab, account);
  }
}

/**
 * Manager Debug Mode entry point. Triggered from the account page when
 * MANAGEMENT_OVERRIDE and DEBUG_MODE are both true. Sets up the walk
 * state in chrome.storage and navigates the tab to the same URL the
 * normal reg flow uses (so accountPage.js's existing
 * processAttendeesTab() takes over from there).
 *
 * The walk's later steps live in registrations.js and attendeeContact.js;
 * each checks STORAGE_KEY.DEBUG_WALK_ACTIVE on page load and appends to
 * STORAGE_KEY.DEBUG_REPORT before advancing.
 */
async function initiateDebugWalk(tab, url) {
  const accountMatch = url.match(/\/admin\/accounts\/(\d+)/);
  const accountId    = accountMatch?.[1] ?? "";
  if (!accountId) {
    console.warn("popup.js: initiateDebugWalk could not parse accountId from URL", url);
    return;
  }

  // Reset any prior report and arm the walk. ACCOUNT_AUTO_NAV reuses the
  // existing accountPage.js auto-click mechanism with no new code needed.
  await chrome.storage.local.remove([STORAGE_KEY.DEBUG_REPORT]);
  await chrome.storage.local.set({
    [STORAGE_KEY.DEBUG_WALK_ACTIVE]: {
      startedAt: Date.now(),
      accountId,
      startedFromUrl: url,
    },
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

  // Capture the account About-page fields into the report BEFORE navigating
  // away -- the .neon_nest_grid_row grid only exists on the About view, and
  // the walk is about to leave it. accountPage.js is already loaded here.
  try {
    await chrome.tabs.sendMessage(tab.id, { action: ACTION.RUN_ACCOUNT_DEBUG_AUDIT });
  } catch (e) {
    console.warn("popup.js: account debug audit message failed (continuing):", e?.message);
  }

  const tabUrl = new URL(tab.url);
  const newUrl = `${tabUrl.protocol}//${tabUrl.host}/admin/accounts/${accountId}/event-registrations?tab=Attendees`;
  console.log("popup.js: initiateDebugWalk armed, navigating to", newUrl);
  await chrome.tabs.update(tab.id, { url: newUrl });
  window.close();
}

function navigateToEventReg(tab, account) {
  // Store event names so the auto-nav logic in accountPage.js can filter
  // registrations. currentEventNames are checked first, then testEventNames.
  chrome.storage.local.set({
    [STORAGE_KEY.ACCOUNT_AUTO_NAV]: {
      accountId: account.accountId,
      currentEventNames: Array.isArray(CONFIG.event.currentEventNames)
        ? CONFIG.event.currentEventNames
        : [CONFIG.event.currentEventNames],
      testEventNames: Array.isArray(CONFIG.event.testEventNames)
        ? CONFIG.event.testEventNames
        : [CONFIG.event.testEventNames],
      timestamp: Date.now(),
    }
  }, () => {
    const tabUrl  = new URL(tab.url);
    const newUrl  = `${tabUrl.protocol}//${tabUrl.host}/admin/accounts/${account.accountId}/event-registrations?tab=Attendees`;
    chrome.tabs.update(tab.id, { url: newUrl });
    window.close();
  });
}


// ── REGISTRATIONS VIEW ─────────────────────────────────────────────────
// Shown on eventRegDetails.do — lets staff pick which attendee on this
// registration to check in.

async function buildRegistrationsView(registrationData, tab) {
  const body = document.body;
  body.innerHTML = "";

  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;

  if (managementOverride) body.appendChild(buildOverrideBanner());

  const notes    = registrationData.notes ?? [];
  const hasNotes = notes.length > 0;

  if (hasNotes) {
    // Registration-level notes must be acknowledged before attendee list shows
    const banner  = el("div", { className: "banner banner-yellow" });
    const heading = el("div", { className: "reason-title" });
    heading.textContent = `⚠ This registration has ${notes.length} note(s) — read before proceeding:`;
    banner.appendChild(heading);

    notes.forEach((note, i) => {
      if (i > 0) banner.appendChild(el("hr", { className: "reason-divider" }));
      const block = el("div", { className: "reason-block" });
      if (note.title) block.appendChild(el("div", { className: "reason-title", textContent: note.title }));
      if (note.body)  block.appendChild(el("div", { className: "reason-body",  textContent: note.body  }));
      banner.appendChild(block);
    });
    body.appendChild(banner);

    const checkRow = el("div");
    checkRow.style.cssText = "display:flex; align-items:center; gap:8px; margin:8px 0; font-size:13px;";
    const chk = el("input"); chk.type = "checkbox"; chk.id = "reg-notes-confirm-chk";
    chk.style.cssText = "width:16px; height:16px; cursor:pointer; flex-shrink:0;";
    const lbl = el("label"); lbl.htmlFor = "reg-notes-confirm-chk";
    lbl.textContent = "I have read and understood the note(s) above";
    lbl.style.cursor = "pointer";
    checkRow.appendChild(chk);
    checkRow.appendChild(lbl);
    body.appendChild(checkRow);

    const proceedBtn = el("button", { className: "btn-checkin", textContent: "Show Attendee List →" });
    proceedBtn.disabled = true;
    chk.addEventListener("change", () => { proceedBtn.disabled = !chk.checked; });
    proceedBtn.addEventListener("click", () => {
      body.innerHTML = "";
      if (managementOverride) body.appendChild(buildOverrideBanner());
      buildAttendeeListContent(registrationData, tab, body, managementOverride);
    });
    body.appendChild(proceedBtn);

  } else {
    buildAttendeeListContent(registrationData, tab, body, managementOverride);
  }
}

function buildAttendeeListContent(registrationData, tab, body, managementOverride) {
  body.appendChild(el("div", { className: "heading", textContent: "Select the attendee to check in:" }));

  registrationData.data.forEach(reg => {
    const row      = el("div", { className: `reg-row reg-row-${reg.state}` });
    // Show "(preferred)" only when it's a genuine nickname not already in the
    // legal name — suppresses the redundant first-name fallback and a captured
    // prefix like "Mr." (see formatRegName in checkin-modal.js).
    const prefName = (reg.preferredName || "").trim();
    const nameText = (prefName && !reg.legalName.toLowerCase().includes(prefName.toLowerCase()))
      ? `${reg.legalName} (${prefName})` : reg.legalName;
    const nameDiv = el("div", { className: "reg-name", textContent: nameText });
    const regPron = pronounSpan(reg.pronouns);
    if (regPron) nameDiv.appendChild(regPron);
    row.appendChild(nameDiv);

    if (reg.state === STATE.RED) {
      if (managementOverride) {
        const overrideBtn = el("button", { className: "btn-override", textContent: "⚠ Override — Check In →" });
        overrideBtn.addEventListener("click", () => navigateToAttendeeEdit(reg, tab));
        row.appendChild(overrideBtn);
      } else {
        row.appendChild(el("div", { className: "helpdesk-note-inline", textContent: "Send to Help Desk" }));
      }
    } else {
      row.appendChild(el("div", { className: "reg-ticket", textContent: reg.ticket }));
      const btn = el("button", { className: "btn-select", textContent: "Check In →" });
      btn.addEventListener("click", () => navigateToAttendeeEdit(reg, tab));
      row.appendChild(btn);
    }

    body.appendChild(row);
  });
}

async function navigateToAttendeeEdit(reg, tab) {
  // Clear the age-verified flag when moving to a new attendee so the
  // age verification step is enforced freshly for this person.
  await chrome.storage.local.remove([STORAGE_KEY.AGE_VERIFIED]);
  await chrome.storage.local.remove([STORAGE_KEY.AGE_VERIFIED, STORAGE_KEY.NOTE_ACKNOWLEDGED]);
  await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: reg });
  await chrome.tabs.update(tab.id, {
    url: `https://${CONFIG.neon.productionDomain}/np/admin/event/attendeeEdit.do?id=${reg.neonAttendeeId}&acct=${reg.accountId}`,
  });
  window.close();
}


// ── ATTENDEE VIEW ──────────────────────────────────────────────────────
// Main check-in view. Shown on attendeeEdit.do pages.
//
// Visibility rules (IMPORTANT — read before editing):
//
//   Badge Number / Ticket cell:  shown ONLY when canIssueBadge is true.
//                                This is intentional — we don't want staff
//                                reading out a badge number while a red or
//                                blocking-yellow condition is still visible.
//   Badge Delivered button:      enabled ONLY when canIssueBadge is true.
//                                The two signals are deliberately coupled.
//   Re-check button:             shown whenever there's any red OR yellow
//                                condition on screen. After clicking, the
//                                view re-renders with fresh scraped data;
//                                if all issues are now clear, the badge
//                                number appears at the same time the
//                                Badge Delivered button becomes active.

// ── ATTENDEE VIEW ──────────────────────────────────────────────────────────
async function buildAttendeeView(attendee, tab) {
  const body = document.body;
  body.innerHTML = "";

  // ── Read override and age-verification flags from storage ──
  const overrideResult     = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;
  const ageVerifiedResult  = await chrome.storage.local.get(STORAGE_KEY.AGE_VERIFIED);
  const ageVerified        = ageVerifiedResult[STORAGE_KEY.AGE_VERIFIED] ?? false;

  if (managementOverride) body.appendChild(buildOverrideBanner());

  // ── Classify this attendee's conditions ──
  // (classification below feeds the top-left "Back to ID Check" link)
  const reasons       = attendee.reasons ?? [];
  const redReasons    = reasons.filter(r => r.isRed);
  const yellowReasons = reasons.filter(r => !r.isRed && r.key !== "ageVerification");

  // isBlocked: red reasons present AND no manager override available
  const isBlocked = attendee.state === STATE.RED && !managementOverride;

  // needsAgeStep: the age-verification gate hasn't been cleared yet,
  // AND the registrant's ticket requires age verification,
  // AND they aren't already blocked by a red condition (unless override)
  const needsAgeStep = !ageVerified &&
    reasons.some(r => r.key === "ageVerification") &&
    (redReasons.length === 0 || managementOverride);
  console.log("popup.js: needsAgeStep=", needsAgeStep, "ageVerified=", ageVerified, "reasons=", reasons.map(r => r.key));

  // hasBlockingYellow: at least one required form field (e.g. ICE contact)
  // is still empty. This is a "yellow" condition but it blocks check-in
  // until resolved, so we treat it the same as red for visibility purposes.
  const hasBlockingYellow = (attendee.missingRequiredFields?.length ?? 0) > 0;
  const hasRed            = redReasons.length > 0;

  // canIssueBadge: the single source of truth for showing the badge number
  // AND enabling the Badge Delivered button. If you change this logic,
  // both the badge cell render and the button state update automatically.
  //
  // Currently: badge visible only when we're not blocked, have no reds,
  // and have no missing required fields.
  const canIssueBadge = !isBlocked && !hasRed && !hasBlockingYellow;
  console.log("popup.js: canIssueBadge=", canIssueBadge, "isBlocked=", isBlocked, "hasRed=", hasRed, "hasBlockingYellow=", hasBlockingYellow);

  // ── "Back to ID Check" link (top-left) ──
  // Shown on ANY screen that can appear AFTER the ID check (badge-issued,
  // missing-ICE, red/override, etc.) for attendees who went through age
  // verification. Clears AGE_VERIFIED and re-renders to the ID/age-verify step
  // so a volunteer can redo the ID check if they advanced by mistake. It is
  // placed before the needsAgeStep block, so it never shows on the ID step
  // itself (wasAgeChecked is false there).
  const wasAgeChecked = ageVerified && reasons.some(r => r.key === "ageVerification");
  if (wasAgeChecked) {
    const backLink = el("a", { className: "cvg-back-idcheck", href: "#", textContent: "← Back to ID Check" });
    backLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await chrome.storage.local.set({ [STORAGE_KEY.AGE_VERIFIED]: false });
      await buildAttendeeView(attendee, tab);
    });
    body.appendChild(backLink);
  }


  // ── AGE VERIFICATION STEP (blocks everything else when required) ──
  // When a minor-age ticket hasn't been age-verified yet, replace the
  // whole view with a compact "check their ID" screen. Once staff clicks
  // the confirm button, the flag is stored and the view re-renders.
  if (needsAgeStep) {
    const nameSpan = el("span");
    nameSpan.className = "legal-name-value";
    nameSpan.textContent = attendee.legalName ?? "—";

    const table = el("div", { className: "kv-table" });

    const addAgeRow = (label, valueEl) => {
      const row = el("div", { className: "kv-row" });
      row.appendChild(el("span", { className: "kv-label", textContent: label }));
      const val = el("span", { className: "kv-val" });
      if (typeof valueEl === "string") val.textContent = valueEl;
      else val.appendChild(valueEl);
      row.appendChild(val);
      table.appendChild(row);
    };

    addAgeRow("Legal Name", nameSpan);

    const today  = new Date();
    const cutoff = new Date(today.getFullYear() - CONFIG.adultMinimumAge, today.getMonth(), today.getDate());
    const dateSpan = el("span");
    dateSpan.className = "age-cutoff-date";
    dateSpan.textContent = `DOB on or before ${cutoff.toLocaleDateString()}`;
    addAgeRow("ID Required", dateSpan);

    body.appendChild(table);

    const btn = el("button", { className: "btn-age-verify", textContent: "Age Verified, ID Returned ✓" });
    btn.addEventListener("click", async () => {
      await chrome.storage.local.set({ [STORAGE_KEY.AGE_VERIFIED]: true });
      body.innerHTML = "";
      await buildAttendeeView(attendee, tab);
    });
    body.appendChild(btn);
    return;
  }


  // ── RED BANNER (only rendered when override is active) ──
  // Without override, isBlocked=true and we'll short-circuit to the
  // "Send to Help Desk" button below without showing these details.
  if (redReasons.length > 0 && managementOverride) {
    const banner = el("div", { className: "banner banner-red" });
    banner.appendChild(el("div", { className: "banner-stop", textContent: "⛔ DO NOT ISSUE BADGE" }));
    redReasons.forEach((r, i) => {
      if (i > 0) banner.appendChild(el("hr", { className: "reason-divider" }));
      const block = el("div", { className: "reason-block" });
      const lines = r.text.split("\n");
      block.appendChild(el("div", { className: "reason-title", textContent: lines[0] }));
      if (lines.length > 1) block.appendChild(buildReasonBody(lines.slice(1).join("\n")));
      banner.appendChild(block);
    });
    body.appendChild(banner);
  }


  // ── YELLOW WARNINGS BANNER ──
  if (yellowReasons.length > 0) {
    const banner = el("div", { className: "banner banner-yellow" });
    yellowReasons.forEach((r, i) => {
      if (i > 0) banner.appendChild(el("hr", { className: "reason-divider" }));
      const block = el("div", { className: "reason-block" });
      const lines = r.text.split("\n");
      block.appendChild(el("div", { className: "reason-title", textContent: lines[0] }));
      if (lines.length > 1) block.appendChild(buildReasonBody(lines.slice(1).join("\n")));
      banner.appendChild(block);
    });
    body.appendChild(banner);
  }


  // ── BADGE NUMBER + TICKET TYPE CELL ──
  // Only shown when the Badge Delivered button would be active
  // (canIssueBadge). Otherwise render a neutral placeholder so the
  // layout doesn't jump and staff know WHY the number is missing.
  if (canIssueBadge) {
    const badgeCell = el("div");
    badgeCell.style.cssText = "text-align:center; padding:12px 6px 10px; border-bottom:2px solid #ccc; margin-bottom:10px;";
    const badgeLabel = el("div", { className: "badge-number-label" });
    badgeLabel.textContent = "BADGE NUMBER";
    const badgeValue = el("div", { className: "badge-number-value" });
    badgeValue.textContent = attendee.accountId ?? "—";
    const ticketValue = el("div", { className: "badge-ticket-value" });
    ticketValue.textContent = attendee.ticket ?? "—";
    badgeCell.appendChild(badgeLabel);
    badgeCell.appendChild(badgeValue);
    if (attendee.badgePrintStatus) {
      const statusEl = el("div", { className: "badge-print-status", textContent: attendee.badgePrintStatus });
      statusEl.classList.add(`badge-print-${attendee.badgePrintStatus.replace(/[^\w]/g, "").toLowerCase()}`);
      badgeCell.appendChild(statusEl);
    }
    badgeCell.appendChild(ticketValue);
    body.appendChild(badgeCell);
    console.log("popup.js: badge cell rendered (canIssueBadge=true)");
  } else {
    // Neutral placeholder — avoids a jarring layout gap and tells staff
    // the badge info is intentionally withheld until issues clear.
    const placeholder = el("div");
    placeholder.style.cssText =
      "text-align:center; padding:14px 8px; margin-bottom:10px; " +
      "background:#f1f3f5; border:1px dashed #adb5bd; border-radius:4px; " +
      "color:#495057; font-size:13px; font-style:italic;";
    placeholder.textContent = "Badge info will appear once all issues are resolved.";
    body.appendChild(placeholder);
    console.log("popup.js: badge cell hidden (canIssueBadge=false) — placeholder shown");
  }


  // ── INFO TABLE (preferred name, legal name, age cutoff, active badges) ──
  const table = el("div", { className: "kv-table" });

  const addRow = (label, valueEl) => {
    const row = el("div", { className: "kv-row" });
    row.appendChild(el("span", { className: "kv-label", textContent: label }));
    const val = el("span", { className: "kv-val" });
    if (typeof valueEl === "string") val.textContent = valueEl;
    else val.appendChild(valueEl);
    row.appendChild(val);
    table.appendChild(row);
  };

  const preferred  = (attendee.preferredName ?? "").trim();
  const legalFirst = (attendee.legalName ?? "").split(" ")[0] ?? "";

  if (canIssueBadge) {
    // Badge-issued view: a large "Welcome to CONvergence <name>" greeting in
    // place of the labeled name row. Name (preferred, falling back to the legal
    // first name) sits on its own line so a long name doesn't crowd the line.
    // Legal name + ID-required date are dropped here.
    const welcome = el("div", { className: "cvg-welcome" });
    welcome.appendChild(el("div", { className: "cvg-welcome-greeting", textContent: "Welcome to CONvergence" }));
    const welcomeName = el("div", { className: "cvg-welcome-name", textContent: preferred || legalFirst || "—" });
    const welcomePron = pronounSpan(attendee.pronouns);
    if (welcomePron) welcomeName.appendChild(welcomePron);
    welcome.appendChild(welcomeName);
    body.appendChild(welcome);
  } else if (!hasBlockingYellow) {
    // Blocked / override / help-desk views keep the legal name and only show a
    // distinct preferred name when it differs from the legal first (avoids
    // "Preferred: Angela" next to "Legal Name: Angela Sample" noise).
    // The missing-required-field screen (hasBlockingYellow, e.g. missing ICE)
    // shows NO name/ID rows — just the alert + the field to fix.
    let pronounsAttached = false;
    if (!needsAgeStep && preferred && preferred.toLowerCase() !== legalFirst.toLowerCase()) {
      const prefSpan = el("span");
      prefSpan.className = "legal-name-value";
      prefSpan.textContent = preferred;
      const prefPron = pronounSpan(attendee.pronouns);
      if (prefPron) { prefSpan.appendChild(prefPron); pronounsAttached = true; }
      addRow("Preferred", prefSpan);
    }
    const nameSpan = el("span");
    nameSpan.className = "legal-name-value";
    nameSpan.textContent = attendee.legalName ?? "—";
    if (!pronounsAttached) {
      const namePron = pronounSpan(attendee.pronouns);
      if (namePron) nameSpan.appendChild(namePron);
    }
    addRow("Legal Name", nameSpan);
  }

  // Age cutoff row (only off the badge-issued + missing-field views, when an
  // age-verification condition is active)
  if (!canIssueBadge && !hasBlockingYellow && reasons.some(r => r.key === "ageVerification")) {
    const today  = new Date();
    const cutoff = new Date(today.getFullYear() - CONFIG.adultMinimumAge, today.getMonth(), today.getDate());
    const dateSpan = el("span");
    dateSpan.className = "age-cutoff-date";
    dateSpan.textContent = `DOB on or before ${cutoff.toLocaleDateString()}`;
    addRow("ID Required", dateSpan);
  }

  // Active badges row (only if "already issued" is flagged)
  if (reasons.some(r => r.key === "alreadyIssued")) {
    addRow("Badges", String(attendee.activeBadges ?? 0));
  }

  body.appendChild(table);


  // ── BLOCKED (no override) ──
  // Red reasons present but no override — short-circuit to a disabled
  // "Send to Help Desk" button and stop rendering.
  if (isBlocked && !managementOverride) {
    body.appendChild(el("button", { className: "btn-no-issue", textContent: "NOT ALLOWED — SEND TO HELP DESK", disabled: true }));
    body.appendChild(el("div", { className: "helpdesk-note", textContent: "Please send attendee to the Help Desk." }));
    return;
  }

  // ── Re-check section ──────────────────────────────────────────────────────
  // If any conditions are fixable on this page, show a single Re-check button
  // plus a "Show me the field" button for ICE if that condition is present.
  // ageVerification is "fixable" but once the volunteer has confirmed ID
  // (ageVerified flag set in storage), it's effectively cleared — exclude it
  // here so it doesn't block the Badge Delivered button.
  const fixableReasons = reasons.filter(r =>
    r.fixable && !(r.key === CONDITION.AGE_VERIFICATION && ageVerified)
  );
  if (fixableReasons.length > 0) {
    const recheckSection = el("div", { className: "recheck-section" });
    const recheckBlock   = el("div", { className: "recheck-block" });

    // "Show me the field" button — only for the ICE condition
    const hasIce = fixableReasons.some(r => r.key === CONDITION.MISSING_ICE);
    if (hasIce) {
      const showBtn = el("button", { className: "btn-show-field" });
      showBtn.textContent = "Show me the field ↓";
      showBtn.addEventListener("click", () => {
        chrome.tabs.sendMessage(tab.id, { action: ACTION.HIGHLIGHT_ICE_FIELD });
        window.close();
      });
      recheckBlock.appendChild(showBtn);
    }

    // Single shared Re-check button for all fixable conditions
    const recheckBtn = el("button", { className: "btn-recheck" });
    recheckBtn.textContent = "Re-check ↺";
    recheckBtn.addEventListener("click", async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) return;
      await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: attendee });
      chrome.tabs.sendMessage(tabs[0].id, { action: ACTION.GET_ATTENDEE_DATA }, async (freshData) => {
        if (freshData) {
          await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE]: freshData });
          buildAttendeeView(freshData, tab);
        }
      });
    });
    recheckBlock.appendChild(recheckBtn);
    recheckSection.appendChild(recheckBlock);
    body.appendChild(recheckSection);
  }

  // ── Action buttons ──
  const hasNoAccountId = reasons.some(r => r.key === CONDITION.NO_ACCOUNT_ID);
  const hasActiveHold  = reasons.some(r =>
    r.key === CONDITION.REG_HOLD ||
    r.key === CONDITION.ART_HOLD ||
    r.key === CONDITION.OPS_HOLD
  );

  if (hasNoAccountId) {
    // Can't proceed at all — no button
  } else if (needsAgeStep) {
    const ageBtn = el("button", { className: "btn-age-verify" });
    ageBtn.textContent = "Age Verified, ID Returned ✓";
    ageBtn.addEventListener("click", async () => {
      await chrome.storage.local.set({ [STORAGE_KEY.AGE_VERIFIED]: true });
      buildAttendeeView(attendee, tab);
    });
    body.appendChild(ageBtn);
  } else if (hasActiveHold) {
    const noIssueBtn = el("button", { className: "btn-no-issue" });
    noIssueBtn.textContent = "⛔ DO NOT ISSUE BADGE";
    noIssueBtn.disabled = true;
    body.appendChild(noIssueBtn);
  } else if ((fixableReasons.length === 0 || managementOverride) && !hasBlockingYellow) {
    // hasBlockingYellow guard: a missing REQUIRED field (today: emergency
    // contact / ICE) suppresses BOTH the first-time ribbon and the Badge
    // Issued button even under Manager Override — the volunteer must fill ICE
    // and Re-check first. Override bypasses red holds, not required fields.
    //
    // Pending merch summary -- one bold line per ordered-not-picked-up item.
    // Populated by getAttendeeInfo in js/attendeeContact.js (REG mode only).
    // Same visual style as the merch-mode eventreg list for consistency.
    const pendingMerch    = Array.isArray(attendee.merch) ? attendee.merch : [];
    const hasPendingMerch = pendingMerch.length > 0;

    // First-time-attendee guide (purely visual — no data recorded). The flag
    // is set on the account Attendees tab by accountPage.js and keyed by
    // accountId so a stale flag from a previous attendee can't leak through.
    const ftResult = await chrome.storage.local.get(STORAGE_KEY.FIRST_TIME);
    const ft = ftResult[STORAGE_KEY.FIRST_TIME];
    if (ft && ft.isFirstTime && String(ft.accountId) === String(attendee.accountId)) {
      const ribbon = el("div", { className: "cvg-first-time" });
      ribbon.appendChild(el("img", { src: chrome.runtime.getURL("assets/FirstTimeRibbon.png"), alt: "" }));
      ribbon.appendChild(document.createTextNode("First Time? Badge Ribbon!"));
      body.appendChild(ribbon);
    }

    pendingMerch.forEach(m => {
      const line = el("div", { className: "cvg-merch-line" });
      const cfgItem = (CONFIG.merch?.items || []).find(i => i.name === m.name);
      if (cfgItem && cfgItem.image) {
        line.appendChild(el("img", { src: chrome.runtime.getURL(cfgItem.image), alt: "" }));
      }
      line.appendChild(document.createTextNode(`${m.name} Ordered`));
      body.appendChild(line);
    });

    const btn = el("button", { className: "btn-checkin" });
    btn.appendChild(document.createTextNode("Badge Issued"));
    if (hasPendingMerch) {
      btn.appendChild(el("br"));
      btn.appendChild(document.createTextNode("Send to Merchandise"));
    }
    btn.addEventListener("click", () => completeCheckIn(attendee, tab, btn));
    body.appendChild(btn);
  }
}

// ── NOT FOUND / GUIDANCE VIEW ──────────────────────────────────────────────
async function buildNotFoundView(heading, detail) {
  const overrideResult = await chrome.storage.local.get(STORAGE_KEY.MANAGEMENT_OVERRIDE);
  const managementOverride = overrideResult[STORAGE_KEY.MANAGEMENT_OVERRIDE] ?? false;
  document.body.innerHTML = "";
  if (managementOverride) document.body.appendChild(buildOverrideBanner());
  document.body.appendChild(el("div", { className: "not-found-heading", textContent: heading }));
  document.body.appendChild(el("div", { className: "not-found-detail",  textContent: detail  }));
}

// ── CHECK-IN COMPLETION ────────────────────────────────────────────────
// Fires the CSV download, then messages the content script to write
// all the fields to the Neon form and save it.

async function completeCheckIn(attendee, tab, btn) {
  console.log("popup.js: completeCheckIn starting for account", attendee.accountId);
  btn.disabled    = true;
  btn.textContent = "Processing…";

  // Step 1 — Save the badge printer CSV
  const csvResult = await saveBadgeCSV(attendee);
  if (!csvResult.ok) {
    showError(`Badge CSV download failed: ${csvResult.error}\n\nDo NOT issue badge. Please contact Registration Head.`);
    return;
  }

  // Step 2 — Find the active Neon tab to send the increment message to
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true, status: "complete" });
  if (!tabs[0]) {
    showError("Could not find the active Neon tab. Please try again.");
    return;
  }

  // Step 3 — Ask content script to increment badge count and save
  chrome.tabs.sendMessage(tabs[0].id, { action: ACTION.INCREMENT_BADGE_COUNT }, (response) => {
    if (chrome.runtime.lastError) {
      showError(`Check-in could not be completed: ${chrome.runtime.lastError.message}\n\nDo NOT hand out the badge. Please contact Registration Head.`);
      return;
    }
    if (!response?.ok) {
      showError(`Check-in could not be completed: ${response?.error ?? "Unknown error"}\n\nDo NOT hand out the badge. Please contact Registration Head.`);
      return;
    }
    // Success — clear the age-verified flag so the next attendee starts fresh
    chrome.storage.local.remove([STORAGE_KEY.AGE_VERIFIED]);
    showConfirmation(attendee);
  });
}

function showConfirmation(attendee) {
  const body = document.body;
  body.innerHTML = "";
  const screen = el("div", { className: "confirm-screen" });
  screen.appendChild(el("div", { className: "confirm-icon",  textContent: "✓" }));
  screen.appendChild(el("div", { className: "confirm-title", textContent: "Check-In Complete" }));
  const confirmName = el("div", { className: "confirm-name",  textContent: attendee.preferredName || attendee.legalName });
  const confirmPron = pronounSpan(attendee.pronouns);
  if (confirmPron) confirmName.appendChild(confirmPron);
  screen.appendChild(confirmName);
  body.appendChild(screen);
  setTimeout(() => window.close(), 1000);
}

function showError(message) {
  const body = document.body;
  body.innerHTML = "";
  const screen = el("div", { className: "error-screen" });
  screen.appendChild(el("div", { className: "error-icon",    textContent: "✗" }));
  screen.appendChild(el("div", { className: "error-message", textContent: message }));
  body.appendChild(screen);
}


// ── CSV DOWNLOAD ───────────────────────────────────────────────────────
// Writes the badge printer CSV file (one row per badge, downloaded
// to the user's Downloads folder where the printer queue watches).

// ── CSV DOWNLOAD ───────────────────────────────────────────────────────────
async function saveBadgeCSV(attendee) {
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
    console.log("popup.js: saveBadgeCSV wrote", filename);
    return { ok: true };
  } catch (err) {
    console.error("saveBadgeCSV failed:", err);
    return { ok: false, error: err.message };
  }
}


// ── NOT FOUND VIEW ─────────────────────────────────────────────────────

function buildNotFoundView(heading, detail) {
  document.body.innerHTML = "";
  document.body.appendChild(el("div", { className: "not-found-heading", textContent: heading }));
  document.body.appendChild(el("div", { className: "not-found-detail",  textContent: detail  }));
}


// ── UTILITIES ──────────────────────────────────────────────────────────

// ── UTILITIES ──────────────────────────────────────────────────────────────
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0];
}

function el(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

// Returns a small inline pronoun span (.cvg-pronouns), or null when empty.
// Append it to a name element to show pronouns to the right of the name.
function pronounSpan(pronouns) {
  const p = (pronouns ?? "").trim();
  return p ? el("span", { className: "cvg-pronouns", textContent: p }) : null;
}

// Build a .reason-body whose text is split into per-line divs so bullet lines
// ("• ...") get a hanging indent: wrapped continuation aligns under the text,
// not under the bullet. Non-bullet lines sit flush left.
function buildReasonBody(text) {
  const wrap = el("div", { className: "reason-body" });
  String(text).split("\n").forEach(line => {
    const isBullet = line.startsWith("• ");
    wrap.appendChild(el("div", {
      className: isBullet ? "reason-line bullet" : "reason-line",
      textContent: line,
    }));
  });
  return wrap;
}

// end js/popup.js