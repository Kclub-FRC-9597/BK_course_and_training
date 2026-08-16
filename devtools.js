// =================================================================
//  DevTools — 开发者工具（功能层）
//  存储引擎切换 + STS_DB 数据库管理 (DB Manager)
//  数据层依赖 shared.js + shared_indexdb.js；布局依赖 header.js
//  加载顺序：shared.js → shared_indexdb.js → header.js → devtools.js
//  原内容来源：migration.js（存储引擎 + DB Manager）
// =================================================================
if (!window.DevToolsApp) {
const DevToolsApp = {
    init() {
        Shared.loadData();
        this.bindEvents();
        this._checkEngineStatus();
        this.renderDB();
    },

    toast(msg, type) { Shared.toast(msg, type); },
    escapeHtml(str) { return Shared.escapeHtml(str); },

    // ============ 存储引擎 ============
    async _checkEngineStatus() {
        const status = document.getElementById('engineStatus');
        if (!status) return;
        const dbOk = await Shared._initIDB();
        const engine = Shared._getEngine();
        const idbRadio = document.querySelector('input[name="storageEngine"][value="idb"]');
        const lsRadio = document.querySelector('input[name="storageEngine"][value="ls"]');

        if (dbOk) {
            status.textContent = '✅ STS_DB 就绪';
            if (idbRadio) idbRadio.disabled = false;
        } else {
            status.textContent = '❌ IndexedDB 不可用，仅 localStorage';
            return;
        }

        // 恢复上次选择的引擎
        if (engine === 'idb') {
            if (idbRadio) idbRadio.checked = true;
            document.getElementById('switchToLSBtn').style.display = '';
            await Shared._overrideFromIDB();
            Shared.loadData();
            this.renderDB();
            this.toast('🗄️ 数据源: IndexedDB (STS_DB)');
        } else if (lsRadio) {
            lsRadio.checked = true;
        }
    },

    // ============ STS_DB (DB Manager) ============
    openDB(version) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('STS_DB', version);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
            req.onblocked = () => reject(new Error('数据库被其他标签页占用，请关闭后重试'));
        });
    },

    async getTableData(storeName) {
        const db = await this.openDB();
        const data = await new Promise(r => {
            const q = db.transaction(storeName).objectStore(storeName).getAll();
            q.onsuccess = () => r(q.result);
        });
        db.close();
        return data;
    },

    async deleteTable(storeName) {
        const db = await this.openDB();
        const oldVer = db.version;
        db.close();
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('STS_DB', oldVer + 1);
            req.onupgradeneeded = (e) => {
                const d = e.target.result;
                if (d.objectStoreNames.contains(storeName)) d.deleteObjectStore(storeName);
            };
            req.onsuccess = e => { e.target.result.close(); resolve(true); };
            req.onerror = e => reject(e.target.error);
            req.onblocked = () => reject(new Error('数据库被占用'));
        });
    },

    EXPECTED_SCHEMA: {
        students:    { indexes: [] },
        classes:     { indexes: [] },
        enrollments: { indexes: ['by_student', 'by_class', 'by_status'] },
    },

    async createTable(name) {
        const spec = this.EXPECTED_SCHEMA[name];
        if (!spec) return;
        try {
            const db = await this.openDB();
            const oldVer = db.version;
            db.close();
            await new Promise((resolve, reject) => {
                const req = indexedDB.open('STS_DB', oldVer + 1);
                req.onupgradeneeded = (e) => {
                    const d = e.target.result;
                    if (!d.objectStoreNames.contains(name)) {
                        const store = d.createObjectStore(name, { keyPath: 'id' });
                        spec.indexes.forEach(i => store.createIndex(i, i, { unique: false }));
                    }
                };
                req.onsuccess = e => { e.target.result.close(); resolve(); };
                req.onerror = e => reject(e.target.error);
                req.onblocked = () => reject(new Error('数据库被占用'));
            });
            this.toast(`✅ 表 "${name}" 已创建`);
            await this.renderDB();
        } catch (e) {
            this.toast(`❌ 创建失败: ${e.message}`, 'warning');
        }
    },

    async renderDB() {
        let db;
        try { db = await this.openDB(); } catch (e) {
            const info = document.getElementById('dbInfo');
            if (info) info.innerHTML = '❌ 无法连接';
            return;
        }
        if (!db) return;

        const names = Array.from(db.objectStoreNames);

        // 统计各表记录数（并行）
        const counts = {};
        await Promise.all(names.map(async (name) => {
            counts[name] = await new Promise(r => {
                const q = db.transaction(name).objectStore(name).count();
                q.onsuccess = () => r(q.result);
            });
        }));

        // ① 数据库信息
        const dbInfo = document.getElementById('dbInfo');
        if (dbInfo) dbInfo.innerHTML =
            `<span>版本: <strong>v${db.version}</strong></span>` +
            `<span style="margin-left:1rem;">表数量: <strong>${names.length}</strong></span>`;

        // ② Schema 校验
        const expected = Object.keys(this.EXPECTED_SCHEMA);
        const warnings = [];
        for (const name of expected) {
            if (!names.includes(name)) warnings.push(`缺失表: ${name}`);
        }
        for (const name of names) {
            const spec = this.EXPECTED_SCHEMA[name];
            if (!spec) { warnings.push(`多余表: ${name}`); continue; }
            const store = db.transaction(name).objectStore(name);
            for (const idx of spec.indexes) {
                if (!store.indexNames.contains(idx)) warnings.push(`表 ${name} 缺失索引: ${idx}`);
            }
        }
        const schemaCheck = document.getElementById('schemaCheck');
        if (schemaCheck) schemaCheck.innerHTML = warnings.length === 0
            ? '<span class="mig-badge ok">✅ Schema 与预期一致</span>'
            : warnings.map(w => `<div class="mig-badge missing" style="margin:0.15rem 0;">⚠ ${w}</div>`).join('');

        // ③ 表列表
        let rows = '';
        for (const name of names) {
            const badge = name === 'groups'
                ? '<span class="mig-badge old">旧表</span>'
                : `<span class="mig-badge ok">v${db.version}</span>`;
            rows += `<tr><td>${this.escapeHtml(name)}</td><td style="text-align:center;">${counts[name] ?? 0}</td><td>${badge}</td></tr>`;
        }
        const tableList = document.getElementById('tableList');
        if (tableList) tableList.innerHTML =
            `<thead><tr><th>表名</th><th style="text-align:center;">记录数</th><th>状态</th></tr></thead>` +
            `<tbody>${rows || '<tr><td colspan="3">无表</td></tr>'}</tbody>`;

        // ④ 数据查看下拉
        const sel = document.getElementById('tableSelect');
        if (sel) {
            sel.innerHTML = '<option value="">选择表...</option>' +
                names.map(n => `<option value="${n}">${n}</option>`).join('');
        }
        const dataCard = document.getElementById('dataCard');
        if (dataCard) dataCard.style.display = names.length ? '' : 'none';

        // ⑤ 逐表创建面板
        let panelHtml = '<table class="score-table"><thead><tr><th>表名</th><th>索引</th><th style="text-align:center;">状态</th><th>操作</th></tr></thead><tbody>';
        for (const [name, spec] of Object.entries(this.EXPECTED_SCHEMA)) {
            const exists = names.includes(name);
            const idxInfo = spec.indexes.length ? spec.indexes.join(', ') : '—';
            if (exists) {
                panelHtml += `<tr><td>${name}</td><td style="font-size:0.75rem;color:var(--gray-400);">${idxInfo}</td><td style="text-align:center;"><span class="mig-badge ok">✅</span></td><td></td></tr>`;
            } else {
                panelHtml += `<tr><td>${name}</td><td style="font-size:0.75rem;color:var(--gray-400);">${idxInfo}</td><td style="text-align:center;"><span class="mig-badge missing">❌ 缺失</span></td><td><button class="btn btn-outline btn-sm" data-create-table="${name}">创建此表</button></td></tr>`;
            }
        }
        panelHtml += '</tbody></table>';
        const schemaPanel = document.getElementById('schemaPanel');
        if (schemaPanel) {
            schemaPanel.innerHTML = panelHtml;
            schemaPanel.querySelectorAll('[data-create-table]').forEach((btn) => {
                btn.addEventListener('click', () => this.createTable(btn.dataset.createTable));
            });
        }

        // ⑥ 旧表清理按钮
        const deleteGroupsBtn = document.getElementById('deleteGroupsBtn');
        if (deleteGroupsBtn) deleteGroupsBtn.style.display = names.includes('groups') ? '' : 'none';

        db.close(); // 只关一次
    },

    async viewData() {
        const store = document.getElementById('tableSelect').value;
        if (!store) return;
        const data = await this.getTableData(store);
        const view = document.getElementById('dataView');
        if (data.length === 0) {
            view.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--gray-400);">空表</div>';
            return;
        }
        const keys = Object.keys(data[0]);
        let html = `<table class="score-table"><thead><tr>${keys.map(k => `<th>${this.escapeHtml(k)}</th>`).join('')}</tr></thead><tbody>`;
        for (const row of data) {
            html += '<tr>' + keys.map(k => {
                const v = row[k];
                const display = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
                return `<td title="${this.escapeHtml(display)}">${this.escapeHtml(display)}</td>`;
            }).join('') + '</tr>';
        }
        html += '</tbody></table>';
        view.innerHTML = html;
    },

    async deleteTableAction() {
        const store = document.getElementById('tableSelect').value;
        if (!store || !confirm(`确定删除表 "${store}" 吗？\n数据不可恢复！`)) return;
        try {
            await this.deleteTable(store);
            this.toast(`已删除 "${store}"`);
            await this.renderDB();
        } catch (e) {
            this.toast('失败: ' + e.message, 'warning');
        }
    },

    async deleteGroups() {
        if (!confirm('确定删除旧 groups 表吗？\n数据已迁移至 classes + enrollments。')) return;
        const log = document.getElementById('actionLog');
        log.style.display = 'block';
        log.textContent = '⏳ 删除 groups 表...\n';
        try {
            await this.deleteTable('groups');
            log.textContent += '✅ groups 表已删除\n💡 现在可移除此工具';
            document.getElementById('actionCard').style.display = 'none';
        } catch (e) {
            log.textContent += `❌ 失败: ${e.message}\n`;
        }
        await this.renderDB();
    },

    // ============ Events ============
    bindEvents() {
        // === 存储引擎 ===
        const verifyBtn = document.getElementById('verifyIDBBtn');
        if (verifyBtn) verifyBtn.addEventListener('click', async () => {
            const log = document.getElementById('idbVerifyLog');
            log.style.display = 'block';
            log.textContent = '⏳ 验证中...\n';

            const result = await Shared._verifyIDB();
            log.textContent = result.steps.join('\n');

            if (result.pass) {
                log.textContent += '\n\n══════ ✅ 全部通过 — 可切换到 IndexedDB ══════';
                const idbRadio = document.querySelector('input[name="storageEngine"][value="idb"]');
                if (idbRadio) idbRadio.disabled = false;
                this.toast('✅ 验证通过，可切换到 STS_DB');
            } else {
                log.textContent += '\n\n══════ ❌ 数据不一致 — 请勿切换 ══════';
            }
        });

        document.querySelectorAll('input[name="storageEngine"]').forEach(radio => {
            radio.addEventListener('change', async function () {
                if (this.value === 'idb') {
                    Shared._setEngine('idb');
                    Shared.loadData();
                    await Shared._overrideFromIDB();
                    document.getElementById('switchToLSBtn').style.display = '';
                    DevToolsApp.renderDB();
                    Shared.toast('🗄️ 已切换到 IndexedDB (STS_DB)');
                } else {
                    Shared._setEngine('ls');
                    Shared.loadData();
                    document.getElementById('switchToLSBtn').style.display = 'none';
                    DevToolsApp.renderDB();
                    Shared.toast('📦 已切换到 localStorage');
                }
            });
        });

        const switchToLSBtn = document.getElementById('switchToLSBtn');
        if (switchToLSBtn) switchToLSBtn.addEventListener('click', () => {
            const ls = document.querySelector('input[name="storageEngine"][value="ls"]');
            if (ls) ls.click();
        });

        // === DB Manager ===
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.renderDB());
        const viewDataBtn = document.getElementById('viewDataBtn');
        if (viewDataBtn) viewDataBtn.addEventListener('click', () => this.viewData());
        const deleteTableBtn = document.getElementById('deleteTableBtn');
        if (deleteTableBtn) deleteTableBtn.addEventListener('click', () => this.deleteTableAction());
        const deleteGroupsBtn = document.getElementById('deleteGroupsBtn');
        if (deleteGroupsBtn) deleteGroupsBtn.addEventListener('click', () => this.deleteGroups());
    },
};

window.DevToolsApp = DevToolsApp;
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.DevToolsApp.init());
} else {
    window.DevToolsApp.init();
}
