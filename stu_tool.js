// =================================================================
//  StuTool — 学生成绩录入（独立页面）
//  不加载 Shared/header，数据存独立 key `stu_tool_data`（本设备）
//  首次进入需设定姓名；之后直接进入录入界面
//  录入：任务类型(基础/随机) + 得分 + 用时；自动记录时间
// =================================================================
(function () {
    const STORAGE_KEY = 'stu_tool_data';
    const TYPE_LABELS = { basic: '基础', random: '随机' };
    // 满分定义（暂定：基础800 / 随机800），后续可在设置中调整
    const FULL_SCORE = { basic: 800, random: 800 };
    // 失误率："用时明显偏多"的判定——满分记录 >= 8 条时用中位数×1.5，否则只用分数
    const MEDIAN_MULTIPLIER = 1.5;
    const MIN_FULL_SAMPLES = 8;
    // 默认失误类型（快速点选）
    const DEFAULT_MISTAKES = [
        'drop失败', '取环丢环', '机器死机/失控', '车旋转角度过大',
        '车前进距离太大', '对柱不准', '对环不准',
    ];

    const Store = {
        load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : null;
                return {
                    name: (parsed && parsed.name) || '',
                    records: (parsed && Array.isArray(parsed.records)) ? parsed.records : [],
                };
            } catch (e) {
                return { name: '', records: [] };
            }
        },
        save(data) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        },
        generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
        },
    };

    const App = {
        data: { name: '', records: [] },

        init() {
            this.data = Store.load();
            this.bindEvents();
            if (!this.data.name) {
                this.showSetup();
            } else {
                this.showEntry();
            }
        },

        // ============ 成绩分析 ============
        computeAnalysis(type) {
            const records = this.data.records.filter((r) => r.type === type);
            const full = FULL_SCORE[type] || 0;
            const stats = { type, full, total: records.length, fullCount: 0, mistakeCount: 0, interval: null, fullRate: null, mistakeRate: null };
            if (records.length === 0) return stats;

            // 满分记录（得分 = 满分，且有时用）
            const fullWithTime = records.filter((r) => r.score === full && r.time != null).map((r) => r.time);
            const fullAny = records.filter((r) => r.score === full);
            stats.fullCount = fullAny.length;
            stats.fullRate = (fullAny.length / records.length) * 100;

            // 满分预测区间 = 满分记录平均用时 μ ± σ（满分样本 >= 2 才有意义）
            if (fullWithTime.length >= 2) {
                const mu = fullWithTime.reduce((a, b) => a + b, 0) / fullWithTime.length;
                const variance = fullWithTime.reduce((a, b) => a + (b - mu) ** 2, 0) / fullWithTime.length;
                const sigma = Math.sqrt(variance);
                stats.interval = { mu, sigma, low: mu - sigma, high: mu + sigma };
            }

            // 用时偏多阈值：满分样本 >= 8 条时用中位数×1.5
            let timeThreshold = null;
            if (fullWithTime.length >= MIN_FULL_SAMPLES) {
                const sorted = [...fullWithTime].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                timeThreshold = median * MEDIAN_MULTIPLIER;
            }

            // 失误判定
            records.forEach((r) => {
                let mistake = false;
                if (r.score !== full) mistake = true;              // 非满分
                else if (r.time == null) mistake = true;           // 满分但用时缺失
                else if (timeThreshold != null && r.time > timeThreshold) mistake = true; // 用时明显偏多
                if (mistake) stats.mistakeCount++;
            });
            stats.mistakeRate = records.length ? (stats.mistakeCount / records.length) * 100 : null;
            return stats;
        },

        renderAnalysis() {
            const content = document.getElementById('analysisContent');
            if (!content) return;
            const atype = this.analysisType || 'basic';
            const s = this.computeAnalysis(atype);

            if (s.total === 0) {
                content.innerHTML = '<div class="empty-state"><div class="icon">📊</div><p>暂无' + TYPE_LABELS[atype] + '成绩，录入后自动分析</p></div>';
                return;
            }

            // 满分区间
            let intervalHtml;
            if (s.interval) {
                intervalHtml = `
                    <div class="stat-cell">
                        <div class="stat-value" style="font-size:1.1rem;">${s.interval.mu.toFixed(1)}s ± ${s.interval.sigma.toFixed(1)}s</div>
                        <div class="stat-label">满分预测区间 [${s.interval.low.toFixed(1)} ~ ${s.interval.high.toFixed(1)}s]</div>
                    </div>`;
            } else {
                intervalHtml = `
                    <div class="stat-cell">
                        <div class="stat-value" style="font-size:1rem;color:var(--gray-400);">样本不足</div>
                        <div class="stat-label">满分预测区间（需≥2条满分记录）</div>
                    </div>`;
            }

            // 满分率 & 失误率
            const rateColor = (r) => r == null ? 'var(--gray-400)' : r >= 80 ? '#10b981' : r >= 50 ? '#f59e0b' : '#ef4444';
            content.innerHTML = `
                <div class="stat-grid">
                    ${intervalHtml}
                    <div class="stat-cell">
                        <div class="stat-value" style="color:${rateColor(s.fullRate)};">${s.fullRate != null ? s.fullRate.toFixed(1) + '%' : '-'}</div>
                        <div class="stat-label">满分率（${s.fullCount}/${s.total}）</div>
                    </div>
                    <div class="stat-cell">
                        <div class="stat-value" style="color:${rateColor(100 - s.mistakeRate)};">${s.mistakeRate != null ? s.mistakeRate.toFixed(1) + '%' : '-'}</div>
                        <div class="stat-label">失误率（${s.mistakeCount}/${s.total}）</div>
                    </div>
                </div>
                <div class="form-note" style="font-size:0.75rem;color:var(--gray-400);margin-top:0.5rem;">
                    失误 = 未满分 · 满分但未填用时 · 用时明显偏多（满分样本≥${MIN_FULL_SAMPLES}条时，用时&gt;满分中位数×${MEDIAN_MULTIPLIER}）
                </div>`;
        },

        // ============ 视图切换 ============
        showSetup() {
            document.getElementById('setupView').style.display = '';
            document.getElementById('entryView').style.display = 'none';
            document.getElementById('setupNameInput').value = '';
            document.getElementById('setupNameInput').focus();
        },

        showEntry() {
            document.getElementById('setupView').style.display = 'none';
            document.getElementById('entryView').style.display = '';
            document.getElementById('currentNameTag').textContent = '👤 ' + this.data.name;
            document.title = '成绩录入 - ' + this.data.name;
            this.analysisType = 'basic';
            this.selectedMistakes = new Set();
            this.customMistakes = [];
            this.renderMistakes();
            this.setDefaultScore();
            this.renderAnalysis();
            this.renderList();
        },

        // 得分默认填满分，方便快速录入
        setDefaultScore() {
            const typeSel = document.getElementById('entryTypeSelect');
            const scoreInput = document.getElementById('entryScoreInput');
            if (!typeSel || !scoreInput) return;
            const type = typeSel.value;
            const full = FULL_SCORE[type] || 0;
            scoreInput.value = full || '';
        },

        // ============ 失误点 ============
        renderMistakes() {
            const tags = document.getElementById('mistakeTags');
            if (!tags) return;
            tags.innerHTML = DEFAULT_MISTAKES.map((m) =>
                `<span class="mistake-tag${this.selectedMistakes.has(m) ? ' active' : ''}" data-mistake="${this.escapeHtml(m)}">${this.escapeHtml(m)}</span>`
            ).join('');
            tags.querySelectorAll('.mistake-tag').forEach((el) => {
                el.addEventListener('click', () => {
                    const val = el.dataset.mistake;
                    if (this.selectedMistakes.has(val)) this.selectedMistakes.delete(val);
                    else this.selectedMistakes.add(val);
                    el.classList.toggle('active', this.selectedMistakes.has(val));
                });
            });
            this.renderCustomMistakeTags();
        },

        renderCustomMistakeTags() {
            const tags = document.getElementById('mistakeOtherTags');
            if (!tags) return;
            if (this.customMistakes.length === 0) {
                tags.innerHTML = '';
                return;
            }
            tags.innerHTML = this.customMistakes.map((m) =>
                `<span class="mistake-tag${this.selectedMistakes.has(m) ? ' active' : ''}" data-mistake="${this.escapeHtml(m)}">${this.escapeHtml(m)}<span class="mistake-tag-x" data-x="${this.escapeHtml(m)}">✕</span></span>`
            ).join('');
            tags.querySelectorAll('.mistake-tag').forEach((el) => {
                el.addEventListener('click', (e) => {
                    if (e.target.classList.contains('mistake-tag-x')) return;
                    const val = el.dataset.mistake;
                    if (this.selectedMistakes.has(val)) this.selectedMistakes.delete(val);
                    else this.selectedMistakes.add(val);
                    el.classList.toggle('active', this.selectedMistakes.has(val));
                });
            });
            tags.querySelectorAll('.mistake-tag-x').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const val = el.dataset.x;
                    this.customMistakes = this.customMistakes.filter((m) => m !== val);
                    this.selectedMistakes.delete(val);
                    this.renderCustomMistakeTags();
                });
            });
        },

        addCustomMistake() {
            const input = document.getElementById('mistakeOtherInput');
            const val = (input.value || '').trim();
            if (!val) { this.toast('请输入失误类型', 'warning'); return; }
            if (DEFAULT_MISTAKES.includes(val) || this.customMistakes.includes(val)) {
                this.toast('该失误类型已存在', 'warning'); return;
            }
            this.customMistakes.push(val);
            this.selectedMistakes.add(val);
            input.value = '';
            this.renderCustomMistakeTags();
            this.toast('已添加：' + val);
        },

        escapeHtml(str) {
            return String(str).replace(/[&<>"']/g, (c) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
            }[c]));
        },

        // ============ 事件绑定 ============
        bindEvents() {
            const setupBtn = document.getElementById('setupConfirmBtn');
            if (setupBtn) setupBtn.addEventListener('click', () => this.confirmSetup());
            const setupInput = document.getElementById('setupNameInput');
            if (setupInput) setupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.confirmSetup(); });

            const switchBtn = document.getElementById('switchIdentityBtn');
            if (switchBtn) switchBtn.addEventListener('click', () => this.showSetup());

            const submitBtn = document.getElementById('entrySubmitBtn');
            if (submitBtn) submitBtn.addEventListener('click', () => this.submitEntry());

            const typeSel = document.getElementById('entryTypeSelect');
            if (typeSel) typeSel.addEventListener('change', () => this.setDefaultScore());

            const exportBtn = document.getElementById('exportEntryBtn');
            if (exportBtn) exportBtn.addEventListener('click', () => this.exportCSV());

            const otherAddBtn = document.getElementById('mistakeOtherAddBtn');
            if (otherAddBtn) otherAddBtn.addEventListener('click', () => this.addCustomMistake());
            const otherInput = document.getElementById('mistakeOtherInput');
            if (otherInput) otherInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.addCustomMistake(); } });

            const atoggle = document.getElementById('analysisTypeToggle');
            if (atoggle) {
                atoggle.querySelectorAll('.view-btn').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        this.analysisType = btn.dataset.atype;
                        atoggle.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b === btn));
                        this.renderAnalysis();
                    });
                });
            }
        },

        confirmSetup() {
            const name = document.getElementById('setupNameInput').value.trim();
            if (!name) { this.toast('请输入姓名', 'warning'); return; }
            this.data.name = name;
            Store.save(this.data);
            this.showEntry();
            this.toast('已设定姓名：' + name);
        },

        // ============ 录入 ============
        submitEntry() {
            const type = document.getElementById('entryTypeSelect').value;
            const scoreStr = document.getElementById('entryScoreInput').value.trim();
            const timeStr = document.getElementById('entryTimeInput').value.trim();

            const score = parseFloat(scoreStr);
            if (scoreStr === '' || isNaN(score) || score < 0) { this.toast('请输入有效得分', 'warning'); return; }
            const full = FULL_SCORE[type] || 0;
            if (score > full) { this.toast('得分不能高于满分 ' + full, 'warning'); return; }
            const time = timeStr ? (Math.round(parseFloat(timeStr) * 1000) / 1000) : null;
            if (timeStr && isNaN(time)) { this.toast('无效用时', 'warning'); return; }

            // 收集选中的失误点
            const mistakes = Array.from(this.selectedMistakes || []);

            this.data.records.push({
                id: Store.generateId(),
                type,
                score: Math.round(score),
                time,
                mistakes,
                submittedAt: new Date().toISOString(),
            });
            Store.save(this.data);
            document.getElementById('entryScoreInput').value = '';
            document.getElementById('entryTimeInput').value = '';
            // 清空失误点选择
            this.selectedMistakes = new Set();
            this.renderMistakes();
            this.setDefaultScore();
            this.renderAnalysis();
            this.renderList();
            this.toast('已记录：' + TYPE_LABELS[type] + ' ' + Math.round(score) + '分' + (mistakes.length ? '（' + mistakes.length + '个失误点）' : ''));
        },

        // ============ 列表 ============
        renderList() {
            const content = document.getElementById('entryListContent');
            const countEl = document.getElementById('entryListCount');
            const records = this.data.records;
            if (countEl) countEl.textContent = '共 ' + records.length + ' 条';

            if (records.length === 0) {
                content.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无录入记录</p></div>';
                return;
            }
            const sorted = [...records].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
            content.innerHTML = `<table class="score-table">
                <thead><tr><th>任务类型</th><th>得分</th><th>用时</th><th>失误点</th><th>记录时间</th></tr></thead>
                <tbody>${sorted.map((r) => `
                    <tr>
                        <td><span class="task-type-badge${r.type === 'random' ? ' challenge' : ''}">${TYPE_LABELS[r.type] || r.type}</span></td>
                        <td><strong>${r.score}</strong></td>
                        <td>${r.time != null ? r.time.toFixed(2) + 's' : '-'}</td>
                        <td style="font-size:0.78rem;">${this.renderMistakeLabels(r.mistakes)}</td>
                        <td style="color:var(--gray-400);font-size:0.78rem;">${new Date(r.submittedAt).toLocaleString('zh-CN')}</td>
                    </tr>`).join('')}</tbody>
            </table>`;
        },

        renderMistakeLabels(mistakes) {
            if (!mistakes || mistakes.length === 0) return '<span style="color:var(--gray-300);">-</span>';
            return mistakes.map((m) =>
                `<span class="mistake-tag" style="font-size:0.72rem;padding:0.05rem 0.4rem;cursor:default;">${this.escapeHtml(m)}</span>`
            ).join('');
        },

        // ============ 导出 ============
        exportCSV() {
            if (this.data.records.length === 0) { this.toast('暂无记录可导出', 'warning'); return; }
            const BOM = '\uFEFF';
            const escape = (v) => {
                const s = String(v ?? '');
                return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const header = ['姓名', '任务类型', '得分', '用时(秒)', '失误点', '记录时间'];
            const rows = [header.map(escape).join(',')];
            this.data.records.forEach((r) => {
                const submitted = new Date(r.submittedAt).toLocaleString('zh-CN');
                rows.push([
                    this.data.name,
                    TYPE_LABELS[r.type] || r.type,
                    r.score,
                    r.time != null ? r.time : '',
                    (r.mistakes || []).join('; '),
                    submitted,
                ].map(escape).join(','));
            });

            const csv = BOM + rows.join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `成绩录入_${this.data.name}.csv`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
            this.toast('已导出成绩');
        },

        toast(msg, type) {
            const container = document.getElementById('toastContainer');
            if (!container) { alert(msg); return; }
            const el = document.createElement('div');
            el.className = 'toast' + (type === 'warning' ? ' toast-warning' : '');
            el.textContent = msg;
            container.appendChild(el);
            setTimeout(() => el.remove(), 2600);
        },
    };

    window.StuTool = App;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }
})();
