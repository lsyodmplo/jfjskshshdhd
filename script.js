// ===== App State =====
const AppState = {
    apiKey: null,
    isPaused: false,
    files: [], // { id, name, data, status }
    config: {
        sourceLanguage: 'en',
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
            showStatus('key-status', 'Key đã được lưu', 'success');
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
        el.className = `status status-${type}`;
    },

    updateStartButton() {
        const btn = document.getElementById('start-translation');
        const processing = this.files.some(f => f.status === 'processing');
        btn.disabled = !this.apiKey || this.files.length === 0 || processing;
    }
};

// ===== Toast Notification =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== Status Message =====
function showStatus(id, message, type) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.className = `status-message status-${type}`;
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
                showToast(`Đã tải ${file.name}`);
                AppState.updateStartButton();
                AppState.updateStats();
            } catch {
                showToast(`Lỗi: ${file.name} không phải JSON hợp lệ`, 'error');
            }
        };
        reader.readAsText(file);
    });
}

function renderFileItem(fileObj) {
    const list = document.getElementById('file-list');
    const item = document.createElement('div');
    item.className = `file-item ${fileObj.status}`;
    item.id = fileObj.id;
    item.innerHTML = `
        <span>${fileObj.name}</span>
        <div>
            <span class="status status-\( {fileObj.status}"> \){getStatusLabel(fileObj.status)}</span>
            <button class="btn-icon btn-remove" onclick="removeFile('${fileObj.id}')"><i class="fas fa-trash"></i></button>
        </div>
    `;
    list.appendChild(item);
}

function getStatusLabel(status) {
    const labels = { pending: 'Chờ', processing: 'Đang dịch', done: 'Hoàn thành', error: 'Lỗi' };
    return labels[status] || 'Chờ';
}

function updateFileStatus(id, status) {
    const item = document.getElementById(id);
    if (item) {
        item.className = `file-item ${status}`;
        item.querySelector('.status').className = `status status-${status}`;
        item.querySelector('.status').textContent = getStatusLabel(status);
    }
}

function removeFile(id) {
    AppState.files = AppState.files.filter(f => f.id !== id);
    document.getElementById(id)?.remove();
    showToast('Đã xóa file');
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
            const translated = await AutoTransEngine.translateFile(file.data, file.name, AppState.config);
            downloadTranslated(file.name, translated);
            updateFileStatus(file.id, 'done');
            showToast(`Hoàn thành ${file.name}`);
        } catch (err) {
            updateFileStatus(file.id, 'error');
            showToast(`Lỗi ${file.name}: ${err.message}`, 'error');
        }

        while (AppState.isPaused) {
            AppState.setStatus('Đã tạm dừng', 'paused');
            await new Promise(r => setTimeout(r, 500));
        }
    }

    AppState.setStatus('Hoàn thành tất cả!', 'success');
    showToast('Tất cả file đã được xử lý');
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    AppState.updateStartButton();
}

function downloadTranslated(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `[Translated] ${name}`;
    a.click();
    URL.revokeObjectURL(url);
}

function togglePause() {
    AppState.isPaused = !AppState.isPaused;
    const btn = document.getElementById('pause-translation');
    btn.innerHTML = AppState.isPaused ? '<i class="fas fa-play"></i> Tiếp tục' : '<i class="fas fa-pause"></i> Tạm dừng';
    if (!AppState.isPaused) startTranslation();
}

function clearAll() {
    if (!confirm('Xóa tất cả file đã tải?')) return;
    AppState.files = [];
    AppState.stats = { textsTranslated: 0, estimatedCost: 0 };
    document.getElementById('file-list').innerHTML = '';
    document.querySelector('.placeholder').style.display = 'block';
    AppState.updateStats();
    AppState.updateProgress(0);
    AppState.setStatus('Sẵn sàng');
    AppState.updateStartButton();
    showToast('Đã xóa tất cả');
}

// ===== DOM Ready =====
document.addEventListener('DOMContentLoaded', () => {
    AppState.load();

    // API Key
    document.getElementById('save-key').onclick = () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (!key) return showStatus('key-status', 'Vui lòng nhập key', 'error');
        AppState.saveApiKey(key);
        showStatus('key-status', 'Đã lưu key thành công!', 'success');
        AppState.updateStartButton();
    };

    document.getElementById('toggle-key').onclick = () => {
        const input = document.getElementById('api-key-input');
        const icon = document.getElementById('toggle-key').querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    };

    // Config
    document.querySelectorAll('select, input[type="checkbox"], input[type="number"]').forEach(el => {
        el.onchange = () => {
            const id = el.id;
            if (el.type === 'checkbox') {
                const key = id.replace(/-/g, '_').replace('translate_', 'translate');
                AppState.config[key] = el.checked;
            } else if (el.type === 'number') {
                AppState.config.batchSize = parseInt(el.value) || 10;
            } else {
                AppState.config[id.replace(/-/g, '_')] = el.value;
            }
        };
    });

    // Upload
    document.getElementById('select-files').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = e => handleFiles(e.target.files);

    const overlay = document.getElementById('drag-overlay');
    const dropZone = document.getElementById('drop-zone');

    const hasFiles = e => e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');

    document.body.addEventListener('dragover', e => {
        e.preventDefault();
        if (hasFiles(e)) overlay.classList.add('active');
    });

    document.body.addEventListener('dragleave', e => {
        if (!e.relatedTarget) overlay.classList.remove('active');
    });

    document.body.addEventListener('drop', e => {
        e.preventDefault();
        overlay.classList.remove('active');
        if (hasFiles(e)) handleFiles(e);
    });

    dropZone.addEventListener('dragover', e => e.preventDefault());
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        handleFiles(e);
    });

    // Controls
    document.getElementById('start-translation').onclick = startTranslation;
    document.getElementById('pause-translation').onclick = togglePause;
    document.getElementById('clear-all').onclick = clearAll;

    // PWA
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('install-btn').style.display = 'block';
    });
    document.getElementById('install-btn').onclick = () => deferredPrompt?.prompt();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // Hook realtime stats từ autotrans.js
    const origStats = AppState.stats;
    AppState.stats = new Proxy(origStats, {
        set(target, prop, value) {
            target[prop] = value;
            if (prop === 'textsTranslated' || prop === 'estimatedCost') AppState.updateStats();
            return true;
        }
    });
});