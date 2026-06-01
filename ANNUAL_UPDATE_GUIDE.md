testing manager pw is "reggie"


# CONvergence Check-In Extension — Annual Update Guide

This guide walks through every change needed to prepare the extension for
a new convention year. You will need access to the GitHub repository and
to Neon CRM.

**You do not need to be a programmer to do this.**
Most changes are in one file — `config.js` — and each change is clearly marked.

---

## Before You Start

You will need:
- Access to the GitHub repository
- Access to Neon CRM (to look up the event ID)
- The new Management Override password (decided by Registration leadership)
- About 30 minutes

---

## Step 1 — Find This Year's Event ID(s) in Neon

1. Log into Neon CRM
2. Go to **Events** and find this year's CONvergence event(s)
3. Click on each event to open it
4. Look at the URL in your browser's address bar
5. Find the number after `id=` — for example:
   `...eventRegDetails.do?id=**312**...`
6. Write each number down — you will need them in Step 2

There may be more than one event ID for the current year (e.g. main event
and dealer spaces). Collect all of them.

---

## Step 2 — Update config.js

Open `config.js` in a text editor (Notepad works fine on Windows).

Search for the text `UPDATE EACH YEAR` — there are a small number of places
to update. Here is each one:

---

### 2a. Event ID(s)

Find this section:
```javascript
event: {
  currentEventId: [     // ← UPDATE EACH YEAR
    "312",              // CONvergence 2026 — Main event
  ],
  otherEventIds: [
    "142",  // CONvergence Training Event
    ...
  ],
},
```

Replace the entries inside `currentEventId: [...]` with this year's event IDs.
Add one line per event, with a comment describing it.

**Example:** If this year has a main event (ID 400) and a dealer event (ID 401):
```javascript
currentEventId: [
  "400",  // CONvergence 2027 — Main event
  "401",  // CONvergence 2027 — Dealer Spaces
],
```

Leave `otherEventIds` alone — those are training/test events and do not change year to year.
You may add last year's main event ID to `otherEventIds` if you want old registrations
to still pass the year check during testing.

---

### 2b. Management Override Password Hash

The real password is never stored in the code. Instead, you store a
"hash" — a scrambled version that the extension can check against without
ever knowing the real password.

**To generate the hash:**
1. Find the file `tools/generate-password-hash.html` on your computer
   (it should be in the extension folder — do NOT open it from GitHub,
   open it from your local copy)
2. Open it in Chrome by double-clicking it or dragging it into Chrome
3. Type the new Management Override password into the box
4. Click **Generate**
5. Click **Copy Hash**

Now find this line in `config.js`:
```javascript
managementPasswordHash: "REPLACE_THIS_WITH_GENERATED_HASH",  // ← UPDATE EACH YEAR
```

Replace the text between the quote marks with the hash you just copied.

**Important:** Never put the actual password in `config.js`.
Share the real password with Help Desk staff verbally or through a
password manager. Do not send it by email, Slack, or GitHub.

---

### 2c. Confirm Adult Minimum Age

Find this line:
```javascript
adultMinimumAge: 18,  // ← confirm each year (typically stays 18)
```

Confirm this is still the correct minimum age for an Adult badge.
This almost never changes, but it is worth a quick check with Registration
leadership each year.

---

### 2d. Confirm Ticket Type Names

Find the `ticketTypes` section. It looks like this:
```javascript
ticketTypes: [
  { nameIncludes: "Adult", ... },
  { nameIncludes: "Teen",  ... },
  { nameIncludes: "Youth", ... },
  { nameIncludes: "Child", ... },
],
```

Log into Neon, open any attendee on this year's event, and look at the
ticket name in the dropdown. Confirm that each ticket name still contains
the word listed in `nameIncludes`.

**Example:** If Neon now calls the ticket "CONvergence Adult Weekend Pass"
instead of just "Adult Weekend Pass", the word "Adult" is still in the name,
so no change is needed.

If a ticket name no longer contains the matching word, update `nameIncludes`
to match a word that does appear in the new name.

---

### 2e. Confirm Merchandise Items (Merch Mode)

The extension has a separate Merch mode (set on the Options page) that
tracks pickup of preorder merch. Find the `merch` section in `config.js`.
It looks like this:

```javascript
merch: {
  items: [
    {
      name: "T-Shirt",
      source: {
        type: "customField",
        label: "Preorder your 2026 T-shirt",
        matchMode: "anyExcept",
        notOrderedValue: "Check the box then click to pick your shirt style and size",
      },
      pickupFieldLabel: "T-Shirt Picked Up",
    },
    {
      name: "Souvenir Guide",
      source: {
        type: "customField",
        label: "Pre-order Souvenir Guide",
        matchMode: "substring",
        matchValue: "Reserve a free printed Guide",
      },
      pickupFieldLabel: "Guide Picked Up",
    },
  ],
},
```

For each item, confirm:

- `source.label` -- the registration form field's label (or a substring
  of it). Open a real registration in Neon; the dropdown or radio for
  this year's merch question must contain this text in its label.
- For `matchMode: "anyExcept"` (T-shirt-style): confirm `notOrderedValue`
  matches the option that is shown when the attendee did NOT order.
- For `matchMode: "substring"` (radio yes/no-style): confirm `matchValue`
  appears in the label of the "ordered" option (e.g., the Yes choice).
