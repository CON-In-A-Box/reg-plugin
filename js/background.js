// js/background.js
// ============================================================================
// CONvergence Check-In Extension -- Service Worker
// ============================================================================
//
// This is the Manifest V3 service worker. It runs in the background and is
// responsible for two things:
//
//   1. Updating the extension toolbar icon (green / yellow / red, with an
//      optional "M" badge when Manager Override is active) based on what
//      the content scripts have scraped from the current Neon page.
//
//   2. Receiving error reports from content scripts and storing them in
//      chrome.storage.local so the popup can display them.
//
// importScripts paths are relative to THIS file's location (js/background.js):
//   "../shared/js/constants-base.js"   -> repo root/shared/js/constants-base.js
//                                          (provides STATE, the icon-machinery
//                                           STORAGE_KEY entries, ERROR_MESSAGES, dbg)
//   "../config.js"                     -> repo root/config.js
//   "constants.js"                     -> js/constants.js (same folder; mutates
//                                          STORAGE_KEY with app-specific keys)
//   "../shared/js/background-core.js"  -> generic icon cache + setIcon +
//                                          worstStateFromRows. Kicks off icon
//                                          cache build as a side effect.
// ============================================================================

importScripts(
  "../shared/js/constants-base.js",
  "../config.js",
  "constants.js",
  "../shared/js/background-core.js"
);

// ── STORAGE CHANGE LISTENER ────────────────────────────────────────────

/**
 * Central handler for all storage changes that should trigger an icon update.
 *
 * PENDING_ICON_UPDATE: written by content scripts after committing their data.
 *   chrome.storage.onChanged reliably wakes the SW even if it was terminated,
 *   unlike chrome.runtime.sendMessage which is silently dropped if the SW
 *   isn't yet ready.
 *
 * MANAGEMENT_OVERRIDE: written by options.js when the override is toggled.
 *   Re-reads stored data and refreshes the icon to show/hide the "M" badge.
 */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;

  // ── Icon update triggered by content script ──
  if (changes[STORAGE_KEY.PENDING_ICON_UPDATE]) {
    const pending = changes[STORAGE_KEY.PENDING_ICON_UPDATE].newValue;
    if (!pending) return;

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab  = tabs[0];
    if (!tab) return;

    const url = tab.url ?? "";

    if (pending.page === "attendee" && url.includes("attendeeEdit")) {
      const result   = await chrome.storage.local.get(STORAGE_KEY.ATTENDEE);
      const attendee = result[STORAGE_KEY.ATTENDEE];
      if (attendee?.state) {
        await setIcon(tab.id, attendee.state);
      }

    } else if (pending.page === "registrations" && url.includes("eventRegDetails")) {
      const result        = await chrome.storage.local.get(STORAGE_KEY.REGISTRATIONS);
      const registrations = result[STORAGE_KEY.REGISTRATIONS];
      if (registrations?.data) {
        await setIcon(tab.id, worstStateFromRows(registrations.data));
      }

    } else if (pending.page === "account" && url.includes("/admin/accounts/")) {
      const result  = await chrome.storage.local.get(STORAGE_KEY.ACCOUNT);
      const account = result[STORAGE_KEY.ACCOUNT];
      if (account?.state) {
        await setIcon(tab.id, account.state);
      }
    }

    // Decide whether this tab's toolbar click opens the classic popup or
    // fires onClicked (so the in-page modal can re-open). See applyPopupForTab.
    await applyPopupForTab(tab.id, pending.page);
  }

  // ── Management override toggled -- refresh icon for the active tab ──
  if (changes[STORAGE_KEY.MANAGEMENT_OVERRIDE]) {
    await refreshActiveTabIcon();
  }

  // ── Extension mode toggled -- swap the icon face (reggie ⇄ connie) ──
  if (changes[STORAGE_KEY.EXTENSION_MODE]) {
    await applyDefaultIconForMode();
    await refreshActiveTabIcon();
  }

  // ── Pop-up mode toggled -- re-apply click behavior on an open eventReg tab ──
  if (changes[STORAGE_KEY.POPUP_MODE]) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab  = tabs?.[0];
    const url  = tab?.url ?? "";
    if (tab && url.includes("eventRegDetails")) {
      await applyPopupForTab(tab.id, "registrations");
    } else if (tab && url.includes("attendeeEdit")) {
      await applyPopupForTab(tab.id, "attendee");
    } else if (tab && url.includes("/admin/accounts/")) {
      await applyPopupForTab(tab.id, "account");
    }
  }
});

/**
 * Sets a tab's toolbar-click behavior. In Automated pop-up mode the eventReg
 * page uses the in-page modal, so we CLEAR the popup for that tab (an empty
 * popup string makes chrome.action.onClicked fire on click). Every other page
 * — and Manual mode — keeps the classic popup.html.
 *
 * @param {number} tabId
 * @param {string} page - "registrations" | "attendee" | "account"
 */
