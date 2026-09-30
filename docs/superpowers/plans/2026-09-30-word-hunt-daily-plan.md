# Word Hunt Daily Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free daily word-search puzzle web app, deployed via GitHub Pages, regenerated every day by a GitHub Actions cron workflow — no store accounts, no local dependency.

**Architecture:** A pure-logic module (ported verbatim from `game-factory`) generates a deterministic, date-seeded puzzle. A Node script writes it to `docs/data/puzzle.json`. A vanilla-JS static page reads that file and renders the playable grid. A GitHub Actions workflow runs the generator daily, commits the new puzzle, and pushes — GitHub Pages redeploys automatically from `/docs` on `main`.

**Tech Stack:** Node.js (generator + tests), Jest 30, vanilla HTML/CSS/JS (no framework), GitHub Actions, GitHub Pages.

**Spec:** `/Users/timarsicoper/Projects/word-hunt-daily/docs/superpowers/specs/2026-09-30-word-hunt-daily-design.md`

## Global Constraints

- No store accounts of any kind — the entire pipeline must work with only a GitHub account, which already exists and is authenticated (`gh auth status` confirmed, `repo` + `workflow` scopes).
- The generator must never write a broken/empty puzzle: throw rather than commit if fewer than half the requested words could be placed (same rule as `game-factory`).
- If the daily workflow fails for any reason, yesterday's puzzle must keep serving — never leave the page broken or blank.
- Puzzle generation must be deterministic for a given date (same seed rule as `game-factory`'s `wordsearch.js`).

## Review Focus

- **The service worker must not permanently cache `data/puzzle.json`**: the existing pattern in `access-guide-app/web/sw.js` is cache-first for every GET request, which would serve the first day's puzzle forever to a returning visitor. `puzzle.json` needs network-first (or no-cache) handling specifically — owned by Task 3.
- **A word longer than the grid dimension, mixed with usable words**: `generateGrid` must skip only that word — already covered by the 15 ported tests in Task 1, re-verify they still pass unmodified.
- **Fewer than half the requested words placeable**: `generateDailyPuzzle` must throw rather than write a broken/near-empty puzzle — owned by Task 2, new test (this exact scenario isn't automatically covered by the ported tests, which test `generateGrid` in isolation, not the day-level orchestration).
- **The workflow runs on a day where `docs/data/puzzle.json` is unchanged** (e.g., manually re-triggered twice the same day): must not fail on "nothing to commit" — owned by Task 4 (workflow step guards the commit).
- **A visitor loads the page before `puzzle.json` has ever been generated** (fresh clone, before the first Actions run): `app.js`'s fetch of `data/puzzle.json` must fail gracefully with a visible message, not a blank white page — owned by Task 3.

---

## Task 1: Port the word-search logic and its tests

**Files:**
- Create: `lib/wordsearch.js`
- Test: `lib/wordsearch.test.js`
- Create: `package.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: `generateGrid({ words, size, seed, directions }) -> { grid, placements }`, `checkSelection(placements, selectionPath) -> string | null`, `isComplete(foundWords, placements) -> boolean`, `mulberry32(seedInt) -> () => number`, `hashSeed(str) -> int` — consumed by Task 2 and Task 3.

- [x] **Step 1: Write `package.json`**

```json
{
  "name": "word-hunt-daily",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "generate": "node scripts/generate-daily-puzzle.js"
  },
  "devDependencies": {
    "jest": "30.5.2"
  }
}
```

- [x] **Step 2: Write `.gitignore`**

```
node_modules/
```

- [x] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [x] **Step 4: Write `lib/wordsearch.js`** (ported verbatim from `~/Projects/game-factory/templates/word-search/lib/wordsearch.js`)

```javascript
const DIRECTION_VECTORS = {
  H: [0, 1],
  V: [1, 0],
  D: [1, 1],
  HR: [0, -1],
  VR: [-1, 0],
  DR: [-1, -1],
};

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function tryPlaceWord(grid, word, size, directions, rand, maxAttempts = 200) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const dirKey = directions[Math.floor(rand() * directions.length)];
    const [dr, dc] = DIRECTION_VECTORS[dirKey];
    const startRow = Math.floor(rand() * size);
    const startCol = Math.floor(rand() * size);
    const endRow = startRow + dr * (word.length - 1);
    const endCol = startCol + dc * (word.length - 1);
    if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;

    const path = [];
    let fits = true;
    for (let i = 0; i < word.length; i++) {
      const r = startRow + dr * i;
      const c = startCol + dc * i;
      const existing = grid[r][c];
      if (existing !== null && existing !== word[i]) {
        fits = false;
        break;
      }
      path.push({ row: r, col: c });
    }
    if (!fits) continue;

    path.forEach((p, i) => {
      grid[p.row][p.col] = word[i];
    });
    return path;
  }
  return null;
}

