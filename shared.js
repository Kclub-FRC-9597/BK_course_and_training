// =================================================================
//  Shared — 通用数据层 & 工具函数
//  所有页面在 header.js 之前加载此文件
// =================================================================
const Shared = {
    // ============ Data Store ============
    data: {
        students: [],
        tasks: [],
        trainings: [],
        classes: [],
        enrollments: [],
        currentTrainingId: null,
        challengeTaskFilter: null,
    },

    // ============ ID Generation ============
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    },

    // ============ Persistence ============
    loadData() {
        try {
            const raw = localStorage.getItem("makexScoreData");
            if (raw) {
                const parsed = JSON.parse(raw);
                const rawGroups = parsed.groups || []; // 仅迁移使用
                this.data.classes = parsed.classes || [];
                this.data.enrollments = parsed.enrollments || [];
                this.data.students = (parsed.students || []).map((s) => {
                    // 只保留需要的字段，剥离 groupId/group 等遗留字段
                    return { id: s.id, name: s.name };
                });
                this.data.tasks = parsed.tasks || [];
                this.data.challengeTaskFilter = parsed.challengeTaskFilter || null;
                this.data.currentTrainingId = parsed.currentTrainingId || null;
                this.data.trainings = (parsed.trainings || []).map((t) => ({
                    ...t,
                    mockCompetitions: (t.mockCompetitions || []).map((m) => ({
                        ...m,
                        scores: m.scores || {},
                    })),
                }));
                // Migrate old groups + groupId → classes + enrollments
                let changed = false;
                if (rawGroups.length > 0 && this.data.classes.length === 0) {
                    this._migrateGroupIdToEnrollments(rawGroups, parsed.students || []);
                    changed = true;
                }
                // Migrate old per-training scheduleOrder → per-mock mock.schedule
                const legacySchedule = parsed.scheduleOrder;
                if (legacySchedule && typeof legacySchedule === 'object') {
                    (this.data.trainings || []).forEach(t => {
                        const entry = legacySchedule[t.id];
                        if (!entry) return;
                        (t.mockCompetitions || []).forEach(m => {
                            if (!m.schedule) m.schedule = {};
                            if (entry.list) m.schedule.list = entry.list;
                            if (entry.roundId) m.schedule.roundId = entry.roundId;
                        });
                    });
                    delete this.data.scheduleOrder;
                    changed = true;
                }
                if (changed) this.saveData();
            }
        } catch (e) {
            console.warn('Failed to load data:', e);
        }
    },

    // 切换引擎后覆盖 data（仅 admin 页调用，不改变其他页面）
    async _overrideFromIDB() {
        if (this._getEngine() !== 'idb') return;
        const classes = await this._readClassesFromIDB();
        const students = await this._readStudentsFromIDB();
        if (classes) this.data.classes = classes;
        if (students) {
            this.data.students = students.map(s => ({ id: s.id, name: s.name }));
        }
    },

    saveData() {
        try {
            localStorage.setItem('makexScoreData', JSON.stringify(this.data));
            // 同页内通知订阅者
            this._notifyListeners();
        } catch (e) {
            console.warn('Failed to save data:', e);
        }
    },

    // ============ Reactive Data Layer (跨页面联动) ============
    // 订阅者列表：{ callback, source? }
    _listeners: [],
    _storageBound: false,

    // 注册数据变化监听（返回取消订阅的函数）
    onDataChange(callback, source) {
        const entry = { callback, source };
        this._listeners.push(entry);
        // 首次注册时绑定跨标签页 storage 事件
        if (!this._storageBound) {
            this._storageBound = true;
            window.addEventListener('storage', (e) => {
                if (e.key === 'makexScoreData' && e.newValue) {
                    try {
                        const parsed = JSON.parse(e.newValue);
                        // 浅合并：只更新顶层 key，保留引用稳定性
                        Object.keys(parsed).forEach(k => {
                            this.data[k] = parsed[k];
                        });
                        // 跨标签页变化：用 'storage' 作为 source
                        this._notifyListeners('storage');
                    } catch (err) { /* ignore */ }
                }
            });
        }
        // 返回取消订阅函数
        return () => {
            this._listeners = this._listeners.filter(l => l !== entry);
        };
    },

    // 取消某个来源的订阅
    offDataChange(source) {
        this._listeners = this._listeners.filter(l => l.source !== source);
    },

    // 通知所有订阅者
    _notifyListeners(triggerSource) {
        // 防抖：200ms 内多次 saveData 只触发一次通知
        if (this._notifyTimer) clearTimeout(this._notifyTimer);
        this._notifyTimer = setTimeout(() => {
            this._listeners.forEach(l => {
                try { l.callback(triggerSource || 'local'); } catch (e) { /* ignore */ }
            });
        }, 200);
    },

    // ============ Toast ============
    toast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.3s';
            setTimeout(() => el.remove(), 300);
        }, 2200);
    },

    // ============ Utility ============
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // ============ Class / Enrollment Helpers ============
    // 兼容旧接口：直接用 classId 查班级名
    getGroupName(groupId) {
        if (!groupId) return '';
        const c = this.data.classes.find(c => c.id === groupId);
        return c ? c.name : '';
    },

    // 获取学员当前的 enrollment（status=active 且 leftAt=null）
    getCurrentEnrollment(studentId) {
        return this.data.enrollments.find(e =>
            e.studentId === studentId && e.status === 'active'
        ) || null;
    },

    // 获取学员当前所在班级 ID
    getCurrentClassId(studentId) {
        const e = this.getCurrentEnrollment(studentId);
        return e ? e.classId : null;
    },

    // 获取学员当前班级名
    getCurrentClassName(studentId) {
        const classId = this.getCurrentClassId(studentId);
        return classId ? this.getGroupName(classId) : '';
    },

    // 获取某班级当前在读学员列表
    getClassStudents(classId) {
        const ids = this.data.enrollments
            .filter(e => e.classId === classId && e.status === 'active')
            .map(e => e.studentId);
        return this.data.students.filter(s => ids.includes(s.id));
    },

    // 获取学员完整入学历史（含班级名称）
    getStudentHistory(studentId) {
        return this.data.enrollments
            .filter(e => e.studentId === studentId)
            .map(e => ({
                ...e,
                className: this.getGroupName(e.classId),
            }))
            .sort((a, b) => a.enrolledAt.localeCompare(b.enrolledAt));
    },

    // ============ Enrollment Operations ============
    // 创建 enrollment（自动关旧、开新）
    createEnrollment(studentId, classId) {
        const current = this.getCurrentEnrollment(studentId);
        if (current) {
            if (current.classId === classId) return; // 已在同班，不做任何事
            current.leftAt = new Date().toISOString().slice(0, 10);
            current.status = 'transferred';
        }
        this.data.enrollments.push({
            id: this.generateId(),
            studentId,
            classId,
            enrolledAt: new Date().toISOString().slice(0, 10),
            leftAt: null,
            status: 'active',
        });
    },

    // 关闭 enrollment（退班/毕业）
    closeEnrollment(enrollmentId, reason = 'inactive') {
        const e = this.data.enrollments.find(x => x.id === enrollmentId);
        if (!e) return;
        e.leftAt = new Date().toISOString().slice(0, 10);
        e.status = reason;
    },

    // ============ 数据迁移：旧 groupId 模式 → enrollment 模式 ============
    _migrateGroupIdToEnrollments(rawGroups, rawStudents) {
        // 将 groups 复制到 classes
        this.data.classes = rawGroups.map(g => ({ ...g }));
        // 为每个有 groupId/group 的学员创建 enrollment
        rawStudents.forEach(s => {
            const gid = s.groupId || s.group || '';
            if (gid) {
                const studentId = s.id;
                const exists = this.data.enrollments.some(e =>
                    e.studentId === studentId && e.classId === gid && e.status === 'active'
                );
                if (!exists) {
                    this.data.enrollments.push({
                        id: this.generateId(),
                        studentId,
                        classId: gid,
                        enrolledAt: '2026-01-01',
                        leftAt: null,
                        status: 'active',
                    });
                }
            }
        });
    },

    // ============ Entry Helpers (shared by stats & training) ============
    getRounds(entry) {
        if (!entry) return [];
        if (entry.round1) return [entry.round1, entry.round2].filter(Boolean);
        return [entry];
    },

    getBestScore(entry) {
        const rounds = this.getRounds(entry);
        const sc = rounds.map((r) => r?.score).filter((s) => s !== undefined && s !== null);
        return sc.length > 0 ? Math.max(...sc) : null;
    },

    getBestScoreTime(entry) {
        const rounds = this.getRounds(entry);
        const valid = rounds.filter((r) => r?.score !== undefined && r?.score !== null);
        if (valid.length === 0) return null;
        const bestScore = Math.max(...valid.map((r) => r.score));
        const best = valid.find((r) => r.score === bestScore);
        return best?.time ?? null;
    },

    getDisplayScore(entry) {
        if (!entry) return null;
        if (entry.round1 === undefined) return entry.score ?? null;
        return this.getBestScore(entry);
    },

    // ============ Mock 类型工具 ============
    // competitionType: 'mock'(模拟赛) | 'official'(正赛)
    getMockType(mock) {
        return (mock && mock.competitionType) || 'mock';
    },
    // 纯文本（无 emoji）：用于名称生成 / CSV 导出
    getMockTypeText(mock) {
        const t = this.getMockType(mock);
        return t === 'official' ? '正赛' : '模拟赛';
    },
    // 带 emoji 的标签：用于界面徽章
    getMockTypeLabel(mock) {
        const t = this.getMockType(mock);
        return t === 'official' ? '🏆 正赛' : '🏅 模拟赛';
    },
    getMockTypeBg(mock) {
        const t = this.getMockType(mock);
        return t === 'official' ? '#fef3c7;color:#92400e' : '#dbeafe;color:#1d4ed8';
    },

    // ============ 目标档位工具（满分前提用时目标） ============
    // task.goalTimes: 目标时间档位列表（从松到紧，越低越难；达成需满分 + 用时≤档位）
    // training.studentGoals: 学员覆盖档位（可选，缺省走任务默认）
    // 解析学员的有效目标档位：覆盖优先，否则任务默认；无配置返回 null
    getGoalTimes(task, training, studentId) {
        if (!task) return null;
        if (training && training.studentGoals && studentId) {
            const sg = training.studentGoals.find(g => g.studentId === studentId && g.taskId === task.id);
            if (sg && sg.goalTimes && sg.goalTimes.length > 0) return sg.goalTimes;
        }
        return (task.goalTimes && task.goalTimes.length > 0) ? task.goalTimes : null;
    },
    // 某档目标是否达成：bestFullScoreTime（满分成绩中最短用时）<= goalTime
    isGoalAchieved(bestFullScoreTime, goalTime) {
        return bestFullScoreTime !== null && bestFullScoreTime !== undefined && bestFullScoreTime <= goalTime;
    },
    // 当前目标 = 下一档更快目标：max{ t ∈ goalTimes | t < best }；
    //   无满分成绩 → 最松档（max goalTimes）；全部达成 → null
    currentGoal(bestFullScoreTime, goalTimes) {
        if (!goalTimes || goalTimes.length === 0) return null;
        if (bestFullScoreTime === null || bestFullScoreTime === undefined) return Math.max(...goalTimes);
        const next = Math.max(...goalTimes.filter(t => t < bestFullScoreTime));
        return isFinite(next) ? next : null;
    },

    // ============ 预估用时区间工具（用于「发挥」分析，纯相对自身，非达标标准） ============
    // task.estTimes / studentGoals[].estTimes: [最快预期秒, 可接受上限秒]
    // 回退链：学员级 estTimes → 任务级 estTimes → goalTimes 的 [min, max] → null
    getEstTimes(task, training, studentId) {
        if (!task) return null;
        const norm = (arr) => {
            if (!Array.isArray(arr)) return null;
            const nums = arr.map(v => Number(v)).filter(v => isFinite(v) && v > 0).sort((a, b) => a - b);
            if (nums.length >= 2) return { min: nums[0], max: nums[nums.length - 1], source: 'est' };
            if (nums.length === 1) return { min: null, max: nums[0], source: 'est' };
            return null;
        };
        if (training && training.studentGoals && studentId) {
            const sg = training.studentGoals.find(g => g.studentId === studentId && g.taskId === task.id);
            const r = sg ? norm(sg.estTimes) : null;
            if (r) return r;
        }
        const t = norm(task.estTimes);
        if (t) return t;
        const g = this.getGoalTimes(task, training, studentId);
        if (g && g.length) {
            const nums = g.map(Number).filter(v => isFinite(v)).sort((a, b) => a - b);
            if (nums.length) return { min: nums[0], max: nums[nums.length - 1], source: 'goalTimes' };
        }
        return null;
    },

    // ============ 稳健统计工具（纯计算，不碰 DOM） ============
    stats: {
        mean(arr) {
            const a = (arr || []).filter(v => isFinite(v));
            return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
        },
        // 总体标准差（÷n）
        sd(arr) {
            const a = (arr || []).filter(v => isFinite(v));
            if (!a.length) return null;
            const m = a.reduce((x, y) => x + y, 0) / a.length;
            return Math.sqrt(a.reduce((x, y) => x + Math.pow(y - m, 2), 0) / a.length);
        },
        // p ∈ [0,1]；线性插值分位数
        quantile(arr, p) {
            const a = (arr || []).filter(v => isFinite(v)).slice().sort((x, y) => x - y);
            if (!a.length) return null;
            if (a.length === 1) return a[0];
            const k = Math.max(0, Math.min(1, p)) * (a.length - 1);
            const lo = Math.floor(k);
            const hi = Math.ceil(k);
            return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (k - lo);
        },
        median(arr) { return this.quantile(arr, 0.5); },
        // 中位绝对离差（MAD）：抗离群的离散度
        mad(arr) {
            const a = (arr || []).filter(v => isFinite(v));
            const m = this.median(a);
            if (m == null) return null;
            return this.median(a.map(v => Math.abs(v - m)));
        },
        // 稳健"标准差"估计：1.4826 × MAD（正态下 ≈ σ，可用于 68% 覆盖区间）
        robustSd(arr) {
            const m = this.mad(arr);
            return m == null ? null : 1.4826 * m;
        },
        iqr(arr) {
            const q1 = this.quantile(arr, 0.25);
            const q3 = this.quantile(arr, 0.75);
            if (q1 == null || q3 == null) return null;
            return q3 - q1;
        },
        // Theil–Sen 稳健斜率（所有点对斜率的中位数），x = 0..n-1
        theilSen(arr) {
            const a = (arr || []).filter(v => isFinite(v));
            if (a.length < 2) return null;
            const slopes = [];
            for (let i = 0; i < a.length; i += 1) {
                for (let j = i + 1; j < a.length; j += 1) slopes.push((a[j] - a[i]) / (j - i));
            }
            return this.median(slopes);
        },
        // 最小二乘直线拟合 y ~ x（x = 0..n-1）：返回斜率/截距/原空间 R²
        linFit(arr) {
            const a = (arr || []).filter(v => isFinite(v));
            if (a.length < 3) return null;
            const f = this._fitXY(a.map((_, i) => i), a);
            if (!f) return null;
            const fits = a.map((_, i) => f.intercept + f.slope * i);
            return { slope: f.slope, intercept: f.intercept, r2: this._r2(a, fits) };
        },
        // 任意 x 的最小二乘拟合
        _fitXY(xs, ys) {
            const n = xs.length;
            if (n < 3 || n !== ys.length) return null;
            const mx = this.mean(xs);
            const my = this.mean(ys);
            let sxy = 0;
            let sxx = 0;
            for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
            const slope = sxx ? sxy / sxx : 0;
            return { slope, intercept: my - slope * mx };
        },
        _r2(ys, fits) {
            const n = ys.length;
            if (!n) return 0;
            const my = this.mean(ys);
            let ssRes = 0;
            let ssTot = 0;
            for (let i = 0; i < n; i += 1) {
                ssRes += Math.pow(ys[i] - fits[i], 2);
                ssTot += Math.pow(ys[i] - my, 2);
            }
            return ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
        },
        // 线性 vs 饱和（趋近上限）两模型择优
        // 分数有满分上限 → 曲线是 S 形：中段近似线性、末端趋近饱和
        // 关键：① 满分点(d≈0)会让 ln d 爆炸，拟合饱和模型时先剔除；② 两模型必须在同一子集、原始空间比 R²
        compareTrend(arr, K) {
            const a = (arr || []).filter(v => isFinite(v));
            const n = a.length;
            if (n < 4) return null;
            const all = a.map((_, i) => i);
            const satIdx = isFinite(K) ? all.filter(i => (K - a[i]) >= 0.005) : [];
            let satRaw = null;
            if (satIdx.length >= 4) {
                const f = this._fitXY(satIdx, satIdx.map(i => Math.log(K - a[i])));
                if (f) satRaw = { slope: f.slope, intercept: f.intercept, sub: satIdx };
            }
            const sub = satRaw ? satRaw.sub : all;
            const ys = sub.map(i => a[i]);
            const linF = this._fitXY(sub, ys);
            const lin = linF ? { slope: linF.slope, r2: this._r2(ys, sub.map(i => linF.intercept + linF.slope * i)) } : null;
            const sat = satRaw ? (() => {
                const fits = satRaw.sub.map(i => K - Math.exp(satRaw.intercept + satRaw.slope * i));
                return {
                    beta: satRaw.slope,
                    halfLife: satRaw.slope < 0 ? Math.log(2) / Math.abs(satRaw.slope) : null,
                    r2: this._r2(satRaw.sub.map(i => a[i]), fits),
                    n: satRaw.sub.length,
                };
            })() : null;
            const winner = (sat && lin) ? (sat.r2 > lin.r2 + 0.02 ? 'sat' : 'lin') : (sat ? 'sat' : 'lin');
            return { lin, sat, winner };
        },
    },
};

window.Shared = Shared;
