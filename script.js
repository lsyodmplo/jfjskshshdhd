// ===== App State =====
const AppState = {
    apiKey: null,
    isPaused: false,
    files: [],
    config: {
        sourceLanguage: 'ja',
        targetLanguage: 'vi',
        safeMode: 'balanced',
        batchSize: 10,
        translateDialogue: true,
        translateNames: true,
        translateDescriptions: true,
        smartFiltering: true,
        contextAware: true,
        qualityCheck: true,
        preserveFormatting: true
    },
    stats: {
        textsTranslated: 0,
        estimatedCost: 0
    },

    load() {
        const stored = localStorage.getItem('deepseek_api_key');
        if (stored) {
            this.apiKey = atob(stored);
            document.getElementById('api-key-input').value = this.apiKey;
            showStatus('key-status', '✅ Key đã được lưu', 'success');
            this.updateStartButton();
        }
    },

    saveApiKey(key) {
        this.apiKey = key.trim();
        localStorage.setItem('deepseek_api_key', btoa(key));
    },

    updateStats() {
        document.getElementById('files-count').textContent = this.files.length;
        document.getElementById('translated-count').textContent = this.stats.textsTranslated;
        document.getElementById('estimated-cost').textContent = `$${this.stats.estimatedCost.toFixed(4)}`;
    },

    updateProgress(percent) {
        document.getElementById('overall-progress').style.width = `${percent}%`;
        document.getElementById('progress-percent').textContent = `${Math.round(percent)}%`;
    },

    setStatus(text, type = 'info') {
        const el = document.getElementById('status-text');
        el.textContent = text;
        el.className = 'status';
        const colors = { success: '#10b981', error: '#ef4444', processing: '#f59e0b', info: '#94a3b8' };
        el.style.color = colors[type] || colors.info;
    },

    updateStartButton() {
        const btn = document.getElementById('start-translation');
        const processing = this.files.some(f => f.status === 'processing');
        btn.disabled = !this.apiKey || this.files.length === 0 || processing;
    }
};

// ===== Helper Functions =====
function showStatus(id, message, type) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = message;
        el.className = `status-message ${type}`;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);

    if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== File Handling =====
let fileCounter = 0;

function handleFiles(source) {
    let files = [];
    if (source instanceof FileList) {
        files = Array.from(source);
    } else if (source.dataTransfer?.files) {
        files = Array.from(source.dataTransfer.files);
    }

    if (files.length === 0) return;

    files.filter(f => f.name.toLowerCase().endsWith('.json')).forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                const id = `file-${fileCounter++}`;
                const fileObj = { id, name: file.name, data, status: 'pending' };
                AppState.files.push(fileObj);
                renderFileItem(fileObj);
                showToast(`✅ Đã tải ${file.name}`, 'success');
                AppState.updateStartButton();
                AppState.updateStats();
            } catch (err) {
                showToast(`❌ ${file.name}: JSON không hợp lệ`, 'error');
            }
        };
        reader.readAsText(file);
    });
}

