# AIMINDSHARE-DESIGN-v1_0.md — AiMindShare Design System
### Doc 7 of 14 · **Version 1.0 · 2026-07-02** · rev 2026-07-03 (D-018 type refinement; §8.9 auth components from M00)
**Single source of truth for every AiMindShare.com screen, module, and component.**

> **How to use this file:** attach it (plus `tokens.css` and, for the first UI session of any new
> surface, `publishlyai-command-center.html`) at the start of every session that produces UI.
> This file + SCREEN-INVENTORY-AND-IA (doc 8) is everything Claude Code needs to produce output
> pixel-consistent with the approved reference mockup.

---

## 0. THE PRIME DIRECTIVE — inheritance chain

Per **D-004** and **D-006** (DECISIONS log):

```
QURANLYAI_DESIGN.md                      ← the LAW (tokens, type, hairlines, motion, forbidden list)
        │  applied to dashboard form by
publishlyai-command-center.html          ← the CANONICAL REFERENCE IMPLEMENTATION
        │  extracted into
tokens.css + THIS DOCUMENT               ← the binding spec for AiMindShare
```

Where this document and the reference mockup disagree, **the mockup wins** and this document has
a bug — fix the document. Where the mockup and QURANLYAI_DESIGN.md disagree, the mockup's value
is a *deliberate recalibration for dashboard-class products* and is canonical here (the mapping
is recorded in §2.3 so nothing is silently different).

**Rules that never bend (inherited, adapted for a dashboard product):**

1. **Never invent new colors.** Use only tokens in `tokens.css`. New tokens require a DECISIONS entry.
2. **Light mode is the default** (D-007 — deliberate inversion of the QuranlyAI rule; matches the
   Console precedent and the reference mockup). Dark mode is the sibling `[data-theme="dark"]` block.