async function applyPopupForTab(tabId, page) {
  let popup = "popup.html";
  // The eventReg, attendee and account pages all use the in-page modal in
  // Automated mode — REG and MERCH each ship their own modal scripts for these
  // pages — so clear their per-tab popup (an empty string makes a toolbar click
  // fire chrome.action.onClicked → SHOW_CHECKIN_MODAL → modal). The modal scripts
  // mode-guard their SHOW_CHECKIN_MODAL handlers so only the active mode renders.
  if (page === "registrations" || page === "attendee" || page === "account") {
    const r = await chrome.storage.local.get({
      [STORAGE_KEY.POPUP_MODE]:     "automated",
      [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG,
    });
    const automated = (r[STORAGE_KEY.POPUP_MODE] ?? "automated") === "automated";
    const mode      = r[STORAGE_KEY.EXTENSION_MODE] ?? EXTENSION_MODE.REG;
    const modalMode = mode === EXTENSION_MODE.REG || mode === EXTENSION_MODE.MERCH;
    if (automated && modalMode) popup = ""; // clear → toolbar click fires onClicked → modal
  }
  try {
    await chrome.action.setPopup({ tabId, popup });
  } catch (e) {
    // Tab may have closed/navigated; harmless.
  }
}

// Toolbar click — only fires when the tab's popup is cleared (Automated mode
// on the eventReg page). Ask the content script to re-scrape and re-open the
// in-page modal.
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action: ACTION.SHOW_CHECKIN_MODAL }).catch(() => {});
});

/**
 * Re-applies the toolbar icon for the active tab from its stored scrape state.
 * Used when something that affects icon appearance changes (manager override,
 * extension mode) without a fresh page scrape.
 */
async function refreshActiveTabIcon() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs?.[0];
  if (!tab) return;
  const url = tab.url ?? "";

  if (url.includes("attendeeEdit")) {
    const result = await chrome.storage.local.get(STORAGE_KEY.ATTENDEE);
    if (result[STORAGE_KEY.ATTENDEE]?.state) await setIcon(tab.id, result[STORAGE_KEY.ATTENDEE].state);

  } else if (url.includes("eventRegDetails")) {
    const result = await chrome.storage.local.get(STORAGE_KEY.REGISTRATIONS);
    if (result[STORAGE_KEY.REGISTRATIONS]?.data) await setIcon(tab.id, worstStateFromRows(result[STORAGE_KEY.REGISTRATIONS].data));

  } else if (url.includes("/admin/accounts/")) {
    const result = await chrome.storage.local.get(STORAGE_KEY.ACCOUNT);
    if (result[STORAGE_KEY.ACCOUNT]?.state) await setIcon(tab.id, result[STORAGE_KEY.ACCOUNT].state);

  } else if (url.includes("neoncrm.com")) {
    await setIcon(tab.id, STATE.GREEN);
  }
}

// ── POST-CHECK-IN REDIRECT ─────────────────────────────────────────────
//
// attendeeContact.js fires ACTION.ARM_POST_CHECKIN_REDIRECT immediately
// before clicking Neon's Submit button on a check-in. We record the tabId
// here, then watch for the eventRegDetails.do navigation Neon triggers as
// the form POST response. When it commits, we redirect that tab to the
// account-search page so the volunteer always starts the next check-in
// from a clean account lookup.
//
// Map state lives in memory only: the arm-to-fire window is sub-second and
// the service worker stays alive across the webNavigation event. The 60 s
// staleness guard covers the edge case where Submit silently fails and no
// eventRegDetails navigation ever follows.

const armedPostCheckin = new Map();  // tabId → armed-at timestamp (ms)
const ARMED_REDIRECT_TTL_MS = 60_000;

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;

  const armedTs = armedPostCheckin.get(details.tabId);
  if (!armedTs) return;

  armedPostCheckin.delete(details.tabId);
  if (Date.now() - armedTs > ARMED_REDIRECT_TTL_MS) {
    console.log(`background.js: armed redirect stale for tab ${details.tabId}, ignoring`);
    return;
  }

  const target = `https://${CONFIG.neon.productionDomain}/np/admin/content/contentList.do`;
  console.log(`background.js: post-check-in redirect tab ${details.tabId} → ${target}`);
  chrome.tabs.update(details.tabId, { url: target });
}, {
  url: [{
    hostEquals:   CONFIG.neon.productionDomain,
    pathContains: "/np/admin/event/eventRegDetails.do",
  }],
});

// ── WEB NAVIGATION FALLBACK ────────────────────────────────────────────

