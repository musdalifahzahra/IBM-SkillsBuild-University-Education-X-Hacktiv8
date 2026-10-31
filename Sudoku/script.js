/* ============================================================
   script.js — Sudoku Game
   Vanilla JavaScript | No external libraries | No backend
   ============================================================

   Arsitektur Modul:
   ─────────────────
   1.  KONSTANTA & KONFIGURASI
   2.  STATE GLOBAL
   3.  SUDOKU ENGINE  (generator, solver, validator)
   4.  RENDER ENGINE  (board, notes, tracker)
   5.  GAME ACTIONS   (input, erase, hint, undo, check, pause)
   6.  TIMER
   7.  OVERLAY / WIN
   8.  EVENT LISTENERS
   9.  INIT

   ============================================================ */

'use strict';

/* ============================================================
   1. KONSTANTA & KONFIGURASI
   ============================================================ */

/** Jumlah sel yang DIBERIKAN (tidak dikosongkan) per tingkat kesulitan */
const DIFFICULTY_GIVEN = {
  easy:   46,   // 46 angka bawaan  → 35 kosong
  medium: 36,   // 36 angka bawaan  → 45 kosong
  hard:   26,   // 26 angka bawaan  → 55 kosong
};

const MAX_MISTAKES = 3;     // Game over setelah 3 kesalahan
const HINT_LIMIT   = 5;     // Maksimum 5 hint per permainan

/* ============================================================
   2. STATE GLOBAL
   ============================================================ */
const state = {
  /** Papan solusi lengkap (array 81 angka 1–9) */
  solution: [],

  /**
   * Papan saat ini:
   *   0 = kosong
   *   1–9 = angka
   */
  board: [],

  /** Apakah sel ini merupakan angka bawaan (tidak bisa diubah) */
  given: [],          // array 81 boolean

  /**
   * Catatan per sel: array 81 elemen, setiap elemen = Set angka kandidat
   */
  notes: [],          // array of Set

  /** Indeks sel yang sedang dipilih (0–80), atau null */
  selectedCell: null,

  /** Apakah mode catatan aktif */
  notesMode: false,

  /** Jumlah kesalahan */
  mistakes: 0,

  /** Jumlah hint yang sudah dipakai */
  hintsUsed: 0,

  /** Tingkat kesulitan aktif */
  difficulty: 'easy',

  /** Apakah game sedang berjalan */
  running: false,

  /** Apakah game dijeda */
  paused: false,

  /** Timer: interval ID dan jumlah detik berjalan */
  timerInterval: null,
  elapsed: 0,

  /**
   * Stack undo: setiap elemen = { index, prevValue, prevNotes }
   */
  undoStack: [],

  /** Apakah game sudah selesai */
  finished: false,
};

/* ============================================================
   3. SUDOKU ENGINE
   ============================================================ */

/**
 * Mengacak urutan array secara in-place (Fisher-Yates shuffle).
 * @param {Array} arr
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Konversi indeks 0–80 ke {row, col} (0-based).
 */
function idx2rc(idx) {
  return { row: Math.floor(idx / 9), col: idx % 9 };
}

/**
 * Konversi {row, col} ke indeks 0–80.
 */
function rc2idx(row, col) {
  return row * 9 + col;
}

/**
 * Mendapatkan indeks awal kotak 3×3 yang mengandung sel (row, col).
 */
function boxStart(row, col) {
  return Math.floor(row / 3) * 3 * 9 + Math.floor(col / 3) * 3;
}

/**
 * Memeriksa apakah angka `num` aman untuk diletakkan di (row, col)
 * pada papan `board`.
 * @param {number[]} board  — array 81 elemen
 * @param {number}   row    — baris (0–8)
 * @param {number}   col    — kolom (0–8)
 * @param {number}   num    — angka (1–9)
 * @returns {boolean}
 */
