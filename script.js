// script.js
// RPG Maker AI Translator ULTIMATE v4.0
// Stable core – browser-safe – autotrans.js compatible

// ==================================================
// Global App State
// ==================================================
const AppState = {
  apiKey: null,
  isPaused: false,
  isTranslating: false,

  files: [],

  stats: {
    textsTranslated: 0,
    estimatedCost: 0
  },

  config: {
    sourceLanguage: 'ja',
    targetLanguage: 'vi',
    safeMode: 'balanced',
    batchSize: 10,
    preserveFormatting: true
  }
};

// expose for autotrans.js
window.AppState = AppState;

// ==================================================
// Logger (safe fallback)
// ==================================================
window.Logger = window.Logger || {
  info: (...a) => console.info('[INFO]', ...a),
  warn: (...a) => console.warn('[WARN]', ...a),
  error: (...a) => console.error('[ERROR]', ...a)
};

// ==================================================
// DOM Helpers
// ==================================================
const $ = (id) => document.getElementById(id);

const DOM = {
  apiKey: $('apiKey'),
  apiStatus: $('apiStatus'),

  startBtn: $('startBtn'),
  pauseBtn: $('pauseBtn'),
  clearBtn: $('clearBtn'),

  selectFiles: $('selectFiles'),
  fileInput: $('fileInput'),
  dropZone: $('dropZone'),
  fileList: $('fileList'),

  sourceLang: $('sourceLang'),
  targetLang: $('targetLang'),
  safeMode: $('safeMode'),
  batchSize: $('batchSize'),
  preserveFormatting: $('preserveFormatting'),

  previewStream: $('previewStream'),
  previewSearch: $('previewSearch'),
  toggleAutoScroll: $('toggleAutoScroll'),
  exportBtn: $('exportBtn'),

  batchProgress: $('batchProgress'),
  batchMeta: $('batchMeta'),
  textsTranslated: $('textsTranslated'),
  estCost: $('estCost')
};

// ==================================================
// API Key (local only)
// ==================================================
const API_KEY_STORAGE = 'rpg_ai_api';

function saveApiKey(key) {
  if (!key) {
    localStorage.removeItem(API_KEY_STORAGE);
    AppState.apiKey = null;
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, btoa(key));
  AppState.apiKey = key;
}

function loadApiKey() {
  const raw = localStorage.getItem(API_KEY_STORAGE);
  if (!raw) return null;
  try {
    const key = atob(raw);
    AppState.apiKey = key;
    return key;
  } catch {
    return null;
  }
}

// ==================================================
// File Handling
// ==================================================
function handleFiles(fileList) {
  const incoming = Array.from(fileList).filter(f => f.name.endsWith('.json'));

  incoming.forEach(file => {
    if (AppState.files.some(x => x.name === file.name)) return;
    AppState.files.push({
      file,
      name: file.name,
      size: file.size
    });
  });

  renderFileList();
}

