# Sourdough Helper

An installable, offline-first PWA for baking sourdough: starter feeding ratios
with explanations, schedules generated forwards from a feed or backwards from a
bake time, timers that survive a locked phone, and a recipe calculator in
baker's percentages.

No backend, no accounts, no network calls. Everything is computed on-device and
kept in `localStorage`.

## Getting started

```bash
npm install
npm run icons     # generates the PWA icon set into public/ (already committed)
npm run dev       # http://localhost:5173, bound to 0.0.0.0 for phone testing
```

To try it on your phone while developing, open the LAN address Vite prints. Note
that installing to the home screen and enabling notifications both require a
secure context — that means `localhost` or real HTTPS, not a bare LAN IP.

```bash
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/ locally
npm test          # run the suite once
npm run test:watch
npm run check     # typecheck + tests, what to run before pushing
```

## Tests

134 tests over the logic in `src/lib`, run with Vitest. There are no component
tests: the pages are thin, and everything that can be quietly wrong — the
schedule engine, baker's percentages, temperature scaling, the timer store — is
a pure function that can be tested directly.

They are written against behaviour rather than implementation, and several are
explicit regression tests for bugs found by hand, each carrying a comment
saying what broke. That set was verified by reintroducing each bug and checking
the suite went red:

| Reintroduced bug | Tests that fail |
| --- | --- |
| Same-day bake loses its final proof | 3 |
| Timer labels read "— done" while running | 2 |
| Preheat appended instead of overlapping | 3 |
| Mid-bake adjustments ignored | 7 |
| Re-arming wipes manual timers | 2 |
| Temperature scaling applied to the oven | 1 |
| Recipe decoupled from the schedule again | 5 |

A test that cannot fail is worth nothing, so it is worth re-running that check
when adding tests to this suite.

## Deploying

The app is configured for a **domain root** (`base: '/'`, service-worker scope
`/`). Deploy `dist/` as static files anywhere:

- **Netlify**: build `npm run build`, publish `dist`
- **Vercel**: framework preset Vite, output `dist`
- **Any static host**: upload `dist/`, and make sure unknown paths fall back to
  `index.html`

If you ever move it to a subpath (GitHub Pages, say), change `base` in
`vite.config.ts` and `start_url`/`scope` in the manifest to match.

## Layout

```
src/
  lib/
    ratios.ts       Feeding ratios, peak times, and what each one is for
    schedule.ts     Step chain → timeline; forward and backward planning
    recipe.ts       Baker's percentages, including levain flour and water
    temperature.ts  Q10 fermentation scaling, unit conversion
    inoculation.ts  How levain percentage shifts fermentation time
    bake.ts         A bake in progress: pinned start + per-step adjustments
    timers.ts       Timer store, persisted as absolute timestamps
    notify.ts       Notifications, chime, vibration, wake lock
    theme.ts        Palette metadata; applies data-palette / data-theme
    prefs.ts        Shared store for palette, light/dark mode, temperature unit
    format.ts       Time, duration, and countdown formatting
  pages/            Starter, Plan, Timers, Method
  components/       Shared controls, timer card, settings sheet
scripts/
  gen-icons.mjs     Dependency-free PNG encoder that draws the icon set
```

## Theming

Three palettes — **Slate** (cool greys and blue, the default), **Crust** (warm
cream and terracotta) and **Sage** (soft greens) — each with a light and a dark
set, and an Automatic / Light / Dark switch. All of it is in the ⚙ sheet in the
top bar, along with the °F / °C toggle.

The colour work is entirely in CSS. A palette declares its values as `--l-*`
and `--d-*` custom properties under a `[data-palette="…"]` selector, and one
shared mapping block resolves those into the `--bg` / `--ink` / `--accent`
tokens every other rule consumes. `src/lib/theme.ts` therefore only sets two
attributes on `<html>`; no component knows a colour value.

Two things fall out of keying the mapping off `[data-palette]` rather than
`:root`:

- Any element can carry `data-palette` + `data-theme` and re-map for its own
  subtree. The swatches in the settings sheet use this to preview each palette
  in its real colours, so there is no second copy of the palette in JS to drift.
- Explicit choices beat the system preference in both directions, because
  `[data-theme="dark"]` and `[data-theme="light"]` blocks come after the
  `prefers-color-scheme` media query.

An inline script in `index.html` applies the saved theme before first paint.
Without it the app renders one frame in the default palette and then snaps to
the saved one — a white flash for anyone using a dark theme. It duplicates a
few lines of `prefs.ts` on purpose, since it has to run before any module loads.

The installed icon and the manifest's launch colours cannot follow the in-app
palette, so the icon deliberately uses neither: a deep neutral ground that sits
comfortably beside all three accents, with a warm cream loaf.

## Notes on the domain logic

A few decisions worth knowing about, since they are the difference between a
schedule that works and one that lies to you.

**Everything is authored at 24 °C and scaled from there.** `fermentFactor`
applies the Q10 rule — fermentation rate roughly doubles per 10 °C — to the
levain build, bulk, bench rest, and room-temperature final proof. Bakes,
preheats, cooling, and the cold retard are not scaled, because an oven and a
fridge do not care how warm your kitchen is. The factor is clamped to
0.35×–3.5× so a silly temperature cannot produce a forty-hour bulk.