function isSafe(board, row, col, num) {
  // Cek baris
  for (let c = 0; c < 9; c++) {
    if (board[rc2idx(row, c)] === num) return false;
  }
  // Cek kolom
  for (let r = 0; r < 9; r++) {
    if (board[rc2idx(r, col)] === num) return false;
  }
  // Cek kotak 3×3
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (board[rc2idx(r, c)] === num) return false;
    }
  }
  return true;
}

/**
 * Mengisi papan Sudoku dengan solusi valid menggunakan backtracking.
 * Urutan angka diacak agar setiap puzzle unik.
 * @param {number[]} board  — array 81 elemen (diisi in-place)
 * @returns {boolean}
 */
function solveFill(board) {
  const emptyIdx = board.indexOf(0);
  if (emptyIdx === -1) return true; // Semua terisi → selesai

  const { row, col } = idx2rc(emptyIdx);
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  for (const num of nums) {
    if (isSafe(board, row, col, num)) {
      board[emptyIdx] = num;
      if (solveFill(board)) return true;
      board[emptyIdx] = 0; // backtrack
    }
  }
  return false;
}

/**
 * Menghitung jumlah solusi puzzle (maksimum dihentikan di 2).
 * Digunakan untuk memastikan puzzle hanya punya 1 solusi unik.
 * @param {number[]} board  — salinan papan puzzle (dengan 0 = kosong)
 * @param {Object}   count  — { value } reference counter
 * @returns {void}
 */
function countSolutions(board, count) {
  if (count.value > 1) return; // Cukup tahu ada > 1 solusi

  const emptyIdx = board.indexOf(0);
  if (emptyIdx === -1) {
    count.value++;
    return;
  }

  const { row, col } = idx2rc(emptyIdx);
  for (let num = 1; num <= 9; num++) {
    if (isSafe(board, row, col, num)) {
      board[emptyIdx] = num;
      countSolutions(board, count);
      board[emptyIdx] = 0;
    }
  }
}

/**
 * Membuat puzzle Sudoku baru yang valid dengan solusi tunggal.
 * @param {string} difficulty — 'easy' | 'medium' | 'hard'
 * @returns {{ puzzle: number[], solution: number[] }}
 */
function generatePuzzle(difficulty) {
  // 1. Buat solusi penuh
  const solution = new Array(81).fill(0);
  solveFill(solution);

  // 2. Tentukan sel yang akan dikosongkan
  const puzzle = [...solution];
  const targetGiven = DIFFICULTY_GIVEN[difficulty];
  const toRemove    = 81 - targetGiven;

  // Daftar indeks acak untuk dicoba dikosongkan
  const indices = shuffle([...Array(81).keys()]);
  let removed = 0;

  for (const idx of indices) {
    if (removed >= toRemove) break;

    const backup = puzzle[idx];
    puzzle[idx] = 0;

    // Pastikan masih punya tepat 1 solusi
    const count = { value: 0 };
    countSolutions([...puzzle], count);

    if (count.value === 1) {
      removed++;
    } else {
      // Batalkan: puzzle jadi ambigu
      puzzle[idx] = backup;
    }
  }

  return { puzzle, solution };
}

/* ============================================================
   4. RENDER ENGINE
   ============================================================ */

/**
 * Membangun 81 elemen <div class="cell"> di dalam #sudoku-board.
 * Dipanggil sekali saat init, lalu updateBoard() untuk refresh.
 */
function buildBoard() {
  const boardEl = document.getElementById('sudoku-board');
  boardEl.innerHTML = '';

  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('role', 'gridcell');
    cell.dataset.idx = i;

    // Tandai border pemisah kotak 3×3
    const { row, col } = idx2rc(i);
    if (col === 2 || col === 5) cell.classList.add('box-right');
    if (row === 2 || row === 5) cell.classList.add('box-bottom');

    // Container untuk mode catatan (notes)
    const notesEl = document.createElement('div');
    notesEl.className = 'cell-notes';
    notesEl.dataset.notesFor = i;
    for (let n = 1; n <= 9; n++) {
      const nd = document.createElement('span');
      nd.className = 'note-digit';
      nd.dataset.n = n;
      notesEl.appendChild(nd);
    }
    cell.appendChild(notesEl);

    cell.addEventListener('click', () => onCellClick(i));
    boardEl.appendChild(cell);
  }
}