function renderFileList() {
  DOM.fileList.innerHTML = '';

  if (AppState.files.length === 0) {
    DOM.fileList.innerHTML =
      `<div class="preview-empty"><p class="muted">No files selected</p></div>`;
    return;
  }

  AppState.files.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'file-item';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${f.name} — ${f.size} bytes`;

    const btn = document.createElement('button');
    btn.className = 'btn small ghost';
    btn.textContent = 'Remove';
    btn.onclick = () => {
      AppState.files.splice(i, 1);
      renderFileList();
    };

    row.appendChild(meta);
    row.appendChild(btn);
    DOM.fileList.appendChild(row);
  });
}

// ==================================================
// Live Preview (hook cho autotrans.js)
// ==================================================
window.LivePreview = {
  add(file, original, translated, status = 'safe') {
    const item = document.createElement('div');
    item.className = `preview-item ${status}`;

    item.innerHTML = `
      <div class="meta">
        <strong>${file}</strong>
        <span class="muted">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="text-row">
        <div class="original">${original || ''}</div>
        <div class="translated">${translated || ''}</div>
      </div>
    `;

    const empty = DOM.previewStream.querySelector('.preview-empty');
    if (empty) empty.remove();

    DOM.previewStream.appendChild(item);

    if (DOM.toggleAutoScroll.classList.contains('active')) {
      DOM.previewStream.scrollTop = DOM.previewStream.scrollHeight;
    }
  }
};

// ==================================================
// Translation Runner
// ==================================================
async function startTranslation() {
  if (!AppState.apiKey) {
    alert('Please enter API key.');
    return;
  }

  if (AppState.files.length === 0) {
    alert('No files selected.');
    return;
  }

  const engine = window.AutoTransEngine;
  if (!engine || typeof engine.translateFile !== 'function') {
    alert('autotrans.js not loaded.');
    Logger.error('AutoTransEngine missing');
    return;
  }

  // sync config
  AppState.config.sourceLanguage = DOM.sourceLang.value;
  AppState.config.targetLanguage = DOM.targetLang.value;
  AppState.config.safeMode = DOM.safeMode.value;
  AppState.config.batchSize = Number(DOM.batchSize.value) || 10;
  AppState.config.preserveFormatting = DOM.preserveFormatting.checked;

  AppState.isPaused = false;
  AppState.isTranslating = true;

  DOM.startBtn.disabled = true;
  DOM.pauseBtn.disabled = false;
  DOM.pauseBtn.textContent = 'Pause';
  DOM.apiStatus.textContent = 'Translating…';

  DOM.batchProgress.value = 0;
  DOM.batchProgress.max = AppState.files.length;
  DOM.batchMeta.textContent = `0 / ${AppState.files.length}`;

  for (let i = 0; i < AppState.files.length; i++) {
    if (AppState.isPaused) break;

    const f = AppState.files[i];
    let json;

    try {
      json = JSON.parse(await f.file.text());
    } catch {
      LivePreview.add(f.name, '', 'Invalid JSON', 'blocked');
      continue;
    }

    try {
      const result = await engine.translateFile(json, f.name, AppState.config);

      LivePreview.add(
        f.name,
        'Original JSON',
        'Translated successfully',
        'safe'
      );

      downloadResult(f.name, result);

      AppState.stats.textsTranslated++;
      DOM.textsTranslated.textContent = AppState.stats.textsTranslated;

    } catch (err) {
      Logger.error(err);
      LivePreview.add(f.name, '', err.message || 'Translation failed', 'blocked');
    }

    DOM.batchProgress.value = i + 1;
    DOM.batchMeta.textContent = `${i + 1} / ${AppState.files.length}`;
  }

  finishTranslation();
}

function finishTranslation() {
  AppState.isTranslating = false;
  DOM.startBtn.disabled = false;
  DOM.pauseBtn.disabled = true;
  DOM.apiStatus.textContent = 'Idle';
}

// ==================================================
// Download helper
// ==================================================
function downloadResult(filename, data) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace('.json', '.translated.json');
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ==================================================
// Event Wiring
// ==================================================
const savedKey = loadApiKey();
if (savedKey) {
  DOM.apiKey.value = '●'.repeat(Math.max(6, savedKey.length));
}

DOM.apiKey.addEventListener('input', (e) => {
  const v = e.target.value.trim();
  if (/^[●•]+$/.test(v)) return;
  saveApiKey(v);
});

DOM.startBtn.onclick = startTranslation;

DOM.pauseBtn.onclick = () => {
  AppState.isPaused = !AppState.isPaused;
  DOM.pauseBtn.textContent = AppState.isPaused ? 'Resume' : 'Pause';
};

DOM.clearBtn.onclick = () => {
  AppState.files = [];
  renderFileList();
};

DOM.selectFiles.onclick = () => DOM.fileInput.click();
DOM.fileInput.onchange = e => handleFiles(e.target.files);

['dragenter', 'dragover', 'drop'].forEach(evt => {
  DOM.dropZone.addEventListener(evt, e => {
    e.preventDefault();
    if (evt === 'drop') handleFiles(e.dataTransfer.files);
  });
});

DOM.previewSearch.addEventListener('input', () => {
  const q = DOM.previewSearch.value.toLowerCase();
  document.querySelectorAll('.preview-item').forEach(el => {
    el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});

DOM.toggleAutoScroll.onclick = () => {
  DOM.toggleAutoScroll.classList.toggle('active');
};

// ==================================================
// Export (future-proof)
// ==================================================
export { startTranslation };