function generateGrid({ words, size, seed, directions = ['H', 'V'] }) {
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('generateGrid requires at least one word');
  }
  if (!Number.isInteger(size) || size < 3) {
    throw new Error('generateGrid requires size >= 3');
  }

  const rand = mulberry32(hashSeed(seed));
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const placements = [];

  const candidates = [...words]
    .map((w) => w.toUpperCase())
    .filter((w) => w.length <= size)
    .sort((a, b) => b.length - a.length);

  for (const word of candidates) {
    const path = tryPlaceWord(grid, word, size, directions, rand);
    if (path) placements.push({ word, path });
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === null) {
        grid[r][c] = String.fromCharCode(65 + Math.floor(rand() * 26));
      }
    }
  }

  return { grid, placements };
}

function pathsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((cell, i) => cell.row === b[i].row && cell.col === b[i].col);
}

function cellsEqual(a, b) {
  return a.row === b.row && a.col === b.col;
}

function checkSelection(placements, selectionPath) {
  if (!selectionPath || selectionPath.length < 2) return null;
  const start = selectionPath[0];
  const end = selectionPath[selectionPath.length - 1];
  const match = placements.find((p) => {
    const pStart = p.path[0];
    const pEnd = p.path[p.path.length - 1];
    return (
      (cellsEqual(start, pStart) && cellsEqual(end, pEnd)) ||
      (cellsEqual(start, pEnd) && cellsEqual(end, pStart))
    );
  });
  return match ? match.word : null;
}

function isComplete(foundWords, placements) {
  return placements.every((p) => foundWords.includes(p.word));
}

module.exports = { generateGrid, mulberry32, hashSeed, checkSelection, isComplete };
```

Note: `pathsEqual` is kept even though `checkSelection` now uses endpoint matching
(`cellsEqual`) rather than full-path matching — it's unused dead weight from the
original file. Delete it; it was never exported and nothing in this port calls it.

- [x] **Step 5: Write `lib/wordsearch.test.js`** (ported verbatim from `~/Projects/game-factory/templates/word-search/lib/wordsearch.test.js`)

```javascript
const { generateGrid, mulberry32, hashSeed, checkSelection, isComplete } = require('./wordsearch');

test('mulberry32 is deterministic for the same seed', () => {
  const a = mulberry32(hashSeed('day-1'));
  const b = mulberry32(hashSeed('day-1'));
  expect(a()).toBe(b());
  expect(a()).toBe(b());
});

test('generateGrid places every word that fits the grid', () => {
  const { grid, placements } = generateGrid({
    words: ['CAT', 'DOG'],
    size: 6,
    seed: 'test-seed-1',
    directions: ['H', 'V'],
  });
  expect(grid).toHaveLength(6);
  expect(grid[0]).toHaveLength(6);
  expect(placements.map((p) => p.word).sort()).toEqual(['CAT', 'DOG']);
});

test('generateGrid is deterministic for the same seed', () => {
  const run = () => generateGrid({ words: ['CAT', 'DOG'], size: 6, seed: 'repeat-me', directions: ['H', 'V'] });
  const first = run();
  const second = run();
  expect(second.grid).toEqual(first.grid);
  expect(second.placements).toEqual(first.placements);
});