/**
 * Memperbarui tampilan seluruh papan berdasarkan state.
 */
function updateBoard() {
  const cells = document.querySelectorAll('.cell');

  cells.forEach(cell => {
    const idx   = +cell.dataset.idx;
    const value = state.board[idx];
    const { row, col } = idx2rc(idx);

    // Reset semua kelas state (kecuali box border dan base)
    cell.classList.remove('given', 'player', 'error', 'selected', 'highlight', 'same-num');

    // Sembunyikan semua catatan dulu
    const notesEl = cell.querySelector('.cell-notes');
    notesEl.style.display = 'none';

    if (state.given[idx]) {
      // ---- Sel bawaan ----
      cell.classList.add('given');
      cell.textContent = '';
      cell.appendChild(notesEl); // re-append agar tidak hilang
      const txt = document.createTextNode(value);
      cell.insertBefore(txt, notesEl);
      cell.setAttribute('aria-label', `Row ${row+1} Col ${col+1}: ${value} (given)`);

    } else if (value !== 0) {
      // ---- Sel diisi player ----
      cell.classList.add('player');
      cell.textContent = '';
      cell.appendChild(notesEl);
      const txt = document.createTextNode(value);
      cell.insertBefore(txt, notesEl);

      // Tandai error jika tidak sesuai solusi
      if (value !== state.solution[idx]) {
        cell.classList.add('error');
      }
      cell.setAttribute('aria-label', `Row ${row+1} Col ${col+1}: ${value}`);

    } else {
      // ---- Sel kosong / catatan ----
      cell.textContent = '';
      cell.appendChild(notesEl);
      cell.setAttribute('aria-label', `Row ${row+1} Col ${col+1}: empty`);

      // Tampilkan catatan jika ada
      const notes = state.notes[idx];
      if (notes && notes.size > 0) {
        notesEl.style.display = 'grid';
        notesEl.querySelectorAll('.note-digit').forEach(nd => {
          const n = +nd.dataset.n;
          nd.textContent = notes.has(n) ? n : '';
          nd.classList.toggle('active', notes.has(n));
        });
      }
    }

    // ---- Highlight ----
    if (state.selectedCell !== null) {
      const si     = state.selectedCell;
      const { row: sr, col: sc } = idx2rc(si);
      const sval   = state.board[si];

      if (idx === si) {
        cell.classList.add('selected');
      } else {
        // Sorot baris, kolom, dan kotak 3×3 yang sama
        const sameBox = Math.floor(row/3) === Math.floor(sr/3) &&
                        Math.floor(col/3) === Math.floor(sc/3);
        if (row === sr || col === sc || sameBox) {
          cell.classList.add('highlight');
        }
        // Sorot angka yang sama
        if (sval !== 0 && value === sval) {
          cell.classList.add('same-num');
        }
      }
    }
  });
}

/**
 * Memperbarui tracker angka (berapa kali tiap angka sudah terisi).
 */
function updateTracker() {
  const counts = new Array(10).fill(0); // counts[1..9]
  state.board.forEach(v => { if (v > 0) counts[v]++; });

  document.querySelectorAll('.tracker-num').forEach(el => {
    const n = +el.dataset.n;
    const remaining = 9 - counts[n];
    el.querySelector('.t-count').textContent = remaining > 0 ? `×${remaining}` : '✓';
    el.classList.toggle('completed', remaining === 0);
  });

  // Tandai num-btn yang sudah selesai
  document.querySelectorAll('.num-btn').forEach(btn => {
    const n = +btn.dataset.num;
    btn.classList.toggle('completed', counts[n] >= 9);
  });
}

/**
 * Membangun elemen tracker angka di panel kiri.
 */
