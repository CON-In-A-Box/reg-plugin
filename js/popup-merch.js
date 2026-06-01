// js/popup-merch.js
//
// ============================================================================
// Merchandise Pickup -- Popup UI
// ============================================================================
//
// Active when EXTENSION_MODE === "merch" (set on the options page).
// popup.js dispatches to displayMerchPopup() before the reg flow runs.
//
// Flow:
//   - On /admin/accounts/* : placeholder; the existing accountPage.js
//                            auto-nav to first SUCCEEDED registration
//                            handles getting the volunteer to eventreg.
//   - On eventRegDetails    : list each attendee with merch summary +
//                              "Review Merch" button.
//   - On attendeeEdit       : checkbox per CONFIG.merch.items entry the
//                              attendee ordered. Already-picked-up items
//                              show checked + greyed with the recorded
//                              date/time. Submit button writes the
//                              current date/time to each newly-checked
//                              item's pickup field (via merch-attendee.js)
//                              and the form submits + redirects.
//
// Globals expected (loaded by popup.html before this file):
//   STATE, STORAGE_KEY, EXTENSION_MODE          (shared/js/constants-base.js)
//   CONFIG, CONFIG.merch                        (config.js)
//   REG_STATUS, ACTION, CONDITION, EVENT_MATCH  (js/constants.js)
//   el()                                        (popup.js -- DOM helper)
// ============================================================================

/**
 * Top-level dispatcher for merch mode. popup.js calls this when mode
 * is MERCH; the reg flow does not run.
 *
 * @param {chrome.tabs.Tab|undefined} activeTab
 * @param {string} url -- the active tab's URL
 */
async function displayMerchPopup(activeTab, url) {
  document.body.innerHTML = "";

  // Mode banner so it's obvious the volunteer is in merch mode.
  document.body.appendChild(buildMerchBanner());

  if (!activeTab) {
    renderMerchInfo(
      "No active tab",
      "Open a Neon CRM tab, then click the extension icon again.",
    );
    return;
  }

  if (url.includes("/admin/accounts/")) {
    // Merch mode skips the holds/notes gating the reg flow uses. The only
    // filter that matters here is SUCCEEDED, which is enforced inside
    // accountPage.js's auto-click logic on the event-registrations tab.
    // We just trigger the navigation immediately.
    const result  = await chrome.storage.local.get(STORAGE_KEY.ACCOUNT);
    const account = result[STORAGE_KEY.ACCOUNT];
    if (account?.accountId) {
      navigateToEventReg(activeTab, account);
      return;
    }
    // Fallback: extract accountId from the URL itself if storage isn't
    // populated yet (popup clicked before accountPage.js finished scraping).
    const m = url.match(/\/admin\/accounts\/(\d+)/);
    if (m) {
      navigateToEventReg(activeTab, { accountId: m[1] });
      return;
    }
    renderMerchInfo(
      "Could not read account ID.",
      "Reload the Neon account page and try again.",
    );
    return;
  }

  if (url.includes("eventRegDetails")) {
    const result = await chrome.storage.local.get(STORAGE_KEY.REGISTRATIONS);
    const regs   = result[STORAGE_KEY.REGISTRATIONS];
    if (!regs?.data) {
      renderMerchInfo(
        "No registration data found",
        "Reload this Neon page and try again. If the issue persists, contact IT.",
      );
      return;
    }
    buildMerchAttendeeListView(regs.data, activeTab);
    return;
  }

  if (url.includes("attendeeEdit")) {
    let merch = (await chrome.storage.local.get(STORAGE_KEY.ATTENDEE_MERCH))[STORAGE_KEY.ATTENDEE_MERCH];
    console.log("popup-merch.js: STORAGE_KEY.ATTENDEE_MERCH from storage =", merch);

    // If storage is empty (race: popup opened before merch-attendee.js's
    // on-load scrape finished, or in incognito where storage was wiped),
    // ask the content script to scrape on demand.
    if (!merch) {
      console.log("popup-merch.js: storage empty, requesting on-demand scrape from content script");
      try {
        merch = await new Promise((resolve) => {
          chrome.tabs.sendMessage(activeTab.id, { action: ACTION.GET_ATTENDEE_MERCH }, (resp) => {
            if (chrome.runtime.lastError) {
              console.warn("popup-merch.js: GET_ATTENDEE_MERCH sendMessage error:", chrome.runtime.lastError.message);
              resolve(null);
            } else {
              resolve(resp);
            }
          });
        });
        console.log("popup-merch.js: on-demand scrape returned:", merch);
      } catch (err) {
        console.error("popup-merch.js: on-demand scrape threw:", err);
      }
    }

    if (!merch) {
      renderMerchInfo(
        "Attendee merch data not ready",
        "The merch content script didn't respond. Reload this Neon page and try again. If the issue persists, open DevTools on the Neon page and check the Console for 'merch-attendee.js:' lines.",
      );
      return;
    }
    buildMerchAttendeeView(merch, activeTab);
    return;
  }

  renderMerchInfo(
    "Wrong page",
    "To use Merch mode:\n1. Open an attendee account in Neon\n2. Click the extension icon (auto-nav to the first SUCCEEDED registration)\n3. Pick the attendee whose merch you're handing out",
  );
}

// ── BANNER ────────────────────────────────────────────────────────────────

function buildMerchBanner() {
  return el("div", {
    className:   "override-bar",
    textContent: "MERCH MODE",
    style:       `background:${BRAND.blue}; color:#fff;`,
  });
}

// ── EVENTREG VIEW: list of attendees with merch summary ───────────────────