test('generateGrid skips a word longer than the grid but still places the rest', () => {
  const { placements } = generateGrid({
    words: ['CAT', 'ELEPHANTINE'],
    size: 5,
    seed: 'skip-long-word',
    directions: ['H', 'V'],
  });
  const words = placements.map((p) => p.word);
  expect(words).toContain('CAT');
  expect(words).not.toContain('ELEPHANTINE');
});

test('generateGrid fills unused cells with a letter, never null', () => {
  const { grid } = generateGrid({ words: ['CAT'], size: 5, seed: 'fill-test', directions: ['H'] });
  for (const row of grid) {
    for (const cell of row) {
      expect(typeof cell).toBe('string');
      expect(cell).toMatch(/^[A-Z]$/);
    }
  }
});

test('generateGrid throws on an empty word list', () => {
  expect(() => generateGrid({ words: [], size: 5, seed: 'x' })).toThrow();
});

test('generateGrid throws on a grid size below 3', () => {
  expect(() => generateGrid({ words: ['CAT'], size: 2, seed: 'x' })).toThrow();
});

const placements = [
  { word: 'CAT', path: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] },
  { word: 'DOG', path: [{ row: 0, col: 4 }, { row: 1, col: 4 }, { row: 2, col: 4 }] },
];

test('checkSelection matches a forward selection to its word', () => {
  expect(checkSelection(placements, placements[0].path)).toBe('CAT');
});

test('checkSelection matches a reversed selection to its word', () => {
  const reversed = [...placements[1].path].reverse();
  expect(checkSelection(placements, reversed)).toBe('DOG');
});

test('checkSelection returns null for a selection matching no placement', () => {
  const bogus = [{ row: 3, col: 3 }, { row: 3, col: 4 }];
  expect(checkSelection(placements, bogus)).toBeNull();
});

test('checkSelection matches on start/end endpoints even when intermediate touch points were not sampled', () => {
  const sparseSelection = [{ row: 0, col: 0 }, { row: 0, col: 2 }];
  expect(checkSelection(placements, sparseSelection)).toBe('CAT');
});

test('checkSelection does not match when the endpoints belong to different words', () => {
  const crossWord = [{ row: 0, col: 0 }, { row: 2, col: 4 }];
  expect(checkSelection(placements, crossWord)).toBeNull();
});

test('checkSelection returns null for a selection with fewer than two points', () => {
  expect(checkSelection(placements, [{ row: 0, col: 0 }])).toBeNull();
  expect(checkSelection(placements, [])).toBeNull();
});

test('isComplete is false until every placement is found', () => {
  expect(isComplete(['CAT'], placements)).toBe(false);
});

test('isComplete is true once every placement is found, in any order', () => {
  expect(isComplete(['DOG', 'CAT'], placements)).toBe(true);
});
```

- [x] **Step 6: Run tests to verify they pass**

Run: `npx jest`
Expected: PASS (16 tests)

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore lib/wordsearch.js lib/wordsearch.test.js
git commit -m "feat: port word-search generator and tests from game-factory"
```

---

## Task 2: Daily puzzle generator script

**Files:**
- Create: `data/word-bank.json`
- Create: `scripts/generate-daily-puzzle.js`
- Test: `scripts/generate-daily-puzzle.test.js`