- `pickupFieldLabel` -- the label of the matching pickup-tracking field
  on the attendee form. These are the fields the extension writes the
  date/time into. They must exist on the form (ask the Neon admin to
  add them if missing).

If a merch item is no longer offered this year, delete its entry. If
new items are offered, copy an existing entry and adjust the labels.

---

## Step 3 — Verify Field Detection

> **First, run the Config check.** Open the extension **Options** page — the
> **Config check** panel runs automatically and flags structural mistakes in your
> `config.js` edits (a real event left in `testEventNames`, a bad merch match mode,
> an out-of-date password hash, a version/year mismatch, etc.). Fix anything it
> lists, reload the extension, and reopen Options until it says "No problems
> found." This catches the edit mistakes; the steps below catch label drift in Neon.

Neon occasionally renames or reorganizes its custom fields. The extension finds
each field by matching its **label text** (a substring) — see `CONFIG.fieldLabels`,
`CONFIG.requiredFields`, and `CONFIG.merch.items[]` in `config.js`. If Neon renames
a label, the substring no longer matches and the extension reads/writes the wrong
field (or nothing) at check-in.

**Recommended: run the Manager Debug Walk.** This drives the extension through
the same three pages a real check-in touches and opens a report tab that lists
every field on each page and flags anything the extension relies on but can't
find — no copy/paste required.

1. Open the extension **Options** (right-click the toolbar icon → Options, or
   `chrome://extensions` → Details → Extension options).
2. Tick **Manager Override**, enter the manager password, choose **Debugging**,
   and **Save**.
3. In Neon, open the **account page** of any real attendee. Click the extension toolbar icon.
4. The extension walks Account → Event Registration → first Attendee and opens a
   **Debug Walk Report** tab with one section per page: every field + value, plus
   a red **NOT FOUND** list for any label the extension expects but didn't see.
5. When done, return to Options and switch **Debugging** back to **Regular**.

A green report means check-in will resolve every field. If a walk halts early
(e.g. no SUCCEEDED registration), the report still opens with the pages it
reached and a note explaining where it stopped.

**If the report flags a field:** open `config.js` and update the matching label so
it is a substring of the field's actual label on the Neon form:

- Registration fields → `CONFIG.fieldLabels` (and `CONFIG.requiredFields` for the
  ICE contact).
- Merch fields → `CONFIG.merch.items[].source.label` and `pickupFieldLabel`.

Reload the extension and re-run until everything is green. Contact IT if unsure.

> **Fallback A — single-page tool:** open `tools/field-diagnostic.html` in Chrome,
> click **Copy snippet**, paste it into DevTools Console on an AttendeeEdit page,
> then paste the result back into the tool and click **Analyze**. Same matching,
> one page at a time, no manager mode needed.
>
> **Fallback B — raw console dump:**
>
> ```javascript
> document.querySelectorAll('[name^="attendee.customDataList"]').forEach((el) => {
>   const name = el.getAttribute('name');
>   const idx = name.match(/\[(\d+)\]/)?.[1];
>   const val = el.value || el.checked || '';
>   console.log(`[${idx}] ${name} = "${val}"`);
> });
> ```

---

## Step 4 — Update the Version Number in manifest.json

Open `manifest.json` in a text editor. Find:
```json
"version": "2026.1"
```
Update the year to the current year.

---

## Step 5 — Commit the Changes to GitHub

1. Save both files (`config.js` and `manifest.json`)
2. Commit the changes to GitHub with a message like:
   `Annual update for CONvergence 2027`
3. Do **not** commit `tools/generate-password-hash.html` — it is excluded
   by `.gitignore` for security reasons

---

## Step 6 — Test Before Con

Before the convention weekend:

1. Load the updated extension on a test computer (see `SETUP.md`)
2. Run the **Manager Debug Walk** (Options → Manager Override + Debugging mode) against
   a real Neon attendee page to verify every field resolves correctly (see Step 3 above).
3. The Debug Walk report should show no red NOT FOUND items.
4. Do NOT complete an actual check-in during testing.

If the extension does not activate or shows errors, see `TROUBLESHOOTING.md`
or contact IT.

---

## If Something Looks Wrong After Updating

The most common problems after an annual update:

| Symptom | Likely cause | What to do |
|---|---|---|
| Extension shows "Wrong Year" for all attendees | Event ID not updated or wrong ID entered | Re-check the event ID in Neon |
| Management Override password not accepted | Hash not updated, or wrong password shared | Regenerate hash with correct password |
| Ticket type shows as "Unknown" | Neon renamed a ticket type | Update `nameIncludes` to match new name |
| Fields not writing at check-in | Neon renamed a custom field label | Run the Step 3 Field Diagnostic and fix the label in `CONFIG.fieldLabels` |
| Wrong data showing in popup (e.g. wrong name) | Neon renamed a custom field label | Run the Step 3 Field Diagnostic and fix the label in `CONFIG.fieldLabels` |

---

## What NOT to Change

Unless IT has specifically told you to:

- Do not change `otherEventIds` — these are permanent training/test events
- Do not change `holdMessages` order — it must match the field index order
- Do not change anything in `js/` files — these are the code files

If you are unsure whether something needs changing, ask IT before touching it.