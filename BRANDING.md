# CONvergence Branding

Canonical color guideline for CONvergence projects. This file is the **human source of truth** —
copy it into other repos / load it as context. In code, the values are mirrored as CSS custom
properties and a small JS constant (see "How it's wired"); when a value changes, update it here
**and** in those two places (there is no build step that generates them automatically).

## Palette

| Name   | Hex       | Primary role             | Also used for                       |
|--------|-----------|--------------------------|-------------------------------------|
| Purple | `#620272` | **Section headers**      | primary brand accent                |
| Green  | `#328332` | **Links**                | — (do **not** use for "go" — see Accessibility) |
| Blue   | `#0072B2` | **"Go / OK / ready" status** | primary affirmative actions/buttons |
| Red    | `#CC0202` | Complimentary accent     | **"stop / blocked / error"** status |
| Yellow | `#FFB400` | Complimentary accent     | **"caution / attention"** status    |

Colors are **not locked to a single use** — any of them may serve as an accent elsewhere. The roles
above are the defaults; the one firm rule is the status palette below.

## Accessibility: the status "stoplight" uses Blue, not Green

For any status / "stoplight" signal, use **Blue for "go / OK"** instead of green.

| Meaning            | Color              |
|--------------------|--------------------|
| Go / OK / ready    | **Blue** `#0072B2` |
| Caution / attention/ notes | **Yellow** `#FFB400` |
| Stop / blocked / error | **Red** `#CC0202` |

**Why:** green-vs-red is the most common colorblind confusion (red–green color vision deficiency is
by far the most prevalent). A **red / yellow / blue** stoplight stays distinguishable for those
users, where red / yellow / green does not. So this project intentionally swaps the usual green
"go" for **blue**. Green is reserved for **links**.

> Note for future contributors: this blue-for-"go" choice is deliberate and accessibility-driven —
> please don't "correct" it back to green.

## Shades (single source of truth)

Define each color **once**, then derive lighter backgrounds and darker hover/border variants with
CSS `color-mix()` (supported in Chrome 111+, which is all this extension targets). Pop-up / modal /
panel backgrounds should be a **light tint of the relevant color** rather than a separately chosen
hex — so they always track the base color.

```css
:root {
  /* Base palette */
  --brand-purple: #620272;
  --brand-green:  #328332;
  --brand-blue:   #0072B2;
  --brand-red:    #CC0202;
  --brand-yellow: #FFB400;

  /* Light backgrounds (~10% color on white) — e.g. modal/section backgrounds */
  --brand-blue-bg:   color-mix(in srgb, var(--brand-blue)   10%, white);
  --brand-red-bg:    color-mix(in srgb, var(--brand-red)    10%, white);
  --brand-yellow-bg: color-mix(in srgb, var(--brand-yellow) 14%, white);
  --brand-purple-bg: color-mix(in srgb, var(--brand-purple) 10%, white);

  /* Darker variants (~15% black) — hover states, borders */
  --brand-blue-dark:   color-mix(in srgb, var(--brand-blue)   85%, black);
  --brand-purple-dark: color-mix(in srgb, var(--brand-purple) 85%, black);
}
```

Adjust the mix percentages to taste; changing a base value updates every tint/shade derived from it.
(If `color-mix()` ever needs to be avoided, replace these with precomputed hex equivalents.)

## How it's wired (this repo — no build step)

- **CSS:** a single `:root { … }` block of the variables above, referenced everywhere as
  `var(--brand-purple)` etc. This replaces scattered hard-coded hex and the
  "search for `#dc3545` and replace all" maintenance note in `css/popup.css`.
- **JS:** a small `BRAND` constant for colors used outside CSS — the toolbar icon "M" override badge
  fill in `shared/js/background-core.js`, and any inline styles.

## Applying to the extension UI (mapping)

| UI element                              | Brand color                          |
|-----------------------------------------|--------------------------------------|
| Section / popup / modal **header bars** | Purple `#620272`                     |
| Primary affirmative buttons (Check In)  | Blue `#0072B2`                       |
| **Ready / OK** status                   | Blue `#0072B2` (not green)           |
| **Caution / notes** status              | Yellow `#FFB400`                     |
| **Blocked / error / override** status   | Red `#CC0202`                        |
| Links                                   | Green `#328332`                      |
| Panel / row backgrounds                 | light tint (`--brand-*-bg`)          |

## Known limitation

The toolbar PNG icons (`assets/reggie-*` for REG, `assets/connie-*` for MERCH) are raster and can't
be re-tinted via CSS. The reggie "go" icon already uses **blue** (`reggie-blue-{19,38}.png`) per the
colorblind rule; connie still ships a green "go" icon, so aligning it (and any other hue tweaks) to
the brand palette would require regenerating those PNGs as a separate task.