**Interfaces:**
- Consumes: `generateGrid`, `mulberry32`, `hashSeed` from `../lib/wordsearch` (Task 1)
- Produces: `generateDailyPuzzle({ date, wordBank?, outputPath? }) -> { date, dir: outputPath, wordCount }`, writes a `puzzle.json` with shape `{ date, grid, solutionPlacements, words }` — consumed by Task 3 (the page reads this exact shape) and Task 4 (the workflow calls this script's CLI entrypoint).

- [x] **Step 1: Write `data/word-bank.json`**

```json
[
  "APPLE", "BEACH", "CLOUD", "DANCE", "EAGLE", "FOREST", "GARDEN", "HARBOR",
  "ISLAND", "JUNGLE", "KITTEN", "LEMON", "MELODY", "NOODLE", "OCEAN", "PENGUIN",
  "QUARTZ", "RIVER", "SUNSET", "TIGER", "UMBRELLA", "VOLCANO", "WINTER", "YELLOW",
  "ZEBRA", "BRIDGE", "CASTLE", "DESERT", "ENGINE", "FALCON", "GLACIER", "HORIZON",
  "IGLOO", "JACKET", "KAYAK", "LANTERN", "METEOR", "NECTAR", "ORCHID", "PUZZLE",
  "QUIVER", "ROCKET", "SPARROW", "TRUMPET", "URCHIN", "VELVET", "WALRUS", "XENON",
  "YOGURT", "ZEPHYR"
]
```

- [x] **Step 2: Write the failing tests**

```javascript
// scripts/generate-daily-puzzle.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateDailyPuzzle } = require('./generate-daily-puzzle');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('generateDailyPuzzle writes a valid puzzle.json for the given date', () => {
  const dir = tmpDir('whd-generate-');
  const outputPath = path.join(dir, 'puzzle.json');
  const result = generateDailyPuzzle({ date: '2026-09-30', outputPath });

  expect(result.date).toBe('2026-09-30');
  expect(fs.existsSync(outputPath)).toBe(true);

  const puzzle = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  expect(puzzle.date).toBe('2026-09-30');
  expect(puzzle.grid.length).toBeGreaterThan(0);
  expect(puzzle.solutionPlacements.length).toBe(result.wordCount);
  expect(puzzle.words).toEqual(puzzle.solutionPlacements.map((p) => p.word));
});

test('generateDailyPuzzle is deterministic for the same date', () => {
  const dirA = tmpDir('whd-generate-a-');
  const dirB = tmpDir('whd-generate-b-');
  generateDailyPuzzle({ date: '2026-09-30', outputPath: path.join(dirA, 'puzzle.json') });
  generateDailyPuzzle({ date: '2026-09-30', outputPath: path.join(dirB, 'puzzle.json') });

  const a = fs.readFileSync(path.join(dirA, 'puzzle.json'), 'utf8');
  const b = fs.readFileSync(path.join(dirB, 'puzzle.json'), 'utf8');
  expect(a).toEqual(b);
});

test('generateDailyPuzzle produces a different puzzle for a different date', () => {
  const dirA = tmpDir('whd-generate-c-');
  const dirB = tmpDir('whd-generate-d-');
  generateDailyPuzzle({ date: '2026-09-30', outputPath: path.join(dirA, 'puzzle.json') });
  generateDailyPuzzle({ date: '2026-10-01', outputPath: path.join(dirB, 'puzzle.json') });

  const a = fs.readFileSync(path.join(dirA, 'puzzle.json'), 'utf8');
  const b = fs.readFileSync(path.join(dirB, 'puzzle.json'), 'utf8');
  expect(a).not.toEqual(b);
});

test('generateDailyPuzzle throws when fewer than half the requested words could be placed', () => {
  const dir = tmpDir('whd-generate-fail-');
  const mixedBank = [
    'CAT', 'DOG', 'SUN',
    'SUPERCALIFRAGILISTICEXPIALIDOCIOUS',
    'ANTIDISESTABLISHMENTARIANISM',
    'INCOMPREHENSIBILITIES',
    'PNEUMONOULTRAMICROSCOPICSILICOVOLCANOCONIOSIS',
    'FLOCCINAUCINIHILIPILIFICATION',
  ];
  expect(() =>
    generateDailyPuzzle({ date: '2026-09-30', wordBank: mixedBank, outputPath: path.join(dir, 'puzzle.json') })
  ).toThrow();
});
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx jest scripts/generate-daily-puzzle.test.js`
Expected: FAIL with "Cannot find module './generate-daily-puzzle'"

- [x] **Step 4: Write the implementation**

```javascript
// scripts/generate-daily-puzzle.js
const fs = require('fs');
const path = require('path');
const { generateGrid, mulberry32, hashSeed } = require('../lib/wordsearch');

const DEFAULT_WORD_BANK_PATH = path.join(__dirname, '..', 'data', 'word-bank.json');
const DEFAULT_OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'data', 'puzzle.json');
const GRID_SIZE = 10;
const WORDS_PER_PUZZLE = 8;

function loadWordBank(bankPath = DEFAULT_WORD_BANK_PATH) {
  const words = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  if (!Array.isArray(words) || words.length < 10) {
    throw new Error(`Word bank at ${bankPath} must contain at least 10 words`);
  }
  return words;
}

function pickWords(wordBank, count, rand) {
  const pool = [...wordBank];
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function generateDailyPuzzle({ date, wordBank = null, outputPath = DEFAULT_OUTPUT_PATH } = {}) {
  const seed = date;
  const rand = mulberry32(hashSeed(seed));
  const bank = wordBank || loadWordBank();
  const words = pickWords(bank, WORDS_PER_PUZZLE, rand);
  const { grid, placements } = generateGrid({ words, size: GRID_SIZE, seed, directions: ['H', 'V', 'D'] });

  if (placements.length < Math.ceil(words.length / 2)) {
    throw new Error(
      `Only ${placements.length}/${words.length} words could be placed for ${date} (grid too small or word list unusable)`
    );
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      { date, grid, solutionPlacements: placements, words: placements.map((p) => p.word) },
      null,
      2
    )
  );

  return { date, dir: outputPath, wordCount: placements.length };
}

if (require.main === module) {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const result = generateDailyPuzzle({ date });
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { generateDailyPuzzle };
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx jest scripts/generate-daily-puzzle.test.js`
Expected: PASS (4 tests)

- [x] **Step 6: Commit**

```bash
git add data/word-bank.json scripts/generate-daily-puzzle.js scripts/generate-daily-puzzle.test.js
git commit -m "feat: add daily puzzle generator script"
```

---

## Task 3: Playable static page (PWA)

**Files:**
- Create: `docs/index.html`
- Create: `docs/app.js`
- Create: `docs/manifest.webmanifest`
- Create: `docs/icon.svg`
- Create: `docs/sw.js`
- Create: `docs/data/puzzle.json` (a fixture so the page is playable in a fresh clone, before the first Actions run)

**Interfaces:**
- Consumes: `docs/data/puzzle.json` shape `{ date, grid, solutionPlacements, words }`, fetched at runtime by `docs/app.js` — matches exactly what Task 2's `generateDailyPuzzle` writes. The selection-matching logic (start/end endpoint comparison) is reimplemented directly in `app.js` as plain JS — this page has no build step and cannot `require()` `lib/wordsearch.js`, so the small `checkSelection`/`isComplete` logic is duplicated here rather than pulled in via a bundler (no bundler is in scope for this plan — see spec's "hors scope").