3. **Glassmorphism is a system, not decoration.** Applied by zone (§5), never ad hoc.
4. **No shimmer animations.** No `::after` sweep on any card, ever. Glow shadows only.
   (Static radial-glow `::after` accents like `.kpi-tile::after` are fine — they don't animate.)
5. **No raw hex** inline in HTML or page CSS except inside SVG `<defs>` gradients.
6. **Theme blocks are always siblings** of `:root` — never merged inside it.
7. **Reveal system uses the `js-ready` pattern** (§10). Content is visible by default and hidden
   only after JS runs. `threshold: 0` in every IntersectionObserver.
8. **Three fonts only:** Cormorant Garamond (display) · Baskerville / Libre Baskerville (body, labels, UI) ·
   Shippori Mincho (numbers/data) — **D-014** supersedes D-008. No others, ever.
9. **Hairline borders:** `.5px solid` everywhere a border exists. Never `1px` on cards/panels.
10. **Honest data.** Design mockups carry a visible "sample data" label; live screens show honest
    empty states — never fabricated numbers. (Inherited from the reference mockup's own footer rule.)
11. **No urgency copy** ("Act now", "Limited time") in platform chrome. Brand tone violation.
12. **Numbers use the data font.** Every metric, count, currency value, delta, and timestamp renders in
    `--font-mono` (now Shippori Mincho, D-014). This is the single strongest signature of the dashboard language.

---

## 1. BRAND IDENTITY — AiMindShare

| Property | Value |
|---|---|
| Product name | **AiMindShare** (exact casing — capital A, lowercase i, capital M, capital S) |
| Domain | `aimindshare.com` |
| Default theme | **Light** (D-007) |
| Wordmark | `--font-serif`, 600, `AiMind` in `--ink-900` + `<em>Share</em>` in `--gold-500` italic — mirrors the mockup's `Publishly<em>Ai</em>` pattern |
| Logo mark | 30×30 rounded square (`--r-sm`), `--grad-brand` fill, white glyph, gold notification-dot accent at top-right (`.brand .mark::after` in the mockup) — replace the glyph, keep the construction |
| Accent philosophy | Teal = product/action · Gold = attention/premium/AI-highlight · never a third accent |
| Theme localStorage key | **D-012 OPEN** — mockup boot script reads shared `islamicinfo-theme`; treat as a *proposal*. Until decided, write the boot script against a `THEME_KEY` const so the swap is one line. |

---

## 2. TOKENS — `tokens.css`

### 2.1 The file

`tokens.css` (shipped alongside this doc) is the **verbatim extraction** of the reference
mockup's `:root` + `:root[data-theme="light"]` + `:root[data-theme="dark"]` blocks, per D-006.
Every page loads it first:

```html
<link rel="stylesheet" href="/assets/css/tokens.css">
```

Do **not** re-declare tokens per page. Do not fork values. If a screen genuinely needs a new
token, it goes into `tokens.css` with a DECISIONS entry.

### 2.2 Token quick reference

| Group | Tokens | Notes |
|---|---|---|
| Teal scale | `--teal-950…50` | Brand/action. Dark theme *re-tunes* `--teal-700/500/300` brighter — always use tokens, never assume a hex |
| Gold scale | `--gold-700…50` | Attention, premium, AI, "needs you" surfaces |
| Status | `--status-success/warning/danger/info/idle` | The ONLY colors allowed for state pills, deltas, dots |
| Surfaces | `--bg`, `--bg-elev`, `--bg-card`, `--card-solid` | Page canvas → elevated chrome → card fill → opaque card |
| Lines | `--line`, `--line-strong` | Hairline dividers vs emphasized borders. Always `.5px` |
| Ink | `--ink-900/700/500/400/300` | Headings → strong body → body → muted → faint |
| Glass | `--glass-bg`, `--glass-border`, `--glass-hi` | The glass recipe inputs (§5) |
| Interaction | `--row-hover` | Row/list hover fill |
| Gradients | `--grad-brand`, `--grad-gold`, `--grad-ai`, `--grad-spine` | Spine = vertical teal→gold accent bar |
| Fonts | `--font-serif`, `--font-sans`, `--font-mono` | §3 |
| Tracking | `--label-track` (.16em) | Uppercase label letter-spacing |
| Radii | `--r-sm 10 / -md 14 / -lg 18 / -xl 24 / -2xl 32 / -pill 999` | Cards ≥ `--r-xl`; controls `--r-sm/md`; chips `--r-pill` |
| Easing | `--ease-reverent`, `--ease-premium` | Entrances/hover vs chrome/buttons |
| Shadows | `--shadow-sm/md/lg/glow` | Theme-aware (dark overrides md/lg) |

### 2.3 Mapping table — QuranlyAI law → AiMindShare tokens (recorded deviations)

The dashboard token set renames and recalibrates some QuranlyAI tokens. This table is the
complete diff, so nothing is silently different:

| QURANLYAI_DESIGN token | AiMindShare token | Change |
|---|---|---|
| `--font-display` | `--font-serif` | rename only |
| `--font-body` | `--font-sans` | rename only |
| `--font-arabic` (Amiri) | `--font-mono` (Shippori Mincho) | **D-014** — data font owns numbers/data; supersedes D-008 |
| `--ink-primary/body/muted/subtle/faint` | `--ink-900/700/500/400/300` | rename to numeric scale |
| `--surface`, `--surface-card` | `--bg`, `--bg-elev`, `--bg-card`, `--card-solid` | expanded 4-level surface system |
| `--r-full` | `--r-pill` | rename only |
| `--teal-50 #F0FAFB` | `--teal-50 #EAF5F5` | recalibrated for light-default UI fills |
| `--teal-800 #004E55` | `--teal-800 #003F44` | recalibrated |
| `--teal-900 #0A3A3D` | `--teal-900 #0F2A2C` | recalibrated (doubles as light-mode ink-900) |
| — (new) | `--gold-50`, `--line`, `--line-strong`, `--row-hover`, `--label-track`, `--status-*`, `--grad-*`, `--shadow-*` | dashboard extensions from the mockup |
| `--ghost-green/amber/red` | *(dropped)* | Recitation-only tokens; state color = `--status-*` |
| Grade colors (`--grade-sahih` etc.) | *(dropped)* | Content-site only, forbidden here |

---

## 3. FONT STACK

**Required import — this exact string on every page, preconnects first:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Shippori+Mincho:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

| Variable | Font | Owns |
|---|---|---|
| `--font-serif` | Cormorant Garamond | H1/H2/H3, page titles, card/row titles (`.r-title`, `.oc-topic`), wordmark, `<em>` gradient/gold accents |
| `--font-sans` | Baskerville (Libre Baskerville web fallback) | Everything else — body, nav, buttons, labels, inputs, table text. Body base **16.5px / 400** (D-014) |
| `--font-mono` | Shippori Mincho | **All numbers and machine-ish text**: KPI values, counts, currency, deltas, percentages, timestamps, freshness lines, kbd hints, pills, chips, scores, IDs, code |

Helper classes (in `base.css`): `.mono, .num { font-family: var(--font-mono); }` ·
`.muted { color: var(--ink-400); }`

**The data-font rule is not optional.** A revenue figure set in the body serif is a design defect —
numerals always render in `--font-mono` (Shippori Mincho). `--font-mono` keeps its legacy variable
name but no longer maps to a monospace face (D-014).

---

## 4. TYPE SCALE — dashboard class

The QuranlyAI landing-page scale is recalibrated for information-dense app screens. These values
come from the reference mockup:

| Role | Size | Weight | Font | Notes |
|---|---|---|---|---|
| Page H1 (`.page-head h1`) | `clamp(32px, 4.4vw, 52px)` | 600 | serif | line-height `1.02`, letter-spacing `-.025em`, one `<em>` gradient-italic word |
| Base H1 (default) | `30px` | 600 | serif | for compact heads (settings, drawers) |
| Section H2 | `19–21px` | 600 | serif | `<em>` accent word in `--gold-500` italic 500 |
| Panel H3 | `16–17px` | 600 | serif | |
| Body | `16.5px` | 400 | sans | line-height `1.6` — the app-wide default on `body` (D-014) |
| Page-head sub | `16.5px` | 400 | sans | `--ink-400`, line-height `1.6`, max-width `62ch` (D-014) |
| Nav item | `13.5px` | 500 | sans | |
| Row/card title | `15px` | 600 | serif | line-height `1.2`, ellipsis on overflow |
| Secondary text / meta | `11.5–12.5px` | 400 | sans | `--ink-400/500` |
| KPI value | `22px` | 500 | mono | letter-spacing `-.02em`; currency symbol `18px --ink-400` (**D-018** — eased from 29px) |
| Big stage count | `24px` | 500 | mono | `.ps-count` |
| Uppercase label | `10px` | 600 | sans | `letter-spacing .1em`; eyebrows keep `.2em`; UPPERCASE (**D-018** — eased from 14.5px/`--label-track` so labels sit in rhythm with the body) |
| Pill / chip | `10–11px` | 500 | mono | uppercase, `letter-spacing .06–.08em` |
| Freshness / caption | `11–11.5px` | 400 | mono | `--ink-400/300` |

### Gradient-italic headline (signature style — one word per H1/H2)

```css
.page-head h1 em{font-style:italic;font-weight:500;
  background:linear-gradient(125deg,var(--teal-700) 0%,var(--teal-500) 40%,var(--gold-700) 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;}
:root[data-theme="dark"] .page-head h1 em{
  background:linear-gradient(125deg,var(--teal-300) 0%,var(--teal-500) 40%,var(--gold-400) 100%);
  -webkit-background-clip:text;background-clip:text;}
```

Section-level `h2 em` uses the simpler gold accent: `color:var(--gold-500);font-style:italic;font-weight:500;`.
There is **no Bismillah** and **no Arabic type ramp** in this product (D-008 rationale: no Arabic content).

---

## 5. GLASSMORPHISM SYSTEM — by zone, never by whim

Glass intensity is determined by **screen zone**, not preference. Dashboard mapping of the
QuranlyAI zone law:

| Zone | Recipe | Where |
|---|---|---|
| **App chrome** (rail, topbar) | `background:var(--glass-bg); backdrop-filter:blur(24px) saturate(1.5); border:.5px solid var(--glass-border)` — dark rail overrides to `rgba(6,16,18,.72)` | `.rail`, `.topbar` |
| **Glass Heavy** — status & AI surfaces | same blur(24) recipe + `box-shadow: inset 0 1px 0 var(--glass-hi), 0 8px 28px rgba(0,105,110,.09)` (dark: `rgba(0,0,0,.28)`) | `.kpi-tile`, `.panel`, copilot panel, jobs panel |
| **Gold Heavy** — "needs you" surfaces | blur(24) saturate(1.5) over `linear-gradient(145deg, rgba(197,160,89,.10), rgba(0,105,110,.04))`, border `rgba(197,160,89,.30)` | `.needs-panel`, upgrade/attention banners |
| **Glass Deep** — overlays above content | `blur(36–40px) saturate(1.7–1.8)`, near-opaque fill | modals, drawers (deal drawer, contact drawer), command palette |
| **Glass Light / none** — dense work surfaces | `blur(12px) saturate(1.2)` or **no glass at all** | big tables, kanban columns, editors, email/doc canvases. Legibility first — glass never sits behind long-form reading or editing |
| **Solid** | `var(--card-solid)` | dropdown menus, tooltips, toasts (must be fully opaque) |

Sub-cards inside a glass panel (`.needs-item`, `.opp-card`, `.rec-card`, `.pipe-stage`) do **not**
re-blur — they use translucent teal fills (`rgba(0,105,110,.05–.10)`) + hairline borders. Never
nest backdrop-filters.

### Approved card hover (no shimmer, ever)

```css
/* hero-grade tiles (KPI) */    transform:translateY(-6px) scale(1.015); border-color:rgba(26,154,161,.38);
                                box-shadow:0 20px 52px rgba(0,105,110,.18),0 4px 14px rgba(0,105,110,.10),0 0 0 1px rgba(0,105,110,.10);
/* mid cards (opp/rec) */       transform:translateY(-4px); border-color:rgba(26,154,161,.45); box-shadow:0 16px 40px rgba(0,105,110,.18);
/* small items (needs/stage) */ transform:translateY(-3px); border-color:rgba(26,154,161,.45); box-shadow:0 12px 30px rgba(0,105,110,.18);
/* rows */                      background:var(--row-hover);  /* no lift — rows never levitate */
```

Hover transitions: `.3–.35s var(--ease-reverent)` on transform/box-shadow/border-color only.

---

## 6. ATMOSPHERE LAYER — required on every app page

Copy verbatim from the mockup (`.bg-canvas` + `::before` radial washes + `.bg-grid` +
3 `.orb`s + `#starField`, 55 stars). Structure:

```html
<div class="bg-canvas" aria-hidden="true">
  <div class="bg-grid"></div>
  <div class="orb orb-1"></div><div class="orb orb-2"></div><div class="orb orb-3"></div>
  <div id="starField"></div>
</div>
```

Key values: grid `48px`, `gridDrift 60s linear infinite`; orbs `blur(80px)`, `orbFloat 20–28s`;
stars `starTwinkle 3–10s`, opacity `.04–.13`, light-mode stars `rgba(0,105,110,.4)`.
The star generator and orb keyframes are in the mockup lines and ship as `atmosphere.js` +
part of `base.css` — extract once, reuse everywhere. Gate everything behind
`prefers-reduced-motion` (the mockup already does: star generator early-returns; global
media-query kills animation durations).

Public-facing pages built *by* the platform (M19 sites, M15 forms, M20 funnels) do **not**
inherit the atmosphere — it belongs to AiMindShare's own chrome only. Public AiMindShare pages
(booking, document signing, invoice pay) use `--bg` + the radial `::before` washes only (no
grid/orbs/stars) so they stay calm and fast.

---

## 7. APP SHELL

```
grid: "rail topbar" 56px
      "rail content" 1fr
columns: 240px 1fr
```

| Part | Spec |
|---|---|
| `.rail` | 240px, glass chrome, sticky full-height, own scroll. Brand block → `.nav-group`s with 10px uppercase `.nav-group-label`s → items |
| `.nav-item` | 13.5px/500, `--r-sm`, 17px icon at `.85` opacity. Hover `rgba(0,105,110,.08)`. Active: `--teal-50` fill (dark `rgba(0,150,160,.12)`), `--teal-700` text (dark `--teal-300`), **3px `--grad-spine` bar** on the left (`::before`, inset 7px top/bottom, radius 2px) |
| `.topbar` | 56px, glass, sticky. Search pill (`.tb-search`, `--r-pill`, `⌘K` kbd hint in mono) → spacer → `.jobs-chip` (pulsing `--status-info` dot + mono count) → icon buttons (40×40 `--r-pill`) → theme toggle → 32px `.avatar` (`--grad-brand`, initials) |
| `.content-inner` | `max-width:1440px; margin:0 auto; padding:32px` (22px/18px ≤760px) |
| Responsive | ≤1100px: rail collapses to 64px icon rail (labels hidden) · ≤760px: rail hidden (drawer pattern), single-column grid |

The jobs-chip is a **product requirement**, not decoration: it surfaces the M13/jobs-table queue
depth (D-003) on every screen and opens the Jobs panel.

---

## 8. COMPONENT LIBRARY — canonical dashboard components

Class names below are the canon (from the mockup). New screens compose these before inventing
anything. Full CSS lives in `components.css`, extracted 1:1 from the mockup's `<style>` block.

### 8.1 Page head
`.page-head` → `.eyebrow` (module badge: `MODULE · M09` style, 10px/700/.2em uppercase, teal tint
pill, animated blink dot via `::before`) → `h1` with one gradient `<em>` → `.sub` (≤62ch) →
`.freshness` (mono 11.5px, green dot; states data recency honestly — "latest snapshot 2h ago").

### 8.2 KPI strip
`.kpi-strip` (auto-fit grid, `minmax(190px,1fr)`) of `.kpi-tile` (glass heavy, `--r-xl`,
min-height 124px, static radial glow `::after` top-right). Anatomy: `.kpi-top` (`.kpi-label`
10px uppercase + `.kpi-ico` 30px teal-tint icon square) → `.kpi-value` (mono 22px, D-018; `.cur` for
currency symbol) → `.kpi-meta` (`.kpi-delta.up/.down` mono in status color + `.kpi-chip`,
`.kpi-chip.est` outlined for estimates). `.kpi-featured` = gold variant (gold border, gold
gradient icon, gold ink) — max **one** per strip.

### 8.3 Needs panel (the "act now" surface)
`.needs-panel` (gold-heavy glass, `--r-2xl`) → `.np-head` (`.np-ico` 34px `--grad-gold` square,
h2 with gold `<em>`, `.np-count` mono gold outline pill) → `.needs-actions` grid of
`.needs-item` (icon square + `.ni-num` mono 19px + `.ni-label` + `.ni-go` arrow that slides on
hover). `.needs-item.danger` tints the icon `--status-danger`. This is the canonical pattern for
approval queues, failed jobs, expiring anything.

### 8.4 Pipeline mini
`.pipe-mini` horizontal scroll of `.pipe-stage` (translucent teal card, 3px `--grad-spine` left
bar at 55% opacity, `.ps-label` 10px uppercase + `.ps-count` mono 24px; `.dim` mutes zero/low
stages). Canonical for any stage/funnel summary (M11 board header, M20 funnel map summary,
M22 content pipeline).

### 8.5 Panels & data rows
`.panel` (glass heavy, `--r-xl`) → `.panel-head` (`.ph-ico` 26px teal square + h3 + `.cc-viewall`
link whose gap widens on hover). `.row-list` of `.data-row`: optional `.rank` mono → `.r-body`
(`.r-title` serif 15px ellipsized + `.r-meta` 11.5px with mono `.num` fragments) → `.r-right`
(`.r-value` mono, `.pos` = `--status-success`). Rows separated by `.5px var(--line)` top borders,
hover = `--row-hover` fill. **This is the default list pattern everywhere** — contacts, deals,
invoices, keywords, articles.

### 8.6 Pills & chips
`.pill` — mono 10px uppercase pill with 6px `currentColor` dot. Tint variants map to semantics:
`.pill.attention` (gold) is in the mockup; extend with `.pill.success/.warning/.danger/.info/.idle`
using the `--status-*` colors at ~14% background tint. These pills render **every domain enum**
(deal_status, content_status, job status, invoice status, campaign state).
`.oc-tag` — outlined mono micro-tag for taxonomy (channels, types, tags).

### 8.7 Opportunity & AI cards
`.opp-card` — scored suggestion card: `.oc-topic` serif + `.oc-score` mono teal pill + one-line
`.oc-buyer` + `.oc-tags`. Canonical for anything ranked/scored (SEO keyword ideas, enrichment
suggestions, churn risks).
`.rec-card` — AI recommendation: `.rc-orb` 32px `--grad-ai` icon square with gold corner-dot
(`::after`) + `.rc-summary` + `.rc-tags`. **The `--grad-ai` orb is the platform-wide "AI said
this" marker** — reuse it for Copilot messages, AI-generated badges, agent avatars.

### 8.8 Components the mockup implies but doesn't show — build in this DNA

| Component | Spec (compose from tokens; no new colors) |
|---|---|
| **Buttons** | QuranlyAI §9 system with light-default adjustments: `.btn-primary` `--grad-brand` fill, white text, 13px/28px padding `--r-md`, glow shadow, hover `translateY(-2px) scale(1.02)`; `.btn-ghost` transparent, `.5px` teal border, `--teal-700` text (dark `--teal-300`); `.btn-gold` gold gradient, `#1A0E00` text, premium/upgrade only; `.btn-danger` = ghost with `--status-danger`; sizes: default 40px, `.btn-sm` 32px |
| **Inputs** | 40px, `--bg-card` fill, `.5px var(--line-strong)` border, `--r-sm`, 13.5px sans; focus: border `--teal-500` + `0 0 0 3px rgba(44,164,171,.15)` ring; labels 10px/600 uppercase `--ink-400` `.1em` (D-018); errors `--status-danger` 12px; native `<form>` per D-005. Auth forms use taller 46px inputs (§8.9) |
| **Select/menu/dropdown** | `--card-solid` (opaque), `--r-md`, `--shadow-lg`, `.5px var(--line)`; items 13.5px, hover `--row-hover` |
| **Tables** | plain `<table>` (D-005): header 11px uppercase `--ink-400` with `--label-track`, rows = `.data-row` styling (hairline top borders, `--row-hover`), numeric cells right-aligned mono, sticky header on long tables, no zebra stripes ever |
| **Kanban card** (M11/M18, SortableJS) | `--card-solid`, `--r-lg`, `--shadow-sm`, `.5px var(--line)`; serif title, mono value, `.pill` badges; drag state: `--shadow-lg` + 2° tilt; column = glass-light well with `.ps-label`-style header |
| **Drawer** (deal/contact/settings) | right sheet 480–640px, glass deep, `--r-2xl` left corners, header with serif title + close `.iconbtn`; tabs = 12.5px/600 with 2px `--teal-500` underline on active |
| **Modal** | centered, `--card-solid` or glass deep, `--r-2xl`, `--shadow-lg`, max-width 560px; scrim `rgba(4,9,10,.55)` + `blur(4px)` |
| **Toast** | `--card-solid`, `--r-lg`, `--shadow-lg`, left 3px status bar, mono timestamp; bottom-right stack |
| **Tabs** | text tabs, 13px/600, `--ink-400` → active `--ink-900` + 2px `--teal-500` underline |
| **Empty state** | centered in panel: 40px icon square (teal tint), serif 17px title, 13px `--ink-400` line, one `.btn-primary`. Honest copy ("No contacts yet — import a CSV or create one"), never fake preview data |
| **Skeleton** | `--bg-card` blocks, `--r-sm`, opacity pulse (1.6s) — pulse opacity, don't shimmer-sweep |
| **kbd** | mono 11px, `.5px var(--line-strong)` border, 6px radius, 1×6px padding |
| **Progress bar** | 6px `--r-pill` track `rgba(0,105,110,.10)`, `--grad-brand` fill; usage meters (M03) switch fill to `--status-warning`/`--status-danger` at 80%/95% |
| **Charts** (Chart.js, D-005) | line/bar: `--teal-500` primary, `--gold-500` comparison, `--status-*` for state series; gridlines `var(--line)`; axis labels mono 10px `--ink-400`; tooltips `--card-solid`; no 3D, no rainbow palettes |

### 8.9 Auth & identity components (M00 — reuse for M37 portal login, M42 white-label login)

Built and shipped in M00 (`styles/m00-auth.css`). These are the canonical auth surface; compose them
before inventing login/settings UI elsewhere.

| Component | Spec |
|---|---|
| **`.auth-stage` / `.auth-card`** | Vertically-centered stage → glass-heavy card, `max-width 452px`, `--r-2xl`, 38px padding. The single card holds one flow (login/signup/reset/…) |
| **`.auth-crest`** | 56px `--grad-ai` rounded square with an inset rotated hairline diamond — the identity mark. (The `--grad-ai` = "AI/identity" marker, consistent with `.rc-orb` §8.7) |
| **`.seg`** | Segmented control (Sign in / Create account): pill track, active tab = `--card-solid` + `--shadow-sm`, teal ink |
| **`.oauth-btn`** | Full-width 46px provider button, `--card-solid`, `.5px` border, inline brand SVG (raw hex allowed inside `<svg>` only). Hover lifts 1px |
| **`.divider`** | "or with email" hairline rule with centered 10px uppercase label (D-018) |
| **Auth fields** | `.auth-card .field` — 46px inputs (taller than the 40px base for touch), 10px uppercase labels, `.input-wrap` + `.peek` show/hide toggle |
| **`.pw-meter`** | 4-segment strength bar; `data-score` 1–4 fills danger→warning→gold→success. Calm color fill, no sweep |
| **`.otp-group`** | 6 auto-advancing single-char inputs, mono 20px (D-018), 52px tall (46/18 on ≤420px). Reuse for any code-entry (2FA, email OTP) |
| **`.inline-msg`** | Form feedback banner in `.error/.success/.info/.gold` — maps envelope error codes and success states to human copy (Gate 5 error/success states) |
| **`.qr-panel` / `.backup-grid`** | 2FA enrolment: QR box + secret string; backup codes grid (mono) |
| **`.set-card` / `.settings-grid`** | Settings page panels (password, 2FA, sessions, danger). `.sc-head` (title + `.sc-sub` + status pill) → `.sc-body` |
| **`.sess-row`** | Device/session row: icon square + device meta (serif name + mono sub) + `current` pill or Revoke button. Empty state = `.empty-state` |
| **`.avatar`** | 64px `--grad-brand` circle, initials fallback or `<img>` |
| **`.g-card` gallery** | Screen-index cards (used by the M00 mockup/overview) — icon + title + blurb + state pills + mono route |
| **Mockup / preview-state pattern** | When no backend is connected, the auth app renders full mockups with a `.mock-note` (gold) preview-state switcher cycling default/loading/error/success — the honest way to show every Gate-5 state without a live backend or fabricated data |

The auth app is **hash-routed** (`#/login`, `#/signup`, `#/2fa`, `#/settings/security`, …); a
standalone `mockup.html` (all CSS inlined) is the portable design-review artifact.

---

## 9. ICONOGRAPHY

Lucide-style inline SVG: `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
stroke-linecap="round" stroke-linejoin="round"`. Delivered by the mockup's `icons.js` pattern —
a path dictionary + `svg(name,size)` helper + `[data-ico]` auto-hydration. Extract to
`/assets/js/icons.js` and grow the dictionary there only (one source of truth). Standard sizes:
14 (inline links) / 16 (rows, chips) / 17 (nav) / 18 (icon buttons, panel icons).
Icon squares (`.kpi-ico`, `.ph-ico`, `.ni-ico`) are the standard way an icon appears on a card:
teal-tint square, `--r-sm`. Gold gradient square = attention. `--grad-ai` square = AI.

---

## 10. MOTION SYSTEM

| Keyframe | Effect | On |
|---|---|---|
| `gridDrift` | 48px diagonal drift / 60s | `.bg-grid` |
| `orbFloat` | organic ellipse drift | `.orb` |
| `starTwinkle` | opacity/scale twinkle | `.star` |
| `blink` | eyebrow dot pulse 2s | `.eyebrow::before` |
| `pulse` | opacity pulse 2s | `.jobs-chip .dot`, live/online dots |

**Reveal system** — the bulletproof `js-ready` pattern, verbatim from the law:
CSS: `.reveal` transitions opacity/transform `.65s var(--ease-reverent)`; hidden state
(`opacity:0; translateY(22px)`) applies **only** under `.js-ready`; `.in` forces visible with
`!important`. Stagger via `.reveal-d1…d3` (.06s steps on dashboards — tighter than the landing
page's .08s). JS: add `js-ready` class → IntersectionObserver `threshold: 0`,
`rootMargin: '0px 0px -40px 0px'` → elements already in viewport get `.in` immediately →
`prefers-reduced-motion` short-circuits everything to visible.
Dashboards reveal **sections, not individual cards** — a KPI strip reveals as one unit.

Micro-interactions: `.cc-viewall` gap widens on hover; `.ni-go` arrow translates 2px; icon
buttons tint to `--teal-700`. Durations: chrome .18–.2s `--ease-premium`; cards .3–.35s
`--ease-reverent`. Nothing animates longer than .65s except ambient atmosphere.

---

## 11. THEME BOOT & TOGGLE

Inline in `<head>` **before first paint** on every page (from the mockup, with the D-012 caveat):

```html
<script>(function(){try{var t=localStorage.getItem(THEME_KEY);
document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){}})();</script>
```

Default resolves to **light** (D-007). `THEME_KEY` is `'islamicinfo-theme'` in the mockup —
**D-012 OPEN**, do not treat as locked; keep it a single const in `theme.js`. Toggle = `.iconbtn`
in topbar swapping moon/sun, persisting the choice.

---

## 12. FILE LAYOUT (front-end assets)

```
/assets/css/tokens.css        ← the extraction (this release's artifact)
/assets/css/base.css          ← reset, element defaults, .mono/.num/.muted, atmosphere CSS
/assets/css/components.css    ← §8 library, extracted 1:1 from the mockup
/assets/js/icons.js           ← path dictionary + svg() + [data-ico] hydration
/assets/js/theme.js           ← THEME_KEY const, boot + toggle
/assets/js/atmosphere.js      ← star generator (reduced-motion aware)
/assets/js/reveal.js          ← js-ready reveal system
```

Per-screen CSS/JS may exist but must contain **zero raw hex** and **zero token re-declarations**.

---

## 13. FORBIDDEN LIST — INSTANT FAIL

| Forbidden | Reason |
|---|---|
| Any `::after`/`::before` **shimmer sweep animation** on cards | Destroys the aesthetic — glow shadows only |
| Raw hex inline (except SVG `<defs>`) | Breaks the theme system |
| Theme block merged inside `:root {}` | Breaks dark mode |
| A 4th font family, or Amiri | D-014: three fonts — Cormorant / Baskerville / Shippori Mincho |
| New colors outside `tokens.css` | Token law |
| Numbers set in the body serif | Data font owns numbers (§3) |
| `1px` borders on cards/panels/rows | Hairline law — `.5px` |
| `opacity:0` on content without the `js-ready` guard | Content invisible if JS fails |
| IntersectionObserver `threshold > 0` | In-viewport cards may never reveal |
| Glass (backdrop-filter) behind long tables, editors, or reading text | Legibility first |
| Nested backdrop-filters | Performance + rendering artifacts |
| Fabricated numbers in live UI / missing "sample data" label in mockups | Honesty rule |
| Urgency copy in platform chrome | Brand tone |
| Zebra-striped tables, 3D charts, rainbow chart palettes | Not this design language |
| More than one `.kpi-featured` (gold KPI) per strip | Gold = scarce by definition |
| `AIMindShare`, `AImindshare`, `Aimindshare` casings | Always **AiMindShare** |

---

## 14. PRE-BUILD CHECKLIST — every new screen

- [ ] `<html lang="en" data-theme="light">` — light default (D-007)
- [ ] Theme boot script inline in `<head>` before first paint (THEME_KEY const, D-012 noted)
- [ ] Fonts: exact 3-font import string, preconnects first (§3)
- [ ] `tokens.css` + `base.css` + `components.css` linked — no per-page token redeclaration
- [ ] Atmosphere layer present (app pages) / radial-wash-only (public pages)
- [ ] App shell grid: rail (nav groups per doc 8) + topbar (search ⌘K, jobs-chip, theme, avatar)
- [ ] `.page-head`: eyebrow with module ID (`Mnn`) + gradient-`<em>` H1 + sub + freshness line
- [ ] All numbers in `--font-mono`; all enums as `.pill` variants
- [ ] Glass zone correct: chrome/status/gold-attention vs light/none on work surfaces (§5)
- [ ] Hover states per §5 table — no shimmer, rows don't lift
- [ ] Reveal: `js-ready` pattern, `threshold: 0`, sections not cards, reduced-motion respected
- [ ] Empty states honest; loading = opacity-pulse skeletons
- [ ] Hairlines `.5px`; radii from the token set; card radius ≥ `--r-xl`
- [ ] Responsive: 1100px icon-rail, 960px single column panels, 760px mobile
- [ ] Zero raw hex outside SVG `<defs>`; zero new tokens without a DECISIONS entry
- [ ] Dark mode toggled and verified — both themes ship with every screen

---

*AIMINDSHARE-DESIGN v1.0 · Doc 7 of 14 · Law: QURANLYAI_DESIGN.md · Reference:
publishlyai-command-center.html · Bound by DECISIONS D-004, D-006, D-007, D-014, D-018 (D-008 superseded; D-012 open).*
