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
