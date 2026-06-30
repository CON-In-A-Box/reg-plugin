// js/merch-attendee.js
// ============================================================================
// CONvergence Check-In Extension -- Attendee Edit Page Script (MERCH MODE)
// ============================================================================
//
// Active only when STORAGE_KEY.EXTENSION_MODE === EXTENSION_MODE.MERCH.
// Loaded AFTER js/attendeeContact.js on attendeeEdit.do and contactSelect.do.
// attendeeContact.js's IIFE returns early in MERCH mode so the two scripts
// don't compete for STORAGE_KEY.ATTENDEE.
//
// THE NEON ATTENDEE EDIT PAGE HAS THREE FIELD PATTERNS we need to read:
//
//   1. Plain customDataList text input:
//      <input type="text" name="attendee.customDataList[21].value" ...>
//      (e.g. "Guide Picked Up", "T-Shirt Picked Up")
//
//   2. customDataList radio group -- value lives in optionId, displayed
//      text lives in the title attribute (NOT in the .value):
//      <input type="radio" name="attendee.customDataList[9].optionId"
//             value="311" title="Yes -- Reserve a free printed Guide for me.">
//      (e.g. "Pre-order Souvenir Guide")
//
//   3. Session/ticket select OUTSIDE the customDataList namespace:
//      <select name="package/15/0">
//        <option value="445" selected>Unisex XXXXXL - $25.00</option>
//        ...
//        <option value="484">Check the box then click to pick your shirt style and size - $0.00</option>
//      </select>
//      (e.g. "Preorder your 2026 T-shirt")
//
// All three patterns are wrapped in <div class="form-group edit-attendee">
// with a <label class="col-xs-4">FieldName</label>. The label-based
// scanner below handles all three uniformly so CONFIG.merch.items doesn't
// need to declare per-item HTML strategies.
//
// CONFIG, EXTENSION_MODE, STORAGE_KEY, ACTION are injected as globals.
// ============================================================================

// ── TRIGGER MERCH STATE SCRAPE ON PAGE LOAD ───────────────────────────────

(async function triggerMerchScrape() {
  const modeResult = await chrome.storage.local.get({ [STORAGE_KEY.EXTENSION_MODE]: EXTENSION_MODE.REG });
  const mode       = modeResult[STORAGE_KEY.EXTENSION_MODE];
  if (mode !== EXTENSION_MODE.MERCH) {
    console.log(`merch-attendee.js: mode is "${mode}", skipping merch scrape`);
    return;
  }

  console.log("merch-attendee.js: MERCH mode confirmed, scraping page");
  let merchState;
  try {
    merchState = scrapeAttendeeMerch();
  } catch (err) {
    console.error("merch-attendee.js: scrape threw:", err);
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEY.ATTENDEE_MERCH]: merchState });
  await chrome.storage.local.set({ [STORAGE_KEY.PENDING_ICON_UPDATE]: { page: "attendee", ts: Date.now() } });
  console.log("merch-attendee.js: stored ATTENDEE_MERCH and triggered icon update", merchState);
})();

// ── MESSAGE LISTENER ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === ACTION.GET_ATTENDEE_MERCH) {
    console.log("merch-attendee.js: received GET_ATTENDEE_MERCH, scraping on demand");
    try {
      sendResponse(scrapeAttendeeMerch());
    } catch (err) {
      console.error("merch-attendee.js: on-demand scrape threw:", err);
      sendResponse(null);
    }
    return; // synchronous response
  }

  if (request.action === ACTION.WRITE_MERCH_PICKUP) {
    console.log("merch-attendee.js: received WRITE_MERCH_PICKUP for items:", request.itemNames);
    try {
      sendResponse(writeMerchPickup(request.itemNames ?? []));
    } catch (err) {
      console.error("merch-attendee.js: write threw:", err);
      sendResponse({ ok: false, error: err?.message ?? String(err) });
    }
    return; // synchronous response
  }
});

// ── PAGE SCRAPE ───────────────────────────────────────────────────────────

/**
 * Builds the merch state object for the attendee currently on screen.
 * Reads CONFIG.merch.items[] and probes the page for each item's source
 * and pickup fields using the label-substring scanner.
 */
