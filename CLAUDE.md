# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Open Translate is a VSCode extension (TypeScript) that translates the user's selected text and shows the result in a hover popup. Translation is delegated to Google's free, key-less `translate_a/single` endpoint (`translate.googleapis.com` and equivalent mirrors) — there is no local translation logic.

## Commands

- `npm run compile` — compile `src/` → `out/` with `tsc` (the extension's `main` is `./out/extension.js`).
- `npm run watch` — incremental compile on change.
- `npm run lint` — ESLint over `src` (`.ts` only).
- `npm test` — runs `vscode-test`, which launches a headless VSCode and executes compiled tests in `out/test/**/*.test.js`. The `pretest` hook runs `compile` + `lint` first, so `npm test` is the full gate.
- Run a single test: there is no per-test npm script. Either temporarily switch a Mocha `test(...)` to `test.only(...)` (suite uses Mocha TDD style), or run the extension's "Extension Tests" launch config from `.vscode/launch.json` in the VSCode debugger.
- Manual debugging: press F5 in VSCode to open an Extension Development Host with the extension loaded.

Tests run against **compiled** JS in `out/`, not `src/` — always compile before running tests (the `pretest` hook handles this for `npm test`).

## Architecture

Activation (`extension.ts`, on `onStartupFinished`) wires two things into `context.subscriptions`:

1. A `HoverProvider` registered for all `file`-scheme documents.
2. The `open-translate.setTargetLanguage` command.

Request flow on hover (`hoverProvider.ts` → `api.ts`):
- `TranslateHoverProvider.provideHover` only acts when the hover position is inside the **active editor's current selection** (`isSelectionMatch`). It rejects empty selections and anything ≥ `CHAR_LIMIT` (2000 chars).
- It caches the last selection/translation pair (`beforeSelectedText` / `beforeTranslatedText`) to avoid re-translating identical selections.
- `api.translateText` performs **endpoint failover**: it builds an ordered candidate list (last-known-working URL → configured `apiUrl` → `fallbackApiUrls`), issues a `GET` to each `translate_a/single?client=gtx&sl=auto&tl=<lang>&dt=t&q=<text>` in turn (10s `AbortController` timeout), and returns the first valid result. The Google response is an array whose first element holds the translated segments (`[[ [segmentText, sourceText, ...], ... ], ...]`); `requestTranslation` joins every `segment[0]` so multi-sentence selections come back whole. A response is "valid" only if it is HTTP-ok and yields a non-empty joined translation. The first working endpoint is cached for the session and persisted into `apiUrl` (Global) as the new default. If every candidate fails, it throws a message directing the user to set a custom URL; `hoverProvider` renders thrown errors into the hover as `**Translate Error:**`.

The `setTargetLanguage` command (`commands.ts`) shows a QuickPick and writes the choice to `ConfigurationTarget.Global`.

`enum.ts` holds `COMMAND_ID = 'open-translate'`, the config-section / command prefix used throughout. `types.ts` describes the Google `translate_a/single` response shape (`GoogleTranslateResponse` / `GoogleTranslateSegment`).

## Configuration

Contributed settings live under the `open-translate` section in `package.json`:
- `open-translate.targetLanguage` (default `tr`) — large language `enum`.
- `open-translate.apiUrl` (default `https://translate.googleapis.com/translate_a/single`) — **free-text** string; the preferred endpoint, auto-overwritten with the working one on failover.
- `open-translate.fallbackApiUrls` (array, defaults to the three Google `translate_a/single` hosts: `translate.googleapis.com`, `clients5.google.com`, `translate.google.com`) — tried in order when `apiUrl` fails. Any custom URL must speak the same Google response format.

All config reads go through `Enums.COMMAND_ID` (`'open-translate'`). When adding settings, keep the config section, the `package.json` key, and `Enums.COMMAND_ID` consistent — `api.ts` and `hoverProvider.ts` read config per-call (not at module load), so changes take effect without an extension-host reload.

**Known remaining bug (out of scope so far):** `commands.ts` `setTargetLanguageCommand` reads `open-translate.targetLanguages` (plural), which `package.json` does not declare — so the "Set Target Language" QuickPick is empty. To fix, source the list from the `targetLanguage` enum in `packageJSON.contributes.configuration`.

## Conventions

- Source modules import sibling files with explicit `.js` extensions (e.g. `./api.js`) — required by the `Node16` module resolution in `tsconfig.json`. Keep this when adding imports.
- `strict` TypeScript is on; target/lib is ES2022.
