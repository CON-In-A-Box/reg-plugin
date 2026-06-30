# CONvergence Check-In Extension — Troubleshooting

Quick fixes for problems you may hit on the check-in workstation. If
something here doesn't help, contact IT before the badge line backs up.

---

## Pop-up: "No valid event registration found"

This modal appears when you click the extension icon on an account and the
extension checks the **Attendees** tab and then the **Registrations** tab, but
the account has **no usable registration** for this year's event — no records at
all, or only ones that are cancelled, failed, refunded, or for a different
event. It is a **safe guard**, not a bug. (The extension waits a few seconds for
each tab's list to load before deciding, so a slow page won't trigger it early.)

What to do:

1. Click **Dismiss**.
2. Look at the Attendees and Registrations tables on the Neon page yourself.
3. If you do see a CONvergence registration with status `SUCCEEDED`, click
   that row manually to open it and continue check-in.
4. Otherwise, send the attendee to the **Help Desk** to sort out their
   registration.

## Yellow banner: "Could not find / read the Attendees table"

Separate from the modal above, a yellow banner means a **technical** hiccup
reading the page (not "no registration"):

- **"Could not find the Attendees table — refresh and try again."** —
  the page took too long to load the registrations table. Reload the Neon
  tab and try the extension icon again.
- **"Could not read the Attendees table layout. Click the registration
  manually."** — Neon may have changed the table structure. The extension
  will still let you check people in manually; tell IT so the lookup can
  be updated.

---

## Extension popup is blank (no buttons, no info)

Almost always a JavaScript parse error in `js/popup.js`. To confirm:

1. Right-click the extension icon → **Inspect popup**. This opens DevTools
   attached to the popup. (Plain left-clicks close the popup; right-click
   keeps it alive.)
2. Look in the Console for a red `SyntaxError`. The line number points
   straight at the broken code.
3. Tell IT. The popup will stay blank until the file is fixed and the
   extension is reloaded.

---

## Popup opens but doesn't react to my click

The content script on the underlying Neon page may have failed to load.

1. With the Neon tab focused, press **F12** to open DevTools.
2. In the **Settings** ⚙ panel, check **Preserve log**.
3. Reload the Neon page. In the Console you should see lines starting
   with `accountPage.js`, `attendeeContact.js`, or `registrations.js`
   depending on the URL.
4. If there are none, the content script didn't inject. Try toggling the
   extension off and on in `chrome://extensions`.

---

## Wrong attendee data showing

The popup reads cached data from `chrome.storage.local`. If the page was
loaded before the extension was installed (or before the latest reload),
the cache may be stale.

1. Reload the Neon page (Ctrl+R / Cmd+R) — this re-scrapes.
2. If still wrong, clear the cache via `chrome://extensions` → Details →
   **Inspect views: service worker** → Application tab → Storage → Local
   Storage → clear all the keys.

---

## Icon stays grey

The extension only colors the icon when it recognizes the page. Greys
mean "I don't know how to read this page."

- Make sure you're on one of: an account page (`/admin/accounts/N`),
  the Attendees tab on event-registrations, an `attendeeEdit.do` page,
  or an `eventRegDetails.do` page.
- If you ARE on one of those and the icon is still grey, reload the page
  once.

---

## Badge Delivered button is missing

When the attendee has unresolved blocking conditions (red banner), the
Badge Delivered button is intentionally hidden — clear the issues first.
If there are no red banners and no missing required fields and the
button still isn't there, see "Extension popup is blank" above.

---

## Merch popup shows "(no merch ordered)" or no checkboxes even though the attendee ordered items

The extension matches merch items by the **label substring** of the
registration field. If Neon changed the question text (e.g., from
"Preorder your 2026 T-shirt" to "Order Your CONvergence 2027 T-shirt"),
the substring no longer matches and the extension thinks the attendee
ordered nothing.

What to do:

1. Open `config.js` and find the `merch` section. For each item, the
   `source.label` value must be a substring of the actual question label
   on the registration form.
2. Check the matcher:
   - `matchMode: "anyExcept"` -- the `notOrderedValue` must EXACTLY match
     the dropdown option text shown when no item is selected.
   - `matchMode: "substring"` -- the `matchValue` must appear in the
     radio option text shown when the attendee chose "Yes" (or
     equivalent).
3. Open the attendee edit page in Neon, then **right-click the extension
   icon → Inspect popup** and check the DevTools Console for lines from
   `merch-attendee.js:` -- they log the scraped value of each source
   field, which tells you exactly what to match against.
4. Pickup fields work the same way: `pickupFieldLabel` must be a
   substring of the actual pickup-tracking field's label.

This is also the most likely cause of "Could not record pickup" errors
after clicking Confirm Pickup -- the pickup field's label substring is
wrong and the extension can't find the element to write to.

---

## Merch in-page modal didn't auto-open (account / eventReg / attendee page)

In **Merch** mode + **Automated** pop-up mode the extension draws an in-page
modal on each page (no toolbar click needed), the same way Reg mode does. If it
doesn't appear:

1. Confirm the mode on the **Options** page: **Merch** mode AND **Automated**
   pop-up mode. Manual mode keeps the classic toolbar popup instead.
2. Reload the **extension** (not just the page) at `chrome://extensions` — the
   merch modal files (`merch-account-modal.js`, `merch-reg-modal.js`,
   `merch-attendee-modal.js`) only register after an extension reload.
3. Open DevTools on the Neon page and check the Console for that page's modal
   log line, e.g. `merch-reg-modal.js: auto-open check → merchMode=… automated=…`.
   `merchMode=false` means you're still in Reg mode; `automated=false` means
   you're in Manual mode.