function scrapeAttendeeMerch() {
  const items = (CONFIG.merch?.items ?? []).map(item => {
    console.log(`merch-attendee.js: --- scraping item "${item.name}" ---`);

    if (item.source?.type !== "customField") {
      console.log(`merch-attendee.js:   source.type "${item.source?.type}" not supported (Phase B2 = customField only)`);
      return { name: item.name, ordered: false, variant: null, alreadyPickedUp: false, pickedUpAt: null };
    }

    // Read source field by label substring.
    const sourceVal = readFieldValueByLabel(item.source.label);
    console.log(`merch-attendee.js:   source label "${item.source.label}" → value "${sourceVal || "(empty)"}"`);

    const ordered = isMerchItemOrdered(item, sourceVal);
    console.log(`merch-attendee.js:   ordered = ${ordered} (matchMode "${item.source.matchMode}")`);

    const variant = ordered && item.source.matchMode === "anyExcept" ? sourceVal : null;

    // Read pickup field by label substring.
    const pickupVal = readFieldValueByLabel(item.pickupFieldLabel);
    console.log(`merch-attendee.js:   pickup label "${item.pickupFieldLabel}" → value "${pickupVal || "(empty)"}"`);

    const alreadyPickedUp = pickupVal !== "";

    return {
      name:           item.name,
      ordered,
      variant,
      alreadyPickedUp,
      pickedUpAt:     alreadyPickedUp ? pickupVal : null,
    };
  });

  const state = {
    accountId:     getAccountIdFromUrl(),
    attendeeId:    getAttendeeIdFromUrl(),
    legalName:     getLegalName(),
    preferredName: readFieldValueByLabel("Preferred Name") || "",
    // readViewFieldByLabel is a content-script global from attendeeContact.js
    // (loaded before this file). Guard in case the load order ever changes.
    pronouns:      (typeof readViewFieldByLabel === "function"
                     ? readViewFieldByLabel(CONFIG.fieldLabels.pronouns) : ""),
    items,
  };
  console.log("merch-attendee.js: scrapeAttendeeMerch result:", state);
  return state;
}

// ── FIELD WRITE (called by popup-merch.js submit) ─────────────────────────

/**
 * Writes the current date/time to each named item's pickup field and clicks
 * Save. Unlike the reg flow it does NOT arm the post-check-in redirect: merch
 * skips holds, so after Neon's Save the tab lands back on eventRegDetails (its
 * natural post-Save destination) where merch-reg-modal.js auto-opens for the
 * next attendee — no dashboard bounce.
 */
function writeMerchPickup(itemNames) {
  const saveButton = document.getElementsByName("save")[0];
  if (!saveButton) {
    const msg = "Cannot record merch pickup: Save button not found on this form.";
    console.error("merch-attendee.js:", msg);
    return { ok: false, error: msg };
  }

  const now   = new Date();
  const stamp = formatMerchDateTime(now);
  console.log(`merch-attendee.js: writeMerchPickup stamp="${stamp}" for items:`, itemNames);

  const written = [];
  for (const name of itemNames) {
    const item = (CONFIG.merch?.items ?? []).find(i => i.name === name);
    if (!item) {
      console.warn(`merch-attendee.js:   no CONFIG.merch.items entry named "${name}"`);
      continue;
    }
    const ok = writeFieldValueByLabel(item.pickupFieldLabel, stamp);
    if (ok) {
      written.push(name);
      console.log(`merch-attendee.js:   wrote "${stamp}" to "${item.pickupFieldLabel}" for "${name}"`);
    } else {
      console.warn(`merch-attendee.js:   pickup field "${item.pickupFieldLabel}" not found for "${name}"`);
    }
  }

  if (written.length === 0) {
    return { ok: false, error: "No matching pickup fields found on this form." };
  }

  console.log("merch-attendee.js: clicking Save (no redirect arm — land on eventRegDetails)");
  saveButton.click();
  return { ok: true, written };
}

// ── LABEL-BASED FIELD SCANNER ─────────────────────────────────────────────

/**
 * Walks every .form-group.edit-attendee div on the page, finds the one
 * whose <label class="col-xs-4"> text contains labelText, and extracts
 * the displayed value from whatever input pattern lives inside it:
 *
 *   - <select>         → selected option's text (with " - $price" stripped)
 *   - radio group      → checked radio's title attribute (or sibling text)
 *   - checkbox group   → checked checkbox's title (or "")
 *   - text/input       → trimmed value
 *
 * Returns "" if no matching .form-group is found. Heavy logging on each
 * candidate so it's obvious in DevTools why a field wasn't matched.
 */
