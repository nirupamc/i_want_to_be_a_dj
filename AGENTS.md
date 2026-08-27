# AGENTS.md

Project: browser-based DJ app inspired by the Pioneer DDJ-FLX4.
Source of truth for hardware: `ref/DDJ_FLX4_DRI1804A_manual.pdf`.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck + bundle
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — Vitest (jsdom + RTL)

## Conventions

- **Never put AudioBuffer/AudioNode/AudioContext in React state.** Audio
  objects live in the `src/audio` singleton; the DJ Engine (`src/engine`) owns
  transport state as shallow JSON; React components are dumb renderers that
  dispatch actions via `engine.dispatch(action)`.
- The `DeckTransport` interface (`src/types.ts`) is the only thing the mixer and
  DJ Engine depend on — swap internals freely.
- Equal-power crossfade: `gainA = cos(x*π/2)`, `gainB = sin(x*π/2)`.
- All gain changes ramp over 20 ms to avoid clicks.
- Audio is created lazily on first user gesture and `resume()`d.

## Scope gating

See `docs/MILESTONES.md`. A control listed in a milestone's scope must be
wired and tested; every control NOT listed must be absent or disabled.