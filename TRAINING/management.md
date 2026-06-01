# Management & Help Desk Manual

For Registration management and Help Desk leads. This covers everything the
volunteer cards leave out: switching modes, the Management Override, reading
every blocking condition, the pre-con field check, and the maintenance tools.

If you only need the simple flows, hand volunteers
[`reg-checkin.md`](reg-checkin.md) or [`merch-checkin.md`](merch-checkin.md)
instead. This document assumes you're the person they escalate to.

---

## 1. Contents

1. [How the extension is organized](#2-how-the-extension-is-organized)
2. [The options page](#3-the-options-page)
3. [Modes: Registration vs Merchandise](#4-modes-registration-vs-merchandise)
4. [Pop-up behavior: Automated vs Manual](#5-pop-up-behavior-automated-vs-manual)
5. [Management Override](#6-management-override)
6. [Reading the blocking conditions](#7-reading-the-blocking-conditions)
7. [Notes gates](#8-notes-gates)
8. [What happens at check-in](#9-what-happens-at-check-in)
9. [Pre-con field check (Debug Walk)](#10-pre-con-field-check-debug-walk)
10. [Maintenance tools](#11-maintenance-tools)
11. [Escalation & the annual update](#12-escalation--the-annual-update)

---

## 2. How the extension is organized

It's a Chrome extension that runs inside Neon CRM while staff are logged in. It
reads the attendee/registration pages, decides whether the person can get their
badge (or merch), and writes the result back to Neon so volunteers don't type it
by hand.

There is **no install step beyond loading it in Chrome** and **no server** — all
of its settings live in the browser's local storage on each workstation. That
means **settings are per-workstation**: turning on Management Override on one
machine does not affect any other machine.

---

## 3. The options page

Right-click the toolbar icon → **Options** (or via `chrome://extensions` →
Details → Extension options). The page has:

- **Extension Mode** — Registration or Merchandise (see §4).
- **Enable Management Override** — checkbox; reveals the password field (see §6).

When override is enabled and the correct password is entered, three more
controls appear (manager-only):

- **Behavior** — Regular or Debugging (the pre-con field walk, §10).
- **Pop-up behavior** — Automated or Manual (§5).
- **Maintenance panel** — tab check, cache reset, storage inspector (§11).

A **Config check** panel is always visible at the bottom and flags mistakes in
`config.js` (the annual settings file). If it shows red errors, the yearly
update is wrong — fix before con.

Click **Save Options** to apply. Settings persist on that workstation until
changed.

`[SCREENSHOT: options page with override enabled, all manager rows visible]`

---

## 4. Modes: Registration vs Merchandise

Set under **Extension Mode**. Pick one per workstation based on what that station
does.

| | Registration | Merchandise |
|---|---|---|
| Purpose | Check in attendees, issue badges | Hand out pre-ordered merch |
| Toolbar face | Reggie | Connie |
| On-screen marker | — | Blue **MERCH MODE** banner |
| Validates holds / age / ICE? | Yes | No (merch only cares about what was ordered) |
| Volunteer guide | [`reg-checkin.md`](reg-checkin.md) | [`merch-checkin.md`](merch-checkin.md) |

A merch station should be set to Merchandise mode **before** the volunteer sits
down. If a volunteer reports the wrong toolbar face or a missing/extra MERCH MODE
banner, the mode is wrong — fix it on the options page.

The merch catalog (what items exist, which Neon fields they read/write) lives in
`config.js` under `CONFIG.merch.items`. Currently: **T-Shirt** and **Souvenir
Guide**. Changing it is an annual-update / IT task — see
[`../ANNUAL_UPDATE_GUIDE.md`](../ANNUAL_UPDATE_GUIDE.md).

---

## 5. Pop-up behavior: Automated vs Manual

Manager-only choice (only visible when override is on). It controls how the
check-in screen appears on the registration and attendee pages.

- **Automated (default)** — the check-in window opens **in the page itself** as a
  modal, automatically, as soon as the page loads. Clicking the toolbar icon
  re-opens it. The modal can be **dragged by its title bar** and remembers where
  you put it. This is the smoother flow for a busy line.
- **Manual** — the classic behavior: nothing opens on its own; the volunteer
  clicks the toolbar icon to open the small pop-up window.

Both show the same information and buttons. Automated is recommended for
check-in stations; Manual exists as a fallback if the in-page modal ever
conflicts with a Neon page.

> Account pages always use the classic pop-up regardless of this setting; only
> the registration and attendee check-in screens switch.

---

## 6. Management Override

Override lets a lead push a check-in past a **red (blocked)** status that a
regular volunteer cannot. Use it only when you've personally resolved the
underlying issue.

**Enabling it:** check **Enable Management Override**, type the management
password, **Save Options**. The password is verified against a SHA-256 hash in
`config.js` — the real password is never stored anywhere in the code or browser.

**While override is active:**

- Every screen shows a red **MANAGER OVERRIDE ACTIVE** bar.
- The toolbar icon carries a purple **"M"** badge.
- Red attendee rows gain an **⚠ Override — Check In →** button instead of "Send to
  Help Desk".
- The attendee screen still shows the full red **⛔ DO NOT ISSUE BADGE** detail
  and hold instructions — override does **not** hide the reason, it just lets you
  proceed anyway.

**Password handling (important):**

- Share the plaintext password **verbally or via a password manager** — never in
  email, Slack, or GitHub.
- It rotates annually. Regenerate the hash with
  `tools/generate-password-hash.html` (run locally only) and paste it into
  `config.js`. See [`../ANNUAL_UPDATE_GUIDE.md`](../ANNUAL_UPDATE_GUIDE.md).
- **Turn override off** (uncheck + Save) when you step away from a Help Desk
  workstation so a volunteer can't issue blocked badges.

`[SCREENSHOT: attendee screen with override active — red banner + DO NOT ISSUE BADGE + override button]`

---

## 7. Reading the blocking conditions

When you (with override) look at a flagged attendee, here's what each condition
means and where it gets resolved. **Red** = blocks check-in; **Yellow** = warn /
must-fix-first.

### Holds (red) — resolved elsewhere, not at the check-in page

| Hold | Where to send the attendee |
|---|---|
| **Registration Hold** | Review account notes / contact Registration Head. Do not release badge. |
| **Art Show Hold** | Send to Art Show to pay, then back to the Registration Help Desk. |
| **Operations Hold** | Send to Operations. |

### Other red conditions

| Condition | Meaning | Action |
|---|---|---|
| **Not paid** | Registration status isn't SUCCEEDED | Send to cashier / Registration Head. Not fixable on the page. |
| **Already issued** | Badge already handed out | Send to Help Desk — possible duplicate. |
| **Wrong year / wrong event** | Registration isn't this year's con | Verify the right event in Neon. |
| **Incorrect day** | Day Pass used on the wrong day | Send to Help Desk. |
| **Unknown ticket** | Ticket type not recognized | Ticket names may have changed — IT / annual update. |
| **No account / attendee ID, no name** | Page data couldn't be read | Reload the page; if it persists, IT. |
| **Name mismatch** | Non-transferable badge, name doesn't match | Send to Help Desk. |

### Yellow conditions — fixable right at the check-in page

| Condition | Action |
|---|---|
| **Age verification** (Adult / Dealer) | Check photo ID against the shown cutoff date, click **Age Verified, ID Returned ✓**. |
| **Missing emergency contact (ICE)** | Click **Show me the field ↓**, fill it on the Neon form, click **Re-check ↺**. |

The badge number is deliberately **hidden** until every red and every required
field is clear — so a volunteer can't read out a number before the problem is
resolved. When it's clear, the number appears and the **Badge Issued** button
turns on at the same moment.

---

## 8. Notes gates

Notes must be acknowledged before a volunteer can move on — this is intentional
friction so important notes aren't skipped.

- **Account notes** (yellow) — read, tick "I have read and understood…", then
  **Proceed to Check-In →**.
- **Registration notes** (yellow) — same pattern, then **Show Attendee List →**.
- **Single registration note** — a 📋 screen with **Note Read ✓**.

If a volunteer is stuck on a note screen, it's because the checkbox isn't
ticked — the Proceed button stays disabled until it is.

---

## 9. What happens at check-in

When **Badge Issued** is clicked, the extension automatically:

1. Downloads a **badge-printer CSV** to the Downloads folder (the printer queue
   watches that folder).
2. Increments **Number of Active Badges** in Neon.
3. Writes the attendee's name to the **Non-Transferable Name** field.
4. Records pickup date & time in the next pickup slot.
5. Submits the Neon form and returns the volunteer to a fresh search.

If the CSV download fails, the volunteer is told **not** to issue the badge and to
contact the Registration Head — that's your cue to check the workstation's
Downloads setup.

**Merch check-in** (Confirm Pickup) writes the current date/time into each
checked item's pickup field (format `MM/DD/YYYY HH:MM`, 24-hour) and submits.

---

## 10. Pre-con field check (Debug Walk)

The extension finds Neon's custom fields by **matching label text**. If Neon's
admins rename or reorder fields, matching can silently break. Run this check
**before con** and **after any Neon form change.**

**To run it:**

1. Options page → enable **Management Override** (password).
2. Set **Behavior** to **Debugging (pre-con field check walk)**. Save.
3. Open any real attendee's **account page** and click the toolbar icon.

The extension walks account → registration → attendee automatically, audits
whether every field it depends on resolves, and opens a **report tab** listing
each step and any problems.

**Turn Behavior back to Regular when you're done** — leave it on Debugging and
normal clicks will trigger the walk instead of a check-in.

If the report flags missing/ambiguous fields, that's an IT / annual-update fix —
see [`../ANNUAL_UPDATE_GUIDE.md`](../ANNUAL_UPDATE_GUIDE.md) and
[`../DEVELOPER.MD`](../DEVELOPER.MD).

---

## 11. Maintenance tools

In the manager-only **Maintenance** panel on the options page:

- **Check Neon tab(s)** — confirms the extension's scripts actually loaded on
  your open Neon tabs. Use this first when "nothing happens" on a page. If it
  reports no script responded, reload the Neon tab.
- **Clear cached scrape data** — wipes the cached page reads (attendee,
  registration, account, etc.) **without** touching your settings. Use when a
  page shows stale data; reload the Neon tab afterward to re-scrape.
- **Storage contents** — expandable dump of everything in local storage, for
  diagnosing with IT.

The always-visible **Config check** panel validates `config.js`. Red = error
(fix before con), yellow = warning.

For broader problems see [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md).

---

## 12. Escalation & the annual update

**Call IT (the code maintainer) when:**

- The Config check or Debug Walk reports errors you can't resolve by re-running.
- A condition fires that doesn't match reality (e.g. everyone shows "Unknown
  ticket") — usually means Neon field/ticket names changed.
- The badge CSV won't download on a station that's set up correctly.
- The extension doesn't load or scripts don't respond after reloads.

Point them at [`../DEVELOPER.MD`](../DEVELOPER.MD) and
[`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md).

**The yearly update** (event names, ticket names, merch catalog, override
password) all lives in `config.js`. The full checklist is in
[`../ANNUAL_UPDATE_GUIDE.md`](../ANNUAL_UPDATE_GUIDE.md). Don't edit other files
for the annual refresh.

Never complete a real check-in on a live attendee during testing or training runs.
Use the Manager Debug Walk (Options → Debugging mode) against a real attendee
page to verify field detection before con.