function buildTracker() {
  const grid = document.getElementById('number-tracker');
  grid.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const el = document.createElement('div');
    el.className = 'tracker-num';
    el.dataset.n = n;
    el.innerHTML = `<span class="t-num">${n}</span><span class="t-count"></span>`;
    grid.appendChild(el);
  }
}

/* ============================================================
   5. GAME ACTIONS
   ============================================================ */

/**
 * Dipanggil ketika sel diklik.
 * @param {number} idx — indeks sel (0–80)
 */
function onCellClick(idx) {
  if (state.paused || state.finished) return;

  // Jika klik sel yang sama → deselect
  if (state.selectedCell === idx) {
    state.selectedCell = null;
  } else {
    state.selectedCell = idx;
  }
  updateBoard();
}

/**
 * Memasukkan angka ke sel yang dipilih.
 * Mendukung:
 *   - Mode normal: mengisi angka
 *   - Mode catatan: toggle catatan kandidat
 *   - Mencegah angka duplikat di baris/kolom/kotak
 * @param {number} num — angka 1–9
 */
function inputNumber(num) {
  const idx = state.selectedCell;
  if (idx === null || state.given[idx] || state.finished || state.paused) return;

  if (state.notesMode) {
    // ---- Mode Catatan ----
    // Push undo sebelum ubah
    pushUndo(idx);

    const notes = state.notes[idx];
    if (notes.has(num)) {
      notes.delete(num);
    } else {
      notes.add(num);
    }
    updateBoard();
    return;
  }

  // ---- Mode Normal ----
  const currentVal = state.board[idx];

  // Jika nilai sama → toggle hapus
  if (currentVal === num) {
    eraseCell();
    return;
  }

  // Push ke undo stack
  pushUndo(idx);

  // Kosongkan catatan sel ini ketika diisi angka
  state.notes[idx].clear();
  state.board[idx] = num;

  // Cek apakah angka salah
  if (num !== state.solution[idx]) {
    state.mistakes++;
    updateMistakeDisplay();
    setStatus(`Angka ${num} salah! (${state.mistakes}/${MAX_MISTAKES} kesalahan)`, 'error');

    if (state.mistakes >= MAX_MISTAKES) {
      gameOver();
      return;
    }
  } else {
    // Hapus catatan angka ini dari sel lain dalam baris, kolom, kotak yang sama
    clearRelatedNotes(idx, num);
    setStatus('');
  }

  updateBoard();
  updateTracker();
  checkWin();
}

/**
 * Setelah mengisi angka benar, hapus catatan kandidat yang sama
 * di sel-sel dalam baris, kolom, dan kotak 3×3 yang berhubungan.
 * @param {number} idx
 * @param {number} num
 */
function clearRelatedNotes(idx, num) {
  const { row, col } = idx2rc(idx);
  const peers = getPeers(row, col);
  peers.forEach(pi => state.notes[pi].delete(num));
}

/**
 * Mendapatkan semua indeks "peers" (sel yang berbagi baris/kolom/kotak)
 * dengan sel di (row, col), tidak termasuk sel itu sendiri.
 * @param {number} row
 * @param {number} col
 * @returns {number[]}
 */
function getPeers(row, col) {
  const peers = new Set();
  for (let c = 0; c < 9; c++) peers.add(rc2idx(row, c));
  for (let r = 0; r < 9; r++) peers.add(rc2idx(r, col));
  const br = Math.floor(row/3)*3, bc = Math.floor(col/3)*3;
  for (let r = br; r < br+3; r++)
    for (let c = bc; c < bc+3; c++)
      peers.add(rc2idx(r, c));
  peers.delete(rc2idx(row, col));
  return [...peers];
}

/**
 * Menghapus isi sel yang dipilih (hanya sel player, bukan given).
 */
