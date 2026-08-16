// =================================================================
//  Student Card — 个人成绩卡 + 自主训练录入
//  面向教练/管理员（下拉选学生）与学生（选自己）
//  来源切换：正赛(official) / 模拟赛(mock) / 自主训练(practice) / 全部(all)
//  自主训练：录入时自动记 submittedAt；修改时保留原 submittedAt
// =================================================================
(function () {
    const StudentCard = {
        source: 'all',
        selectedStudentId: null,
        _editingPracticeId: null,

        init() {
            Shared.loadData();
            this.renderStudentSelect();
            this.bindEvents();
            this.bindSourceToggle();
        },

        // ============ 学生下拉 ============
        renderStudentSelect() {
            const sel = document.getElementById('studentSelect');
            if (!sel) return;
            const students = Shared.data.students || [];
            if (students.length === 0) {
                sel.innerHTML = '<option value="">— 暂无学员 —</option>';
                return;
            }
            let html = '<option value="">— 请选择学员 —</option>';
            students.forEach((s) => {
                html += `<option value="${Shared.escapeHtml(s.id)}">${Shared.escapeHtml(s.name)}</option>`;
            });
            sel.innerHTML = html;
        },

        bindEvents() {
            const sel = document.getElementById('studentSelect');
            if (sel) {
                sel.addEventListener('change', () => {
                    const sid = sel.value;
                    this.selectedStudentId = sid || null;
                    if (!sid) {
                        document.getElementById('studentCardContent').innerHTML =
                            '<div class="empty-state"><div class="icon">👆</div><p>请在上方选择学员查看个人成绩</p></div>';
                        this.setPracticeCardsVisible(false);
                        return;
                    }
                    this.renderCard(sid, this.source);
                    this.renderPracticeEntry();
                    this.renderPracticeList();
                });
            }
            const submitBtn = document.getElementById('practiceSubmitBtn');
            if (submitBtn) submitBtn.addEventListener('click', () => this.submitPractice());
            const exportBtn = document.getElementById('exportPracticeBtn');
            if (exportBtn) exportBtn.addEventListener('click', () => this.exportPractice());
            const importBtn = document.getElementById('importPracticeBtn');
            if (importBtn) importBtn.addEventListener('click', () => this.openImportPractice());
            const cancel = document.getElementById('editPracticeCancel');
            if (cancel) cancel.addEventListener('click', () => this.closeEditPractice());
            const save = document.getElementById('editPracticeSave');
            if (save) save.addEventListener('click', () => this.confirmEditPractice());
            const modal = document.getElementById('editPracticeModal');
            if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) this.closeEditPractice(); });
            const impCancel = document.getElementById('importPracticeCancel');
            if (impCancel) impCancel.addEventListener('click', () => this.closeImportPractice());
            const impConfirm = document.getElementById('importPracticeConfirm');
            if (impConfirm) impConfirm.addEventListener('click', () => this.confirmImportPractice());
            const impModal = document.getElementById('importPracticeModal');
            if (impModal) impModal.addEventListener('click', (e) => { if (e.target === impModal) this.closeImportPractice(); });
        },

        bindSourceToggle() {
            const toggle = document.getElementById('sourceToggle');
            if (!toggle) return;
            toggle.querySelectorAll('.view-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.source = btn.dataset.source;
                    toggle.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b === btn));
                    if (this.selectedStudentId) {
                        this.renderCard(this.selectedStudentId, this.source);
                        this.renderPracticeList();
                    }
                });
            });
        },

        setPracticeCardsVisible(visible) {
            ['practiceEntryCard', 'practiceListCard'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.style.display = visible ? '' : 'none';
            });
        },

        // ============ 统计 ============
        // 收集某学生在所有集训中按任务聚合的成绩，按来源过滤
        // source: 'official'(正赛) | 'mock'(模拟赛) | 'practice'(自主训练) | 'all'(全部)
        collectStudentScores(studentId, source) {
            const D = Shared.data;
            const taskMap = {};
            (D.tasks || []).forEach((t) => { taskMap[t.id] = t; });

            const perTask = {};
            let totalScores = [];
            let totalTimes = [];
            const addEntry = (tid, score, time) => {
                if (!perTask[tid]) perTask[tid] = { scores: [], times: [], fullTimes: [], count: 0 };
                const p = perTask[tid];
                const task = taskMap[tid];
                if (score !== null && score !== undefined) { p.scores.push(score); totalScores.push(score); }
                if (time !== null && time !== undefined) { p.times.push(time); totalTimes.push(time); }
                if (task && task.maxScore && score === task.maxScore && time != null) p.fullTimes.push(time);
                p.count += 1;
            };

            const wantMock = source === 'all' || source === 'competition';
            const wantPractice = source === 'all' || source === 'practice';

            (D.trainings || []).forEach((training) => {
                if (wantMock) {
                    (training.mockCompetitions || []).forEach((mock) => {
                        const mockSource = mock.competitionType || 'mock';
                        if (source === 'competition') {
                            if (mockSource !== 'mock' && mockSource !== 'official') return;
                        }
                        const scores = mock.scores || {};
                        const studentScores = scores[studentId];
                        if (!studentScores) return;
                        Object.entries(studentScores).forEach(([tid, entry]) => {
                            if (!entry) return;
                            addEntry(tid, Shared.getDisplayScore(entry), Shared.getBestScoreTime(entry));
                        });
                    });
                }

                if (wantPractice) {
                    (training.practiceRecords || []).forEach((r) => {
                        if (r.studentId !== studentId) return;
                        addEntry(r.taskId, (r.score !== undefined && r.score !== null) ? r.score : null, (r.time !== undefined && r.time !== null) ? r.time : null);
                    });
                }
            });

            return { perTask, totalScores, totalTimes, taskMap };
        },

        buildStats(studentId, source) {
            const { perTask, totalScores, totalTimes, taskMap } = this.collectStudentScores(studentId, source || 'all');
            const student = (Shared.data.students || []).find((s) => s.id === studentId);

            // 统计卡
            const stats = {
                best: totalScores.length ? Math.max(...totalScores) : null,
                avg: totalScores.length ? totalScores.reduce((a, b) => a + b, 0) / totalScores.length : null,
                fullScoreRate: null,
                count: totalScores.length,
                bestTime: totalTimes.length ? Math.min(...totalTimes) : null,
                taskCount: Object.keys(perTask).length,
            };

            // 满分率：对每个有 maxScore 的任务，按最佳分算
            const withMax = [];
            Object.entries(perTask).forEach(([tid, p]) => {
                const task = taskMap[tid];
                if (task && task.maxScore && p.scores.length > 0) {
                    withMax.push(Math.max(...p.scores) / task.maxScore);
                }
            });
            if (withMax.length > 0) {
                stats.fullScoreRate = (withMax.reduce((a, b) => a + b, 0) / withMax.length) * 100;
            }

            // 各任务最佳分（用于条形图）
            const taskBars = Object.entries(perTask)
                .map(([tid, p]) => {
                    const task = taskMap[tid];
                    return {
                        taskId: tid,
                        name: task ? task.name : tid,
                        type: task ? task.type : 'basic',
                        maxScore: task ? (task.maxScore || null) : null,
                        best: p.scores.length ? Math.max(...p.scores) : null,
                        bestTime: p.times.length ? Math.min(...p.times) : null,
                        bestFullScoreTime: p.fullTimes.length ? Math.min(...p.fullTimes) : null,
                        count: p.count,
                    };
                })
                .sort((a, b) => (b.best || 0) - (a.best || 0));

            return { student, stats, taskBars, taskMap };
        },

        // ============ 渲染 ============
        renderCard(studentId, source) {
            const container = document.getElementById('studentCardContent');
            const src = source || this.source || 'all';
            const { student, stats, taskBars, taskMap } = this.buildStats(studentId, src);

            if (!student) {
                container.innerHTML = '<div class="empty-state"><div class="icon">❓</div><p>学员不存在</p></div>';
                return;
            }

            const toggle = document.getElementById('sourceToggle');
            if (toggle) toggle.style.display = 'inline-flex';

            const name = Shared.escapeHtml(student.name);

            // ---- 统计卡 ----
            const statCell = (label, value, color) => `
                <div class="stat-cell">
                    <div class="stat-value" style="${color ? 'color:' + color + ';' : ''}">${value}</div>
                    <div class="stat-label">${label}</div>
                </div>`;

            const cardHtml = `
                <div class="student-card-header">
                    <div class="student-card-avatar">👤</div>
                    <div class="student-card-name">${name}</div>
                    <div class="student-card-sub">共 ${stats.count} 条成绩 · ${stats.taskCount} 个任务</div>
                </div>
                <div class="stat-grid">
                    ${statCell('🏆 最佳分', stats.best !== null ? stats.best : '-', '#2563eb')}
                    ${statCell('📊 平均分', stats.avg !== null ? stats.avg.toFixed(1) : '-', '#7c3aed')}
                    ${statCell('🎯 满分率', stats.fullScoreRate !== null ? stats.fullScoreRate.toFixed(1) + '%' : '-',
                        stats.fullScoreRate === 100 ? '#10b981' : stats.fullScoreRate >= 80 ? '#f59e0b' : '#ef4444')}
                    ${statCell('⏱ 最佳用时', stats.bestTime !== null ? stats.bestTime.toFixed(1) + 's' : '-', '#0891b2')}
                </div>`;

            // ---- 各任务最佳分条形图 ----
            let barsHtml = '';
            if (taskBars.length === 0) {
                barsHtml = '<div class="empty-state"><div class="icon">📭</div><p>暂无成绩数据</p></div>';
            } else {
                const maxScoreOverall = Math.max(...taskBars.map((b) => b.maxScore || b.best || 0), 1);
                barsHtml = taskBars.map((b) => {
                    const pct = (b.best !== null ? Math.min(100, (b.best / (b.maxScore || maxScoreOverall)) * 100) : 0);
                    const typeBadge = b.type === 'challenge' ? '<span class="task-type-badge challenge">挑战</span>' : '<span class="task-type-badge">基本功</span>';
                    const value = b.best !== null
                        ? (b.maxScore ? `${b.best} / ${b.maxScore}` : `${b.best}`)
                        : '-';
                    const taskDef = taskMap[b.taskId] || null;
                    const goalTimes = Shared.getGoalTimes(taskDef, null, null);
                    let goalHtml = '';
                    if (goalTimes) {
                        const current = Shared.currentGoal(b.bestFullScoreTime, goalTimes);
                        if (current) {
                            goalHtml = `<div style="font-size:0.7rem;color:#ef4444;font-weight:600;">🎯 ${current}s</div>`;
                        } else {
                            goalHtml = '<div style="font-size:0.7rem;color:#10b981;">🎯 全部达标</div>';
                        }
                    }
                    return `
                        <div class="task-bar-row">
                            <div class="task-bar-label">
                                <span class="task-bar-name">${Shared.escapeHtml(b.name)}</span>
                                ${typeBadge}
                                <span class="task-bar-count">${b.count}次</span>
                                ${goalHtml}
                            </div>
                            <div class="score-bar"><div class="score-bar-fill" style="width:${pct}%;"></div></div>
                            <div class="task-bar-value">${value}</div>
                        </div>`;
                }).join('');
            }

            container.innerHTML = `
                ${cardHtml}
                <div class="card" style="margin-top:1rem;">
                    <div class="card-header">
                        <span class="card-title">🏅 各任务最佳成绩</span>
                    </div>
                    <div class="task-bar-list">${barsHtml}</div>
                </div>`;
        },

        // ============ 自主训练录入 ============
        getCurrentTraining() {
            const D = Shared.data;
            const id = D.currentTrainingId;
            return (D.trainings || []).find((t) => t.id === id) || (D.trainings || [])[0] || null;
        },

        renderPracticeEntry() {
            const card = document.getElementById('practiceEntryCard');
            if (!card) return;
            const training = this.getCurrentTraining();
            const nameEl = document.getElementById('practiceEntryTrainingName');
            if (nameEl) nameEl.textContent = training ? '当前集训：' + training.name : '（无集训）';
            const taskSel = document.getElementById('practiceTaskSelect');
            if (!taskSel) return;
            const tasks = Shared.data.tasks || [];
            taskSel.innerHTML = '<option value="">— 选择任务 —</option>' + tasks.map((t) =>
                `<option value="${t.id}">${Shared.escapeHtml(t.name)}</option>`
            ).join('');
            document.getElementById('practiceScoreInput').value = '';
            document.getElementById('practiceTimeInput').value = '';
            this.setPracticeCardsVisible(true);
        },

        submitPractice() {
            const studentId = this.selectedStudentId;
            if (!studentId) { this.toast('请先选择学员', 'warning'); return; }
            const training = this.getCurrentTraining();
            if (!training) { this.toast('暂无集训，无法记录', 'warning'); return; }
            const taskId = document.getElementById('practiceTaskSelect').value;
            const scoreStr = document.getElementById('practiceScoreInput').value.trim();
            const timeStr = document.getElementById('practiceTimeInput').value.trim();
            if (!taskId) { this.toast('请选择任务', 'warning'); return; }
            const score = parseFloat(scoreStr);
            if (scoreStr === '' || isNaN(score) || score < 0) { this.toast('请输入有效得分', 'warning'); return; }
            const time = timeStr ? (Math.round(parseFloat(timeStr) * 1000) / 1000) : null;
            if (timeStr && isNaN(time)) { this.toast('无效用时', 'warning'); return; }

            if (!training.practiceRecords) training.practiceRecords = [];
            const date = new Date().toISOString().slice(0, 10);
            const existingMax = Math.max(0, ...training.practiceRecords
                .filter((r) => r.date === date && r.studentId === studentId && r.taskId === taskId)
                .map((r) => r.round || 0));
            training.practiceRecords.push({
                id: Shared.generateId(),
                studentId,
                taskId,
                date,
                round: existingMax + 1,
                score: Math.round(score),
                time,
                source: 'practice',
                submittedAt: new Date().toISOString(),
            });
            Shared.saveData();
            document.getElementById('practiceScoreInput').value = '';
            document.getElementById('practiceTimeInput').value = '';
            this.toast('已提交自主训练记录');
            this.renderPracticeList();
            this.renderCard(studentId, this.source);
        },

        // ============ 练习记录列表 ============
        renderPracticeList() {
            const card = document.getElementById('practiceListCard');
            if (!card) return;
            const studentId = this.selectedStudentId;
            if (!studentId) { this.setPracticeCardsVisible(false); return; }
            this.setPracticeCardsVisible(true);

            const training = this.getCurrentTraining();
            const countEl = document.getElementById('practiceListCount');
            const content = document.getElementById('practiceListContent');
            if (!training || !training.practiceRecords) {
                if (countEl) countEl.textContent = '';
                if (content) content.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无自主训练记录</p></div>';
                return;
            }
            const records = training.practiceRecords
                .filter((r) => r.studentId === studentId)
                .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.submittedAt || '').localeCompare(a.submittedAt || ''));
            const taskMap = {};
            (Shared.data.tasks || []).forEach((t) => { taskMap[t.id] = t; });
            if (countEl) countEl.textContent = `共 ${records.length} 条`;
            if (records.length === 0) {
                content.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无自主训练记录</p></div>';
                return;
            }
            content.innerHTML = `<table class="score-table">
                <thead><tr><th>日期</th><th>任务</th><th>轮次</th><th>得分</th><th>用时</th><th>提交时间</th><th></th></tr></thead>
                <tbody>${records.map((r) => {
                    const task = taskMap[r.taskId];
                    const name = task ? task.name : r.taskId;
                    const sub = r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : (r.date || '-');
                    return `<tr>
                        <td>${Shared.escapeHtml(r.date || '-')}</td>
                        <td>${Shared.escapeHtml(name)}</td>
                        <td>${r.round || 1}</td>
                        <td><strong>${r.score}</strong></td>
                        <td>${r.time != null ? r.time.toFixed(2) + 's' : '-'}</td>
                        <td style="color:var(--gray-400);font-size:0.78rem;">${Shared.escapeHtml(sub)}</td>
                        <td><button class="btn btn-sm btn-outline" data-edit="${r.id}">✎ 修改</button></td>
                    </tr>`;
                }).join('')}</tbody>
            </table>`;
            content.querySelectorAll('[data-edit]').forEach((btn) => {
                btn.addEventListener('click', () => this.openEditPractice(btn.dataset.edit));
            });
        },

        // ============ 编辑练习记录（保留 submittedAt） ============
        openEditPractice(prId) {
            const training = this.getCurrentTraining();
            if (!training || !training.practiceRecords) return;
            const record = training.practiceRecords.find((r) => r.id === prId);
            if (!record) return;
            this._editingPracticeId = prId;
            const taskMap = {};
            (Shared.data.tasks || []).forEach((t) => { taskMap[t.id] = t; });
            document.getElementById('editPracticeMeta').textContent =
                `${Shared.escapeHtml(taskMap[record.taskId] ? taskMap[record.taskId].name : record.taskId)} · ${record.date || ''} · 第${record.round || 1}轮`;
            document.getElementById('editPracticeScoreInput').value = record.score;
            document.getElementById('editPracticeTimeInput').value = record.time != null ? record.time : '';
            document.getElementById('editPracticeSubmitted').textContent =
                record.submittedAt ? '提交时间（保持不变）：' + new Date(record.submittedAt).toLocaleString('zh-CN') : '（此条记录无提交时间戳）';
            document.getElementById('editPracticeModal').classList.add('open');
        },

        closeEditPractice() {
            document.getElementById('editPracticeModal').classList.remove('open');
            this._editingPracticeId = null;
        },

        confirmEditPractice() {
            const id = this._editingPracticeId;
            if (!id) return;
            const training = this.getCurrentTraining();
            if (!training || !training.practiceRecords) return;
            const record = training.practiceRecords.find((r) => r.id === id);
            if (!record) return;
            const scoreStr = document.getElementById('editPracticeScoreInput').value.trim();
            const timeStr = document.getElementById('editPracticeTimeInput').value.trim();
            const score = parseFloat(scoreStr);
            if (scoreStr === '' || isNaN(score) || score < 0) { this.toast('请输入有效得分', 'warning'); return; }
            const time = timeStr ? (Math.round(parseFloat(timeStr) * 1000) / 1000) : null;
            record.score = Math.round(score);
            record.time = time;
            // 保留 record.submittedAt 不变
            Shared.saveData();
            this.closeEditPractice();
            this.toast('已更新记录（提交时间保持不变）');
            this.renderPracticeList();
            this.renderCard(this.selectedStudentId, this.source);
        },

        // ============ 导出 ============
        exportPractice() {
            const studentId = this.selectedStudentId;
            if (!studentId) { this.toast('请先选择学员', 'warning'); return; }
            const student = (Shared.data.students || []).find((s) => s.id === studentId);
            const records = this.getAllPracticeRecords(studentId);
            if (records.length === 0) { this.toast('该学员暂无练习记录', 'warning'); return; }
            const taskMap = {};
            (Shared.data.tasks || []).forEach((t) => { taskMap[t.id] = t; });

            const BOM = '\uFEFF';
            const escape = (v) => {
                const s = String(v ?? '');
                return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const header = ['数据类型', '得分', '用时(秒)', '记录时间'];
            const rows = [header.map(escape).join(',')];
            records.forEach((r) => {
                const task = taskMap[r.taskId];
                const typeLabel = (task && task.type === 'challenge') ? '挑战类' : '基本功';
                const score = r.score !== undefined && r.score !== null ? r.score : '';
                const time = r.time != null ? r.time : '';
                const submitted = r.submittedAt
                    ? new Date(r.submittedAt).toLocaleString('zh-CN')
                    : (r.date || '');
                rows.push([typeLabel, score, time, submitted].map(escape).join(','));
            });

            const csv = BOM + rows.join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `练习记录_${student ? student.name : studentId}.csv`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
            this.toast('已导出练习记录');
        },

        // ============ 导入 ============
        openImportPractice() {
            const modal = document.getElementById('importPracticeModal');
            if (!modal) return;
            // 目标集训：默认当前
            const trSel = document.getElementById('importTrainingSelect');
            const trainings = Shared.data.trainings || [];
            const cur = this.getCurrentTraining();
            trSel.innerHTML = trainings.map((t) =>
                `<option value="${t.id}"${cur && t.id === cur.id ? ' selected' : ''}>${Shared.escapeHtml(t.name)}</option>`
            ).join('');
            // 任务映射：基础 → ? / 随机 → ?
            const tasks = Shared.data.tasks || [];
            const taskOptions = tasks.map((t) =>
                `<option value="${t.id}">${Shared.escapeHtml(t.name)}</option>`
            ).join('');
            const basicSel = document.getElementById('importBasicTask');
            const randomSel = document.getElementById('importRandomTask');
            if (basicSel) {
                basicSel.innerHTML = '<option value="">— 选择任务 —</option>' + taskOptions;
            }
            if (randomSel) {
                randomSel.innerHTML = '<option value="">— 选择任务 —</option>' + taskOptions;
            }
            document.getElementById('importPracticeCsv').value = '';
            document.getElementById('importPracticeResult').textContent = '';
            modal.classList.add('open');
        },

        closeImportPractice() {
            document.getElementById('importPracticeModal').classList.remove('open');
        },

        confirmImportPractice() {
            const text = document.getElementById('importPracticeCsv').value.trim();
            if (!text) { this.toast('请粘贴数据', 'warning'); return; }
            const trainingId = document.getElementById('importTrainingSelect').value;
            if (!trainingId) { this.toast('请选择目标集训', 'warning'); return; }
            const basicTaskId = document.getElementById('importBasicTask').value;
            const randomTaskId = document.getElementById('importRandomTask').value;
            if (!basicTaskId || !randomTaskId) { this.toast('请设置基础/随机的任务映射', 'warning'); return; }
            const training = (Shared.data.trainings || []).find((t) => t.id === trainingId);
            if (!training) return;
            if (!training.practiceRecords) training.practiceRecords = [];

            // 学员按姓名匹配
            const students = Shared.data.students || [];
            const nameToStudent = {};
            students.forEach((s) => { nameToStudent[s.name] = s; });

            const lines = text.split('\n').filter((l) => l.trim());
            let success = 0, errors = [];
            const roundCounts = {};
            lines.forEach((line, i) => {
                const parts = line.split(',').map((s) => s.trim());
                if (parts.length < 3) { errors.push(`第${i + 1}行: 字段不足`); return; }
                const [nameStr, typeStr, scoreStr, timeStr, mistakeStr, timeSubmitted] = parts;
                const student = nameToStudent[nameStr];
                if (!student) { errors.push(`第${i + 1}行: 找不到学员"${nameStr}"`); return; }
                const score = parseFloat(scoreStr);
                if (isNaN(score)) { errors.push(`第${i + 1}行: 无效得分"${scoreStr}"`); return; }
                const time = timeStr && !isNaN(parseFloat(timeStr)) ? (Math.round(parseFloat(timeStr) * 1000) / 1000) : null;
                // 任务类型映射：基础 → basicTaskId，随机 → randomTaskId
                const isRandom = typeStr === '随机';
                const taskId = isRandom ? randomTaskId : basicTaskId;
                // 记录时间：有则解析，缺失则用当前时间
                let submittedAt = null;
                if (timeSubmitted) {
                    const d = new Date(timeSubmitted.replace(/-/g, '/'));
                    if (!isNaN(d.getTime())) submittedAt = d.toISOString();
                }
                const date = submittedAt ? submittedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
                // 失误点：分号/逗号分隔
                const mistakes = mistakeStr
                    ? mistakeStr.split(/[;；、]/).map((m) => m.trim()).filter(Boolean)
                    : [];
                // round 递增（同 date+student+task）
                const key = date + '|' + student.id + '|' + taskId;
                if (!roundCounts[key]) roundCounts[key] = 0;
                roundCounts[key]++;
                const existingMax = Math.max(0, ...training.practiceRecords
                    .filter((r) => r.date === date && r.studentId === student.id && r.taskId === taskId)
                    .map((r) => r.round || 0));
                training.practiceRecords.push({
                    id: Shared.generateId(),
                    studentId: student.id,
                    taskId,
                    date,
                    round: Math.max(roundCounts[key], existingMax + 1),
                    score: Math.round(score),
                    time,
                    mistakes,
                    source: 'practice',
                    submittedAt: submittedAt || new Date().toISOString(),
                });
                success++;
            });

            Shared.saveData();
            this.renderPracticeList();
            this.renderCard(this.selectedStudentId, this.source);
            const resultEl = document.getElementById('importPracticeResult');
            if (errors.length > 0) {
                resultEl.innerHTML = `<span style="color:var(--success);">✅ 成功导入 ${success} 条</span><br><span style="color:var(--danger);">⚠️ ${errors.length} 条错误：</span><br><span style="font-size:0.78rem;color:var(--gray-500);">${errors.join('<br>')}</span>`;
                this.toast(`导入完成：${success} 成功，${errors.length} 失败`, 'warning');
            } else {
                resultEl.innerHTML = `<span style="color:var(--success);">✅ 成功导入 ${success} 条</span>`;
                this.toast(`成功导入 ${success} 条练习记录`);
                setTimeout(() => this.closeImportPractice(), 1200);
            }
        },

        // 汇总所有集训中某学员的练习记录
        getAllPracticeRecords(studentId) {
            const all = [];
            (Shared.data.trainings || []).forEach((t) => {
                (t.practiceRecords || []).forEach((r) => {
                    if (r.studentId === studentId) all.push(r);
                });
            });
            return all;
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

    window.StudentCard = StudentCard;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => StudentCard.init());
    } else {
        StudentCard.init();
    }
})();