function buildMerchAttendeeListView(attendees, tab) {
  const body = document.body;
  body.appendChild(el("div", { className: "heading", textContent: "Select the attendee picking up merch:" }));

  attendees.forEach(att => {
    const row = el("div", { className: "reg-row reg-row-green" });

    const nameText = att.preferredName
      ? `${att.legalName} (${att.preferredName})`
      : att.legalName;
    row.appendChild(el("div", { className: "reg-name", textContent: nameText }));

    // One line per ordered item, sized to match the attendee-page popup
    // (bold, ~14px, modest vertical spacing).
    const merchItems  = Array.isArray(att.merch) ? att.merch : [];
    const orderedList = merchItems.filter(m => m.ordered === true);
    const anyUnknown  = merchItems.some(m => m.ordered === null);

    if (orderedList.length === 0) {
      row.appendChild(el("div", {
        className:   "reg-ticket",
        textContent: anyUnknown ? "Open to review merch" : "(no merch ordered)",
      }));
    } else {
      orderedList.forEach(m => {
        const line = el("div", {
          textContent: m.variant ? `${m.name} (${m.variant})` : m.name,
        });
        line.style.cssText = "font-size:14px; font-weight:bold; margin:4px 0 4px 6px;";
        row.appendChild(line);
      });
    }

    const btn = el("button", { className: "btn-select", textContent: "Review Merch →" });
    btn.addEventListener("click", () => navigateToAttendeeMerch(att, tab));
    row.appendChild(btn);

    body.appendChild(row);
  });
}

async function navigateToAttendeeMerch(att, tab) {
  await chrome.tabs.update(tab.id, {
    url: `https://${CONFIG.neon.productionDomain}/np/admin/event/attendeeEdit.do?id=${att.neonAttendeeId}&acct=${att.accountId}`,
  });
  window.close();
}

// ── ATTENDEE EDIT VIEW: checkboxes per ordered item ──────────────────────

function buildMerchAttendeeView(merchState, tab) {
  const body = document.body;

  // Attendee name header.
  const nameText = merchState.preferredName
    ? `${merchState.legalName} (${merchState.preferredName})`
    : merchState.legalName;
  body.appendChild(el("div", { className: "heading", textContent: nameText }));

  const orderedItems = (merchState.items ?? []).filter(i => i.ordered);

  if (orderedItems.length === 0) {
    body.appendChild(el("div", { className: "not-found-detail", textContent: "This attendee has not ordered any merchandise." }));
    return;
  }

  // Track which item names are newly checked (not previously picked up).
  const newlyChecked = new Set();

  const submitBtn = el("button", { className: "btn-checkin", textContent: "Confirm Pickup" });
  submitBtn.disabled = true;

  orderedItems.forEach(item => {
    const row = el("div", { className: `reg-row reg-row-${item.alreadyPickedUp ? "green" : "yellow"}` });

    const checkboxRow = el("div");
    checkboxRow.style.cssText = "display:flex; align-items:center; gap:8px;";

    const chk = el("input");
    chk.type    = "checkbox";
    chk.id      = `merch-chk-${cssId(item.name)}`;
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
    const lbl = el("label", { htmlFor: chk.id, textContent: labelText });
    lbl.style.cssText = "cursor:pointer; font-weight:bold;";
    if (item.alreadyPickedUp) lbl.style.cursor = "default";
    checkboxRow.appendChild(lbl);

    row.appendChild(checkboxRow);

    if (item.alreadyPickedUp) {
      row.appendChild(el("div", {
        className:   "reg-ticket",
        textContent: `Already picked up: ${item.pickedUpAt}`,
      }));
    }

    body.appendChild(row);
  });

  submitBtn.addEventListener("click", () => {
    submitBtn.disabled    = true;
    submitBtn.textContent = "Recording…";
    chrome.tabs.sendMessage(
      tab.id,
      { action: ACTION.WRITE_MERCH_PICKUP, itemNames: Array.from(newlyChecked) },
      (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          submitBtn.disabled    = false;
          submitBtn.textContent = "Retry";
          const errMsg = chrome.runtime.lastError?.message ?? response?.error ?? "Unknown error";
          body.appendChild(el("div", {
            className:   "not-found-detail",
            textContent: `Could not record pickup: ${errMsg}`,
            style:       `color:${BRAND.red}; font-weight:bold; margin-top:8px;`,
          }));
          return;
        }
        // Success: content script wrote fields, armed the redirect, and
        // clicked Save. Show a brief confirmation and close after 1s,
        // matching the reg-flow pattern.
        showMerchConfirmation(merchState);
      }
    );
  });

  body.appendChild(submitBtn);
}

// ── CONFIRMATION SCREEN ───────────────────────────────────────────────────

/**
 * Brief "Pickup Recorded" overlay shown for 1 second after a successful
 * write, then auto-close. Mirrors showConfirmation() in popup.js.
 */
function showMerchConfirmation(merchState) {
  const body = document.body;
  body.innerHTML = "";
  const screen = el("div", { className: "confirm-screen" });
  screen.appendChild(el("div", { className: "confirm-icon",  textContent: "✓" }));
  screen.appendChild(el("div", { className: "confirm-title", textContent: "Pickup Recorded" }));
  screen.appendChild(el("div", { className: "confirm-name",  textContent: merchState.preferredName || merchState.legalName }));
  body.appendChild(screen);
  setTimeout(() => window.close(), 1000);
}

// ── PLACEHOLDER / ERROR RENDERERS ─────────────────────────────────────────

function renderMerchInfo(heading, detail) {
  document.body.appendChild(el("div", {
    className:   "not-found-heading",
    textContent: heading,
  }));
  document.body.appendChild(el("div", {
    className:   "not-found-detail",
    textContent: detail,
  }));
}

function cssId(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// end js/popup-merch.js
