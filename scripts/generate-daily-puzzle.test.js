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
