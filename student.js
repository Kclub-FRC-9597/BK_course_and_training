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
        // 训练成绩记录表筛选状态
        _recordFilter: { trainingId: '', mockId: '', taskId: '' },

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
                    this._recordFilter = { trainingId: '', mockId: '', taskId: '' }; // 切换学员重置筛选
                    if (!sid) {
                        document.getElementById('studentCardContent').innerHTML =
                            '<div class="empty-state"><div class="icon">👆</div><p>请在上方选择学员查看个人成绩</p></div>';
                        this.setPracticeCardsVisible(false);
                        return;
                    }
                    this.renderCard(sid, this.source);
                    this.renderPracticeList();
                });
            }
            const headerImportBtn = document.getElementById('importSelfTrainingBtn');
            if (headerImportBtn) headerImportBtn.addEventListener('click', () => this.openImportPractice());
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

            // ===== 训练成绩记录表筛选 =====
            const trFilter = document.getElementById('recordTrainingFilter');
            if (trFilter) trFilter.addEventListener('change', () => {
                this._recordFilter.trainingId = trFilter.value;
                this._recordFilter.mockId = ''; // 集训变化后重置赛项
                this.populateRecordMockFilter();
                this.renderPracticeList();
            });
            const mockFilter = document.getElementById('recordMockFilter');
            if (mockFilter) mockFilter.addEventListener('change', () => {
                this._recordFilter.mockId = mockFilter.value;
                this.renderPracticeList();
            });
            const taskFilter = document.getElementById('recordTaskFilter');
            if (taskFilter) taskFilter.addEventListener('change', () => {
                this._recordFilter.taskId = taskFilter.value;
                this.renderPracticeList();
            });
            const resetBtn = document.getElementById('recordFilterReset');
            if (resetBtn) resetBtn.addEventListener('click', () => this.resetRecordFilters());
        },

        resetRecordFilters() {
            this._recordFilter = { trainingId: '', mockId: '', taskId: '' };
            this.populateRecordFilters();
            this.renderPracticeList();
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
            const el = document.getElementById('practiceListCard');
            if (el) el.style.display = visible ? '' : 'none';
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

        // ============ 自主训练导入 ============
        getCurrentTraining() {
            const D = Shared.data;
            const id = D.currentTrainingId;
            return (D.trainings || []).find((t) => t.id === id) || (D.trainings || [])[0] || null;
        },

        // ============ 训练成绩记录表 ============
        // 汇总某学员在所有集训中的成绩记录（赛项记录 + 自主训练记录）
        getAllStudentRecords(studentId) {
            const D = Shared.data;
            const taskMap = {};
            (D.tasks || []).forEach((t) => { taskMap[t.id] = t; });
            const records = [];

            (D.trainings || []).forEach((training) => {
                const trainingName = training.name || '（未命名集训）';
                // ---- 赛项记录（mockCompetitions）----
                (training.mockCompetitions || []).forEach((mock) => {
                    if (mock.withdrawn && mock.withdrawn[studentId]) return;
                    const studentScores = mock.scores && mock.scores[studentId];
                    if (!studentScores) return;
                    Object.entries(studentScores).forEach(([taskId, entry]) => {
                        if (!entry) return;
                        const rounds = Shared.getRounds(entry);
                        rounds.forEach((r, idx) => {
                            if (!r) return;
                            const score = (r.score !== undefined && r.score !== null) ? r.score : null;
                            const time = (r.time !== undefined && r.time !== null) ? r.time : null;
                            if (score === null && time === null) return;
                            records.push({
                                kind: 'mock',
                                trainingId: training.id,
                                trainingName,
                                mockId: mock.id,
                                mockName: mock.name || Shared.getMockTypeText(mock),
                                competitionType: mock.competitionType || 'mock',
                                date: mock.date || '',
                                taskId,
                                taskName: taskMap[taskId] ? taskMap[taskId].name : taskId,
                                roundLabel: rounds.length > 1 ? '第' + (idx + 1) + '轮' : '—',
                                score,
                                time,
                                submittedAt: null,
                                recordId: mock.id + '|' + taskId + '|' + idx,
                                editable: false,
                            });
                        });
                    });
                });
                // ---- 自主训练记录（practiceRecords）----
                (training.practiceRecords || []).forEach((r) => {
                    if (r.studentId !== studentId) return;
                    const score = (r.score !== undefined && r.score !== null) ? r.score : null;
                    if (score === null) return;
                    records.push({
                        kind: 'practice',
                        trainingId: training.id,
                        trainingName,
                        mockId: 'practice',
                        mockName: '自主训练',
                        competitionType: 'practice',
                        date: r.date || (r.submittedAt || '').slice(0, 10) || '',
                        taskId: r.taskId,
                        taskName: taskMap[r.taskId] ? taskMap[r.taskId].name : r.taskId,
                        roundLabel: '第' + (r.round || 1) + '轮',
                        score,
                        time: (r.time !== undefined && r.time !== null) ? r.time : null,
                        submittedAt: r.submittedAt || null,
                        recordId: r.id,
                        editable: true,
                    });
                });
            });

            return records;
        },

        // 筛选后记录（含排序：日期倒序 → 提交时间倒序）
        getFilteredRecords() {
            let records = this.getAllStudentRecords(this.selectedStudentId);
            const f = this._recordFilter;
            if (f.trainingId) records = records.filter((r) => r.trainingId === f.trainingId);
            if (f.mockId) records = records.filter((r) => r.mockId === f.mockId);
            if (f.taskId) records = records.filter((r) => r.taskId === f.taskId);
            records.sort((a, b) =>
                (b.date || '').localeCompare(a.date || '') ||
                (b.submittedAt || '').localeCompare(a.submittedAt || '') ||
                (a.trainingName || '').localeCompare(b.trainingName || '') ||
                (a.mockName || '').localeCompare(b.mockName || '')
            );
            return records;
        },

        // 填充筛选下拉（集训 / 任务 / 赛项）
        populateRecordFilters() {
            const studentId = this.selectedStudentId;
            if (!studentId) return;
            const trSel = document.getElementById('recordTrainingFilter');
            const mockSel = document.getElementById('recordMockFilter');
            const taskSel = document.getElementById('recordTaskFilter');
            if (!trSel || !mockSel || !taskSel) return;
            const D = Shared.data;

            // 集训：仅列出该学员有记录（赛项或自主训练）的集训
            const trainings = (D.trainings || []).filter((t) => {
                const hasMock = (t.mockCompetitions || []).some((m) =>
                    m.scores && m.scores[studentId] && Object.keys(m.scores[studentId]).length > 0);
                const hasPractice = (t.practiceRecords || []).some((r) => r.studentId === studentId);
                return hasMock || hasPractice;
            });
            let trHtml = '<option value="">全部集训</option>';
            trainings.forEach((t) => {
                trHtml += `<option value="${Shared.escapeHtml(t.id)}"${this._recordFilter.trainingId === t.id ? ' selected' : ''}>${Shared.escapeHtml(t.name || '（未命名集训）')}</option>`;
            });
            trSel.innerHTML = trHtml;

            // 任务：全部任务
            let taskHtml = '<option value="">全部任务</option>';
            (D.tasks || []).forEach((t) => {
                taskHtml += `<option value="${Shared.escapeHtml(t.id)}"${this._recordFilter.taskId === t.id ? ' selected' : ''}>${Shared.escapeHtml(t.name)}</option>`;
            });
            taskSel.innerHTML = taskHtml;

            this.populateRecordMockFilter();
        },

        // 填充赛项下拉（依赖集训筛选）
        populateRecordMockFilter() {
            const studentId = this.selectedStudentId;
            if (!studentId) return;
            const mockSel = document.getElementById('recordMockFilter');
            if (!mockSel) return;
            const D = Shared.data;
            const f = this._recordFilter;
            const trainings = f.trainingId
                ? (D.trainings || []).filter((t) => t.id === f.trainingId)
                : (D.trainings || []);
            const mocks = [];
            let hasPractice = false;
            trainings.forEach((t) => {
                if ((t.practiceRecords || []).some((r) => r.studentId === studentId)) hasPractice = true;
                (t.mockCompetitions || []).forEach((m) => {
                    const studentScores = m.scores && m.scores[studentId];
                    if (studentScores && Object.keys(studentScores).length > 0) {
                        mocks.push(m);
                    }
                });
            });
            let html = '<option value="">全部赛项</option>';
            if (hasPractice) {
                html += `<option value="practice"${f.mockId === 'practice' ? ' selected' : ''}>🎯 自主训练</option>`;
            }
            mocks.forEach((m) => {
                const label = `${Shared.getMockTypeLabel(m)} · ${m.name || Shared.getMockTypeText(m)}`;
                html += `<option value="${Shared.escapeHtml(m.id)}"${f.mockId === m.id ? ' selected' : ''}>${Shared.escapeHtml(label)}</option>`;
            });
            mockSel.innerHTML = html;
            // 当前 mockId 若已不在选项中则重置
            if (f.mockId && !Array.from(mockSel.options).some((o) => o.value === f.mockId)) {
                f.mockId = '';
            }
        },

        // 赛项类型徽章
        renderMockBadge(competitionType) {
            if (competitionType === 'practice') {
                return '<span class="task-type-badge" style="background:#e0f2fe;color:#0369a1;">🎯 自主训练</span>';
            }
            if (competitionType === 'official') {
                return '<span class="task-type-badge" style="background:#fef3c7;color:#b45309;">🏆 正赛</span>';
            }
            return '<span class="task-type-badge" style="background:#dbeafe;color:#1d4ed8;">🏅 模拟赛</span>';
        },

        // ============ 训练成绩记录表渲染 ============
        renderPracticeList() {
            const card = document.getElementById('practiceListCard');
            if (!card) return;
            const studentId = this.selectedStudentId;
            if (!studentId) { this.setPracticeCardsVisible(false); return; }
            this.setPracticeCardsVisible(true);

            this.populateRecordFilters();
            const records = this.getFilteredRecords();
            const countEl = document.getElementById('practiceListCount');
            const content = document.getElementById('practiceListContent');
            if (countEl) countEl.textContent = `共 ${records.length} 条`;
            if (records.length === 0) {
                content.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无符合条件的成绩记录</p></div>';
                return;
            }
            content.innerHTML = `<table class="score-table">
                <thead><tr>
                    <th>日期</th><th>集训</th><th>赛项</th><th>任务</th><th>轮次</th><th>得分</th><th>用时</th><th>记录时间</th><th></th>
                </tr></thead>
                <tbody>${records.map((r) => {
                    const sub = r.submittedAt ? new Date(r.submittedAt).toLocaleString('zh-CN') : '—';
                    const action = r.editable
                        ? `<button class="btn btn-sm btn-outline" data-edit="${Shared.escapeHtml(r.recordId)}">✎ 修改</button>`
                        : '';
                    return `<tr>
                        <td>${Shared.escapeHtml(r.date || '-')}</td>
                        <td>${Shared.escapeHtml(r.trainingName)}</td>
                        <td>${this.renderMockBadge(r.competitionType)} ${Shared.escapeHtml(r.mockName)}</td>
                        <td>${Shared.escapeHtml(r.taskName)}</td>
                        <td style="color:var(--gray-500);">${Shared.escapeHtml(r.roundLabel)}</td>
                        <td><strong>${r.score}</strong></td>
                        <td>${r.time != null ? Number(r.time).toFixed(2) + 's' : '-'}</td>
                        <td style="color:var(--gray-400);font-size:0.78rem;">${Shared.escapeHtml(sub)}</td>
                        <td>${action}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>`;
            content.querySelectorAll('[data-edit]').forEach((btn) => {
                btn.addEventListener('click', () => this.openEditPractice(btn.dataset.edit));
            });
        },

        // ============ 编辑自主训练记录（保留 submittedAt，跨集训查找） ============
        findPracticeRecord(prId) {
            const D = Shared.data;
            for (const training of (D.trainings || [])) {
                const record = (training.practiceRecords || []).find((r) => r.id === prId);
                if (record) return { training, record };
            }
            return null;
        },

        openEditPractice(prId) {
            const found = this.findPracticeRecord(prId);
            if (!found) return;
            const { training, record } = found;
            this._editingPracticeId = prId;
            const taskMap = {};
            (Shared.data.tasks || []).forEach((t) => { taskMap[t.id] = t; });
            document.getElementById('editPracticeMeta').textContent =
                `${Shared.escapeHtml(training.name || '（未命名集训）')} · ${Shared.escapeHtml(taskMap[record.taskId] ? taskMap[record.taskId].name : record.taskId)} · ${record.date || ''} · 第${record.round || 1}轮`;
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
            const found = this.findPracticeRecord(id);
            if (!found) return;
            const { record } = found;
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

        // ============ 导出（导出当前筛选的训练成绩记录） ============
        exportPractice() {
            const studentId = this.selectedStudentId;
            if (!studentId) { this.toast('请先选择学员', 'warning'); return; }
            const student = (Shared.data.students || []).find((s) => s.id === studentId);
            this.populateRecordFilters();
            const records = this.getFilteredRecords();
            if (records.length === 0) { this.toast('该学员暂无符合条件的成绩记录', 'warning'); return; }

            const BOM = '\uFEFF';
            const escape = (v) => {
                const s = String(v ?? '');
                return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const header = ['集训', '赛项', '类型', '日期', '任务', '得分', '用时(秒)', '记录时间'];
            const rows = [header.map(escape).join(',')];
            records.forEach((r) => {
                const typeText = r.competitionType === 'practice' ? '自主训练'
                    : (r.competitionType === 'official' ? '正赛' : '模拟赛');
                const score = r.score !== undefined && r.score !== null ? r.score : '';
                const time = r.time != null ? r.time : '';
                const submitted = r.submittedAt
                    ? new Date(r.submittedAt).toLocaleString('zh-CN')
                    : (r.date || '');
                rows.push([r.trainingName, r.mockName, typeText, r.date, r.taskName, score, time, submitted].map(escape).join(','));
            });

            const csv = BOM + rows.join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `训练成绩记录_${student ? student.name : studentId}.csv`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
            this.toast('已导出训练成绩记录');
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