No automated test for this task — DOM rendering and touch/mouse interaction require a real browser, same as the camera/GPS parts of `access-guide-app`. Verified manually (Step 6) before committing.

- [x] **Step 1: Write the fixture `docs/data/puzzle.json`**

```json
{
  "date": "2026-09-30",
  "grid": [
    ["C", "A", "T", "Q", "D"],
    ["Q", "Q", "Q", "Q", "O"],
    ["Q", "Q", "Q", "Q", "G"],
    ["Q", "Q", "Q", "Q", "Q"],
    ["Q", "Q", "Q", "Q", "Q"]
  ],
  "solutionPlacements": [
    { "word": "CAT", "path": [{ "row": 0, "col": 0 }, { "row": 0, "col": 1 }, { "row": 0, "col": 2 }] },
    { "word": "DOG", "path": [{ "row": 0, "col": 4 }, { "row": 1, "col": 4 }, { "row": 2, "col": 4 }] }
  ],
  "words": ["CAT", "DOG"]
}
```

- [x] **Step 2: Write `docs/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Word Hunt Daily</title>
  <link rel="manifest" href="manifest.webmanifest" />
  <link rel="icon" href="icon.svg" type="image/svg+xml" />
  <style>
    body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; padding-top: 32px; background: #f7f8fb; margin: 0; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    #status { margin: 16px 0; font-size: 16px; }
    #grid { display: inline-block; border: 1px solid #ccc; user-select: none; touch-action: none; }
    .row { display: flex; }
    .cell { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 0.5px solid #ddd; font-weight: 600; cursor: pointer; }
    .cell.selected { background: #bfdbfe; }
    #words { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; max-width: 320px; justify-content: center; }
    .word { font-weight: 600; }
    .word.found { color: #999; text-decoration: line-through; }
    noscript { margin-top: 32px; font-size: 18px; }
  </style>
</head>
<body>
  <h1>Word Hunt Daily</h1>
  <div id="status">Chargement du puzzle du jour...</div>
  <div id="grid"></div>
  <div id="words"></div>
  <noscript>Active JavaScript pour jouer.</noscript>
  <script src="app.js"></script>
</body>
</html>
```

