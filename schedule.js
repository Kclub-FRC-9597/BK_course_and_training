// =================================================================
//  Schedule — 共享赛程模块
//  排位顺序按比赛（mock）记录，存于 mock.schedule（list + roundId）
//  加载顺序：shared.js → schedule.js → 页面脚本
// =================================================================
const Schedule = {
    // ============ Data Access ============
    loadOrder(mock, defaultIds) {
        if (!mock || !mock.id) return [...(defaultIds || [])];
        const entry = mock.schedule;
        const validIds = defaultIds || [];
        return (entry && entry.list && entry.list.length === validIds.length &&
                entry.list.every(id => validIds.includes(id))) ? entry.list : [...validIds];
    },

    saveOrder(mock, list, roundId) {
        if (!mock || !window.Shared) return;
        if (!mock.schedule) mock.schedule = {};
        if (list !== null && list !== undefined) mock.schedule.list = list;
        if (roundId !== undefined) mock.schedule.roundId = roundId;
        Shared.saveData();
    },

    loadRoundId(mock) {
        if (!mock || !mock.schedule) return null;
        return mock.schedule.roundId || null;
    },

    shuffle(list) {
        const arr = [...list];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    // ============ Status ============
    // 按单个任务轮次判定 (display 页面用)
    getStatusByRound(mock, orderList, taskId, roundNum, getRoundsFn) {
        const withdrawn = [], completed = [], pending = [];
        const scores = mock ? (mock.scores || {}) : {};
        orderList.forEach(sid => {
            const entry = scores[sid] && scores[sid][taskId];
            if (!entry) { pending.push(sid); return; }
            const rounds = getRoundsFn(entry);
            const r = rounds[(roundNum || 1) - 1];
            if (!r) { pending.push(sid); return; }
            if (r.withdrawn) { withdrawn.push(sid); }
            else if (r.score !== undefined && r.score !== null) { completed.push(sid); }
            else { pending.push(sid); }
        });
        return { pending, completed, withdrawn };
    },

    // 按全部任务判定 (training 录入弹窗用)
    getStatusAllTasks(mock, orderList, getRoundsFn) {
        const withdrawn = [], completed = [], pending = [];
        const scores = mock ? (mock.scores || {}) : {};
        const tasks = mock ? (mock.tasks || []) : [];
        orderList.forEach(sid => {
            let allDone = true, anyDone = false, hasWithdrawn = false;
            tasks.forEach(ti => {
                const entry = scores[sid] && scores[sid][ti.taskId || '__default__'];
                if (!entry) { allDone = false; return; }
                const rounds = getRoundsFn(entry);
                for (let r = 0; r < (ti.rounds || 1); r++) {
                    const rd = rounds[r];
                    if (rd && rd.withdrawn) { hasWithdrawn = true; allDone = false; }
                    else if (!rd || rd.score === undefined) { allDone = false; }
                    else { anyDone = true; }
                }
            });
            if (hasWithdrawn) { withdrawn.push(sid); }
            else if (allDone && anyDone) { completed.push(sid); }
            else { pending.push(sid); }
        });
        return { pending, completed, withdrawn };
    },

    // ============ Rendering ============
    // Display 页面面板（纯展示，无控件）
    renderDisplayPanel(container, training, orderList, selectedMockId, selectedRoundId, escapeHtmlFn) {
        const D = window.Shared ? Shared.data : {};
        const mocks = training.mockCompetitions || [];
        if (orderList.length !== training.studentIds.length ||
            !orderList.every(id => training.studentIds.includes(id))) {
            orderList = [...training.studentIds];
        }

        const studentMap = {};
        (D.students || []).forEach(s => { studentMap[s.id] = s.name; });

        const selMock = selectedMockId ? mocks.find(m => m.id === selectedMockId) : (mocks[mocks.length - 1] || null);

        // Status
        let pending = [], completed = [], withdrawn = [];
        if (selMock && selectedRoundId) {
            const [taskId, roundStr] = selectedRoundId.split('_R');
            const status = this.getStatusByRound(selMock, orderList, taskId, parseInt(roundStr, 10), window.Shared.getRounds.bind(window.Shared));
            pending = status.pending; completed = status.completed; withdrawn = status.withdrawn;
        } else {
            pending = [...orderList];
        }

        const lanes = (selMock && selMock.concurrentLanes) || 1;
        const inProgress = pending.slice(0, lanes);
        const preparing = pending.slice(lanes);

        // Current round label
        let roundLabel = '';
        if (selMock && selectedRoundId) {
            const [tid, rStr] = selectedRoundId.split('_R');
            const def = (D.tasks || []).find(td => td.id === tid);
            const tname = def ? def.name : '未知任务';
            roundLabel = `<div style="font-size:0.72rem;color:var(--display-muted);margin-bottom:0.4rem;">当前：${escapeHtmlFn(tname)} R${rStr}</div>`;
        }

        const renderLi = (sid, i, cls = '') =>
            `<li class="${cls}"><span class="order-num">${i + 1}</span>${escapeHtmlFn(studentMap[sid] || '未知')}</li>`;

        container.innerHTML = `
            <h3>🎯 赛程</h3>
            ${roundLabel}
            ${inProgress.length > 0 ? `
            <div class="order-section">
                <div class="order-section-title active-title">⚡ 进行中 (${inProgress.length})</div>
                <ol class="order-list">${inProgress.map((sid, i) => renderLi(sid, i)).join('')}</ol>
            </div>` : ''}
            ${preparing.length > 0 ? `
            <div class="order-section">
                <div class="order-section-title" style="color:var(--display-accent);opacity:0.7;">⏳ 准备中 (${preparing.length})</div>
                <ol class="order-list">${preparing.map((sid, i) => renderLi(sid, inProgress.length + i)).join('')}</ol>
            </div>` : ''}
            ${completed.length > 0 ? `
            <div class="order-section">
                <div class="order-section-title done-title">✅ 已完成 (${completed.length})</div>
                <ol class="order-list">${completed.map((sid, i) => renderLi(sid, i)).join('')}</ol>
            </div>` : ''}
            ${withdrawn.length > 0 ? `
            <div class="order-section">
                <div class="order-section-title" style="color:var(--danger);">🚫 弃权 (${withdrawn.length})</div>
                <ol class="order-list">${withdrawn.map((sid, i) => renderLi(sid, i)).join('')}</ol>
            </div>` : ''}`;
    },

    // Training 录入弹窗内面板（紧凑版，含轮次选择和排序控件）
    renderTrainingPanel(mock, training, orderList, selectedRoundId, onShuffle, onReset, onRoundChange, escapeHtmlFn) {
        const D = window.Shared ? Shared.data : {};
        const studentMap = {};
        (D.students || []).forEach(s => { studentMap[s.id] = s.name; });

        const status = this.getStatusAllTasks(mock, orderList, window.Shared ? window.Shared.getRounds.bind(window.Shared) : (() => []));
        const { pending, completed, withdrawn } = status;
        const lanes = (mock && mock.concurrentLanes) || 1;

        const inProgress = pending.slice(0, lanes);
        const preparing = pending.slice(lanes);

        // Round options from mock's task rounds
        let roundOptions = '<option value="">-- 选择轮次 --</option>';
        let roundIdx = 0;
        if (mock && mock.tasks) {
            mock.tasks.forEach(ti => {
                const def = (D.tasks || []).find(td => td.id === ti.taskId);
                const tname = def ? def.name : '未知任务';
                const n = ti.rounds || 1;
                for (let r = 1; r <= n; r++) {
                    const rid = ti.taskId + '_R' + r;
                    roundIdx++;
                    roundOptions += `<option value="${rid}" ${rid === selectedRoundId ? 'selected' : ''}>${roundIdx}. ${escapeHtmlFn(tname)} R${r}</option>`;
                }
            });
        }

        const renderItem = (sid, i) =>
            `<div class="sch-item"><span class="sch-num">${i + 1}</span><span>${escapeHtmlFn(studentMap[sid] || '未知')}</span></div>`;

        return `
            <div style="font-weight:700;margin-bottom:0.3rem;font-size:0.85rem;">📋 赛程</div>
            <select style="width:100%;padding:0.25rem 0.35rem;font-size:0.72rem;border:1px solid var(--gray-300);border-radius:4px;margin-bottom:0.4rem;font-family:inherit;" id="scheduleRoundSelect">${roundOptions}</select>
            <div style="display:flex;gap:0.25rem;margin-bottom:0.4rem;">
                <button style="flex:1;padding:0.3rem 0.3rem;font-size:0.7rem;border-radius:4px;border:1px solid var(--primary);background:#dbeafe;color:var(--primary);cursor:pointer;font-weight:600;" id="btnSchShuffle">🔀 随机</button>
                <button style="flex:1;padding:0.3rem 0.3rem;font-size:0.7rem;border-radius:4px;border:1px solid var(--gray-300);background:#fff;color:var(--gray-600);cursor:pointer;font-weight:600;" id="btnSchReset">↺ 重置</button>
            </div>
            <div style="font-size:0.7rem;color:var(--gray-400);margin-bottom:0.35rem;">同时 ${lanes} 场</div>
            ${inProgress.length > 0 ? `
            <div style="font-weight:700;font-size:0.7rem;color:#2563eb;border-bottom:1px solid var(--gray-200);padding-bottom:0.15rem;margin-bottom:0.3rem;">⚡ 进行中 (${inProgress.length})</div>
            ${inProgress.map((sid, i) => renderItem(sid, i)).join('')}` : ''}
            ${preparing.length > 0 ? `
            <div style="font-weight:700;font-size:0.7rem;color:var(--gray-400);border-bottom:1px solid var(--gray-200);padding-bottom:0.15rem;margin-top:0.4rem;margin-bottom:0.3rem;">⏳ 准备中 (${preparing.length})</div>
            ${preparing.map((sid, i) => renderItem(sid, inProgress.length + i)).join('')}` : ''}
            ${completed.length > 0 ? `
            <div style="font-weight:700;font-size:0.7rem;color:var(--success);border-bottom:1px solid var(--gray-200);padding-bottom:0.15rem;margin-top:0.4rem;margin-bottom:0.3rem;">✅ 已完成 (${completed.length})</div>
            ${completed.map((sid, i) => renderItem(sid, i)).join('')}` : ''}
            ${withdrawn.length > 0 ? `
            <div style="font-weight:700;font-size:0.7rem;color:var(--danger);border-bottom:1px solid var(--gray-200);padding-bottom:0.15rem;margin-top:0.4rem;margin-bottom:0.3rem;">🚫 弃权 (${withdrawn.length})</div>
            ${withdrawn.map((sid, i) => renderItem(sid, i)).join('')}` : ''}`;
    }
};

window.Schedule = Schedule;