function readFieldValueByLabel(labelText) {
  if (!labelText) return "";

  const formGroups = document.querySelectorAll(".form-group.edit-attendee");
  for (const fg of formGroups) {
    const lbl = fg.querySelector("label.col-xs-4");
    if (!lbl) continue;
    const lblText = lbl.textContent.trim();
    if (!lblText.includes(labelText)) continue;

    // Found the form-group. Probe each input pattern in priority order.

    // 1. <select> (T-shirt session/ticket OR a customDataList dropdown).
    //
    // SESSION-TICKET GATE: session items (e.g. "Preorder your 2026 T-shirt")
    // have BOTH a "Will Attend" checkbox AND a size dropdown in the same
    // form-group. The dropdown can hold a leftover size selection even when
    // the attendee never paid for the item. The checkbox is the source of
    // truth -- unchecked = not ordered, ignore whatever the dropdown says.
    // We only enter this gate when both inputs coexist; a plain customDataList
    // dropdown (e.g. "Comp Reason") has no sibling checkbox so the gate
    // doesn't fire and the existing behavior is preserved.
    const select = fg.querySelector("select");
    if (select) {
      const gateCheckbox = fg.querySelector('input[type="checkbox"]');
      if (gateCheckbox && !gateCheckbox.checked) {
        const leftover = (select.options[select.selectedIndex]?.text ?? "").trim();
        console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → session checkbox unchecked, treating as not ordered (dropdown leftover: "${leftover}")`);
        return "";
      }
      const opt     = select.options[select.selectedIndex];
      const raw     = (opt?.text ?? opt?.value ?? "").trim();
      const cleaned = stripSessionPrice(raw);
      const gateTag = gateCheckbox ? " (session checkbox checked)" : "";
      console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → select option "${raw}" → cleaned "${cleaned}"${gateTag}`);
      return cleaned;
    }

    // 2. radio group -- value is in title attribute, NOT .value.
    const radios = fg.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      const checked = Array.from(radios).find(r => r.checked);
      if (!checked) {
        console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → radio group, none checked`);
        return "";
      }
      const titleAttr = (checked.getAttribute("title") ?? "").trim();
      if (titleAttr) {
        console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → checked radio title="${titleAttr}"`);
        return titleAttr;
      }
      // Fallback: text node after the input
      let next = checked.nextSibling;
      while (next && (next.nodeType !== 3 || !next.textContent.trim())) next = next.nextSibling;
      const sibling = next?.textContent?.trim() ?? "";
      if (sibling) {
        console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → checked radio sibling="${sibling}"`);
        return sibling;
      }
      const fallback = checked.value?.trim() ?? "";
      console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → checked radio value (id) = "${fallback}"`);
      return fallback;
    }

    // 3. checkbox -- title attr if checked, else empty
    const checkboxes = fg.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      const checked = Array.from(checkboxes).find(c => c.checked);
      const val = checked ? ((checked.getAttribute("title") ?? "").trim() || "checked") : "";
      console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → checkbox value="${val}"`);
      return val;
    }

    // 4. plain text input
    const text = fg.querySelector('input[type="text"], textarea');
    if (text) {
      const val = (text.value ?? "").trim();
      console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → text input value="${val}"`);
      return val;
    }

    console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → matching form-group has no recognized input`);
    return "";
  }

  console.log(`merch-attendee.js:   readFieldValueByLabel "${labelText}" → no matching form-group found (scanned ${formGroups.length})`);
  return "";
}

/**
 * Writes a value into the text input inside the .form-group.edit-attendee
 * whose label contains labelText. Returns true on success, false if no
 * matching field was found. Dispatches input + change events so any Neon
 * validators react.
 */
function writeFieldValueByLabel(labelText, value) {
  const formGroups = document.querySelectorAll(".form-group.edit-attendee");
  for (const fg of formGroups) {
    const lbl = fg.querySelector("label.col-xs-4");
    if (!lbl) continue;
    if (!lbl.textContent.trim().includes(labelText)) continue;

    const text = fg.querySelector('input[type="text"], textarea');
    if (!text) {
      console.warn(`merch-attendee.js:   writeFieldValueByLabel "${labelText}" → form-group has no writable text input`);
      return false;
    }
    text.value = value;
    text.dispatchEvent(new Event("input",  { bubbles: true }));
    text.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

// ── HELPERS ───────────────────────────────────────────────────────────────

/**
 * Applies the configured matchMode to the source field value to decide
 * whether the attendee has ordered the item.
 */
function isMerchItemOrdered(item, fieldValue) {
  const src = item.source ?? {};
  if (src.matchMode === "anyExcept") {
    return fieldValue !== "" && fieldValue !== src.notOrderedValue;
  }
  if (src.matchMode === "substring") {
    return fieldValue.includes(src.matchValue ?? "");
  }
  console.warn(`merch-attendee.js: unknown matchMode "${src.matchMode}" for item "${item.name}"`);
  return false;
}

/**
 * Strips Neon's session/ticket "- $price" suffix from a dropdown option.
 *   "Unisex XXXXXL - $25.00" -> "Unisex XXXXXL"
 *   "Plain Size"             -> "Plain Size"
 */
function stripSessionPrice(raw) {
  const m = raw.match(/^(.+?)\s*-\s*\$[\d,]+(?:\.\d+)?$/);
  return m ? m[1].trim() : raw;
}

/**
 * Formats a Date as "MM/DD/YYYY HH:MM" (24-hour / military time) for
 * writing to a Neon text field.
 */
function formatMerchDateTime(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getAccountIdFromUrl() {
  return new URLSearchParams(location.search).get("acct") ?? "";
}

function getAttendeeIdFromUrl() {
  return new URLSearchParams(location.search).get("id") ?? "";
}

function getLegalName() {
  const first = document.getElementById("acInput")?.value?.trim()
             ?? document.getElementsByName("attendee.firstName")[0]?.value?.trim() ?? "";
  const last  = document.getElementsByName("attendee.lastName")[0]?.value?.trim() ?? "";
  return `${first} ${last}`.trim();
}

// end js/merch-attendee.js