function eraseCell() {
  const idx = state.selectedCell;
  if (idx === null || state.given[idx] || state.finished || state.paused) return;

  // Hanya hapus jika ada isi atau ada catatan
  if (state.board[idx] === 0 && state.notes[idx].size === 0) return;

  pushUndo(idx);
  state.board[idx] = 0;
  state.notes[idx].clear();

  updateBoard();
  updateTracker();
  setStatus('');
}

/**
 * Memberikan petunjuk: mengisi otomatis satu sel kosong yang dipilih
 * (atau sel kosong acak jika tidak ada yang dipilih).
 */
function giveHint() {
  if (state.finished || state.paused) return;
  if (state.hintsUsed >= HINT_LIMIT) {
    setStatus(`Hint habis (maks. ${HINT_LIMIT} hint per game)`, 'error');
    return;
  }

  let idx = state.selectedCell;

  // Jika tidak ada sel dipilih, atau sel dipilih sudah terisi → cari sel kosong acak
  if (idx === null || state.board[idx] !== 0 || state.given[idx]) {
    const emptyCells = state.board
      .map((v, i) => v === 0 && !state.given[i] ? i : -1)
      .filter(i => i !== -1);

    if (emptyCells.length === 0) return;
    idx = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    state.selectedCell = idx;
  }

  pushUndo(idx);
  state.notes[idx].clear();
  state.board[idx] = state.solution[idx];
  state.hintsUsed++;

  updateBoard();
  updateTracker();
  setStatus(`Hint: angka ${state.solution[idx]} (${state.hintsUsed}/${HINT_LIMIT} hint dipakai)`, 'info');
  checkWin();
}

/**
 * Memeriksa jawaban semua sel player dan menandai error.
 * Memberikan feedback visual.
 */
function checkAnswer() {
  if (state.finished || state.paused) return;

  let correctCount = 0;
  let errorCount   = 0;

  state.board.forEach((val, idx) => {
    if (!state.given[idx] && val !== 0) {
      if (val === state.solution[idx]) correctCount++;
      else errorCount++;
    }
  });

  if (errorCount === 0 && correctCount > 0) {
    setStatus(`✓ Semua ${correctCount} angka yang diisi sudah benar!`, 'success');
  } else if (errorCount > 0) {
    setStatus(`${errorCount} angka salah, ${correctCount} angka benar — sel merah = salah`, 'error');
  } else {
    setStatus('Belum ada angka yang dimasukkan.', 'info');
  }

  updateBoard();
}

/**
 * Menyimpan snapshot ke undo stack sebelum mengubah sel.
 * @param {number} idx
 */
function pushUndo(idx) {
  state.undoStack.push({
    idx,
    prevValue: state.board[idx],
    prevNotes: new Set(state.notes[idx]),
  });
  // Batasi ukuran stack
  if (state.undoStack.length > 100) state.undoStack.shift();
}

/**
 * Membatalkan langkah terakhir.
 */
function undo() {
  if (state.undoStack.length === 0 || state.finished || state.paused) {
    setStatus('Tidak ada langkah untuk di-undo.', 'info');
    return;
  }

  const snap = state.undoStack.pop();
  state.board[snap.idx] = snap.prevValue;
  state.notes[snap.idx] = snap.prevNotes;
  state.selectedCell = snap.idx;

  updateBoard();
  updateTracker();
  setStatus('Langkah terakhir dibatalkan.', 'info');
}

/**
 * Toggle pause.
 */
function togglePause() {
  if (state.finished) return;

  state.paused = !state.paused;

  const overlay = document.getElementById('pause-overlay');
  const pauseBtn = document.getElementById('btn-pause');

  if (state.paused) {
    stopTimer();
    overlay.classList.remove('hidden');
    // Ubah ikon pause → play
    pauseBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    pauseBtn.title = 'Resume';
  } else {
    overlay.classList.add('hidden');
    startTimer();
    pauseBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    pauseBtn.title = 'Pause';
  }
}

/**
 * Memperbarui tampilan jumlah kesalahan.
 */
function updateMistakeDisplay() {
  const el = document.getElementById('mistake-count');
  if (el) el.textContent = `${state.mistakes} / ${MAX_MISTAKES}`;
}