/**
 * Fallback for non-content-script Neon pages and as a safety net in case
 * the storage-based trigger didn't fire (e.g. storage write failed).
 *
 * Retries the content-script message up to 5 times with increasing delay
 * so we don't fail just because the page DOM wasn't ready yet.
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = details.url ?? "";

  // Non-content-script Neon pages -- set green directly to acknowledge
  // that we're "in Neon" even though we have nothing specific to evaluate.
  if (
    url.includes("neoncrm.com") &&
    !url.includes("attendeeEdit") &&
    !url.includes("eventRegDetails") &&
    !url.includes("/admin/accounts/")
  ) {
    await setIcon(details.tabId, STATE.GREEN);
    return;
  }

  // Only the attendeeEdit and eventRegDetails pages support the
  // request/response message API used by this fallback.
  if (!url.includes("attendeeEdit") && !url.includes("eventRegDetails")) return;

  const action = url.includes("attendeeEdit")
    ? ACTION.GET_ATTENDEE_DATA
    : ACTION.GET_REGISTRATIONS;

  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
    try {
      const response = await chrome.tabs.sendMessage(details.tabId, { action });
      if (!response) continue;

      if (action === ACTION.GET_ATTENDEE_DATA) {
        await setIcon(details.tabId, response.state);
      } else {
        await setIcon(details.tabId, worstStateFromRows(response.data ?? []));
      }
      console.log(`background.js: webNav fallback succeeded attempt ${attempt + 1} tab ${details.tabId}`);
      return;
    } catch (err) {
      console.warn(`background.js: webNav fallback attempt ${attempt + 1} failed:`, err.message);
    }
  }
});

// ============================================================================
// ERROR MESSAGE HANDLER
// ============================================================================
// Listens for error messages from content scripts and stores them in
// chrome.storage.local for the popup to display.
//
// The user-friendly templates live in shared/js/constants-base.js
// (ERROR_MESSAGES) so the service worker, content scripts, and popup all
// reference the same table. importScripts at the top of this file makes
// ERROR_MESSAGES available here as a global.

/**
 * Persist an error record in chrome.storage.local under STORAGE_KEY.REGISTRATION_ERROR.
 * popup.js reads this key and renders an alert on the next popup open.
 *
 * @param {string} errorType    -- one of the keys in ERROR_MESSAGES
 * @param {*}      originalError -- Error object or string from the caller
 * @param {object} context       -- optional debug data (accountId, etc.)
 */
async function recordErrorInStorage(errorType, originalError, context = {}) {
  const timestamp = Date.now();

  console.error(
    `[BackgroundScript] Recording error: ${errorType}`,
    { originalError, context }
  );

  const messageTemplate = ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR;

  const errorState = {
    type: errorType,
    timestamp,
    title:  messageTemplate.title,
    detail: messageTemplate.detail,
    action: messageTemplate.action,
    debugInfo: {
      originalMessage: String(originalError),
      context,
      timestamp: new Date(timestamp).toISOString(),
    },
  };

  await chrome.storage.local.set({ [STORAGE_KEY.REGISTRATION_ERROR]: errorState });
  console.log("[BackgroundScript] Error stored for popup display:", errorState);

  // Also append to a bounded ring buffer for the debug report's error history.
  // REGISTRATION_ERROR above is the single latest error the popup shows; this
  // keeps the last 20 so IT can spot recurring failures.
  try {
    const logResult = await chrome.storage.local.get(STORAGE_KEY.ERROR_LOG);
    const log = Array.isArray(logResult[STORAGE_KEY.ERROR_LOG]) ? logResult[STORAGE_KEY.ERROR_LOG] : [];
    log.push({
      type: errorType,
      title: messageTemplate.title,
      message: String(originalError),
      context,
      at: new Date(timestamp).toISOString(),
    });
    await chrome.storage.local.set({ [STORAGE_KEY.ERROR_LOG]: log.slice(-20) });
  } catch (e) {
    console.warn("[BackgroundScript] could not append to ERROR_LOG:", e?.message);
  }
}

/**
 * Message listener for RECORD_REGISTRATION_ERROR messages from content scripts.
 *
 * IMPORTANT: this listener is async -- we MUST return true to keep the
 * sendResponse channel open until the storage write completes, otherwise
 * the caller's callback may fire before storage actually updates.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === ACTION.ARM_POST_CHECKIN_REDIRECT) {
    const tabId = sender?.tab?.id;
    if (tabId != null) {
      armedPostCheckin.set(tabId, Date.now());
      console.log(`background.js: armed post-check-in redirect for tab ${tabId}`);
    }
    sendResponse({ ok: true });
    return;
  }

  // Manager Debug Walk finished (or halted) -- open the report tab and clear
  // the walk flag so subsequent normal clicks aren't hijacked. DEBUG_REPORT is
  // left in place for the report page to read.
  if (message?.action === ACTION.OPEN_DEBUG_REPORT) {
    chrome.tabs.create({ url: chrome.runtime.getURL("debug-report.html") });
    chrome.storage.local.remove(STORAGE_KEY.DEBUG_WALK_ACTIVE);
    console.log("background.js: opened debug report tab and cleared DEBUG_WALK_ACTIVE");
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "RECORD_REGISTRATION_ERROR") {
    recordErrorInStorage(message.errorType, message.originalError, message.context)
      .then(()  => sendResponse({ success: true }))
      .catch(err => {
        console.error("background.js: recordErrorInStorage failed:", err);
        sendResponse({ success: false, error: err?.message });
      });
    return true; // keep sendResponse alive for async work
  }
});

// end js/background.js