- [x] **Step 3: Write `docs/app.js`**

```javascript
const CELL_SIZE = 32;

function cellsEqual(a, b) {
  return a.row === b.row && a.col === b.col;
}

function checkSelection(placements, selectionPath) {
  if (!selectionPath || selectionPath.length < 2) return null;
  const start = selectionPath[0];
  const end = selectionPath[selectionPath.length - 1];
  const match = placements.find((p) => {
    const pStart = p.path[0];
    const pEnd = p.path[p.path.length - 1];
    return (
      (cellsEqual(start, pStart) && cellsEqual(end, pEnd)) ||
      (cellsEqual(start, pEnd) && cellsEqual(end, pStart))
    );
  });
  return match ? match.word : null;
}

function isComplete(foundWords, placements) {
  return placements.every((p) => foundWords.includes(p.word));
}

async function loadPuzzle() {
  const statusEl = document.getElementById('status');
  try {
    const res = await fetch(`data/puzzle.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    statusEl.textContent = "Impossible de charger le puzzle du jour. Réessaie plus tard.";
    throw e;
  }
}

function renderGrid(puzzle, foundWords, selection) {
  const gridEl = document.getElementById('grid');
  gridEl.innerHTML = '';
  puzzle.grid.forEach((row, r) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';
    row.forEach((letter, c) => {
      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      if (selection.some((cell) => cellsEqual(cell, { row: r, col: c }))) {
        cellEl.classList.add('selected');
      }
      cellEl.textContent = letter;
      cellEl.dataset.row = r;
      cellEl.dataset.col = c;
      rowEl.appendChild(cellEl);
    });
    gridEl.appendChild(rowEl);
  });
}

function renderWords(puzzle, foundWords) {
  const wordsEl = document.getElementById('words');
  wordsEl.innerHTML = '';
  puzzle.words.forEach((word) => {
    const span = document.createElement('span');
    span.className = 'word' + (foundWords.includes(word) ? ' found' : '');
    span.textContent = word;
    wordsEl.appendChild(span);
  });
}

function renderStatus(puzzle, foundWords) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = isComplete(foundWords, puzzle.solutionPlacements)
    ? 'Résolu !'
    : `${foundWords.length} / ${puzzle.solutionPlacements.length} trouvés`;
}