**Expected post-pickup behavior:** after Confirm Pickup the tab returns to the
**event registration page** (NOT the dashboard) with the merch list modal
re-opened, so you can hand the next person their merch. Merch does not re-check
holds, so it never bounces through the dashboard or account page.

---

## Verify field detection (labels changed in Neon)

The extension finds every custom field by matching its **label text**. When
Neon renames a label, the match fails and the field reads/writes wrong (or not
at all). To see exactly which fields resolve, run the **Manager Debug Walk**:

1. Open the extension Options, tick **Manager Override**, enter the manager
   password, choose **Debugging**, and Save.
2. In Neon, open the **account page** of a real attendee and click the extension
   toolbar icon.
3. The extension walks Account → Event Registration → first Attendee and opens a
   report tab listing every field per page and flagging anything it can't find in
   red. (If it halts early, the report still opens with a note explaining where.)
4. Fix flagged labels in `config.js` (`CONFIG.fieldLabels` / `CONFIG.requiredFields`
   for reg fields, `CONFIG.merch.items[]` for merch), reload, and re-run until
   green. Switch **Debugging** back to **Regular** when done.

Full walkthrough is Step 3 in `ANNUAL_UPDATE_GUIDE.md`. For a quick single-page
check without manager mode, `tools/field-diagnostic.html` does the same matching
from a pasted DevTools dump.

---

## Pronouns or the print-status line are always blank

Pronouns (shown small to the right of the name) and the **Pre-Printed /
Printed? / Blank** line under the badge number come from Neon's read-only
`viewLabel` fields, matched by label substring. These fields live on the
**registration detail** (`eventRegDetails.do`) page, **not** the attendee edit
page — so they are scraped when you pick the attendee from the registration list
and **carried forward** to the badge-issued view. (Opening `attendeeEdit.do`
directly, without going through the registration list first, leaves them blank.)

- **Pronouns blank for everyone** — confirm the attendee actually has pronouns
  set in Neon, then check `CONFIG.fieldLabels.pronouns` ("Pronouns") still
  matches the on-page label. The account page reads it from the **About** grid
  (`.about-field-title`); the registration list page reads it from a
  `td.viewLabel`. A blank pronoun is expected and correct when none is set.
- **Print-status line never appears** — it only shows in the single-attendee
  (badge-number) view, and only when the **Created** date can be read. Because
  Created / Last Updated are read on the registration page and carried forward,
  reaching the attendee via the check-in list (not a direct `attendeeEdit.do`
  URL) is required. Confirm `CONFIG.fieldLabels.createdDate` ("Created") and
  `lastUpdatedDate` ("Last Updated") match the page, and that
  `CONFIG.badgePrint.cutoff` is a valid `MM/DD/YYYY HH:MM` string (a bad cutoff
  logs a warning in the page console and suppresses the line).
- **Wrong status** — re-check the cutoff datetime and the 15-minute window
  against when badges were actually printed (see Step 2f in
  `ANNUAL_UPDATE_GUIDE.md`).

---

## Config looks wrong after editing config.js

Open the extension **Options** page — the **Config check** panel runs automatically
and lists any problems (missing/duplicate values, bad merch match modes, a real
event left in the test list, an out-of-date password hash, version/year drift,
debug mode left on). Fix the flagged items in `config.js`, reload the extension,
and reopen Options until it says "No problems found." The same checks appear at
the top of the Manager Debug Walk report.

---

## "Wrong attendee data" / popup won't react — quick resets

Enable **Manager Override** on the Options page to reveal the **Maintenance** panel:

- **Clear cached scrape data** — wipes the cached scrape (`attendee`,
  `registrations`, `account`, etc.) without touching your settings. Use this for
  the "wrong attendee data showing" problem, then reload the Neon tab.
- **Check Neon tab(s)** — finds your open Neon tabs by URL and pings each one's
  content script. If it reports none responded, the script didn't inject (the
  "popup doesn't react" case) on a supported page — reload the Neon page, or
  toggle the extension off/on in `chrome://extensions`.
- **Storage contents** — expand to see every stored value (for IT).

---

## The check-in panel auto-opens now (or I want the old click-to-open back)

On the **account**, **registration (Attendees)**, and **attendee** pages the
panel now appears automatically as an in-page panel (top-right) once the page
loads — no click needed. Close it with the **✕**; click the extension icon to
re-open it (it re-reads the page first).

- On the **account page** the panel shows account holds / notes, or — for a
  clean account — the attendee's full name and a **"Proceed to Check-In"**
  button (this replaces clicking the icon to advance).
- If it **didn't** open: make sure you're in Registration mode and that the
  page finished loading; click the extension icon to force it. A manager can
  also confirm the mode below.
- To go back to the **old click-to-open popup**: open the extension Options
  and set **Pop-up behavior → Manual** (no Manager Override needed).

> **IT note:** if the account/attendee panel never appears even in Automated
> mode and the page console shows `accountPage.js` logs but **no**
> `account-modal.js` logs (or, in Merch mode, no `merch-account-modal.js` /
> `merch-reg-modal.js` / `merch-attendee-modal.js` logs), the extension is
> running a stale manifest — newly added content-script files only register
> after you reload the **extension** (`chrome://extensions` → ↻ on the card),
> not just the Neon page.

---

## Debugging recipes (for IT)

- **Content-script logs across navigations** — DevTools on the Neon tab,
  Console → ⚙ → check "Preserve log". Filter by `accountPage`,
  `attendeeContact`, or `registrations`.
- **Service worker logs** — `chrome://extensions` → extension card →
  Details → **Inspect views: service worker**.
- **Popup logs** — right-click the extension icon → **Inspect popup**.
  The popup will still close when it calls `window.close()`, but
  breakpoints fire before that.
- **Storage inspection** — service worker DevTools → Application →
  Storage → Local Storage → `chrome-extension://<id>`.