// FIX LỖI RENDER HOÀN TOÀN
function renderFileItem(fileObj) {
    const list = document.getElementById('file-list');
    const item = document.createElement('div');
    item.className = `file-item ${fileObj.status}`;
    item.id = fileObj.id;

    item.innerHTML = `
        <span class="file-name">${escapeHtml(fileObj.name)}</span>
        <div class="file-actions">
            <span class="status status-\( {fileObj.status}"> \){getStatusLabel(fileObj.status)}</span>
            <button class="btn-icon btn-remove" onclick="removeFile('${fileObj.id}')" aria-label="Xóa file">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    list.appendChild(item);
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Chờ',
        processing: 'Đang dịch',
        done: 'Hoàn thành',
        error: 'Lỗi'
    };
    return labels[status] || 'Chờ';
}

function updateFileStatus(id, status) {
    const item = document.getElementById(id);
    if (item) {
        item.className = `file-item ${status}`;
        const statusEl = item.querySelector('.status');
        if (statusEl) {
            statusEl.className = `status status-${status}`;
            statusEl.textContent = getStatusLabel(status);
        }
    }
}

function removeFile(id) {
    AppState.files = AppState.files.filter(f => f.id !== id);
    document.getElementById(id)?.remove();
    showToast('🗑️ Đã xóa file', 'info');
    AppState.updateStartButton();
    AppState.updateStats();
}

// ===== Translation =====
async function startTranslation() {
    if (!AppState.apiKey) {
        showToast('Vui lòng lưu API Key trước', 'error');
        return;
    }

    const startBtn = document.getElementById('start-translation');
    const pauseBtn = document.getElementById('pause-translation');
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    AppState.isPaused = false;
    AppState.setStatus('Đang khởi động...', 'processing');

    for (const file of AppState.files) {
        if (file.status !== 'pending') continue;

        updateFileStatus(file.id, 'processing');
        AppState.setStatus(`Đang dịch ${file.name}...`, 'processing');

        try {
            const translatedData = await AutoTransEngine.translateFile(
                file.data,
                file.name,
                AppState.config
            );

            downloadTranslatedFile(file.name, translatedData);
            updateFileStatus(file.id, 'done');
            showToast(`✅ Hoàn thành: ${file.name}`, 'success');
        } catch (err) {
            console.error(err);
            updateFileStatus(file.id, 'error');
            showToast(`❌ Lỗi dịch ${file.name}`, 'error');
        }

        while (AppState.isPaused) {
            AppState.setStatus('Đã tạm dừng', 'paused');
            await new Promise(r => setTimeout(r, 500));
        }
    }

    AppState.setStatus('Hoàn thành toàn bộ!', 'success');
    showToast('🎉 Tất cả file đã xử lý xong!', 'success');
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    AppState.updateStartButton();
}

function downloadTranslatedFile(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `[Translated] ${name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function togglePause() {
    AppState.isPaused = !AppState.isPaused;
    const btn = document.getElementById('pause-translation');
    if (AppState.isPaused) {
        btn.innerHTML = '<i class="fas fa-play"></i> Tiếp Tục';
        btn.classList.remove('btn-pause');
        btn.classList.add('btn-primary');
    } else {
        btn.innerHTML = '<i class="fas fa-pause"></i> Tạm Dừng';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-pause');
        startTranslation();
    }
}

function clearAll() {
    if (!confirm('Bạn có chắc muốn xóa tất cả file?')) return;

    AppState.files = [];
    AppState.stats.textsTranslated = 0;
    AppState.stats.estimatedCost = 0;
    document.getElementById('file-list').innerHTML = '';
    const placeholder = document.querySelector('#live-preview .placeholder');
    if (placeholder) placeholder.style.display = 'block';
    AppState.updateStats();
    AppState.updateProgress(0);
    AppState.setStatus('Sẵn sàng', 'info');
    AppState.updateStartButton();
    showToast('🗑️ Đã xóa toàn bộ', 'info');
}

// ===== DOM Ready =====
document.addEventListener('DOMContentLoaded', () => {
    AppState.load();

    // FIX LỖI Logger is not defined: Định nghĩa Logger fallback nếu autotrans.js chưa load
    if (typeof Logger === 'undefined') {
        window.Logger = {
            info: (msg) => console.log('[INFO]', msg),
            warning: (msg) => console.warn('[WARNING]', msg),
            error: (msg) => console.error('[ERROR]', msg),
            success: (msg) => console.log('[SUCCESS]', msg)
        };
    }

    // LivePreview fallback (nếu autotrans.js gọi trước khi script.js load)
    if (typeof LivePreview === 'undefined') {
        window.LivePreview = {
            addTranslation: () => {},
            showBatchProgress: () => {}
        };
    }

    // API Key
    document.getElementById('save-key').addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (!key) {
            showStatus('key-status', '❌ Vui lòng nhập API key', 'error');
            return;
        }
        AppState.saveApiKey(key);
        showStatus('key-status', '✅ Đã lưu key thành công!', 'success');
        AppState.updateStartButton();
    });

    document.getElementById('toggle-key').addEventListener('click', () => {
        const input = document.getElementById('api-key-input');
        const icon = document.getElementById('toggle-key').querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });

    // Config
    document.querySelectorAll('select, input[type="checkbox"], input[type="number"]').forEach(el => {
        el.addEventListener('change', () => {
            const id = el.id;
            if (el.type === 'checkbox') {
                const key = id.replace(/-/g, '_').replace('translate_', 'translate');
                AppState.config[key] = el.checked;
            } else if (el.type === 'number') {
                AppState.config.batchSize = parseInt(el.value) || 10;
            } else {
                const key = id.replace(/-/g, '_');
                if (key in AppState.config) AppState.config[key] = el.value;
            }
        });
    });

    // Upload
    document.getElementById('select-files').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', e => handleFiles(e.target.files));

    const overlay = document.getElementById('drag-overlay');
    const dropZone = document.getElementById('drop-zone');

    const hasFiles = e => e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');

    document.body.addEventListener('dragover', e => {
        e.preventDefault();
        if (hasFiles(e)) {
            overlay.classList.add('active');
            dropZone.classList.add('dragover');
        }
    });

    document.body.addEventListener('dragleave', e => {
        if (!e.relatedTarget) {
            overlay.classList.remove('active');
            dropZone.classList.remove('dragover');
        }
    });

    document.body.addEventListener('drop', e => {
        e.preventDefault();
        overlay.classList.remove('active');
        dropZone.classList.remove('dragover');
        if (hasFiles(e)) handleFiles(e);
    });

    dropZone.addEventListener('dragover', e => e.preventDefault());
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        handleFiles(e);
    });

    // Controls
    document.getElementById('start-translation').addEventListener('click', startTranslation);
    document.getElementById('pause-translation').addEventListener('click', togglePause);
    document.getElementById('clear-all').addEventListener('click', clearAll);

    // PWA
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('install-btn').style.display = 'block';
    });

    document.getElementById('install-btn').addEventListener('click', () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt = null;
        }
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // Hook realtime stats
    const statsProxy = new Proxy(AppState.stats, {
        set(target, prop, value) {
            target[prop] = value;
            if (prop === 'textsTranslated' || prop === 'estimatedCost') {
                AppState.updateStats();
            }
            return true;
        }
    });
    AppState.stats = statsProxy;
});