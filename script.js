// ===== App State =====
const AppState = {
    apiKey: null,
    isPaused: false,
    files: [], // { id, name, data, status: 'pending'|'processing'|'done'|'error' }
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
            showKeyStatus('✅ Key đã được lưu từ trước', 'success');
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

    updateProgress(percentage) {
        document.getElementById('overall-progress').style.width = `${percentage}%`;
        document.getElementById('progress-text').textContent = `${Math.round(percentage)}%`;
    },

    setStatus(text, type = 'info') {
        const el = document.getElementById('status-text');
        el.textContent = text;
        el.className = `value status-${type}`;
    },

    updateStartButton() {
        const btn = document.getElementById('start-translation');
        const hasProcessing = this.files.some(f => f.status === 'processing');
        btn.disabled = !this.apiKey || this.files.length === 0 || hasProcessing;
    }
};

// ===== Toast Notification =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);

    if ('vibrate' in navigator) {
        navigator.vibrate([50, 50, 50]);
    }
}

// ===== Key Status Helper =====
function showKeyStatus(msg, type) {
    const el = document.getElementById('key-status');
    el.textContent = msg;
    el.className = `status-${type}`;
}

// ===== File Handling =====
let fileIdCounter = 0;

function handleFiles(source) {
    let files;
    if (source instanceof FileList) {
        files = source;
    } else if (source.dataTransfer) {
        files = source.dataTransfer.files;
    } else {
        return;
    }

    if (files.length === 0) return;

    Array.from(files).filter(file => file.name.toLowerCase().endsWith('.json')).forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                const id = `file_${fileIdCounter++}`;
                const fileObj = { id, name: file.name, data, status: 'pending' };
                AppState.files.push(fileObj);
                renderFileItem(fileObj);
                showToast(`✅ Đã tải: ${file.name}`, 'success');
                AppState.updateStartButton();
                AppState.updateStats();
            } catch (err) {
                showToast(`❌ ${file.name}: JSON không hợp lệ`, 'error');
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
        <span class="file-name">${fileObj.name}</span>
        <div class="file-actions">
            <span class="status status-\( {fileObj.status}"> \){getStatusText(fileObj.status)}</span>
            <button class="btn-icon btn-remove" onclick="removeFile('${fileObj.id}')" aria-label="Xóa file">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    list.appendChild(item);
}

function getStatusText(status) {
    const texts = {
        pending: 'Chờ',
        processing: 'Đang dịch',
        done: 'Hoàn thành',
        error: 'Lỗi'
    };
    return texts[status] || 'Chờ';
}

function updateFileStatus(id, status) {
    const item = document.getElementById(id);
    if (item) {
        item.className = `file-item ${status}`;
        const statusEl = item.querySelector('.status');
        statusEl.className = `status status-${status}`;
        statusEl.textContent = getStatusText(status);
    }
}

function removeFile(id) {
    AppState.files = AppState.files.filter(f => f.id !== id);
    document.getElementById(id)?.remove();
    showToast('🗑️ Đã xóa file', 'info');
    AppState.updateStartButton();
    AppState.updateStats();
}

// ===== Translation Process =====
async function startTranslation() {
    if (!AppState.apiKey) {
        showToast('Vui lòng nhập và lưu API Key trước!', 'error');
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
        AppState.setStatus(`Đang dịch: ${file.name}`, 'processing');

        try {
            const translatedData = await AutoTransEngine.translateFile(
                file.data,
                file.name,
                AppState.config
            );

            downloadFile(file.name, translatedData);

            updateFileStatus(file.id, 'done');
            showToast(`✅ Hoàn thành: ${file.name}`, 'success');

        } catch (err) {
            console.error(err);
            updateFileStatus(file.id, 'error');
            showToast(`❌ Lỗi dịch ${file.name}: ${err.message}`, 'error');
        }

        while (AppState.isPaused && !pauseBtn.disabled) {
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

function downloadFile(originalName, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `[Translated] ${originalName}`;
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
        btn.classList.replace('btn-pause', 'btn-primary');
    } else {
        btn.innerHTML = '<i class="fas fa-pause"></i> Tạm Dừng';
        btn.classList.replace('btn-primary', 'btn-pause');
        startTranslation(); // Resume
    }
}

function clearAll() {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ file đã tải?')) return;

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

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
    AppState.load();

    // API Key
    document.getElementById('save-key').addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (!key) {
            showKeyStatus('❌ Vui lòng nhập API key', 'error');
            return;
        }
        AppState.saveApiKey(key);
        showKeyStatus('✅ Đã lưu key thành công!', 'success');
        AppState.updateStartButton();
    });

    document.getElementById('toggle-key-visibility').addEventListener('click', () => {
        const input = document.getElementById('api-key-input');
        const icon = document.querySelector('#toggle-key-visibility i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });

    // Config
    ['source-lang', 'target-lang', 'safe-mode', 'batch-size',
     'translate-dialogue', 'translate-names', 'translate-descriptions',
     'smart-filtering', 'context-aware', 'quality-check', 'preserve-formatting'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateConfigFromUI);
    });

    function updateConfigFromUI() {
        AppState.config.sourceLanguage = document.getElementById('source-lang').value;
        AppState.config.targetLanguage = document.getElementById('target-lang').value;
        AppState.config.safeMode = document.getElementById('safe-mode').value;
        AppState.config.batchSize = parseInt(document.getElementById('batch-size').value) || 10;
        AppState.config.translateDialogue = document.getElementById('translate-dialogue').checked;
        AppState.config.translateNames = document.getElementById('translate-names').checked;
        AppState.config.translateDescriptions = document.getElementById('translate-descriptions').checked;
        AppState.config.smartFiltering = document.getElementById('smart-filtering').checked;
        AppState.config.contextAware = document.getElementById('context-aware').checked;
        AppState.config.qualityCheck = document.getElementById('quality-check').checked;
        AppState.config.preserveFormatting = document.getElementById('preserve-formatting').checked;
    }

    // File upload
    document.getElementById('select-files').addEventListener('click', () => 
        document.getElementById('file-input').click()
    );
    document.getElementById('file-input').addEventListener('change', e => handleFiles(e.target.files));

    // Drag & Drop
    const overlay = document.getElementById('drag-overlay');
    const dropZone = document.getElementById('drop-zone');

    document.body.addEventListener('dragover', e => {
        e.preventDefault();
        if ([...e.dataTransfer.types].includes('Files')) {
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
        handleFiles(e);
    });

    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
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
        document.getElementById('install-btn').style.display = 'flex';
    });

    document.getElementById('install-btn').addEventListener('click', () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => deferredPrompt = null);
        }
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }

    // Hook để cập nhật cost realtime từ autotrans.js
    const stats = AppState.stats;
    Object.defineProperty(stats, 'estimatedCost', {
        configurable: true,
        get: () => stats._estimatedCost || 0,
        set: (val) => {
            stats._estimatedCost = val;
            AppState.updateStats();
        }
    });

    Object.defineProperty(stats, 'textsTranslated', {
        configurable: true,
        get: () => stats._textsTranslated || 0,
        set: (val) => {
            stats._textsTranslated = val;
            AppState.updateStats();
        }
    });
});