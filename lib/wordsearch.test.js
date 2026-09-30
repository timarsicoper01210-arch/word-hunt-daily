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