loadPuzzle().then((puzzle) => {
  const foundWords = [];
  let selection = [];
  let dragging = false;

  const gridEl = document.getElementById('grid');

  function cellFromEvent(e) {
    const target = e.target.closest('.cell');
    if (!target) return null;
    return { row: Number(target.dataset.row), col: Number(target.dataset.col) };
  }

  function render() {
    renderGrid(puzzle, foundWords, selection);
    renderWords(puzzle, foundWords);
    renderStatus(puzzle, foundWords);
  }

  function startSelection(e) {
    const cell = cellFromEvent(e);
    if (!cell) return;
    dragging = true;
    selection = [cell];
    render();
  }

  function extendSelection(e) {
    if (!dragging) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    const last = selection[selection.length - 1];
    if (last && cellsEqual(last, cell)) return;
    selection.push(cell);
    render();
  }

  function endSelection() {
    if (!dragging) return;
    dragging = false;
    const match = checkSelection(puzzle.solutionPlacements, selection);
    if (match && !foundWords.includes(match)) foundWords.push(match);
    selection = [];
    render();
  }

  gridEl.addEventListener('mousedown', startSelection);
  gridEl.addEventListener('mousemove', extendSelection);
  window.addEventListener('mouseup', endSelection);
  gridEl.addEventListener('touchstart', (e) => { startSelection(e); e.preventDefault(); }, { passive: false });
  gridEl.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el) extendSelection({ target: el });
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', endSelection);

  render();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
```

- [x] **Step 4: Write `docs/manifest.webmanifest`**

```json
{
  "name": "Word Hunt Daily",
  "short_name": "Word Hunt",
  "description": "Un nouveau mots-mêlés chaque jour.",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#f7f8fb",
  "theme_color": "#1d4ed8",
  "lang": "fr",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [x] **Step 5: Write `docs/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="16" fill="#1d4ed8" />
  <text x="50" y="62" font-size="48" font-family="system-ui, sans-serif" font-weight="700" fill="#fff" text-anchor="middle">W</text>
</svg>
```

- [x] **Step 6: Write `docs/sw.js`**

```javascript
const CACHE_NAME = 'word-hunt-daily-v1';
const SHELL_FILES = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // puzzle.json changes daily — never serve it from the cache, or a
  // returning visitor would be stuck on the first day's puzzle forever.
  if (event.request.url.includes('/data/puzzle.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [x] **Step 7: Verify manually in a browser**

Run: `cd docs && python3 -m http.server 8123`, then open `http://localhost:8123/` in a browser.
Expected: the grid renders with the fixture puzzle (CAT/DOG), dragging from C to T (row 0, cols 0-2) marks CAT as found, dragging from D to G (col 4, rows 0-2) marks DOG as found, status shows "Résolu !" once both are found. Stop the server after verifying (`Ctrl+C`).

- [x] **Step 8: Commit**

```bash
git add docs/index.html docs/app.js docs/manifest.webmanifest docs/icon.svg docs/sw.js docs/data/puzzle.json
git commit -m "feat: add playable static PWA page"
```

---

## Task 4: GitHub Actions daily workflow and Pages deployment

**Files:**
- Create: `.github/workflows/daily-puzzle.yml`

**Interfaces:**
- Consumes: `scripts/generate-daily-puzzle.js`'s CLI entrypoint (Task 2) — invoked as `node scripts/generate-daily-puzzle.js` inside the workflow, writing to the default `docs/data/puzzle.json` path.

No automated test — this is CI configuration, verified by actually running it (Step 4).

- [x] **Step 1: Write `.github/workflows/daily-puzzle.yml`**

```yaml
name: Daily puzzle

on:
  schedule:
    - cron: '0 6 * * *'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: node scripts/generate-daily-puzzle.js
      - name: Commit and push if the puzzle changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/data/puzzle.json
          git diff --cached --quiet && echo "No change, skipping commit" || git commit -m "chore: daily puzzle for $(date -u +%Y-%m-%d)"
          git push
```

- [x] **Step 2: Create the GitHub repository and push**

Run:
```bash
cd ~/Projects/word-hunt-daily
gh repo create word-hunt-daily --public --source=. --remote=origin --push
```
Expected: repository created at `https://github.com/timarsicoper01210-arch/word-hunt-daily`, `main` pushed, `origin` remote set.

- [x] **Step 3: Enable GitHub Pages to serve from `/docs` on `main`**

Run:
```bash
gh api -X POST repos/timarsicoper01210-arch/word-hunt-daily/pages \
  -f "source[branch]=main" -f "source[path]=/docs"
```
Expected: JSON response describing the new Pages site, with a `"status"` field (typically `null` or `"building"` right after creation — GitHub takes a minute or two to actually build and serve it).

- [x] **Step 4: Trigger the workflow manually and verify it runs end to end**

Run: `gh workflow run daily-puzzle.yml`
Wait ~30s, then: `gh run list --workflow=daily-puzzle.yml --limit 1`
Expected: the run shows `completed` / `success`. If it fails, run `gh run view --log` on that run's id and fix before relying on the schedule.

- [x] **Step 5: Verify the live site**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://timarsicoper01210-arch.github.io/word-hunt-daily/`
Expected: `200` (may take a few minutes after Step 3 for Pages to finish its first build — retry if it's still `404`).

- [x] **Step 6: Commit the workflow file**

```bash
git add .github/workflows/daily-puzzle.yml
git commit -m "feat: add daily GitHub Actions workflow"
git push
```
