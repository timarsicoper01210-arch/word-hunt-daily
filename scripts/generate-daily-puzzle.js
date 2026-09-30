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
