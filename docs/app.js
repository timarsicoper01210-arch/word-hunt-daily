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