/**
 * Game Over: terlalu banyak kesalahan.
 */
function gameOver() {
  stopTimer();
  state.finished = true;
  setStatus(`Game Over! Anda membuat ${MAX_MISTAKES} kesalahan. Tekan New Game untuk memulai ulang.`, 'error');
  updateBoard();
}

/**
 * Memeriksa apakah pemain menang (semua sel terisi dengan benar).
 */
function checkWin() {
  // Cek semua 81 sel terisi dan benar
  const solved = state.board.every((val, idx) => val === state.solution[idx]);
  if (!solved) return;

  stopTimer();
  state.finished = true;
  state.running  = false;

  // Flash animasi kemenangan
  document.querySelectorAll('.cell').forEach((cell, i) => {
    setTimeout(() => cell.classList.add('win-flash'), i * 8);
  });

  // Isi data overlay win
  document.getElementById('win-time').textContent       = formatTime(state.elapsed);
  document.getElementById('win-mistakes').textContent   = `${state.mistakes}`;
  document.getElementById('win-difficulty').textContent =
    state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);

  // Tampilkan overlay win setelah animasi flash selesai
  setTimeout(() => {
    document.getElementById('win-overlay').classList.remove('hidden');
  }, 81 * 8 + 300);
}

/* ============================================================
   6. TIMER
   ============================================================ */

/** Memformat detik menjadi "MM:SS" */
function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  if (state.timerInterval) return;
  state.timerInterval = setInterval(() => {
    state.elapsed++;
    document.getElementById('timer').textContent = formatTime(state.elapsed);
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function resetTimer() {
  stopTimer();
  state.elapsed = 0;
  document.getElementById('timer').textContent = '00:00';
}

/* ============================================================
   7. STATUS BAR
   ============================================================ */

let _statusTimeout = null;

/**
 * Menampilkan pesan di status bar.
 * @param {string} msg     — pesan
 * @param {string} [type]  — 'info' | 'success' | 'error' | ''
 * @param {number} [ttl]   — time-to-live ms (default: 3500, 0 = permanent)
 */
function setStatus(msg, type = '', ttl = 3500) {
  const bar = document.getElementById('status-bar');
  if (!bar) return;
  bar.textContent = msg;
  bar.className   = 'status-bar' + (type ? ' ' + type : '');

  clearTimeout(_statusTimeout);
  if (ttl > 0 && msg) {
    _statusTimeout = setTimeout(() => {
      bar.textContent = '';
      bar.className   = 'status-bar';
    }, ttl);
  }
}

/* ============================================================
   8. NEW GAME
   ============================================================ */

/**
 * Memulai permainan baru.
 * @param {string} [diff] — opsional, jika tidak diberikan pakai state.difficulty
 */
function newGame(diff) {
  if (diff) state.difficulty = diff;

  // Sembunyikan overlay win jika terbuka
  document.getElementById('win-overlay').classList.add('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');

  // Reset timer dan state
  resetTimer();
  state.paused   = false;
  state.finished = false;
  state.mistakes = 0;
  state.hintsUsed = 0;
  state.selectedCell = null;
  state.notesMode    = false;
  state.undoStack    = [];

  // Restore pause button icon
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    pauseBtn.title = 'Pause';
  }

  // Update notes toggle UI
  document.getElementById('btn-notes').classList.remove('active');
  document.getElementById('notes-badge').textContent = 'OFF';
  document.getElementById('notes-badge').className   = 'notes-badge off';
  document.getElementById('btn-notes').setAttribute('aria-pressed', 'false');

  // Update difficulty label
  document.getElementById('current-difficulty').textContent =
    state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);

  // Update difficulty button styles
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === state.difficulty);
  });

  // Generate puzzle
  setStatus('Membuat puzzle baru…', 'info', 0);
  // setTimeout agar browser sempat render status dulu
  setTimeout(() => {
    const { puzzle, solution } = generatePuzzle(state.difficulty);

    state.solution = solution;
    state.board    = [...puzzle];
    state.given    = puzzle.map(v => v !== 0);
    state.notes    = Array.from({ length: 81 }, () => new Set());

    updateMistakeDisplay();
    buildBoard();
    updateBoard();
    buildTracker();
    updateTracker();
    startTimer();
    state.running = true;
    setStatus('Permainan baru dimulai. Selamat bermain!', 'info');
  }, 20);
}

