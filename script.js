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

// ===== Toast =====
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

    if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
}

// ===== Key Status =====
function showKeyStatus(msg, type) {
    const el = document.getElementById('key-status');
    el.textContent = msg;
    el.className = `status-${type}`;
}

// ===== File Handling =====
let fileIdCounter = 0;

function handleFiles(source) {
    let files = [];
    if (source instanceof FileList) {
        files = Array.from(source);
    } else if (source.dataTransfer && source.dataTransfer.files) {
        files = Array.from(source.dataTransfer.files);
    }

    if (files.length === 0) return;

    files
        .filter(file => file.name.toLowerCase().endsWith('.json'))
        .forEach(file => {
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
            <button class="btn-icon btn-remove" onclick="removeFile('${fileObj.id}')" aria-label="Xóa">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    list.appendChild(item);
}

function getStatusText(status) {
    const map = { pending: 'Chờ', processing: 'Đang dịch', done: 'Hoàn thành', error: 'Lỗi' };
    return map[status] || 'Chờ';
}

function updateFileStatus(id, status) {
    const item = document.getElementById(id);
    if (item) {
        item.className = `file-item ${status}`;
        item.querySelector('.status').className = `status status-${status}`;
        item.querySelector('.status').textContent = getStatusText(status);
    }
}

function removeFile(id) {
    AppState.files = AppState.files.filter(f => f.id !== id);
    document.getElementById(id)?.remove();
    showToast('🗑️ Đã xóa file', 'info');
    AppState.updateStartButton();
    AppState.updateStats();
}

// ===== Translation & Controls =====
async function startTranslation() { /* giữ nguyên như phiên bản trước */ 
    // (copy từ phiên bản fix trước, phần này không lỗi)
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
            const translatedData = await AutoTransEngine.translateFile(file.data, file.name, AppState.config);
            downloadFile(file.name, translatedData);
            updateFileStatus(file.id, 'done');
            showToast(`✅ Hoàn thành: ${file.name}`, 'success');
        } catch (err) {
            updateFileStatus(file.id, 'error');
            showToast(`❌ Lỗi: ${err.message}`, 'error');
        }

        while (AppState.isPaused) {
            AppState.setStatus('Đã tạm dừng', 'paused');
            await new Promise(r => setTimeout(r, 500));
        }
    }

    AppState.setStatus('Hoàn thành!', 'success');
    showToast('🎉 Xong tất cả!', 'success');
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    AppState.updateStartButton();
}

function downloadFile(name, data) {
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
    btn.innerHTML = AppState.isPaused ? '<i class="fas fa-play"></i> Tiếp Tục' : '<i class="fas fa-pause"></i> Tạm Dừng';
    btn.classList.toggle('btn-pause', !AppState.isPaused);
    btn.classList.toggle('btn-primary', AppState.isPaused);
    if (!AppState.isPaused) startTranslation();
}

function clearAll() {
    if (!confirm('Xóa hết file?')) return;
    AppState.files = [];
    AppState.stats = { textsTranslated: 0, estimatedCost: 0 };
    document.getElementById('file-list').innerHTML = '';
    document.querySelector('#live-preview .placeholder').style.display = 'block';
    AppState.updateStats();
    AppState.updateProgress(0);
    AppState.setStatus('Sẵn sàng', 'info');
    AppState.updateStartButton();
}

// ===== DOM Loaded =====
document.addEventListener('DOMContentLoaded', () => {
    AppState.load();

    // API Key
    document.getElementById('save-key').onclick = () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (!key) return showKeyStatus('❌ Nhập key đi!', 'error');
        AppState.saveApiKey(key);
        showKeyStatus('✅ Lưu key OK!', 'success');
        AppState.updateStartButton();
    };

    document.getElementById('toggle-key-visibility').onclick = () => {
        const input = document.getElementById('api-key-input');
        const icon = document.querySelector('#toggle-key-visibility i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    };

    // Config update
    document.querySelectorAll('#source-lang, #target-lang, #safe-mode, #batch-size, .checkbox-group input').forEach(el => {
        el.addEventListener('change', () => {
            const id = el.id;
            if (el.type === 'checkbox') {
                AppState.config[id.replace(/translate-/, 'translate').replace(/-/g, '_')] = el.checked;
            } else if (el.type === 'number') {
                AppState.config.batchSize = parseInt(el.value) || 10;
            } else {
                AppState.config[id.replace(/-/g, '_')] = el.value;
            }
        });
    });

    // Upload
    document.getElementById('select-files').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = e => handleFiles(e.target.files);

    const overlay = document.getElementById('drag-overlay');
    const dropZone = document.getElementById('drop-zone');

    // Fix đúng cách kiểm tra types
    const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

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

    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e);
    });

    // Buttons
    document.getElementById('start-translation').onclick = startTranslation;
    document.getElementById('pause-translation').onclick = togglePause;
    document.getElementById('clear-all').onclick = clearAll;

    // PWA & SW
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('install-btn').style.display = 'flex';
    });
    document.getElementById('install-btn').onclick = () => deferredPrompt?.prompt();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }

    // Hook cost realtime
    Object.defineProperties(AppState.stats, {
        estimatedCost: {
            get: () => AppState.stats._cost || 0,
            set: v => { AppState.stats._cost = v; AppState.updateStats(); }
        },
        textsTranslated: {
            get: () => AppState.stats._texts || 0,
            set: v => { AppState.stats._texts = v; AppState.updateStats(); }
        }
    });
});