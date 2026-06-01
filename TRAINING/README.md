# Training Documentation

Training material for the CONvergence Check-In extension, split by role.

## Google Slides / PowerPoint presentations

Upload these to Google Drive — Drive auto-converts them to Google Slides.

| File | Who it's for |
|---|---|
| [`reg-checkin.pptx`](reg-checkin.pptx) | Registration check-in volunteers |
| [`merch-checkin.pptx`](merch-checkin.pptx) | Merchandise pickup volunteers |
| [`management.pptx`](management.pptx) | Registration management / Help Desk leads |

Regenerate any time: `node tools/generate-training-pptx.js`

---

## Graphical training guides (HTML — read on screen or share with volunteers)

| Guide | Who it's for |
|---|---|
| [`reg-checkin.html`](reg-checkin.html) | Registration check-in volunteers (badges) |
| [`merch-checkin.html`](merch-checkin.html) | Merchandise pickup volunteers |
| [`management.html`](management.html) | Registration management / Help Desk leads |

Open in Chrome. All three have a sidebar navigation, color-coded status indicators,
screen mock-ups, and screenshot placeholders.

## Printable station cards (laminate these)

Open in Chrome and use **File → Print** (`Ctrl+P`). Each fits a single letter page.

| Card | Print this for |
|---|---|
| [`reg-checkin-card.html`](reg-checkin-card.html) | Registration check-in stations |
| [`merch-checkin-card.html`](merch-checkin-card.html) | Merchandise pickup stations |

The reg card includes the full age-verification ID-check procedure for Adult and
Dealer badges. Management is a reference manual — read it on screen, no card.

## Plain-text source (for editing / version control)

| File | Corresponds to |
|---|---|
| [`reg-checkin.md`](reg-checkin.md) | reg-checkin.html |
| [`merch-checkin.md`](merch-checkin.md) | merch-checkin.html |
| [`management.md`](management.md) | management.html |

## Which mode am I in?

The extension runs in one of two modes, set by management on the options page:

- **Registration mode** — checking attendees in and issuing badges. Toolbar
  face is **Reggie**.
- **Merchandise mode** — handing out pre-ordered merch (T-shirts, guides).
  Toolbar face is **Connie**, and every screen shows a blue **MERCH MODE**
  banner.

If the banner and toolbar face don't match the job you were told to do, stop and
ask your lead — you're in the wrong mode.

## A note on screenshots

These guides have `[SCREENSHOT: ...]` placeholders where station photos should go.
Capture them against a real Neon attendee during a training shift or con setup —
drop the images in next to these files when ready.