/* ============================================================
   9. EVENT LISTENERS
   ============================================================ */

function attachEventListeners() {
  // ---- Keyboard input ----
  document.addEventListener('keydown', e => {
    if (state.paused || state.finished) return;

    const key = e.key;

    // Angka 1–9
    if (key >= '1' && key <= '9') {
      inputNumber(+key);
      return;
    }

    // Hapus / Backspace
    if (key === 'Delete' || key === 'Backspace') {
      eraseCell();
      return;
    }

    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      undo();
      return;
    }

    // Navigasi papan dengan arrow keys
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)) {
      e.preventDefault();
      navigateBoard(key);
      return;
    }

    // N = toggle notes mode
    if (key === 'n' || key === 'N') {
      toggleNotesMode();
      return;
    }

    // H = hint
    if (key === 'h' || key === 'H') {
      giveHint();
      return;
    }

    // Escape = deselect
    if (key === 'Escape') {
      state.selectedCell = null;
      updateBoard();
    }
  });

  // ---- Number pad buttons ----
  document.querySelectorAll('.num-btn').forEach(btn => {
    btn.addEventListener('click', () => inputNumber(+btn.dataset.num));
  });

  // ---- Action buttons ----
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-erase').addEventListener('click', eraseCell);
  document.getElementById('btn-hint').addEventListener('click', giveHint);
  document.getElementById('btn-check').addEventListener('click', checkAnswer);
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-resume').addEventListener('click', togglePause);

  // ---- Notes mode toggle ----
  document.getElementById('btn-notes').addEventListener('click', toggleNotesMode);

  // ---- New Game button ----
  document.getElementById('btn-new-game').addEventListener('click', () => {
    newGame();
  });
  document.getElementById('btn-new-game-win').addEventListener('click', () => {
    newGame();
  });

  // ---- Difficulty buttons ----
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      newGame(btn.dataset.diff);
    });
  });
}

/**
 * Navigasi papan dengan tombol panah.
 * @param {string} key — 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
 */
function navigateBoard(key) {
  if (state.selectedCell === null) {
    state.selectedCell = 0;
    updateBoard();
    return;
  }

  const { row, col } = idx2rc(state.selectedCell);
  let newRow = row, newCol = col;

  if (key === 'ArrowUp')    newRow = Math.max(0, row - 1);
  if (key === 'ArrowDown')  newRow = Math.min(8, row + 1);
  if (key === 'ArrowLeft')  newCol = Math.max(0, col - 1);
  if (key === 'ArrowRight') newCol = Math.min(8, col + 1);

  state.selectedCell = rc2idx(newRow, newCol);
  updateBoard();
}

/**
 * Toggle mode catatan.
 */
function toggleNotesMode() {
  state.notesMode = !state.notesMode;

  const btn   = document.getElementById('btn-notes');
  const badge = document.getElementById('notes-badge');

  btn.classList.toggle('active', state.notesMode);
  btn.setAttribute('aria-pressed', state.notesMode ? 'true' : 'false');
  badge.textContent = state.notesMode ? 'ON' : 'OFF';
  badge.className   = state.notesMode ? 'notes-badge on' : 'notes-badge off';
  setStatus(state.notesMode ? 'Mode Catatan: ON — klik angka untuk tambah/hapus catatan' : 'Mode Catatan: OFF', 'info');
}

/* ============================================================
   10. INIT
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  attachEventListeners();
  newGame('easy'); // Mulai dengan easy secara default
});
