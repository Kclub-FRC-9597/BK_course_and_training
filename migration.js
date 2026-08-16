// =================================================================
//  Migration — 数据迁移（功能层）
//  数据备份 / 跨设备同步（localStorage 导出/导入）
//  数据层依赖 shared.js + shared_indexdb.js；布局依赖 header.js
//  加载顺序：shared.js → shared_indexdb.js → header.js → migration.js
//  存储引擎 + STS_DB 管理已移至 devtools.js（开发者工具）
// =================================================================
if (!window.MigrationApp) {
const MigrationApp = {
    _pendingImport: null,

    init() {
        Shared.loadData();
        this.bindEvents();
    },

    toast(msg, type) { Shared.toast(msg, type); },
    escapeHtml(str) { return Shared.escapeHtml(str); },

    // ============ 数据备份 / 跨设备同步 ============
    // 导出 localStorage 全部键为 JSON 文件
    exportAllData() {
        try {
            const keys = {};
            let totalBytes = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                keys[key] = value;
                totalBytes += (key.length + (value ? value.length : 0)) * 2; // UTF-16 近似字节
            }
            const payload = {
                app: 'insTools',
                type: 'localstorage-backup',
                formatVersion: 1,
                exportedAt: new Date().toISOString(),
                keyCount: Object.keys(keys).length,
                keys,
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `insTools_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.toast(`✅ 已导出 ${payload.keyCount} 个键，约 ${(totalBytes / 1024).toFixed(1)} KB`);
        } catch (e) {
            console.warn('exportAllData error:', e);
            this.toast('导出失败', 'warning');
        }
    },

    // 解析并预览导入文件
    async handleImportFile(file) {
        if (!file) return;
        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            if (!payload || typeof payload !== 'object' || !payload.keys || typeof payload.keys !== 'object') {
                this.toast('文件格式不正确：缺少 keys 字段', 'warning');
                return;
            }
            this._pendingImport = payload;
            const keyNames = Object.keys(payload.keys);
            const totalBytes = keyNames.reduce((s, k) => s + (k.length + (payload.keys[k] ? payload.keys[k].length : 0)) * 2, 0);
            const timeStr = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : '未知';
            let info = `📄 ${file.name}\n导出时间：${timeStr}\n键数量：${keyNames.length}　数据量：${(totalBytes / 1024).toFixed(1)} KB`;
            if (payload.keys.sts_storage_mode === 'idb') {
                info += '\n⚠️ 源设备处于 IndexedDB 模式，本次备份不含 STS_DB 数据；建议在源设备切回 localStorage 后重新导出';
            }
            document.getElementById('importPreviewInfo').textContent = info;
            document.getElementById('importKeyList').textContent = keyNames.join('\n');
            document.getElementById('importModal').classList.add('open');
        } catch (e) {
            console.warn('handleImportFile error:', e);
            this.toast('导入文件解析失败：不是有效的 JSON', 'warning');
        }
    },

    closeImportModal() {
        document.getElementById('importModal').classList.remove('open');
        this._pendingImport = null;
    },

    confirmImport() {
        const payload = this._pendingImport;
        if (!payload) return;
        const mode = document.querySelector('input[name="importMode"]:checked').value;
        try {
            if (mode === 'overwrite') localStorage.clear();
            Object.keys(payload.keys).forEach((k) => localStorage.setItem(k, payload.keys[k]));
            Shared.loadData();
            const modeLabel = mode === 'overwrite' ? '整体覆盖' : '合并写入';
            this.toast(`✅ 已导入 ${Object.keys(payload.keys).length} 个键（${modeLabel}）`);
            this.closeImportModal();
        } catch (e) {
            console.warn('confirmImport error:', e);
            this.toast('导入写入失败', 'warning');
        }
    },

    // ============ Events ============
    bindEvents() {
        // === 数据备份 / 导入导出 ===
        const exportBtn = document.getElementById('exportDataBtn');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportAllData());
        const importBtn = document.getElementById('importDataBtn');
        if (importBtn) importBtn.addEventListener('click', () => document.getElementById('importFileInput').click());
        const importFileInput = document.getElementById('importFileInput');
        if (importFileInput) importFileInput.addEventListener('change', (e) => {
            this.handleImportFile(e.target.files[0]);
            e.target.value = '';
        });
        const importCancel = document.getElementById('importModalCancel');
        if (importCancel) importCancel.addEventListener('click', () => this.closeImportModal());
        const importConfirm = document.getElementById('importModalConfirm');
        if (importConfirm) importConfirm.addEventListener('click', () => this.confirmImport());
        const importModal = document.getElementById('importModal');
        if (importModal) importModal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeImportModal();
        });
    },
};

window.MigrationApp = MigrationApp;
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.MigrationApp.init());
} else {
    window.MigrationApp.init();
}