**Forward and backward planning are the same code.** The step chain is laid out
on a relative timeline starting at zero, and then shifted so the one moment you
actually know — "I am feeding my starter now", "I want it out of the oven at
8am" — lands where you said. That is the whole trick, and it means there is only
one timeline implementation to get right.

**The preheat overlaps the step before it.** It is marked `overlapsPrevious`, so
it ends when the cold retard ends rather than being appended after it. The oven
is therefore hot at the moment the dough leaves the fridge, and lengthening the
preheat does not push your bake time back.

**Setting the cold retard to zero swaps in a room-temperature final proof**
rather than deleting the proof entirely. A same-day loaf still has to prove
after shaping, and an earlier version of this app happily produced a schedule
that went straight from shaping to the oven.

**Baker's percentages are relative to total flour, including levain flour.**
So 1000 g flour at 75% hydration with a 20% 100%-hydration levain means you
weigh out 900 g flour and 650 g water, because the levain already brought 100 g
of each. This is why "75% hydration" means the same thing regardless of how big
your levain is.

**The recipe drives the schedule.** How much levain you use changes how long
the dough takes, so `buildSchedule` takes `levainPct` and shifts the bulk and
the room-temperature final proof by it. The model is a population one, not a
fudge factor: yeast grows exponentially, so halving the levain costs exactly
one doubling — about 90 minutes at 24 °C — wherever you halve from.

    minutes = base + 90 × log2(20 / levainPct)

A naive "double the levain, halve the time" rule would predict a 2.5 hour bulk
at 40% instead of 3.5, which is wrong enough to ruin a loaf. The shift is
computed at 24 °C and the temperature factor applied afterwards, because a
generation is itself shorter in a warm kitchen.

It does not touch the levain build — that speed comes from the feeding ratio,
not from how much of the levain ends up in the dough — nor the bench rest,
which is dough relaxing rather than rising, nor anything in the fridge or the
oven. Hydration is deliberately not modelled: wetter dough does ferment
slightly faster, but the effect is small next to temperature and inoculation,
and a coefficient invented for it would add false precision rather than
accuracy.

**Planning and baking need different anchors.** While planning you work
backwards from a target and the start time falls out of it. Once the dough is
in the bowl the start is a fact and the *finish* is what moves. Conflating the
two was a real bug: extending a bulk on a backward-anchored plan held the bake
time fixed and slid the start an hour earlier, into the past. Starting a bake
therefore pins `startedAt` and rebuilds the schedule forward from it, so
adjustments push the finish later — which is what actually happens in a
kitchen. See `src/lib/bake.ts`.

**Mid-bake adjustments are data, not a mutated schedule.** An `ActiveBake`
holds a map of extra minutes per step; `buildSchedule` applies them after
temperature scaling, since they record an observation about this dough rather
than anything the model could predict. The schedule stays fully derived, so
adjustments compose, survive a reload, and can be reasoned about one at a time.

**Only waits get timers.** Hands-on steps like shaping are named in the `Next:`
line of the preceding alert instead of getting their own timer, which would fire
at the same moment and say something meaningless like "Final shape — done".

**Re-arming never touches a timer you set yourself.** Schedule timers carry
`source: 'bake'`; `replaceBakeTimers` swaps only those. Adjusting a running
bake re-times the plan's alarms every time, and it would be hostile for that to
silently delete the "check the oven stone" timer you added five minutes ago.

**Schedule timers are views of a step, not independent timers.** They get
"Done early" and "+15m", which move the *bake*; the ordinary per-timer controls
are hidden, because editing one directly would desync it from the schedule and
be silently undone by the next re-arm. Only the step currently under way is
actionable — offering it on later steps let you collapse the entire bulk to
nothing while still mixing. Folds get no controls at all: they alert at their
start, and being late to one moves nothing downstream.

**Anything read or written from more than one place is a store**, not
`usePersisted`. Two components calling `usePersisted` with the same key get two
independent copies that both write to localStorage and neither hears the other
— the cause of both the feeding-ratio and kitchen-temperature bugs. `prefs`,
`timers`, `planStore` and `bakeStore` are all shared stores; only genuinely
page-local state uses `usePersisted`. Re-arming a bake lives in `App` for the
same reason: one route is mounted at a time, and steps are usually marked done
from the Timers tab while the Plan tab is unmounted.

**Temperatures are stored in Celsius and displayed in the chosen unit.** The
unit is a single shared preference, so the fermentation maths never has to know
about it. Fixed appliance temperatures — oven, doneness — are written with both
units, since they are reference values rather than anything the app scales.

## How the timers behave

Timers store the absolute moment they are due, never a counted-down remainder.
Lock the phone, kill the browser, come back six hours later: the remaining time
is still right, and anything that came due while you were away is shown as
overdue with how late it is.

Alerts are best-effort, and the app says so on the Timers tab rather than
pretending otherwise:

| App state | What happens |
| --- | --- |
| Open | Chime, vibration, on-screen alert |
| Backgrounded but alive | System notification, usually within a minute |
| Fully closed | Nothing fires; reopening reports what came due and when |

Waking a fully-closed app needs Web Push, which needs a server. There isn't one
by design. For an overnight cold retard, set a normal phone alarm as well.

On iOS, notifications only work once the app has been added to the home screen;
the Timers tab detects this and says so.
