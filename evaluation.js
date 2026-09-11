// =================================================================
//  Evaluation App — 评估管理：训练评估报告（单个学员）
//  针对 选定学员 + 选定集训 + 选定数据集（赛项/自主训练）生成评估
//  学员选择采用 班级 → 学员 两级导航
//  输出：评估结论 + 概览统计 + 各任务表现（折线图趋势）
// =================================================================
(function () {
    const EvaluationApp = {
        selectedClassId: '',
        selectedStudentId: null,
        selectedTrainingIds: [], // 选中的集训 id；默认全选
        selectedMockIds: [], // 选中的数据集（赛项 id + 'practice'）；默认全选
        _modalTrainings: null,
        _modalData: null,
        viewMode: 'edit', // 'edit' 填写 | 'preview' 导出预览（同窗口）
        quantSubMode: 'fill', // 'fill' 填写（只打分）| 'edit' 编辑（结构改动，退出编辑时询问 丢弃/覆盖/存模板）
        _quantEditBaseline: null, // 进入「编辑」时的结构快照（用于差异判断 / 丢弃还原）
        _quantExitPrompting: false,
        _quantExitCb: null,
        _quantExitCancelCb: null,
        viewingArchiveId: null, // 正在查看的已出具报告存档 id（null = 处于当前报告）
        _reportRendered: false, // #evalContent 里是否已有已渲染的报告内容（空内容不允许打开报告弹窗）
        _fillPlanId: null, // 当前进入填写的计划 id（用于退出时自动记填写进度）
        _fillSid: null, // 当前进入填写的学员 id
        _fillBase: null, // 进入填写时的数据快照（退出时对比判断“有改动”）
        // 量化评估模板：维度 → 子维度 → 评价细则（每条细则含 名称 + 参考评分 ref；综合同龄指数 = 评分/参考评分）
        // 填写模式下 维度/子维度/细则 均可改名与增删、参考评分可编辑，按学员保存在 evalQuantTemplate
        // 「内置默认」模板：维度一/二/三（各自含 子维度一/二/三），每个子维度含 3 条细则
        // 细则名称采用【学科N】评价细则N 的格式（预览时【…】会高亮）
        quantTemplate: [
            { dim: '维度一', icon: '', color: '#3b82f6', subs: [
                { sub: '子维度一', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
                { sub: '子维度二', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
                { sub: '子维度三', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
            ] },
            { dim: '维度二', icon: '', color: '#f97316', subs: [
                { sub: '子维度一', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
                { sub: '子维度二', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
                { sub: '子维度三', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
            ] },
            { dim: '维度三', icon: '', color: '#22c55e', subs: [
                { sub: '子维度一', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
                { sub: '子维度二', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
                { sub: '子维度三', criteria: [
                    { name: '【学科一】评价细则一', ref: 3.6 },
                    { name: '【学科二】评价细则二', ref: 3.6 },
                    { name: '【学科三】评价细则三', ref: 3.6 },
                ] },
            ] },
        ],
        MAX_SCORE: 5, // 每个评价细则满分

        // ============ 量化评估配色：一个维度一个色，明快活泼；子维度用同色系浅一档 ============
        // 主色：维度自身 color（填写模式可自选）优先，否则按序取调色板（已移除旧的固定名配色映射）
        OVERALL_COLOR: { main: '#a855f7', light: '#d8b4fe' },   // 综合评分 紫
        // 自动配色板：维度一/二/三 ≈ 蓝/橙/绿，超出后按序循环
        DIM_PALETTE: ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#0891b2', '#65a30d', '#eab308'],

        // 取维度主色：用户自选 dim.color 优先，否则按序调色板
        dimHex(dim, index) {
            if (dim && typeof dim.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(dim.color)) return dim.color;
            const i = (typeof index === 'number' && index >= 0) ? index : 0;
            return this.DIM_PALETTE[i % this.DIM_PALETTE.length];
        },
        // 主色 → 浅一档（子维度底 / 汇总子行）与最浅一档（表格行底）
        dimLight(main) { return this.mixHex(main, '#ffffff', 0.72); },
        dimRow(main) { return this.mixHex(main, '#ffffff', 0.9); },
        // 颜色混合：t=0 → a 原色；t=1 → b
        mixHex(a, b, t) {
            const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
            const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
            const m = (x, y) => Math.round(x + (y - x) * t);
            const c = (x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0');
            return '#' + c(m(r1, r2)) + c(m(g1, g2)) + c(m(b1, b2));
        },
        // 1 → 一 … 用于新增 维度N / 子维度N 的自动命名
        numToCn(n) {
            const digits = '一二三四五六七八九';
            const m = Math.max(1, Math.floor(n));
            if (m <= 10) return m === 10 ? '十' : digits[m - 1];
            const t = Math.floor(m / 10), o = m % 10;
            return (t > 1 ? digits[t - 1] : '') + '十' + (o > 0 ? digits[o - 1] : '');
        },

        init() {
            Shared.loadData();
            this.migrateLegacyQuantTemplates(); // 清除旧“知识与技能/赛事能力/个人能力”默认结构，统一用内置默认
            this.migrateTemplateElements(); // 把旧「元素模板 / 全局元素设置」并入「评估模板」
            this.initScope(); // 默认全选
            this.populateClassSelect();
            this.bindEvents();
            this.updateScopeSummary();
            this.populateTemplateChoiceSelect(); // 报告级「量化模板」下拉（静态，模板可能已存于本地）
            this.renderPlanBoard(); // 评估计划 ToDo 看板
            // 报告弹窗：页面初载确保关闭（它只在选中/已渲染学员报告时才打开）
            const sheetEl = document.getElementById('reportSheet');
            if (sheetEl) sheetEl.classList.remove('open');
            document.body.classList.remove('report-sheet-lock');
            this.initUnsavedGuard(); // 未提交改动时离开页面给出提示
        },

        // ============ 未保存（未提交）离开页面提示 ============
        // 多数编辑都是失焦/回车即自动保存到本机；只有当某个输入/可编辑框“正在编辑且未提交”时，
        // 关闭页面或跳转才可能丢字，因此仅在这种情况弹浏览器确认框提醒。
        initUnsavedGuard() {
            const isEditor = (t) => t && t.matches && (
                /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.getAttribute('contenteditable') === 'plaintext-only'
            );
            const setSnap = (t) => {
                if (isEditor(t)) t.__guardSnap = t.value !== undefined ? t.value : t.textContent;
            };
            // 聚焦/进入时记录当前值（作为“已提交基准”）；focus/focusin 都监听以兼容不同浏览器与程序化聚焦
            document.addEventListener('focusin', (e) => setSnap(e.target), true);
            document.addEventListener('focus', (e) => setSnap(e.target), true);
            // 失焦即视为已提交/已保存
            document.addEventListener('focusout', (e) => { if (e.target) e.target.__guardSnap = undefined; }, true);
            // 关闭标签 / 刷新 / 点击站内链接离开时：若有未提交改动则弹确认框
            window.addEventListener('beforeunload', (e) => {
                if (!this.hasUnsavedEdit()) return;
                e.preventDefault();
                e.returnValue = ''; // 触发浏览器“离开/关闭”确认提示
            });
        },
        hasUnsavedEdit() {
            const t = document.activeElement;
            if (!t || !t.matches) return false;
            const isEditor = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.getAttribute('contenteditable') === 'plaintext-only';
            if (!isEditor || t.__guardSnap === undefined) return false;
            const cur = t.value !== undefined ? t.value : t.textContent;
            return cur !== t.__guardSnap;
        },

        // ============ 视图切换：填写 / 导出预览（同窗口） ============
        setViewMode(mode) {
            const target = mode === 'preview' ? 'preview' : 'edit';
            if (target === this.viewMode) return;
            // 正在查看已出具报告存档时：先返回当前报告，再按需切换视图
            if (this.viewingArchiveId) {
                const was = this.viewMode;
                this.backFromArchive();
                if (target === was) return;
                this.guardQuantEditExit(() => this._applyViewMode(target));
                return;
            }
            // 量化结构处于「编辑」且可能未保存时，先让用户决定（丢弃/覆盖保存/存为新模板）再切换视图
            this.guardQuantEditExit(() => this._applyViewMode(target));
        },
        _applyViewMode(mode) {
            this.viewMode = mode === 'preview' ? 'preview' : 'edit';
            document.body.classList.toggle('preview-mode', this.viewMode === 'preview');
            // 离开编辑即保存：切换视图前结束教练评语 / 最终评语编辑
            if (this._finalizeCoachEdit) this._finalizeCoachEdit();
            if (this._finalizeFinalEdit) this._finalizeFinalEdit();
            const toggle = document.getElementById('evalViewToggle');
            if (toggle) {
                toggle.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === this.viewMode));
            }
            // 量化评估表：按视图模式重渲染（填写=可编辑，预览=只读/纯文本）
            this.refreshQuantTableMode();
            // 任务点评：按视图模式重渲染（填写=输入框，预览=文本）
            this.refreshTaskCommentMode();
            // 预览模式：量化评估（综合）与各任务表现趋势由隐藏转为显示，需以可见尺寸重绘
            if (this.viewMode === 'preview') {
                if (document.getElementById('quantSummaryBody')) this.drawRadarCharts();
                if (this._chartResizeHandlers) {
                    Object.values(this._chartResizeHandlers).forEach((draw) => { try { draw(); } catch (e) {} });
                }
            }
            // 水印层（切换视图时同步）
            this.renderWatermark();
        },

        // ============ 量化评估细则：填写 / 编辑 子模式 ============
        // 填写 = 只打分（结构字段只读）；编辑 = 可改结构（改名/增删/参考分等），改动先入草稿不落盘，
        // 退出「编辑」时若有修改，弹窗询问：丢弃 / 覆盖保存（应用到当前学员）/ 存为新模板。
        guardQuantEditExit(afterExit, cancelExit) {
            if (this.quantSubMode !== 'edit') { if (afterExit) afterExit(); return; }
            this.askQuantEditExit(afterExit, cancelExit);
        },
        // 量化模式切换：进入编辑 / 退回填写
        setQuantSubMode(mode) {
            const target = mode === 'edit' ? 'edit' : 'fill';
            if (target === this.quantSubMode) return;
            if (target === 'edit') {
                this.beginQuantEdit();
            } else {
                // 编辑 → 填写：先处理未保存的结构改动
                this.askQuantEditExit();
            }
        },
        // 进入「编辑」：以当前已保存结构为基线，后续改动仅作用于草稿
        beginQuantEdit() {
            if (this.quantSubMode === 'edit' || this._quantExitPrompting) return;
            if (!document.getElementById('quantTableContainer')) return;
            this._quantEditBaseline = JSON.parse(JSON.stringify(this.getQuantTemplate() || []));
            this._quantTemplate = JSON.parse(JSON.stringify(this._quantEditBaseline));
            this.quantSubMode = 'edit';
            this.refreshQuantTableMode();
            this.updateQuantModeUI();
        },
        // 当前生效结构：编辑模式取草稿，否则取已保存结构
        currentQuantTemplate() {
            if (this.quantSubMode === 'edit' && this._quantTemplate && this._quantTemplate.length) return this._quantTemplate;
            return this.getQuantTemplate();
        },
        quantTemplatesEqual(a, b) {
            return JSON.stringify(a || []) === JSON.stringify(b || []);
        },
        // 是否为“系统内置默认”结构（维度一/二/三）：作为种子，不可被直接覆盖保存
        isBuiltinDefaultStructure(tpl) {
            return this.quantTemplatesEqual(tpl || [], this.defaultQuantTemplate() || []);
        },
        // 本次“覆盖保存”是否会改写系统内置默认副本
        _overwriteTargetsBuiltin() {
            return this.isBuiltinDefaultStructure(this._quantEditBaseline);
        },
        // 同步退出弹窗中“覆盖保存”的可用态：目标是系统内置默认时置灰（点击给提示）
        updateQuantExitLockUI() {
            const btn = document.getElementById('quantExitOverwrite');
            if (!btn) return;
            const locked = this._overwriteTargetsBuiltin();
            btn.classList.toggle('quant-locked', locked);
            btn.title = locked
                ? '系统内置默认模板不可覆盖保存；如需定制请「存为新模板」，再在编辑模式「▶ 套用」到该学员'
                : '把本次修改保存到当前学员的量化结构';
            const hint = document.getElementById('quantExitLockHint');
            if (hint) hint.style.display = locked ? 'block' : 'none';
        },
        // 结构改动落盘：报告编辑/模板编辑模式只改草稿（不落盘，退出时由用户决定）；否则直接保存
        persistQuantStructure(t) {
            if (this.quantSubMode !== 'edit' && !this._tplEditCtx) this.saveQuantTemplate(t);
        },
        // 同步 模式切换按钮 高亮 / 编辑提示 / 结构工具栏 显隐
        updateQuantModeUI() {
            const edit = this.quantSubMode === 'edit';
            const tog = document.getElementById('quantModeToggle');
            if (tog) tog.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b.dataset.quantmode === this.quantSubMode));
            const hint = document.getElementById('quantEditHint');
            if (hint) hint.style.display = edit ? 'inline-block' : 'none';
            const tools = document.getElementById('quantStructTools');
            if (tools) tools.style.display = edit ? 'inline-flex' : 'none';
            const saveRow = document.getElementById('quantTplSaveRow');
            if (saveRow && !edit) saveRow.style.display = 'none'; // 非编辑模式收起「存为模板」名称输入行
        },
        // 请求退出编辑：无改动则直接退出；有改动弹窗询问；完成退出后回调 cb；用户取消（继续编辑）回调 cancelExit
        askQuantEditExit(cb, cancelCb) {
            if (this.quantSubMode !== 'edit') { if (cb) cb(); return; }
            if (this._quantExitPrompting) return;
            if (this.quantTemplatesEqual(this._quantEditBaseline, this._quantTemplate || [])) {
                this._leaveQuantEdit();
                if (cb) cb();
                return;
            }
            this._quantExitCb = cb || null;
            this._quantExitCancelCb = cancelCb || null;
            this._quantExitPrompting = true;
            const modal = document.getElementById('quantEditExitModal');
            if (modal) {
                this._resetQuantExitModalState();
                modal.classList.add('open');
                this.updateQuantExitLockUI(); // 目标为系统内置默认时锁定「覆盖保存」
            } else {
                // 兜底：无弹窗容器时当作“丢弃”直接退出
                this._quantExitPrompting = false;
                this._leaveQuantEdit();
                if (cb) cb();
            }
        },
        // 实际退出「编辑」（回到填写），按当前已保存结构重渲染
        _leaveQuantEdit() {
            this.quantSubMode = 'fill';
            this._quantEditBaseline = null;
            this._quantExitPrompting = false;
            this.refreshQuantTableMode();
            this.updateQuantModeUI();
        },
        // —— 退出编辑弹窗：三个动作 + 取消 ——
        quantExitDiscard() {
            if (!this._quantExitPrompting) return;
            this._leaveQuantEdit(); // 不保存草稿 → 自动回到已保存结构
            this._quantExitFinish();
            this.toast('已丢弃本次结构修改');
        },
        quantExitOverwrite() {
            if (!this._quantExitPrompting) return;
            // 目标仍是“系统内置默认”结构时不可覆盖（种子只读），需先另存为新模板再套用
            if (this._overwriteTargetsBuiltin()) {
                this.toast('系统内置模板不可修改：请选择「存为新模板」，再到编辑模式「▶ 套用」到该学员', 'warning');
                return;
            }
            if (!this.selectedStudentId) { this.toast('未选择学员，无法覆盖保存', 'warning'); return; }
            this.saveQuantTemplate(JSON.parse(JSON.stringify(this._quantTemplate || [])));
            this._leaveQuantEdit();
            this._quantExitFinish();
            this.toast('已覆盖保存到当前学员');
        },
        quantExitShowNewName(show) {
            if (!this._quantExitPrompting) return;
            const row = document.getElementById('quantExitNewNameRow');
            const inp = document.getElementById('quantExitNewName');
            if (row) row.style.display = (show === false) ? 'none' : 'flex';
            if (inp && show !== false) inp.focus();
        },
        quantExitSaveNew() {
            if (!this._quantExitPrompting) return;
            const inp = document.getElementById('quantExitNewName');
            const name = inp ? inp.value.trim() : '';
            if (!name) { this.toast('请输入模板名称', 'warning'); if (inp) inp.focus(); return; }
            if (this.isReservedStructName(name)) {
                this.toast('「默认/default」为系统内置模板，用户模板不能占用该名称', 'warning');
                if (inp) { inp.value = ''; inp.focus(); }
                return;
            }
            // 已被已出具报告引用的模板只读：不可同名覆盖
            if (!this.assertTemplateWritable(name)) return;
            const wasBuiltin = this.isBuiltinDefaultStructure(this._quantEditBaseline); // 覆盖目标是否为系统内置默认（不可覆盖，仅可另存）
            this.saveStructureTemplate(name, JSON.parse(JSON.stringify(this._quantTemplate || [])));
            this.refreshQuantStructSelect(name);
            this._leaveQuantEdit(); // 仅存为可复用模板，当前学员结构保持不变
            this._quantExitFinish();
            if (wasBuiltin) {
                this.toast(`已存为新模板「${name}」（系统内置默认未改动）；如需应用到当前学员，请在编辑模式「▶ 套用」该模板`);
            } else {
                this.toast(`已保存为新模板「${name}」（当前学员结构未改变）`);
            }
        },
        quantExitCancel() {
            if (!this._quantExitPrompting) return;
            const cc = this._quantExitCancelCb;
            this._quantExitCb = null;
            this._quantExitCancelCb = null;
            this._quantExitPrompting = false;
            this._resetQuantExitModalState();
            const modal = document.getElementById('quantEditExitModal');
            if (modal) modal.classList.remove('open');
            if (cc) cc(); // 取消 = 停留在编辑（调用方按需撤销 / 继续）
        },
        _quantExitFinish() {
            const cb = this._quantExitCb;
            this._quantExitCb = null;
            this._quantExitCancelCb = null;
            this._quantExitPrompting = false;
            this._resetQuantExitModalState();
            const modal = document.getElementById('quantEditExitModal');
            if (modal) modal.classList.remove('open');
            if (cb) cb();
        },
        _resetQuantExitModalState() {
            const row = document.getElementById('quantExitNewNameRow');
            if (row) row.style.display = 'none';
            const inp = document.getElementById('quantExitNewName');
            if (inp) inp.value = '';
        },

        // ============ 出具报告存档：已出具记录 + 量化模板索引 + 模板冻结 ============
        // 「出具/存档」在导出预览视图触发：把当前报告静态快照存入本地，并记录其用量化结构模板索引；
        // 保存超过 1 个月（30 天）的存档自动成为「定稿」（只读、不可删除/覆盖）；
        // 被存档引用的用户模板只读：不可删除 / 不可同名覆盖，需改动请「另存为新模板」。
        getIssuedReports() {
            try { return JSON.parse(localStorage.getItem('evalIssuedReports') || '[]'); } catch (e) { return []; }
        },
        saveIssuedReports(list) {
            try { localStorage.setItem('evalIssuedReports', JSON.stringify(list)); } catch (e) { /* ignore */ }
        },
        // 保存超过 1 个月（30 天）自动定稿
        isIssuedFinal(rec) {
            const t = rec && rec.savedAt ? new Date(rec.savedAt).getTime() : 0;
            return t > 0 && (Date.now() - t) > 30 * 24 * 3600 * 1000;
        },
        // 当前报告所用的量化结构 → 匹配的模板索引（用于存档标签与冻结判断）
        matchQuantTemplateIndex() {
            const cur = this.currentQuantTemplate() || [];
            if (this.quantTemplatesEqual(cur, this.defaultQuantTemplate() || [])) return { key: '__default__', label: '内置默认' };
            const tpls = this.getQuantStructTemplates() || {};
            for (const name of Object.keys(tpls)) {
                if (this.isReservedStructName(name)) continue;
                if (this.quantTemplatesEqual(cur, tpls[name])) return { key: name, label: name };
            }
            return { key: '__custom__', label: '（自定义结构）' };
        },
        // 被已出具报告索引引用的用户模板名（这些模板只读：不可删除 / 不可同名覆盖）
        referencedTemplateNames() {
            const refs = {};
            this.getIssuedReports().forEach((r) => {
                const k = r && r.quantTemplateKey;
                if (k && k !== '__default__' && k !== '__custom__') refs[k] = true;
            });
            return refs;
        },
        templateReferenced(name) {
            return !!this.referencedTemplateNames()[name];
        },
        // 模板可写性断言：被引用则禁止覆盖/删除
        assertTemplateWritable(name) {
            if (!this.templateReferenced(name)) return true;
            const cnt = this.getIssuedReports().filter((r) => r.quantTemplateKey === name).length;
            this.toast(`模板「${name}」已被 ${cnt} 份历史报告引用，处于只读状态；如需改动请「另存为新模板」`, 'warning');
            return false;
        },
        // 把当前报告内容序列化为“静态只读快照”（去掉编辑控件，canvas 转图片），供存档回看/再次导出
        snapshotEvalContentHtml() {
            const src = document.getElementById('evalContent');
            if (!src) return '';
            const clone = src.cloneNode(true);
            // 移除编辑态专用容器
            clone.querySelectorAll('.report-edit-only, .coach-editor-col').forEach((n) => n.remove());
            // 表单控件 → 纯文本
            clone.querySelectorAll('input, textarea, select').forEach((el) => {
                const sp = document.createElement('span');
                const v = (el.value != null ? el.value : '');
                sp.textContent = v;
                const st = el.getAttribute('style');
                if (st) sp.setAttribute('style', st.replace(/border[^;]*;?/gi, '').replace(/width:\s*auto;?/gi, ''));
                sp.removeAttribute('title');
                if (el.parentNode) el.parentNode.replaceChild(sp, el);
            });
            // 残留按钮 / 可编辑区
            clone.querySelectorAll('button, [contenteditable]').forEach((n) => n.remove());
            // canvas（雷达 / 折线）→ 图片
            clone.querySelectorAll('canvas').forEach((cv) => {
                try {
                    const img = document.createElement('img');
                    img.src = cv.toDataURL('image/png');
                    img.alt = '';
                    img.width = cv.width;
                    img.height = cv.height;
                    const st = cv.getAttribute('style');
                    if (st) img.setAttribute('style', st);
                    if (cv.parentNode) cv.parentNode.replaceChild(img, cv);
                } catch (e) { /* 忽略单张失败 */ }
            });
            return clone.innerHTML;
        },
        // 出具并保存当前报告（导出预览视图）
        issueReport() {
            if (this.viewingArchiveId) { this.toast('正在查看历史报告，请先返回当前报告', 'warning'); return false; }
            if (this.viewMode !== 'preview') { this.toast('请先在「👁 导出预览」视图再存档报告', 'warning'); return false; }
            if (!this.selectedStudentId) { this.toast('未选择学员，无法存档', 'warning'); return false; }
            const student = (Shared.data.students || []).find((s) => s.id === this.selectedStudentId);
            if (!student) { this.toast('未找到学员', 'warning'); return false; }
            const idx = this.matchQuantTemplateIndex();
            let header = {};
            if (typeof this.getReportHeader === 'function') { try { header = this.getReportHeader(student) || {}; } catch (e) { header = {}; } }
            const rec = {
                id: (Shared && Shared.generateId) ? Shared.generateId() : ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
                studentId: student.id,
                studentName: student.name,
                className: header.className || '',
                title: header.title || '训练评估报告',
                date: header.date || '',
                coach: header.coach || '',
                quantTemplateKey: idx.key,
                quantTemplateLabel: idx.label,
                savedAt: new Date().toISOString(),
                html: this.snapshotEvalContentHtml(),
            };
            if (!rec.html) { this.toast('报告内容为空，无法存档', 'warning'); return false; }
            const list = this.getIssuedReports();
            list.push(rec);
            this.saveIssuedReports(list);
            this._markCurrentReportExported(); // 存档即视为「报告已导出」
            this.toast(`已出具并存档「${student.name}」的报告（量化模板：${rec.quantTemplateLabel}）`);
            return true;
        },
        // —— 历史报告存档：回看 / 删除（入口在「按学员 → 学员评估记录」弹窗）——
        viewIssued(id) {
            const rec = this.getIssuedReports().find((r) => r.id === id);
            if (!rec) { this.toast('未找到该存档', 'warning'); return; }
            this.viewingArchiveId = id;
            const content = document.getElementById('evalContent');
            if (content) content.innerHTML = rec.html || '';
            this._reportRendered = !!rec.html; // 存档快照为空时不打开报告弹窗
            const notice = document.getElementById('archiveViewNotice');
            const title = document.getElementById('archiveViewTitle');
            if (notice && title) {
                title.textContent = `📄 正在查看历史报告：${rec.studentName || ''}${rec.date ? ' · ' + rec.date : ''}（${this.isIssuedFinal(rec) ? '🔒 定稿' : '已存档'} · 模板：${rec.quantTemplateLabel || '—'}）`;
                notice.style.display = 'flex';
            }
            const ib = document.getElementById('evalIssueBtn');
            if (ib) ib.style.display = 'none';
            this.openReportSheet(`${rec.studentName || ''}${rec.date ? ' · ' + rec.date : ''} · 模板：${rec.quantTemplateLabel || '—'}`);
        },
        deleteIssued(id) {
            const rec = this.getIssuedReports().find((r) => r.id === id);
            if (!rec) return;
            if (this.isIssuedFinal(rec)) { this.toast('该报告已定稿（保存超过 1 个月），不可删除', 'warning'); return; }
            if (!confirm(`删除历史报告（${rec.studentName || ''} · ${rec.title || ''}）？若该报告是某模板的唯一引用，删除后该模板将解除只读。`)) return;
            const list = this.getIssuedReports().filter((r) => r.id !== id);
            this.saveIssuedReports(list);
            this.toast('已删除该存档');
        },
        // 从“查看已出具报告”返回当前报告的编辑态
        backFromArchive() {
            if (!this.viewingArchiveId) return;
            this.viewingArchiveId = null;
            const notice = document.getElementById('archiveViewNotice');
            if (notice) notice.style.display = 'none';
            const ib = document.getElementById('evalIssueBtn');
            if (ib && this.viewMode === 'preview') ib.style.display = '';
            if (this.selectedStudentId && (this.selectedTrainingIds || []).length) this.generate();
            else this.closeReportSheet();
        },
        _hideIssueBtnForArchive(hidden) {
            const ib = document.getElementById('evalIssueBtn');
            if (ib) ib.style.display = hidden ? 'none' : '';
        },

        // ============ 评估计划 ToDo（新增 / 卡片 / 拖动排序） ============
        getPlans() {
            try { return JSON.parse(localStorage.getItem('evalPlans') || '[]'); } catch (e) { return []; }
        },
        savePlans(list) {
            try { localStorage.setItem('evalPlans', JSON.stringify(list)); } catch (e) { /* ignore */ }
        },
        renderPlanBoard() {
            const board = document.getElementById('planBoard');
            const cardsEl = document.getElementById('planCards');
            if (!board || !cardsEl) return;
            const plans = this.getPlans();
            const guide = document.getElementById('evalPageEmpty');
            const view = this.getPlanView();
            // 呈现方式切换按钮状态 + 班级下拉显隐（仅「按学员」需要）
            const toggle = document.getElementById('planViewToggle');
            if (toggle) toggle.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('active', b.dataset.planview === view));
            const clsSel = document.getElementById('planStuClass');
            if (clsSel) clsSel.style.display = view === 'student' ? '' : 'none';
            const showEmptyGuide = () => {
                cardsEl.style.display = 'none';
                cardsEl.innerHTML = '';
                if (clsSel) { clsSel.innerHTML = ''; clsSel.style.display = 'none'; }
                if (guide) guide.style.display = 'block';
            };
            // 按学员：有无计划都列出「全部学员」（含无计划 / 无报告的学员）
            if (view === 'student') {
                if (!(Shared.data.students || []).length) { showEmptyGuide(); return; }
                cardsEl.style.display = 'flex';
                if (guide) guide.style.display = 'none';
                this._renderPlanStudentView(plans, cardsEl);
                return;
            }
            // 按计划：没有任何计划时给出引导
            if (!plans.length) { showEmptyGuide(); return; }
            cardsEl.style.display = 'flex';
            if (guide) guide.style.display = 'none';
            const esc = Shared.escapeHtml;
            const escAttr = (s) => esc(String(s == null ? '' : s)).replace(/"/g, '&quot;');
            const milestones = (p) => {
                const sts = (p.studentIds || []).map((sid) => { const t = (p.tasks && p.tasks[sid]) || {}; return t; });
                return { total: sts.length, fill: sts.filter((t) => t.fill).length, done: sts.filter((t) => t.fill && t.export).length };
            };
            const cardHtml = (p) => {
                const exp = this._expandedPlanId === p.id;
                const m = milestones(p);
                const stage = this.planStage(p);
                // 卡面只留最精简信息（图标 + 名称/数字），完整信息放 title
                const tplLabel = p.templateLabel || '内置默认';
                const wmLabel = p.wmTemplateKey ? (p.wmTemplateLabel || p.wmTemplateKey) : '';
                const projCount = (p.projects && p.projects.length) ? p.projects.length : 0;
                const confirmedAt = p.confirmedAt ? this._fmtRecTime(new Date(p.confirmedAt).getTime()) : '';
                const metaTip = [
                    `评估模板：${tplLabel}`,
                    projCount ? `关联集训：${projCount} 个` : '',
                    wmLabel ? `PDF 水印：${wmLabel}` : '',
                    confirmedAt ? `确认完成：${confirmedAt}` : '',
                ].filter(Boolean).join('　｜　');
                // 进度：进行中/待确认显示里程碑计数；已完成显示确认时间
                const progHtml = stage === 'done'
                    ? `<span class="plan-meta prog" title="${escAttr(metaTip)}">✅ 已完成</span>`
                    : `<span class="plan-meta prog" title="填写完成 / 学员总数 · 导出完成 / 学员总数">✍️ ${m.fill}/${m.total} · 📤 ${m.done}/${m.total}</span>`;
                // 阶段操作：完成待确认 → 手动确认完成；已完成 → 可撤销确认
                const stageBtn = stage === 'review'
                    ? `<button type="button" class="btn btn-sm btn-primary" data-act="confirm" data-id="${esc(p.id)}" title="所有学员的填写与导出都已完成；确认后该计划归入「已完成」">✅ 确认完成</button>`
                    : (stage === 'done'
                        ? `<button type="button" class="btn btn-sm btn-outline" data-act="unconfirm" data-id="${esc(p.id)}" title="撤销「完成」确认，回到「完成待确认」">↩ 撤销</button>`
                        : '');
                let html = `
                <div class="plan-item${exp ? ' expanded' : ''}" data-id="${esc(p.id)}" data-stage="${stage}">
                    <div class="plan-card" draggable="true" data-id="${esc(p.id)}">
                        <span class="plan-drag" title="拖动排序">⠿</span>
                        <div class="plan-card-main" data-id="${esc(p.id)}" title="点击展开 / 收起学员">
                            <span class="plan-title">${exp ? '▾' : '▸'} ${esc(p.title || '（未命名）')}</span>
                            <span class="plan-meta-wrap">
                                <span class="plan-meta tpl" title="${escAttr(metaTip)}">🎯 ${esc(tplLabel)}${wmLabel ? ` · 💧 ${esc(wmLabel)}` : ''}</span>
                                ${progHtml}
                            </span>
                        </div>
                        <span class="plan-actions">
                            ${stageBtn}
                            <button type="button" class="btn btn-sm btn-outline" data-act="edit" data-id="${esc(p.id)}" title="编辑计划">✎</button>
                            <button type="button" class="btn btn-sm btn-outline" data-act="del" data-id="${esc(p.id)}" title="删除计划">🗑</button>
                        </span>
                    </div>`;
                if (exp) {
                    html += `<div class="plan-students" data-pid="${esc(p.id)}">`;
                    (p.studentIds || []).forEach((sid) => {
                        const st = (Shared.data.students || []).find((x) => x.id === sid);
                        const nm = st ? st.name : sid;
                        const cls = st ? (Shared.getCurrentClassName ? Shared.getCurrentClassName(sid) : '') : '';
                        const t = (p.tasks && p.tasks[sid]) || {};
                        const fill = !!t.fill;
                        const expD = !!t.export;
                        const done = fill && expD;
                        const stateTxt = done ? '✅ 已完成' : (fill ? '🖊 已填写，待导出' : '👤 待填写');
                        html += `
                        <div class="plan-stu-card${done ? ' done' : ''}" draggable="true" data-pid="${esc(p.id)}" data-sid="${esc(sid)}">
                            <div class="ps-top">
                                <span class="ps-avatar">${done ? '✅' : (fill ? '🖊' : '👤')}</span>
                                <span class="ps-names">
                                    <span class="ps-name">${esc(nm)}</span>
                                    ${cls ? `<span class="ps-cls">${esc(cls)}</span>` : ''}
                                </span>
                                <span class="ps-drag" title="拖动排序">⠿</span>
                            </div>
                            <div class="ps-prog">
                                <div class="ps-prog-head">
                                    <span class="ps-state">${stateTxt}</span>
                                    <span class="ps-count">${(fill ? 1 : 0) + (expD ? 1 : 0)}/2</span>
                                </div>
                                <div class="ps-nodes">
                                    <span class="ps-node${fill ? ' done' : ''}">${fill ? '✓ ' : ''}填写</span>
                                    <span class="ps-node${expD ? ' done' : ''}">${expD ? '✓ ' : ''}导出</span>
                                </div>
                                <div class="ps-bar">
                                    <span class="ps-seg${fill ? ' done' : ''}"></span>
                                    <span class="ps-seg${expD ? ' done' : ''}"></span>
                                </div>
                                <button type="button" class="btn btn-sm ps-open" data-open="1" data-mode="${fill ? 'preview' : 'edit'}" data-pid="${esc(p.id)}" data-sid="${esc(sid)}" title="${fill ? '已填写完成：直接预览 / 导出（只读，可在弹窗内切回「✍️ 填写」）' : '打开该学员的评估报告（填写 / 修改）'}">${fill ? '👁 预览导出' : '✍️ 进入填写'}</button>
                            </div>
                        </div>`;
                    });
                    html += '</div>';
                }
                html += '</div>';
                return html;
            };
            // 三档分类：进行中 / 完成待确认（流程走完待人工确认）/ 已完成（人工确认过）
            const groups = [
                { key: 'active', label: '🚧 进行中' },
                { key: 'review', label: '⏳ 完成待确认' },
                { key: 'done', label: '✅ 已完成' },
            ];
            let html = '';
            groups.forEach((g) => {
                const list = plans.filter((p) => this.planStage(p) === g.key);
                if (!list.length) return;
                html += '<div class="plan-rec-sec">';
                html += `<div class="plan-rec-head">${g.label} <span class="gcount">（${list.length}）</span></div>`;
                list.forEach((p) => { html += cardHtml(p); });
                html += '</div>';
            });
            cardsEl.innerHTML = html;
        },

        // ============ 内容呈现方式：按计划 / 按学员 ============
        getPlanView() {
            return this._planView === 'student' ? 'student' : 'plan';
        },
        setPlanView(mode) {
            const v = mode === 'student' ? 'student' : 'plan';
            if (this.getPlanView() === v) return;
            this._planView = v;
            this.renderPlanBoard();
        },
        // 按学员汇总（每名学员一条）：学员信息 + 计划内评估任务 + 历史报告存档
        // 注意：遍历「全部学员」，没有任何计划 / 报告的学员也要出现在列表里
        _planStudentRecords(plans) {
            const archives = this.getIssuedReports();
            const allStudents = Shared.data.students || [];
            const map = new Map();
            const ensure = (sid) => {
                if (map.has(sid)) return map.get(sid);
                const st = allStudents.find((x) => x.id === sid) || null;
                const cid = Shared.getCurrentClassId ? Shared.getCurrentClassId(sid) : '';
                const rec = {
                    sid,
                    name: st ? st.name : sid,
                    clsId: cid || '',
                    className: Shared.getCurrentClassName ? (Shared.getCurrentClassName(sid) || '') : '',
                    tasks: [],
                    archives: [],
                };
                map.set(sid, rec);
                return rec;
            };
            allStudents.forEach((st) => ensure(st.id));
            (plans || []).forEach((p) => {
                (p.studentIds || []).forEach((sid) => {
                    const rec = ensure(sid);
                    const t = (p.tasks && p.tasks[sid]) || {};
                    const stamp = [t.fillAt, t.exportAt, p.createdAt]
                        .map((x) => (x ? new Date(x).getTime() : 0))
                        .filter((n) => n > 0);
                    rec.tasks.push({
                        pid: p.id,
                        planTitle: p.title || '（未命名）',
                        templateLabel: p.templateLabel || '内置默认',
                        fill: !!t.fill,
                        export: !!t.export,
                        confirmed: !!p.confirmedAt,
                        at: stamp.length ? Math.max(...stamp) : 0,
                    });
                });
            });
            const arr = [...map.values()];
            arr.forEach((s) => {
                s.archives = archives.filter((r) => r && r.studentId === s.sid);
                s.finalCount = s.archives.filter((r) => this.isIssuedFinal(r)).length;
                s.openCount = s.tasks.filter((t) => !t.fill).length;
                s.total = s.tasks.length + s.archives.length;
                const times = [
                    ...s.tasks.map((t) => t.at),
                    ...s.archives.map((r) => (r.savedAt ? new Date(r.savedAt).getTime() : 0)),
                ].filter((n) => n > 0);
                s.lastAt = times.length ? Math.max(...times) : 0;
                // 四档分类：1 有任务待填写；2 已完成填写但仍可修改；3 已完成且已定稿；4 暂无任何评估（计划 / 报告都没有）
                if (s.openCount > 0) s.bucket = 1;
                else if (!s.tasks.length && !s.archives.length) s.bucket = 4;
                else if (s.archives.length && s.finalCount === s.archives.length) s.bucket = 3;
                else s.bucket = 2;
            });
            return arr;
        },
        // 班级定位下拉：全部班级（含总人数）+ 有学员的班级 + 未分班
        _renderPlanClassFilter(entries, selected) {
            const sel = document.getElementById('planStuClass');
            if (!sel) return '';
            const known = new Set((Shared.data.classes || []).map((c) => c.id));
            const counts = new Map();
            entries.forEach((e) => {
                const key = (e.clsId && known.has(e.clsId)) ? e.clsId : '';
                counts.set(key, (counts.get(key) || 0) + 1);
            });
            const esc = Shared.escapeHtml;
            let html = `<option value="">全部班级（${entries.length}）</option>`;
            (Shared.data.classes || []).forEach((c) => {
                const n = counts.get(c.id) || 0;
                if (n) html += `<option value="${esc(c.id)}">${esc(c.name)}（${n}）</option>`;
            });
            if (counts.get('')) html += `<option value="__none__">未分班（${counts.get('')}）</option>`;
            sel.innerHTML = html;
            const want = selected || '';
            sel.value = [...sel.options].some((o) => o.value === want) ? want : '';
            return sel.value;
        },
        // 按学员呈现：四档分组（待填写 / 已完成可修改 / 已完成不可修改 / 暂无评估），档内按姓名排序
        _renderPlanStudentView(plans, cardsEl) {
            const all = this._planStudentRecords(plans);
            const filterKey = this._renderPlanClassFilter(all, this._planStuFilter);
            const known = new Set((Shared.data.classes || []).map((c) => c.id));
            const shown = all.filter((s) => {
                if (!filterKey) return true;
                const key = (s.clsId && known.has(s.clsId)) ? s.clsId : '';
                return filterKey === '__none__' ? !key : key === filterKey;
            });
            if (!shown.length) {
                cardsEl.innerHTML = '<div class="plan-stu-view"><div class="plan-stu-view-empty">该班级下暂无学员</div></div>';
                return;
            }
            const buckets = [
                { key: 1, label: '👤 有任务待填写' },
                { key: 2, label: '🖊 已完成填写 · 可修改' },
                { key: 3, label: '🔒 已完成 · 不可修改' },
                { key: 4, label: '📭 暂无评估（无计划 / 无报告）' },
            ];
            let html = '<div class="plan-stu-view">';
            buckets.forEach((b) => {
                const list = shown.filter((s) => s.bucket === b.key).sort((x, y) => (x.name || '').localeCompare(y.name || '', 'zh'));
                if (!list.length) return;
                html += '<div class="plan-rec-sec">';
                html += `<div class="plan-rec-head">${b.label} <span class="gcount">（${list.length}）</span></div>`;
                html += '<div class="plan-stu-flat">';
                list.forEach((s) => { html += this._planStuCardHtml(s); });
                html += '</div></div>';
            });
            cardsEl.innerHTML = html + '</div>';
        },
        // 学员信息卡（按学员呈现用）：整卡可点，打开该学员的全部评估记录
        _planStuCardHtml(s) {
            const esc = Shared.escapeHtml;
            const icon = s.bucket === 1 ? '👤' : (s.bucket === 2 ? '🖊' : (s.bucket === 3 ? '🔒' : '📭'));
            const stateTxt = s.bucket === 1
                ? `待填写 ${s.openCount} 项`
                : (s.bucket === 2 ? '已完成填写 · 仍可修改'
                    : (s.bucket === 3 ? '已完成 · 已定稿不可修改' : '暂无评估任务'));
            const cls = s.className ? `🏫 ${esc(s.className)}` : '🏫 未分班';
            return `
            <button type="button" class="plan-stu-card stu-card" data-rec-sid="${esc(s.sid)}" title="点击查看该学员的全部评估记录">
                <div class="ps-top">
                    <span class="ps-avatar">${icon}</span>
                    <span class="ps-names">
                        <span class="ps-name">${esc(s.name)}</span>
                        <span class="ps-cls">${cls}</span>
                    </span>
                </div>
                <div class="stu-meta">
                    <span class="stu-count">现有评估 ${s.total} 条</span>
                    <span class="stu-sub">计划 ${s.tasks.length} · 存档 ${s.archives.length}</span>
                </div>
                <div class="stu-state">${stateTxt}${s.lastAt ? ` · ${this._fmtRecTime(s.lastAt)}` : ''}</div>
            </button>`;
        },
        // 时间戳（ms）→ yyyy-mm-dd hh:mm
        _fmtRecTime(ms) {
            const d = new Date(ms);
            if (!ms || isNaN(d.getTime())) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        },
        // 学员评估记录弹窗（计划内任务 + 历史报告存档）
        openStuRecords(sid) {
            this._stuRecordsSid = sid;
            this._renderStuRecords();
            const m = document.getElementById('stuRecordsModal');
            if (m) m.classList.add('open');
        },
        closeStuRecords() {
            const m = document.getElementById('stuRecordsModal');
            if (m) m.classList.remove('open');
            this._stuRecordsSid = null;
        },
        _renderStuRecords() {
            const sid = this._stuRecordsSid;
            const box = document.getElementById('stuRecordsList');
            const title = document.getElementById('stuRecordsTitle');
            if (!sid || !box) return;
            const plans = this.getPlans();
            const s = this._planStudentRecords(plans).find((x) => x.sid === sid);
            if (!s) { box.innerHTML = '<div class="rec-empty">未找到该学员的评估记录</div>'; return; }
            const esc = Shared.escapeHtml;
            if (title) title.textContent = `👤 ${s.name}${s.className ? ' · ' + s.className : ''} · 现有评估 ${s.total} 条`;
            let html = '';
            html += `<div class="rec-sec-title">📋 计划内评估任务（${s.tasks.length}）</div>`;
            if (!s.tasks.length) html += '<div class="rec-empty">暂无计划内评估任务</div>';
            s.tasks.slice().sort((a, b) => b.at - a.at).forEach((t) => {
                const state = (t.fill && t.export) ? '✅ 已完成' : (t.fill ? '🖊 已填写，待导出' : '👤 未填写');
                html += `<div class="rec-row">
                    <span class="rec-main">
                        <span class="rec-title">${esc(t.planTitle)}</span>
                        <span class="rec-sub">🎯 模板：${esc(t.templateLabel)}${t.at ? ` · ${this._fmtRecTime(t.at)}` : ''}${t.confirmed ? ' · ✅ 计划已完成' : ''}</span>
                    </span>
                    <span class="rec-state">${state}</span>
                    <button type="button" class="btn btn-sm btn-outline" data-rec-open="1" data-mode="${t.fill ? 'preview' : 'edit'}" data-pid="${esc(t.pid)}" data-sid="${esc(s.sid)}" title="${t.fill ? '已填写完成：直接预览 / 导出（只读）' : '打开该学员的评估报告（填写 / 修改）'}">${t.fill ? '👁 预览导出' : '✍️ 进入填写'}</button>
                </div>`;
            });
            html += `<div class="rec-sec-title">🗂 历史报告存档（${s.archives.length}）</div>`;
            if (!s.archives.length) html += '<div class="rec-empty">暂无历史报告存档</div>';
            s.archives.slice().sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || ''))).forEach((r) => {
                const final = this.isIssuedFinal(r);
                html += `<div class="rec-row">
                    <span class="rec-main">
                        <span class="rec-title">${esc(r.title || '训练评估报告')}</span>
                        <span class="rec-sub">报告日期 ${esc(r.date || '—')} · 出具 ${r.savedAt ? this._fmtRecTime(new Date(r.savedAt).getTime()) : '—'} · 🎯 ${esc(r.quantTemplateLabel || '—')}</span>
                    </span>
                    <span class="rec-state">${final ? '🔒 定稿·不可修改' : '已存档·可修改'}</span>
                    <button type="button" class="btn btn-sm btn-outline" data-rec-view="${esc(r.id)}" title="回看该存档（只读）">👁 查看</button>
                    <button type="button" class="btn btn-sm btn-outline" data-rec-del="${esc(r.id)}" title="${final ? '定稿报告不可删除' : '删除该存档'}" ${final ? 'disabled' : ''} style="${final ? 'opacity:0.45;cursor:not-allowed;' : ''}">🗑</button>
                </div>`;
            });
            box.innerHTML = html;
        },
        openPlanModal(editId) {
            const m = document.getElementById('planModal');
            const titleEl = document.getElementById('planModalTitle');
            const t = document.getElementById('planTitle');
            this._planEditId = editId || null;
            if (titleEl) titleEl.textContent = editId ? '✎ 编辑评估计划' : '＋ 新增评估计划';
            let checked = [];
            let tplKey = '__default__';
            let wmKey = '';
            if (editId) {
                const p = this.getPlans().find((x) => x.id === editId);
                if (p) {
                    if (t) t.value = p.title || '';
                    checked = p.studentIds || [];
                    tplKey = p.templateKey || '__default__';
                    wmKey = p.wmTemplateKey || '';
                }
            } else if (t) t.value = '';
            this._planSel = checked.slice();
            this._planClass = null;
            this._initPlanPicker();
            const tplSel = document.getElementById('planTpl');
            if (tplSel) this._fillTemplateOptions(tplSel, tplKey);
            // PDF 水印模板（''=沿用当前设置）
            this._fillWatermarkTplOptions(document.getElementById('planWmTpl'), wmKey);
            this._updatePlanProjInfo();
            if (m) m.classList.add('open');
            if (t) t.focus();
        },
        // 某“班级键”下的学员（键=classId；空串=未分班）
        _classStudents(key) {
            const known = new Set((Shared.data.classes || []).map((c) => c.id));
            return (Shared.data.students || []).filter((s) => {
                const cid = Shared.getCurrentClassId ? Shared.getCurrentClassId(s.id) : null;
                const assigned = !!cid && known.has(cid);
                return key === '' ? !assigned : cid === key;
            });
        },
        // 初始化三栏选择器（默认选中第一个有学员的班级）
        _initPlanPicker() {
            if (this._planClass == null) {
                const c0 = (Shared.data.classes || []).find((c) => this._classStudents(c.id).length);
                const hasUngrouped = this._classStudents('').length > 0;
                this._planClass = (c0 ? c0.id : '');
                if (this._planClass === '' && !hasUngrouped) this._planClass = null;
            }
            this._renderPlanClassList();
            this._renderPlanStudentList();
            this._renderPlanSelectedList();
        },
        _renderPlanClassList() {
            const box = document.getElementById('planClassList');
            if (!box) return;
            const esc = Shared.escapeHtml;
            let items = '';
            (Shared.data.classes || []).forEach((c) => {
                const n = this._classStudents(c.id).length;
                items += `<div class="plan-pick-item${this._planClass === c.id ? ' active' : ''}" data-cls="${esc(c.id)}">${esc(c.name)}<span class="cnt">${n}</span></div>`;
            });
            const u = this._classStudents('').length;
            if (u) items += `<div class="plan-pick-item${this._planClass === '' ? ' active' : ''}" data-cls="">（未分班）<span class="cnt">${u}</span></div>`;
            box.innerHTML = items || '<div style="padding:0.3rem;color:var(--gray-400);font-size:0.8rem;">暂无班级</div>';
        },
        _renderPlanStudentList() {
            const box = document.getElementById('planStuList');
            if (!box) return;
            const esc = Shared.escapeHtml;
            const arr = this._planClass == null ? [] : this._classStudents(this._planClass);
            if (!arr.length) { box.innerHTML = '<div style="padding:0.3rem;color:var(--gray-400);font-size:0.8rem;">该班暂无学员</div>'; return; }
            const sel = this._planSel || [];
            box.innerHTML = arr.map((s) => {
                const inSel = sel.includes(s.id);
                return `<div class="plan-pick-item${inSel ? ' in' : ''}" data-sid="${esc(s.id)}">${inSel ? '☑' : '👤'} ${esc(s.name)}${inSel ? '<span style="margin-left:auto;font-size:0.72rem;color:#15803d;">已选</span>' : '<span class="plus">＋</span>'}</div>`;
            }).join('');
        },
        _renderPlanSelectedList() {
            const box = document.getElementById('planSelList');
            const cntEl = document.getElementById('planSelCount');
            if (!box) return;
            const sel = this._planSel || [];
            if (cntEl) cntEl.textContent = sel.length ? `（${sel.length}）` : '';
            if (!sel.length) { box.innerHTML = '<div style="padding:0.3rem;color:var(--gray-400);font-size:0.8rem;">点击左侧学员加入</div>'; return; }
            const esc = Shared.escapeHtml;
            box.innerHTML = sel.map((sid) => {
                const st = (Shared.data.students || []).find((x) => x.id === sid);
                return `<div class="plan-pick-item" data-sid="${esc(sid)}">👤 ${esc(st ? st.name : sid)}<span class="x">✕</span></div>`;
            }).join('');
        },
        _planAddStudent(sid) {
            if (!this._planSel) this._planSel = [];
            if (!this._planSel.includes(sid)) this._planSel.push(sid);
            this._renderPlanStudentList();
            this._renderPlanSelectedList();
        },
        _planRemoveStudent(sid) {
            this._planSel = (this._planSel || []).filter((x) => x !== sid);
            this._renderPlanStudentList();
            this._renderPlanSelectedList();
        },
        _updatePlanProjInfo() {
            const sel = document.getElementById('planTpl');
            const info = document.getElementById('planProjInfo');
            if (!sel || !info) return;
            const v = sel.value;
            const proj = (v === '__default__') ? [] : this.templateProjects(v);
            if (!proj.length) { info.textContent = ''; return; }
            const labels = proj.map((x) => this.getScopeOptionLabel(x));
            info.textContent = `带入集训：${labels.join('、')}`;
        },
        closePlanModal() {
            const m = document.getElementById('planModal');
            if (m) m.classList.remove('open');
            this._planEditId = null;
        },
        savePlan() {
            const title = ((document.getElementById('planTitle') || {}).value || '').trim();
            const sids = (this._planSel || []).slice();
            if (!sids.length) { this.toast('请至少选择一名学员', 'warning'); return; }
            const tplSel = document.getElementById('planTpl');
            const tplKey = tplSel ? tplSel.value : '__default__';
            let tplLabel = '内置默认';
            if (tplKey !== '__default__' && tplSel && tplSel.selectedIndex >= 0) {
                tplLabel = (tplSel.options[tplSel.selectedIndex].text || tplKey).replace(/^★\s*/, '');
            }
            const projects = (tplKey === '__default__') ? [] : this.templateProjects(tplKey);
            // PDF 水印模板（''=沿用当前设置）
            const wmSel = document.getElementById('planWmTpl');
            const wmKey = wmSel ? wmSel.value : '';
            const wmOk = !!this.getWatermarkTemplates()[wmKey];
            const finalTitle = title || `${sids.length} 名学员 · ${tplLabel}`;
            const list = this.getPlans();
            if (this._planEditId) {
                const p = list.find((x) => x.id === this._planEditId);
                if (p) {
                    p.title = finalTitle;
                    p.studentIds = sids;
                    p.templateKey = tplKey;
                    p.templateLabel = tplLabel;
                    p.projects = projects;
                    p.wmTemplateKey = wmOk ? wmKey : '';
                    p.wmTemplateLabel = wmOk ? wmKey : '';
                }
            } else {
                list.push({
                    id: (Shared && Shared.generateId) ? Shared.generateId() : ('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)),
                    title: finalTitle,
                    studentIds: sids,
                    templateKey: tplKey,
                    templateLabel: tplLabel,
                    projects,
                    wmTemplateKey: wmOk ? wmKey : '',
                    wmTemplateLabel: wmOk ? wmKey : '',
                    status: 'todo',
                    createdAt: new Date().toISOString(),
                });
            }
            const newPlanId = (!this._planEditId && list.length) ? list[list.length - 1].id : null;
            this.savePlans(list);
            this.closePlanModal();
            if (newPlanId) this._expandedPlanId = newPlanId;
            this.renderPlanBoard();
            this.toast('已保存评估计划');
        },
        // 学生 id → 姓名
        studentNamesOf(ids) {
            const set = new Set(ids || []);
            return (Shared.data.students || []).filter((s) => set.has(s.id)).map((s) => s.name);
        },
        // 读取某学员已保存的量化结构（未保存返回 null）
        studentSavedTemplate(sid) {
            try {
                const all = JSON.parse(localStorage.getItem('evalQuantTemplate') || '{}');
                const s = all[sid];
                return (s && s.length) ? s : null;
            } catch (e) { return null; }
        },
        // 按模板键取结构副本（__default__ → 内置默认）
        templateForKey(key) {
            if (!key || key === '__default__') return this.defaultQuantTemplate();
            const tpl = (this.getQuantStructTemplates() || {})[key];
            return tpl ? JSON.parse(JSON.stringify(tpl)) : null;
        },
        // 一键批量生成：按计划给每位学员套模板 + 带入项目 + 生成并出具存档
        planBatchRun(id) {
            const plan = this.getPlans().find((p) => p.id === id);
            if (!plan) return;
            const sids = plan.studentIds || [];
            const students = (Shared.data.students || []).filter((s) => sids.includes(s.id));
            if (!students.length) { this.toast('该计划未包含学员', 'warning'); return; }
            const key = plan.templateKey || '__default__';
            const target = this.templateForKey(key);
            if (!target || !target.length) { this.toast('所选模板不存在', 'warning'); return; }
            const label = plan.templateLabel || '内置默认';
            let replaceAny = false;
            students.forEach((s) => {
                const cur = this.studentSavedTemplate(s.id);
                if (cur) { if (!this.quantTemplatesEqual(cur, target)) replaceAny = true; }
                else if (!this.quantTemplatesEqual(target, this.defaultQuantTemplate())) replaceAny = true;
            });
            const msg = `为 ${students.length} 名学员按模板「${label}」批量生成并出具存档？${replaceAny ? '\n（部分学员现有结构与此模板不同，将替换其结构并清空原有分数）' : ''}`;
            if (!confirm(msg)) return;
            // 先带入计划的项目（自动带上所属集训）
            if (plan.projects && plan.projects.length) this._applyScopeProjects(plan.projects);
            let archived = 0;
            let skipped = 0;
            students.forEach((s) => {
                this.selectedStudentId = s.id;
                const cur = this.studentSavedTemplate(s.id);
                if (!cur || !this.quantTemplatesEqual(cur, target)) {
                    this._quantTemplate = JSON.parse(JSON.stringify(target));
                    this.saveQuantTemplate(this._quantTemplate);
                    this.saveQuantScores({});
                    if (this.quantSubMode === 'edit') this._quantEditBaseline = JSON.parse(JSON.stringify(this.getQuantTemplate()));
                }
                this.generate();
                const content = document.getElementById('evalContent');
                const hasData = content && !content.querySelector('.empty-state');
                if (!hasData) { skipped++; return; }
                if (this.viewMode !== 'preview') this._applyViewMode('preview');
                if (this.issueReport()) archived++; else skipped++;
            });
            if (this.viewMode !== 'edit') this._applyViewMode('edit');
            // 已完成：从待办看板移除
            this.savePlans(this.getPlans().filter((p) => p.id !== id));
            this.renderPlanBoard();
            if (archived) this.toast(`已完成：为 ${archived} 名学员出具并存档${skipped ? `（${skipped} 名暂无数据已跳过）` : ''}`);
            else this.toast('未成功出具任何报告（学员可能暂无成绩数据）', 'warning');
        },
        planAct(id, act) {
            if (act === 'expand') {
                this._expandedPlanId = (this._expandedPlanId === id) ? null : id;
                this.renderPlanBoard();
                return;
            }
            if (act === 'del') {
                if (!confirm('删除该评估计划？')) return;
                this.savePlans(this.getPlans().filter((p) => p.id !== id));
                this.renderPlanBoard();
                this.toast('已删除');
                return;
            }
            if (act === 'edit') { this.openPlanModal(id); return; }
            // 完成待确认 → 操作人员手动确认（最终完成）
            if (act === 'confirm') {
                const list = this.getPlans();
                const p = list.find((x) => x.id === id);
                if (!p) return;
                if (!this.planAchieved(p)) { this.toast('还有学员未完成填写 / 导出，暂不能确认完成', 'warning'); return; }
                p.confirmedAt = new Date().toISOString();
                this.savePlans(list);
                this.renderPlanBoard();
                this.toast(`已确认完成「${p.title || ''}」`);
                return;
            }
            // 撤销确认 → 回到「完成待确认」
            if (act === 'unconfirm') {
                const list = this.getPlans();
                const p = list.find((x) => x.id === id);
                if (!p) return;
                if (!confirm(`撤销「${p.title || ''}」的完成确认？（将回到「完成待确认」）`)) return;
                delete p.confirmedAt;
                this.savePlans(list);
                this.renderPlanBoard();
                this.toast('已撤销完成确认，计划回到「完成待确认」');
            }
        },
        // 读取某学员已保存分数
        getStudentScores(sid) {
            try { return JSON.parse(localStorage.getItem('evalQuantScores') || '{}')[sid] || {}; } catch (e) { return {}; }
        },
        // 进入学员报告：mode='edit'（填写，默认）/'preview'（已填写 → 直接预览导出）
        openPlanStudent(planId, sid, mode) {
            const plan = this.getPlans().find((p) => p.id === planId);
            const student = (Shared.data.students || []).find((s) => s.id === sid);
            if (!plan || !student) { this.toast('未找到计划或学员', 'warning'); return; }
            const preview = mode === 'preview';
            this.selectedStudentId = sid;
            // 顶部学员/班级下拉同步
            const cid = Shared.getCurrentClassId ? Shared.getCurrentClassId(sid) : null;
            if (cid) {
                this.selectedClassId = cid;
                const clsSel = document.getElementById('evalClassSelect');
                if (clsSel && Array.from(clsSel.options).some((o) => o.value === cid)) clsSel.value = cid;
            }
            const stuSel = document.getElementById('evalStudentSelect');
            if (stuSel && !Array.from(stuSel.options).some((o) => o.value === sid)) {
                const o = document.createElement('option');
                o.value = sid; o.textContent = student.name;
                stuSel.appendChild(o);
            }
            if (stuSel) stuSel.value = sid;
            // 按计划模板处理结构（不同才替换；已有分数需确认）
            const key = plan.templateKey || '__default__';
            const target = this.templateForKey(key);
            const label = plan.templateLabel || '内置默认';
            const cur = this.studentSavedTemplate(sid);
            const curT = cur ? JSON.parse(JSON.stringify(cur)) : this.defaultQuantTemplate();
            if (target && target.length && !this.quantTemplatesEqual(curT, target)) {
                const hasScores = Object.keys(this.getStudentScores(sid)).length > 0;
                const ok = hasScores
                    ? confirm(`为 ${student.name} 套用模板「${label}」并进入填写？现有结构不同，将替换并清空其分数。`)
                    : true;
                if (ok) {
                    this._quantTemplate = JSON.parse(JSON.stringify(target));
                    this.saveQuantTemplate(this._quantTemplate);
                    this.saveQuantScores({});
                    if (this.quantSubMode === 'edit') this._quantEditBaseline = JSON.parse(JSON.stringify(this.getQuantTemplate()));
                }
            }
            // 套用计划指定的「报告元素模板」/「PDF 水印模板」（未指定则沿用当前全局设置）
            this._applyPlanReportTemplates(plan);
            // 带入计划模板关联项目；无关联项目的计划 → 范围重置为「全部」（避免沿用上一位学员收窄后的范围）
            if (plan.projects && plan.projects.length) this._applyScopeProjects(plan.projects);
            else this.initScope();
            this.generate();
            this._applyViewMode(preview ? 'preview' : 'edit'); // 已填写的直接进「导出预览」，否则进「填写」
            // 记录本次填写会话：退出弹窗时对比快照，有改动就自动标记「填写」完成（仅填写模式）
            this._fillPlanId = preview ? null : planId;
            this._fillSid = preview ? null : sid;
            this._fillBase = preview ? null : this._fillSnapshot(sid);
            // 当前报告的计划上下文：打印 / 存档时自动标记「报告已导出」
            this._curPlanId = planId;
            this._curSid = sid;
            // 打开报告填写弹窗（全屏可滚动）
            const cname = (Shared.getCurrentClassName && Shared.getCurrentClassName(student.id)) || '';
            this.openReportSheet(`${student.name || ''}${cname ? ' · ' + cname : ''}`);
        },
        reorderPlan(fromId, toId) {
            if (!fromId || !toId || fromId === toId) return;
            const list = this.getPlans();
            const fromIdx = list.findIndex((p) => p.id === fromId);
            const toIdx = list.findIndex((p) => p.id === toId);
            if (fromIdx < 0 || toIdx < 0) return;
            const [item] = list.splice(fromIdx, 1);
            list.splice(toIdx, 0, item);
            this.savePlans(list);
            this.renderPlanBoard();
        },
        // —— 学员任务里程碑（①数据填写 ②报告导出）：全程自动标记，不可手点 ——
        _planTask(p, sid) {
            if (!p.tasks) p.tasks = {};
            if (!p.tasks[sid]) p.tasks[sid] = { fill: false, export: false };
            return p.tasks[sid];
        },
        // 计划流程是否已走完：所有学员都完成「填写 + 导出」
        planAchieved(p) {
            const sids = (p && p.studentIds) || [];
            if (!sids.length) return false;
            return sids.every((sid) => {
                const t = (p.tasks && p.tasks[sid]) || {};
                return !!t.fill && !!t.export;
            });
        },
        // 计划阶段：active 进行中 / review 完成待确认 / done 已完成（由操作人员最终确认）
        planStage(p) {
            if (p && p.confirmedAt) return 'done';
            return this.planAchieved(p) ? 'review' : 'active';
        },
        // 自动记进度：mil=fill（进入填写并改动）/ export（打印或存档报告）
        _markPlanTask(pid, sid, mil) {
            if (!pid || !sid) return false;
            const list = this.getPlans();
            const p = list.find((x) => x.id === pid);
            if (!p || !(p.studentIds || []).includes(sid)) return false;
            const t = this._planTask(p, sid);
            const now = new Date().toISOString();
            if (mil === 'fill') {
                if (t.fill) return false;
                t.fill = true;
                t.fillAt = now;
            } else if (mil === 'export') {
                if (t.export) return false;
                if (!t.fill) { t.fill = true; t.fillAt = t.fillAt || now; }
                t.export = true;
                t.exportAt = now;
            } else {
                return false;
            }
            const allDone = (p.studentIds || []).length > 0 && (p.studentIds || []).every((s) => { const tt = this._planTask(p, s); return tt.fill && tt.export; });
            this.savePlans(list);
            if (allDone) {
                // 流程走完不再自动移除计划：进入「完成待确认」，等操作人员手动确认完成
                this.toast(`计划「${p.title || ''}」全部学员流程已走完，待确认完成`);
            }
            return true;
        },
        // 当前正在填写的（计划, 学员）上下文：用于导出/存档时自动标记「报告已导出」
        _markCurrentReportExported() {
            const ok = this._markPlanTask(this._curPlanId, this._curSid, 'export');
            if (ok) {
                const st = (Shared.data.students || []).find((s) => s.id === this._curSid);
                this.toast(`已记录 ${st ? st.name : '该学员'} 的报告已导出`);
            }
        },
        // 学员卡片拖动排序（同一计划内）
        reorderPlanStudents(planId, fromSid, toSid) {
            if (!fromSid || !toSid || fromSid === toSid) return;
            const list = this.getPlans();
            const p = list.find((x) => x.id === planId);
            if (!p || !Array.isArray(p.studentIds)) return;
            const fromIdx = p.studentIds.indexOf(fromSid);
            const toIdx = p.studentIds.indexOf(toSid);
            if (fromIdx < 0 || toIdx < 0) return;
            const [it] = p.studentIds.splice(fromIdx, 1);
            p.studentIds.splice(toIdx, 0, it);
            this.savePlans(list);
            this.renderPlanBoard();
        },

        // ============ 评估模板管理（量化结构 / 模板元素编辑 / PDF 水印） ============
        openTplMgmtModal() {
            this.renderTplMgmt();
            this.loadWatermarkModal(); // 装载当前水印设置到「🖨 PDF 水印」标签页
            const m = document.getElementById('tplMgmtModal');
            if (m) m.classList.add('open');
        },
        closeTplMgmtModal() {
            const m = document.getElementById('tplMgmtModal');
            if (m) m.classList.remove('open');
        },
        renderTplMgmt() {
            const box = document.getElementById('tplMgmtList');
            if (!box) return;
            const tpls = this.getQuantStructTemplates() || {};
            const dl = this.getDefaultLoadName();
            const refs = this.referencedTemplateNames();
            const meta = this.getTemplateMeta();
            const names = Object.keys(tpls).filter((n) => !this.isReservedStructName(n));
            let html = `<div class="tpl-mgmt-row tpl-system">
                <button type="button" class="tpl-star${dl === '' ? ' on' : ''}" data-act="setdef" data-id="__default__" title="${dl === '' ? '当前默认：新学员初始使用该模板' : '设为默认（点击恢复为「内置默认」）'}">${dl === '' ? '★' : '☆'}</button>
                <span style="flex:1;color:var(--gray-500);font-size:0.82rem;">内置默认</span>
                <span style="flex:none;display:flex;gap:0.3rem;">
                    <button type="button" class="btn btn-sm btn-outline" data-act="view" data-id="__default__" title="预览内置默认模板（系统内置，只读不可编辑）">👁 预览</button>
                </span>
            </div>`;
            if (!names.length) html += '<div class="tpl-mgmt-empty">暂无用户模板</div>';
            else {
                names.forEach((n) => {
                    const isDef = n === dl;
                    const refd = !!refs[n];
                    const proj = (meta[n] && meta[n].projects && meta[n].projects.length) ? meta[n].projects : [];
                    html += `<div class="tpl-mgmt-row" data-name="${Shared.escapeHtml(n)}">
                        <button type="button" class="tpl-star${isDef ? ' on' : ''}" data-act="setdef" data-id="${Shared.escapeHtml(n)}" title="${isDef ? '当前默认：新学员初始使用该模板' : '设为默认：新学员初始使用该模板'}">${isDef ? '★' : '☆'}</button>
                        <span style="flex:1;min-width:120px;font-size:0.9rem;font-weight:600;color:var(--gray-800);">${Shared.escapeHtml(n)}${proj.length ? ` <span style="font-weight:400;font-size:0.72rem;color:var(--primary);">🎯 ${proj.length} 集训</span>` : ''}</span>
                        <span style="flex:none;display:flex;gap:0.3rem;flex-wrap:wrap;">
                            <button type="button" class="btn btn-sm btn-outline" data-act="view" data-id="${Shared.escapeHtml(n)}" title="预览模板（只读）">👁</button>
                            <button type="button" class="btn btn-sm btn-outline" data-act="edit" data-id="${Shared.escapeHtml(n)}" title="编辑评估模板（量化结构 + 报告元素）">✎</button>
                            <button type="button" class="btn btn-sm btn-outline" data-act="proj" data-id="${Shared.escapeHtml(n)}" title="设置/修改关联集训">🎯 关联</button>
                            <button type="button" class="btn btn-sm btn-outline" data-act="del" data-id="${Shared.escapeHtml(n)}" ${refd ? 'disabled' : ''} title="${refd ? '已被历史报告引用，只读不可删除' : '删除该模板'}" style="${refd ? 'opacity:.45;cursor:not-allowed;' : ''}">🗑</button>
                        </span>
                    </div>`;
                });
            }
            box.innerHTML = html;
        },
        // 打开“关联项目”编辑器
        tplProjEdit(name) {
            this._tplProjName = name;
            const editor = document.getElementById('tplProjEditor');
            const nameEl = document.getElementById('tplProjName');
            if (nameEl) nameEl.textContent = name;
            const listEl = document.getElementById('tplProjList');
            const trainings = Shared.data.trainings || [];
            const cur = this.templateProjects(name);
            if (listEl) {
                listEl.innerHTML = trainings.length
                    ? trainings.map((t) => {
                        const pc = (t.practiceRecords || []).length;
                        const mc = (t.mockCompetitions || []).length;
                        const meta = (pc || mc) ? `（练习 ${pc} · 赛项 ${mc}）` : '';
                        return `<label><input type="checkbox" value="${Shared.escapeHtml(t.id)}"${cur.includes(t.id) ? ' checked' : ''} /> ${Shared.escapeHtml(t.name || '（未命名集训）')}${meta ? ` <span style="color:var(--gray-400);font-weight:400;">${meta}</span>` : ''}</label>`;
                    }).join('')
                    : '<span style="font-size:0.85rem;color:var(--gray-400);">暂无可用集训</span>';
            }
            if (editor) editor.style.display = 'block';
        },
        tplProjSave() {
            const name = this._tplProjName;
            if (!name) return;
            const ids = Array.from(document.querySelectorAll('#tplProjList input[type="checkbox"]:checked')).map((c) => c.value);
            this.setTemplateProjects(name, ids);
            this._tplProjName = null;
            const editor = document.getElementById('tplProjEditor');
            if (editor) editor.style.display = 'none';
            this.renderTplMgmt();
            this.toast(ids.length ? `已保存模板「${name}」关联 ${ids.length} 个项目` : `已清除模板「${name}」的项目关联`);
        },
        tplProjClear() {
            const name = this._tplProjName;
            if (!name) return;
            this.setTemplateProjects(name, []);
            this.tplProjEdit(name); // 刷新勾选为空
            this.toast(`已清除模板「${name}」的项目关联`);
        },
        tplProjCancel() {
            this._tplProjName = null;
            const editor = document.getElementById('tplProjEditor');
            if (editor) editor.style.display = 'none';
        },
        tplMgmtAct(name, act) {
            const tpls = this.getQuantStructTemplates() || {};
            if (act === 'setdef') {
                // 点条目名前的 ☆/★：把该模板设为默认；内置默认行(id='__default__') → 恢复为「内置默认」
                const target = name === '__default__' ? '' : name;
                if (target && !tpls[target]) { this.toast('模板不存在', 'warning'); return; }
                if ((this.getDefaultLoadName() || '') === target) {
                    this.toast(target ? `「${target}」已是默认模板` : '当前已是「内置默认」', 'warning');
                    return;
                }
                this.setDefaultLoadName(target);
                this.renderTplMgmt();
                if (document.getElementById('quantStructTpl')) this.refreshQuantStructSelect('');
                else this.populateTemplateChoiceSelect();
                this.toast(target ? `已将「${target}」设为默认加载模板（新学员初始使用）` : '已恢复为「内置默认」模板');
                return;
            }
            if (!tpls[name] && name !== '__default__') { this.toast('模板不存在', 'warning'); return; }
            if (name === '__default__' && act !== 'view' && act !== 'setdef') {
                this.toast('内置默认为系统模板，只读不可编辑', 'warning');
                return;
            }
            if (act === 'view') { this.openTplPreview(name); return; }
            if (act === 'proj') { this.tplProjEdit(name); return; }
            if (act === 'edit') { this.openTplEditModal(name); return; }
            if (act === 'del') {
                if (this.templateReferenced(name)) { this.toast(`模板「${name}」已被历史报告引用，只读不可删除`, 'warning'); return; }
                if (!confirm(`删除用户模板「${name}」？`)) return;
                this.deleteStructureTemplate(name);
                this.renderTplMgmt();
                if (document.getElementById('quantStructTpl')) this.refreshQuantStructSelect('');
                else this.populateTemplateChoiceSelect();
                this.toast('已删除模板');
            }
        },
        tplMgmtShowNew(show) {
            const row = document.getElementById('tplMgmtNewRow');
            const inp = document.getElementById('tplMgmtNewName');
            if (row) row.style.display = (show === false) ? 'none' : 'flex';
            if (inp && show !== false) inp.focus();
        },
        tplMgmtSaveNew() {
            const inp = document.getElementById('tplMgmtNewName');
            const name = inp ? inp.value.trim() : '';
            if (!name) { this.toast('请输入模板名称', 'warning'); if (inp) inp.focus(); return; }
            if (this.isReservedStructName(name)) {
                this.toast('「默认/default」为系统内置模板，用户模板不能占用该名称', 'warning');
                if (inp) { inp.value = ''; inp.focus(); }
                return;
            }
            const exists = !!this.getQuantStructTemplates()[name];
            if (exists && !this.assertTemplateWritable(name)) return; // 被出具报告引用则不可同名覆盖
            this.saveStructureTemplate(name, this.currentQuantTemplate());
            // 新模板同时带入当前报告元素（页面标题 / 教练 / 日期 / AI 提示词与数据说明）
            this.saveTemplateElements(name, this.getReportElements());
            if (inp) inp.value = '';
            this.tplMgmtShowNew(false);
            this.renderTplMgmt();
            if (document.getElementById('quantStructTpl')) this.refreshQuantStructSelect(name);
            else this.populateTemplateChoiceSelect();
            this.toast(`已保存模板「${name}」`);
        },
        // —— 评估模板：预览 / 编辑 双模式（同一弹窗；内置默认仅元素可编辑）——
        openTplPreview(key, mode) {
            const name = key || '__default__';
            const wantEdit = mode === 'edit';
            const tpls = this.getQuantStructTemplates() || {};
            const isDefault = (name === '__default__');
            if (!isDefault && !tpls[name]) { this.toast('模板不存在', 'warning'); return; }
            // 内置默认＝系统模板：只读，任何入口的编辑请求都回落预览
            if (isDefault && wantEdit) this.toast('内置默认为系统模板，只读不可编辑；如需自定义请「＋ 以当前结构新建模板」', 'warning');
            this._tplPreviewKey = name;
            const m = document.getElementById('tplPreviewModal');
            if (m) m.classList.add('open');
            if (wantEdit && !isDefault) return this._renderTplEditMode(name);
            return this._renderTplPreviewMode(name);
        },
        // 预览模式（只读表 + 统计信息）
        _renderTplPreviewMode(name) {
            const key = name || '__default__';
            const tpl = (key === '__default__') ? this.defaultQuantTemplate() : (this.getQuantStructTemplates()[key] || null);
            if (!tpl) { this.toast('模板不存在', 'warning'); return; }
            // 退出编辑态
            this._tplEditCtx = false;
            this._quantContainer = null;
            this._tplEditName = null;
            this._quantTemplate = null;
            const title = document.getElementById('tplPreviewTitle');
            if (title) title.textContent = '👁 预览模板：' + (key === '__default__' ? '内置默认' : key);
            let dims = 0;
            let subs = 0;
            let crits = 0;
            let refSum = 0;
            (tpl || []).forEach((d) => {
                dims += 1;
                (d.subs || []).forEach((s) => {
                    subs += 1;
                    (s.criteria || []).forEach((c) => { crits += 1; refSum += (c.ref != null ? (Number(c.ref) || 0) : 0); });
                });
            });
            const meta = document.getElementById('tplPreviewMeta');
            if (meta) {
                const bits = [`维度 ${dims}`, `子维度 ${subs}`, `评价细则 ${crits}`, `参考总分 ${refSum}`];
                const el = this.getTemplateElements(key);
                bits.push(`标题「${el.title || '训练评估报告'}」`);
                if (el.coach) bits.push(`教练 ${el.coach}`);
                if (key === '__default__') bits.push('系统内置（只读不可编辑）');
                if ((this.getDefaultLoadName() || '') === (key === '__default__' ? '' : key)) bits.push('★ 当前默认加载');
                if (key !== '__default__' && this.templateReferenced(key)) bits.push('已被历史报告引用（结构只读）');
                meta.textContent = bits.join(' · ');
            }
            const body = document.getElementById('tplPreviewBody');
            if (body) body.innerHTML = this._quantPreviewHtml(tpl);
            const elemBox = document.getElementById('tplPreviewElemBox');
            if (elemBox) elemBox.style.display = 'none';
            const m = document.getElementById('tplPreviewModal');
            if (m) m.classList.remove('edit-mode');
            const foot = document.getElementById('tplPreviewEditFoot');
            if (foot) foot.style.display = 'none';
            const closeRow = document.getElementById('tplPreviewCloseRow');
            if (closeRow) closeRow.style.display = '';
            this._setTplPreviewMode('preview', key);
        },
        // 编辑模式（结构 + 报告元素；仅用户模板可用，内置默认只读）
        _renderTplEditMode(name) {
            const key = name || '__default__';
            // 内置默认：系统模板，无编辑入口（双保险：即使被调用也回落预览）
            if (key === '__default__') return this._renderTplPreviewMode(key);
            const tpls = this.getQuantStructTemplates() || {};
            if (!tpls[key] || this.isReservedStructName(key)) { this.toast('模板不存在或不可编辑', 'warning'); return; }
            this._tplEditName = key;
            this._tplEditCtx = true;
            const title = document.getElementById('tplPreviewTitle');
            const meta = document.getElementById('tplPreviewMeta');
            const saveBtn = document.getElementById('tplEditSave');
            const newNameEl = document.getElementById('tplEditNewName');
            const body = document.getElementById('tplPreviewBody');
            if (newNameEl) newNameEl.value = '';
            this._quantContainer = body;
            this._quantTemplate = JSON.parse(JSON.stringify(tpls[key] || []));
            if (title) title.textContent = '✎ 编辑评估模板：' + key;
            const refd = this.templateReferenced(key);
            if (meta) meta.textContent = refd
                ? '结构与报告元素一起保存；该模板结构已被历史报告引用（结构只读，仅保存报告元素），如需改结构请「另存为新模板」。'
                : '结构与报告元素一起保存；可改名 / 增删 维度、子维度、评价细则与参考评分。';
            if (saveBtn) { saveBtn.disabled = false; saveBtn.title = refd ? '结构只读（被历史报告引用），保存报告元素' : '保存结构与报告元素到该模板'; }
            this._fillEditElemFields(key);
            const elemBox = document.getElementById('tplPreviewElemBox');
            if (elemBox) elemBox.style.display = '';
            const m = document.getElementById('tplPreviewModal');
            if (m) m.classList.add('edit-mode');
            const foot = document.getElementById('tplPreviewEditFoot');
            if (foot) foot.style.display = 'flex';
            const closeRow = document.getElementById('tplPreviewCloseRow');
            if (closeRow) closeRow.style.display = 'none';
            this._setTplPreviewMode('edit', key);
            this.initQuantTable();
            this._tplEditCtx = true; // initQuantTable 内不改 _tplEditCtx，此处保险重申
        },
        // 同步顶部模式切换按钮
        _setTplPreviewMode(mode, key) {
            const toggle = document.getElementById('tplPreviewToggle');
            if (!toggle) return;
            const isDefault = (key || '__default__') === '__default__';
            toggle.querySelectorAll('.view-btn').forEach((b) => {
                b.classList.toggle('active', b.dataset.tplmode === mode);
                if (b.dataset.tplmode === 'edit') {
                    // 内置默认为系统模板：编辑入口禁用
                    b.disabled = isDefault;
                    b.style.opacity = isDefault ? '.45' : '';
                    b.style.cursor = isDefault ? 'not-allowed' : '';
                    b.title = isDefault ? '内置默认为系统模板，只读不可编辑' : '编辑评估模板（量化结构 + 报告元素）';
                }
            });
        },
        setTplPreviewMode(mode) {
            const key = this._tplPreviewKey || '__default__';
            if (mode === 'edit') this._renderTplEditMode(key);
            else this._renderTplPreviewMode(key);
        },
        closeTplPreview() {
            const m = document.getElementById('tplPreviewModal');
            if (m) { m.classList.remove('open'); m.classList.remove('edit-mode'); }
            this._tplEditCtx = false;
            this._quantContainer = null;
            this._tplEditName = null;
            this._quantTemplate = null;
            this._tplPreviewKey = null;
        },
        // 只读结构表（与报告内量化表同款样式：竖排维度/子维度 + 评价细则 + 参考评分，无输入框、无得分列）
        _quantPreviewHtml(tpl) {
            const esc = Shared.escapeHtml;
            const vtext = 'writing-mode:vertical-rl;text-orientation:upright;font-size:0.85rem;line-height:1.05;color:#000;';
            const dimW = 30;
            const subW = 30;
            let rows = '';
            (tpl || []).forEach((dim, di) => {
                const main = this.dimHex(dim, di);
                const rowBg = this.dimRow(main);
                let critCount = 0;
                (dim.subs || []).forEach((s) => { critCount += (s.criteria || []).length; });
                const dimRowspan = Math.max(1, critCount);
                let firstDim = true;
                (dim.subs || []).forEach((s) => {
                    const list = (s.criteria || []).length ? s.criteria : [{ name: '', ref: null }];
                    let firstSub = true;
                    list.forEach((c) => {
                        rows += `<tr style="background:${rowBg};">`
                            + (firstDim ? `<td class="qdim" rowspan="${dimRowspan}" style="width:${dimW}px;min-width:${dimW}px;max-width:${dimW}px;text-align:center;vertical-align:middle;background:${rowBg};"><span style="${vtext}">${esc(dim.dim || '')}</span></td>` : '')
                            + (firstSub ? `<td class="qsub" rowspan="${list.length}" style="width:${subW}px;min-width:${subW}px;max-width:${subW}px;text-align:center;vertical-align:middle;background:${rowBg};"><span style="${vtext}">${esc(s.sub || '')}</span></td>` : '')
                            + `<td style="color:var(--gray-700);">${c.name ? this.renderCriteriaText(c.name) : '—'}</td>`
                            + `<td style="text-align:center;color:var(--gray-600);">${c.ref != null ? this.intRef(c.ref) : '—'}</td>`
                            + `</tr>`;
                        firstDim = false;
                        firstSub = false;
                    });
                });
            });
            return `<div style="overflow-x:auto;"><table class="score-table quant-table">
                <thead><tr>
                    <th colspan="2" style="white-space:nowrap;text-align:center;font-size:0.72rem;padding:0.4rem 0.1rem;">评测维度</th>
                    <th>评价细则</th>
                    <th style="width:76px;text-align:center;">参考评分</th>
                </tr></thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--gray-400);">（空模板）</td></tr>'}</tbody>
            </table></div>`;
        },
        // 打开模板编辑（列表 ✎）：直接以「编辑」模式打开模板窗
        openTplEditModal(name) {
            this.openTplPreview(name, 'edit');
        },
        // 退出编辑态：丢弃改动，回到该模板的预览模式（弹窗不关）
        closeTplEditModal() {
            const key = this._tplPreviewKey || this._tplEditName || '__default__';
            this._renderTplPreviewMode(key);
        },
        // 保存当前编辑的评估模板（被引用模板：结构只读，只保存报告元素）
        tplEditSaveOriginal() {
            if (!this._tplEditCtx || !this._tplEditName) return;
            const name = this._tplEditName;
            if (name === '__default__') { this.toast('内置默认为系统模板，只读不可编辑', 'warning'); return; }
            const structReadonly = this.templateReferenced(name);
            if (!structReadonly) {
                this.saveStructureTemplate(name, JSON.parse(JSON.stringify(this._quantTemplate || [])));
            }
            this.saveTemplateElements(name, this.collectEditElements());
            this.closeTplEditModal();
            this.renderTplMgmt();
            if (document.getElementById('quantStructTpl')) this.refreshQuantStructSelect(name);
            else this.populateTemplateChoiceSelect();
            this.toast(`已保存评估模板「${name}」`);
        },
        tplEditSaveNew() {
            if (!this._tplEditCtx) return;
            const inp = document.getElementById('tplEditNewName');
            const name = inp ? inp.value.trim() : '';
            if (!name) { this.toast('请输入新模板名称', 'warning'); if (inp) inp.focus(); return; }
            if (this.isReservedStructName(name)) {
                this.toast('「默认/default」为系统内置模板，不能占用该名称', 'warning');
                if (inp) { inp.value = ''; inp.focus(); }
                return;
            }
            const exists = !!this.getQuantStructTemplates()[name];
            if (exists && !this.assertTemplateWritable(name)) return;
            const struct = (this._quantTemplate && this._quantTemplate.length) ? this._quantTemplate : this.defaultQuantTemplate();
            this.saveStructureTemplate(name, JSON.parse(JSON.stringify(struct)));
            this.saveTemplateElements(name, this.collectEditElements());
            this.closeTplEditModal();
            this.renderTplMgmt();
            if (document.getElementById('quantStructTpl')) this.refreshQuantStructSelect(name);
            else this.populateTemplateChoiceSelect();
            this.toast(`已另存为新模板「${name}」`);
        },

        // ============ 学员两级导航（班级 → 学员） ============
        populateClassSelect() {
            const sel = document.getElementById('evalClassSelect');
            if (!sel) return;
            const classes = Shared.data.classes || [];
            let html = '<option value="">全部班级</option>';
            classes.forEach((c) => {
                html += `<option value="${Shared.escapeHtml(c.id)}"${this.selectedClassId === c.id ? ' selected' : ''}>${Shared.escapeHtml(c.name)}</option>`;
            });
            sel.innerHTML = html;
            this.populateStudentSelect();
        },

        populateStudentSelect() {
            const sel = document.getElementById('evalStudentSelect');
            if (!sel) return;
            const D = Shared.data;
            const students = this.selectedClassId
                ? Shared.getClassStudents(this.selectedClassId)
                : (D.students || []);
            if (students.length === 0) {
                sel.innerHTML = '<option value="">— 暂无学员 —</option>';
                this.selectedStudentId = null;
                return;
            }
            let html = '<option value="">— 请选择学员 —</option>';
            students.forEach((s) => {
                html += `<option value="${Shared.escapeHtml(s.id)}"${this.selectedStudentId === s.id ? ' selected' : ''}>${Shared.escapeHtml(s.name)}</option>`;
            });
            sel.innerHTML = html;
            if (this.selectedStudentId && !students.some((s) => s.id === this.selectedStudentId)) {
                this.selectedStudentId = null;
            }
        },

        // ============ 评估范围（弹窗选择） ============
        getSelectedTrainings() {
            const D = Shared.data;
            return (this.selectedTrainingIds || [])
                .map((id) => (D.trainings || []).find((t) => t.id === id))
                .filter(Boolean);
        },

        // 数据集选项（跨全部集训）
        getDataOptions() {
            const D = Shared.data;
            const all = D.trainings || [];
            const options = [];
            let hasPractice = false;
            all.forEach((t) => {
                if ((t.practiceRecords || []).length > 0) hasPractice = true;
                (t.mockCompetitions || []).forEach((m) => {
                    const suffix = all.length > 1 ? `（${t.name || '未命名集训'}）` : '';
                    options.push({
                        value: m.id,
                        label: `${Shared.getMockTypeLabel(m)} ${m.name || Shared.getMockTypeText(m)}${suffix}`,
                    });
                });
            });
            if (hasPractice) options.unshift({ value: 'practice', label: '🎯 自主训练' });
            return options;
        },

        // 默认全选（集训 + 数据集）
        initScope() {
            this.selectedTrainingIds = (Shared.data.trainings || []).map((t) => t.id);
            this.selectedMockIds = this.getDataOptions().map((o) => o.value);
        },

        // 评估范围按钮摘要
        updateScopeSummary() {
            const btn = document.getElementById('scopeTrigger');
            if (!btn) return;
            const allT = (Shared.data.trainings || []).length;
            const allD = this.getDataOptions().length;
            const tFull = allT > 0 && this.selectedTrainingIds.length === allT;
            const dFull = allD > 0 && this.selectedMockIds.length === allD;
            if (tFull && dFull) btn.textContent = '📋 评估范围：全部';
            else btn.textContent = `📋 评估范围：集训 ${this.selectedTrainingIds.length}/${allT} · 赛项 ${this.selectedMockIds.length}/${allD}`;
        },

        // ============ 评估范围弹窗 ============
        openScopeModal() {
            const modal = document.getElementById('scopeModal');
            if (!modal) return;
            this._modalTrainings = this.selectedTrainingIds.slice();
            this._modalData = this.selectedMockIds.slice();
            this.renderScopeLists();
            modal.classList.add('open');
        },

        closeScopeModal() {
            const modal = document.getElementById('scopeModal');
            if (modal) modal.classList.remove('open');
            this._modalTrainings = null;
            this._modalData = null;
        },

        renderScopeLists() {
            const tList = document.getElementById('scopeTrainingList');
            const dList = document.getElementById('scopeDataList');
            if (!tList || !dList) return;
            const trainings = Shared.data.trainings || [];
            tList.innerHTML = trainings.map((t) => `
                <label><input type="checkbox" value="${Shared.escapeHtml(t.id)}"${this._modalTrainings.includes(t.id) ? ' checked' : ''}> ${Shared.escapeHtml(t.name || '（未命名集训）')}</label>`
            ).join('') || '<span style="font-size:0.85rem;color:var(--gray-400);">暂无集训</span>';
            tList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                cb.addEventListener('change', () => {
                    const v = cb.value;
                    if (cb.checked) {
                        if (!this._modalTrainings.includes(v)) this._modalTrainings.push(v);
                    } else {
                        this._modalTrainings = this._modalTrainings.filter((x) => x !== v);
                    }
                });
            });

            const dataOpts = this.getDataOptions();
            dList.innerHTML = dataOpts.map((o) => `
                <label><input type="checkbox" value="${Shared.escapeHtml(o.value)}"${this._modalData.includes(o.value) ? ' checked' : ''}> ${Shared.escapeHtml(o.label)}</label>`
            ).join('') || '<span style="font-size:0.85rem;color:var(--gray-400);">暂无赛项</span>';
            dList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                cb.addEventListener('change', () => {
                    const v = cb.value;
                    if (cb.checked) {
                        if (!this._modalData.includes(v)) this._modalData.push(v);
                    } else {
                        this._modalData = this._modalData.filter((x) => x !== v);
                    }
                });
            });
        },

        confirmScope() {
            const allT = (Shared.data.trainings || []).map((t) => t.id);
            const allD = this.getDataOptions().map((o) => o.value);
            this.selectedTrainingIds = (this._modalTrainings || []).filter((id) => allT.includes(id));
            this.selectedMockIds = (this._modalData || []).filter((id) => allD.includes(id));
            this.closeScopeModal();
            this.updateScopeSummary();
            if (this.selectedStudentId) this.generate();
            else this.showEmpty('请选择学员，生成评估报告');
        },

        bindEvents() {
            // 视图切换：填写 / 导出预览（同窗口）
            const viewToggle = document.getElementById('evalViewToggle');
            if (viewToggle) {
                viewToggle.querySelectorAll('.view-btn').forEach((btn) => {
                    btn.addEventListener('click', () => this.setViewMode(btn.dataset.view));
                });
            }
            // 导出 PDF（浏览器打印，可另存为 PDF）
            const printBtn = document.getElementById('evalPrintBtn');
            if (printBtn) printBtn.addEventListener('click', () => this.guardQuantEditExit(() => { window.print(); this._markCurrentReportExported(); }));
            // 水印模板（用户自定义）：下拉套用 / 存为模板 / 删除
            const wmTp = document.getElementById('wmTemplate');
            if (wmTp) wmTp.addEventListener('change', () => {
                this.updateWatermarkDelBtn();
                if (!wmTp.value) return;
                this.applyWatermarkSettingsToModal(this.getWatermarkTemplates()[wmTp.value]);
            });
            const wmTplSave = document.getElementById('wmTemplateSave');
            if (wmTplSave) wmTplSave.addEventListener('click', () => {
                const row = document.getElementById('wmTemplateSaveRow');
                const input = document.getElementById('wmTemplateNewName');
                if (row) row.style.display = 'flex';
                if (input) input.focus();
            });
            const wmTplSaveCancel = document.getElementById('wmTemplateSaveCancel');
            if (wmTplSaveCancel) wmTplSaveCancel.addEventListener('click', () => {
                const row = document.getElementById('wmTemplateSaveRow');
                if (row) row.style.display = 'none';
            });
            const wmTplSaveConfirm = document.getElementById('wmTemplateSaveConfirm');
            if (wmTplSaveConfirm) wmTplSaveConfirm.addEventListener('click', () => {
                const input = document.getElementById('wmTemplateNewName');
                const name = input ? input.value.trim() : '';
                if (!name) { this.toast('请输入模板名称', 'warning'); if (input) input.focus(); return; }
                this.saveWatermarkTemplate(name, this.collectWatermarkFromModal());
                if (input) input.value = '';
                const row = document.getElementById('wmTemplateSaveRow');
                if (row) row.style.display = 'none';
                this.refreshWatermarkTemplateSelect(name);
                this.toast(`已保存模板「${name}」`);
            });
            const wmTplDel = document.getElementById('wmTemplateDel');
            if (wmTplDel) wmTplDel.addEventListener('click', () => {
                const sel = document.getElementById('wmTemplate');
                if (!sel || !sel.value) return;
                this.deleteWatermarkTemplate(sel.value);
                this.refreshWatermarkTemplateSelect('');
                this.toast('已删除模板');
            });
            // 「🖨 PDF 水印」标签页：保存水印设置（全局，不依赖学员）
            const wmSaveBtn = document.getElementById('wmSaveBtn');
            if (wmSaveBtn) wmSaveBtn.addEventListener('click', () => this.saveWatermarkFromTab());
            // AI 生成教练评语（aiCommentBtn 为动态创建，在 generate() 内绑定；此处绑定弹窗内静态元素）
            const aiModal = document.getElementById('aiCommentModal');
            if (aiModal) aiModal.addEventListener('click', (e) => { if (e.target === aiModal) aiModal.classList.remove('open'); });
            const aiCancel = document.getElementById('aiCommentCancel');
            if (aiCancel) aiCancel.addEventListener('click', () => { const m = document.getElementById('aiCommentModal'); if (m) m.classList.remove('open'); });
            const aiCopy = document.getElementById('aiCopyBtn');
            if (aiCopy) aiCopy.addEventListener('click', () => this.copyAIDataPackage());
            const aiGen = document.getElementById('aiGenerateBtn');
            if (aiGen) aiGen.addEventListener('click', () => this.callAIGenerate());
            const aiCfgSave = document.getElementById('aiConfigSaveBtn');
            if (aiCfgSave) aiCfgSave.addEventListener('click', () => this.saveAIConfigFromModal());
            const aiPaste = document.getElementById('aiPasteParseBtn');
            if (aiPaste) aiPaste.addEventListener('click', () => this.parsePasteAndShow());
            const aiProviderSel = document.getElementById('aiProvider');
            if (aiProviderSel) aiProviderSel.addEventListener('change', () => this.applyAIProvider(aiProviderSel.value));
            // 新增子维度弹窗（选择父维度）
            const qSubModal = document.getElementById('quantAddSubModal');
            if (qSubModal) qSubModal.addEventListener('click', (e) => { if (e.target === qSubModal) qSubModal.classList.remove('open'); });
            const qSubCancel = document.getElementById('quantAddSubCancel');
            if (qSubCancel) qSubCancel.addEventListener('click', () => { const m = document.getElementById('quantAddSubModal'); if (m) m.classList.remove('open'); });
            const qSubConfirm = document.getElementById('quantAddSubConfirm');
            if (qSubConfirm) qSubConfirm.addEventListener('click', () => this.confirmQuantAddSub());
            // 量化结构编辑退出弹窗（静态，绑定一次）
            const qExitModal = document.getElementById('quantEditExitModal');
            if (qExitModal) {
                qExitModal.addEventListener('click', (e) => { if (e.target === qExitModal) this.quantExitCancel(); });
                const qExitCancel = document.getElementById('quantExitCancel');
                if (qExitCancel) qExitCancel.addEventListener('click', () => this.quantExitCancel());
                const qExitDiscard = document.getElementById('quantExitDiscard');
                if (qExitDiscard) qExitDiscard.addEventListener('click', () => this.quantExitDiscard());
                const qExitOverwrite = document.getElementById('quantExitOverwrite');
                if (qExitOverwrite) qExitOverwrite.addEventListener('click', () => this.quantExitOverwrite());
                const qExitSaveNew = document.getElementById('quantExitSaveNew');
                if (qExitSaveNew) qExitSaveNew.addEventListener('click', () => this.quantExitShowNewName(true));
                const qExitNewNameCancel = document.getElementById('quantExitNewNameCancel');
                if (qExitNewNameCancel) qExitNewNameCancel.addEventListener('click', () => this.quantExitShowNewName(false));
                const qExitNewNameConfirm = document.getElementById('quantExitNewNameConfirm');
                if (qExitNewNameConfirm) qExitNewNameConfirm.addEventListener('click', () => this.quantExitSaveNew());
            }
            // 出具存档
            const issueBtn = document.getElementById('evalIssueBtn');
            if (issueBtn) issueBtn.addEventListener('click', () => this.issueReport());
            const backBtn = document.getElementById('archiveBackBtn');
            if (backBtn) backBtn.addEventListener('click', () => this.backFromArchive());
            const reportCloseBtn = document.getElementById('reportCloseBtn');
            if (reportCloseBtn) reportCloseBtn.addEventListener('click', () => this.closeReportSheet());
            // 量化结构模板导出弹窗（静态）
            const qExpModal = document.getElementById('quantTplExportModal');
            if (qExpModal) {
                qExpModal.addEventListener('click', (e) => { if (e.target === qExpModal) this.closeQuantExportModal(); });
                const qExpCancel = document.getElementById('quantTplExportCancel');
                if (qExpCancel) qExpCancel.addEventListener('click', () => this.closeQuantExportModal());
                const qExpConfirm = document.getElementById('quantTplExportConfirm');
                if (qExpConfirm) qExpConfirm.addEventListener('click', () => this.confirmQuantExport());
                const qExpAll = document.getElementById('quantTplExportAll');
                if (qExpAll) qExpAll.addEventListener('click', () => this.setQuantExportAll(true));
                const qExpNone = document.getElementById('quantTplExportNone');
                if (qExpNone) qExpNone.addEventListener('click', () => this.setQuantExportAll(false));
            }
            // 评估计划 ToDo
            const planQuick = document.getElementById('planQuickAdd');
            if (planQuick) planQuick.addEventListener('click', () => this.openPlanModal());
            // 按学员：学员卡点击 → 评估记录弹窗（计划内任务 / 历史报告存档）
            const stuRecModal = document.getElementById('stuRecordsModal');
            if (stuRecModal) {
                stuRecModal.addEventListener('click', (e) => { if (e.target === stuRecModal) this.closeStuRecords(); });
                const stuRecClose = document.getElementById('stuRecordsClose');
                if (stuRecClose) stuRecClose.addEventListener('click', () => this.closeStuRecords());
                const stuRecList = document.getElementById('stuRecordsList');
                if (stuRecList) stuRecList.addEventListener('click', (e) => {
                    const openBtn = e.target.closest('[data-rec-open]');
                    if (openBtn) { const pid = openBtn.dataset.pid; const sid = openBtn.dataset.sid; const mode = openBtn.dataset.mode; this.closeStuRecords(); this.openPlanStudent(pid, sid, mode); return; }
                    const viewBtn = e.target.closest('[data-rec-view]');
                    if (viewBtn) { const id = viewBtn.dataset.recView; this.closeStuRecords(); this.viewIssued(id); return; }
                    const delBtn = e.target.closest('[data-rec-del]');
                    if (delBtn) { this.deleteIssued(delBtn.dataset.recDel); this._renderStuRecords(); }
                });
            }
            // 内容呈现方式：按计划 / 按学员
            const planViewToggleEl = document.getElementById('planViewToggle');
            if (planViewToggleEl) planViewToggleEl.addEventListener('click', (e) => {
                const b = e.target.closest('.view-btn');
                if (!b) return;
                this.setPlanView(b.dataset.planview);
            });
            // 按学员：班级下拉快速定位
            const planStuClassSel = document.getElementById('planStuClass');
            if (planStuClassSel) planStuClassSel.addEventListener('change', () => {
                this._planStuFilter = planStuClassSel.value;
                this.renderPlanBoard();
            });
            const planModalEl = document.getElementById('planModal');
            if (planModalEl) planModalEl.addEventListener('click', (e) => { if (e.target === planModalEl) this.closePlanModal(); });
            const planCancel = document.getElementById('planCancel');
            if (planCancel) planCancel.addEventListener('click', () => this.closePlanModal());
            const planSave = document.getElementById('planSave');
            if (planSave) planSave.addEventListener('click', () => this.savePlan());
            const planTplSel = document.getElementById('planTpl');
            if (planTplSel) planTplSel.addEventListener('change', () => this._updatePlanProjInfo());
            const planTplPreview = document.getElementById('planTplPreview');
            if (planTplPreview) planTplPreview.addEventListener('click', () => this.openTplPreview(planTplSel ? planTplSel.value : '__default__'));
            const planClassListEl = document.getElementById('planClassList');
            if (planClassListEl) planClassListEl.addEventListener('click', (e) => {
                const el = e.target.closest('[data-cls]');
                if (!el) return;
                this._planClass = el.dataset.cls;
                this._renderPlanClassList();
                this._renderPlanStudentList();
            });
            const planStuListEl = document.getElementById('planStuList');
            if (planStuListEl) planStuListEl.addEventListener('click', (e) => {
                const el = e.target.closest('[data-sid]');
                if (!el) return;
                this._planAddStudent(el.dataset.sid);
            });
            const planSelListEl = document.getElementById('planSelList');
            if (planSelListEl) planSelListEl.addEventListener('click', (e) => {
                const el = e.target.closest('[data-sid]');
                if (!el) return;
                this._planRemoveStudent(el.dataset.sid);
            });
            const planSelClearEl = document.getElementById('planSelClear');
            if (planSelClearEl) planSelClearEl.addEventListener('click', () => { this._planSel = []; this._renderPlanStudentList(); this._renderPlanSelectedList(); });
            const planCardsEl = document.getElementById('planCards');
            if (planCardsEl) {
                planCardsEl.addEventListener('click', (e) => {
                    // 按学员视图：学员信息卡整卡可点 → 评估记录弹窗
                    const stuCard = e.target.closest('[data-rec-sid]');
                    if (stuCard) { this.openStuRecords(stuCard.dataset.recSid); return; }
                    // 进入填写 / 预览导出：功能按钮
                    const openBtn = e.target.closest('button[data-open]');
                    if (openBtn) { this.openPlanStudent(openBtn.dataset.pid, openBtn.dataset.sid, openBtn.dataset.mode); return; }
                    // 计划主区：展开 / 收起学员
                    const main = e.target.closest('.plan-card-main');
                    if (main) { this.planAct(main.dataset.id, 'expand'); return; }
                    const btn = e.target.closest('button[data-act]');
                    if (btn) this.planAct(btn.dataset.id, btn.dataset.act);
                });
                planCardsEl.addEventListener('dragstart', (e) => {
                    const sc = e.target.closest('.plan-stu-card');
                    if (sc) {
                        e.dataTransfer.setData('text/plain', sc.dataset.sid);
                        this._dragStu = { pid: sc.dataset.pid, sid: sc.dataset.sid };
                        sc.classList.add('dragging');
                        return;
                    }
                    const pc = e.target.closest('.plan-card');
                    if (!pc) return;
                    e.dataTransfer.setData('text/plain', pc.dataset.id);
                    this._dragPlanId = pc.dataset.id;
                    pc.classList.add('dragging');
                });
                planCardsEl.addEventListener('dragend', (e) => {
                    const t = e.target.closest('.plan-card, .plan-stu-card');
                    if (t) t.classList.remove('dragging');
                    planCardsEl.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));
                    this._dragPlanId = null;
                    this._dragStu = null;
                });
                planCardsEl.addEventListener('dragover', (e) => {
                    if (this._dragStu) {
                        const sc = e.target.closest('.plan-stu-card');
                        if (!sc || sc.dataset.pid !== this._dragStu.pid) return;
                        e.preventDefault();
                        sc.classList.add('drag-over');
                        return;
                    }
                    const item = e.target.closest('.plan-item');
                    if (!item || !this._dragPlanId) return;
                    e.preventDefault();
                    item.classList.add('drag-over');
                });
                planCardsEl.addEventListener('dragleave', (e) => {
                    const t = e.target.closest('.plan-item, .plan-card, .plan-stu-card');
                    if (t) t.classList.remove('drag-over');
                });
                planCardsEl.addEventListener('drop', (e) => {
                    planCardsEl.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));
                    if (this._dragStu) {
                        const sc = e.target.closest('.plan-stu-card');
                        if (!sc || sc.dataset.pid !== this._dragStu.pid) return;
                        e.preventDefault();
                        const from = this._dragStu.sid;
                        this.reorderPlanStudents(this._dragStu.pid, from, sc.dataset.sid);
                        this._dragStu = null;
                        return;
                    }
                    const item = e.target.closest('.plan-item');
                    if (!item) return;
                    e.preventDefault();
                    const from = this._dragPlanId || e.dataTransfer.getData('text/plain');
                    this.reorderPlan(from, item.dataset.id);
                    this._dragPlanId = null;
                });
            }
            // 任务点评：输入即自动保存 + 失焦再兜底（内容为动态渲染，用文档级委托）
            const saveTaskCommentFrom = (e) => {
                const ta = (e.target && e.target.closest) ? e.target.closest('textarea[data-task-comment]') : null;
                if (ta) this.saveTaskComment(ta.dataset.taskComment, ta.value);
            };
            document.addEventListener('input', saveTaskCommentFrom);
            document.addEventListener('focusout', saveTaskCommentFrom);
            // 评估模板管理
            const tplMgmtBtn = document.getElementById('evalTplMgmtBtn');
            if (tplMgmtBtn) tplMgmtBtn.addEventListener('click', () => this.openTplMgmtModal());
            const tplMgmtModalEl = document.getElementById('tplMgmtModal');
            if (tplMgmtModalEl) {
                tplMgmtModalEl.addEventListener('click', (e) => { if (e.target === tplMgmtModalEl) this.closeTplMgmtModal(); });
                const tplMgmtClose = document.getElementById('tplMgmtClose');
                if (tplMgmtClose) tplMgmtClose.addEventListener('click', () => this.closeTplMgmtModal());
                // 模板管理：标签页切换（评估模板 / PDF 水印）
                const tplMgmtTabs = document.getElementById('tplMgmtTabs');
                if (tplMgmtTabs) tplMgmtTabs.addEventListener('click', (e) => {
                    const tab = e.target.closest('.tpl-tab');
                    if (!tab) return;
                    const key = tab.dataset.tpltab;
                    tplMgmtTabs.querySelectorAll('.tpl-tab').forEach((b) => b.classList.toggle('active', b === tab));
                    const panes = { quant: 'tplPaneQuant', watermark: 'tplPaneWatermark' };
                    Object.keys(panes).forEach((k) => {
                        const pane = document.getElementById(panes[k]);
                        if (pane) pane.classList.toggle('active', k === key);
                    });
                });
                const tplMgmtExport = document.getElementById('tplMgmtExportBtn');
                if (tplMgmtExport) tplMgmtExport.addEventListener('click', () => this.openQuantExportModal());
                // 评估模板导入（JSON 文件）
                const tplMgmtImport = document.getElementById('tplMgmtImportBtn');
                if (tplMgmtImport) tplMgmtImport.addEventListener('click', () => this.openQuantImportPicker());
                const tplMgmtImportFile = document.getElementById('tplMgmtImportFile');
                if (tplMgmtImportFile) tplMgmtImportFile.addEventListener('change', (e) => {
                    const f = e.target && e.target.files ? e.target.files[0] : null;
                    this.importTemplateFile(f);
                });
                // 量化结构模板：预览弹窗（预览 / 编辑 双模式）
                const tplPreviewModalEl = document.getElementById('tplPreviewModal');
                if (tplPreviewModalEl) {
                    tplPreviewModalEl.addEventListener('click', (e) => { if (e.target === tplPreviewModalEl) this.closeTplPreview(); });
                    const tplPreviewClose = document.getElementById('tplPreviewClose');
                    if (tplPreviewClose) tplPreviewClose.addEventListener('click', () => this.closeTplPreview());
                    const tplPreviewToggle = document.getElementById('tplPreviewToggle');
                    if (tplPreviewToggle) tplPreviewToggle.addEventListener('click', (e) => {
                        const b = e.target.closest('.view-btn');
                        if (!b || b.disabled) return;
                        this.setTplPreviewMode(b.dataset.tplmode);
                    });
                }
                const tplMgmtNewBtn = document.getElementById('tplMgmtNewBtn');
                if (tplMgmtNewBtn) tplMgmtNewBtn.addEventListener('click', () => this.tplMgmtShowNew(true));
                const tplMgmtNewCancel = document.getElementById('tplMgmtNewCancel');
                if (tplMgmtNewCancel) tplMgmtNewCancel.addEventListener('click', () => this.tplMgmtShowNew(false));
                const tplMgmtNewConfirm = document.getElementById('tplMgmtNewConfirm');
                if (tplMgmtNewConfirm) tplMgmtNewConfirm.addEventListener('click', () => this.tplMgmtSaveNew());
                const tplMgmtListEl = document.getElementById('tplMgmtList');
                if (tplMgmtListEl) tplMgmtListEl.addEventListener('click', (e) => {
                    const btn = e.target.closest('button[data-act]');
                    if (!btn) return;
                    this.tplMgmtAct(btn.dataset.id, btn.dataset.act);
                });
                const tplProjSave = document.getElementById('tplProjSave');
                if (tplProjSave) tplProjSave.addEventListener('click', () => this.tplProjSave());
                const tplProjClear = document.getElementById('tplProjClear');
                if (tplProjClear) tplProjClear.addEventListener('click', () => this.tplProjClear());
                const tplProjCancel = document.getElementById('tplProjCancel');
                if (tplProjCancel) tplProjCancel.addEventListener('click', () => this.tplProjCancel());
                // 模板编辑模式底部控制（位于模板预览窗内）
                const tplEditCancel = document.getElementById('tplEditCancel');
                if (tplEditCancel) tplEditCancel.addEventListener('click', () => this.closeTplEditModal());
                const tplEditSave = document.getElementById('tplEditSave');
                if (tplEditSave) tplEditSave.addEventListener('click', () => this.tplEditSaveOriginal());
                const tplEditNewConfirm = document.getElementById('tplEditNewConfirm');
                if (tplEditNewConfirm) tplEditNewConfirm.addEventListener('click', () => this.tplEditSaveNew());
                // 模板编辑：赛事规划行（增行；删行在渲染时逐个绑定）
                const tplCompAdd = document.getElementById('tplEditCompPlanAdd');
                if (tplCompAdd) tplCompAdd.addEventListener('click', () => {
                    const cur = this.collectEditCompPlan();
                    cur.push({ competition: '', date: '' });
                    this.renderTplEditCompPlan(cur);
                });
            }

            // ===== 评估范围弹窗 =====
            const scopeBtn = document.getElementById('scopeTrigger');
            if (scopeBtn) scopeBtn.addEventListener('click', () => this.openScopeModal());
            const scCancel = document.getElementById('scopeCancel');
            if (scCancel) scCancel.addEventListener('click', () => this.closeScopeModal());
            const scConfirm = document.getElementById('scopeConfirm');
            if (scConfirm) scConfirm.addEventListener('click', () => this.confirmScope());
            const scModal = document.getElementById('scopeModal');
            if (scModal) scModal.addEventListener('click', (e) => { if (e.target === scModal) this.closeScopeModal(); });
            const tAll = document.getElementById('scopeTrainingAll');
            if (tAll) tAll.addEventListener('click', () => {
                this._modalTrainings = (Shared.data.trainings || []).map((t) => t.id);
                this.renderScopeLists();
            });
            const tNone = document.getElementById('scopeTrainingNone');
            if (tNone) tNone.addEventListener('click', () => {
                this._modalTrainings = [];
                this.renderScopeLists();
            });
            const dAll = document.getElementById('scopeDataAll');
            if (dAll) dAll.addEventListener('click', () => {
                this._modalData = this.getDataOptions().map((o) => o.value);
                this.renderScopeLists();
            });
            const dNone = document.getElementById('scopeDataNone');
            if (dNone) dNone.addEventListener('click', () => {
                this._modalData = [];
                this.renderScopeLists();
            });
        },

        showEmpty(msg) {
            const content = document.getElementById('evalContent');
            if (content) content.innerHTML = `<div class="empty-state"><div class="icon">👆</div><p>${Shared.escapeHtml(msg)}</p></div>`;
        },
        // ============ 报告填写弹窗（全屏 sheet，可上下滚动） ============
        openReportSheet(subtitle) {
            const sheet = document.getElementById('reportSheet');
            if (!sheet) return;
            // 防御：只有在真的有已渲染的报告内容时才打开（避免出现空的「训练评估报告」面板）
            if (!this._reportRendered) {
                this.toast('请先从「📋 评估计划」选择学员，再查看评估报告', 'warning');
                return;
            }
            const sub = document.getElementById('reportSheetSub');
            if (sub) sub.textContent = subtitle || '';
            sheet.classList.add('open');
            document.body.classList.add('report-sheet-lock');
            const bodyEl = sheet.querySelector('.report-sheet-body');
            if (bodyEl) bodyEl.scrollTop = 0;
        },
        closeReportSheet() {
            const sheet = document.getElementById('reportSheet');
            if (sheet) sheet.classList.remove('open');
            document.body.classList.remove('report-sheet-lock');
            this._reportRendered = false; // 关闭后内容不再保证有效，下次需重新渲染方可打开
            // 若正在查看历史报告，一并退出查看态
            if (this.viewingArchiveId) {
                this.viewingArchiveId = null;
                const notice = document.getElementById('archiveViewNotice');
                if (notice) notice.style.display = 'none';
                const ib = document.getElementById('evalIssueBtn');
                if (ib && this.viewMode === 'preview') ib.style.display = '';
            }
            // 回到页面视图（避免停留在「导出预览」导致计划看板隐藏）
            if (this.viewMode !== 'edit') this._applyViewMode('edit');
            this._autoMarkFillOnExit();
            // 退出报告：清掉计划级的元素/水印覆盖，水印层恢复为全局设置
            if (this._elemOverride || this._wmOverride) {
                this._elemOverride = null;
                this._wmOverride = null;
                this.renderWatermark();
            }
            this._curPlanId = null;
            this._curSid = null;
            this.renderPlanBoard();
        },
        // ============ 填写会话：快照 + 退出时自动记进度 ============
        // 学员填写相关数据快照（分数 / 结构 / 评语），用于判断本次进入是否有改动
        // 注：报告元素（evalReportElements）与水印（evalWatermark）为全局设置，不计入单学员改动
        _fillSnapshot(sid) {
            const pick = (key) => {
                try { return JSON.parse(localStorage.getItem(key) || '{}')[sid] || null; } catch (e) { return null; }
            };
            return JSON.stringify([
                pick('evalQuantScores'),
                pick('evalQuantTemplate'),
                pick('evalCoachComments'),
                pick('evalFinalComments'),
            ]);
        },
        // 退出填写弹窗：对比快照，有改动且尚未标记时自动把「填写」标记为完成
        _autoMarkFillOnExit() {
            const pid = this._fillPlanId;
            const sid = this._fillSid;
            const base = this._fillBase;
            this._fillPlanId = null;
            this._fillSid = null;
            this._fillBase = null;
            if (!pid || !sid || base == null) return;
            if (this._fillSnapshot(sid) === base) return; // 没改动，不动进度
            if (!this._markPlanTask(pid, sid, 'fill')) return;
            const st = (Shared.data.students || []).find((s) => s.id === sid);
            this.toast(`已记录 ${st ? st.name : '该学员'} 的填写进度`);
        },

        // ============ 数据收集（单个学员） ============
        // 收集某学员在 多个选定集训 + 选定数据集（赛项/自主训练）内的各任务表现与记录明细
        collectStudentAssessment(studentId, trainings, mockIds) {
            const D = Shared.data;
            const ids = mockIds || [];
            const multi = trainings.length > 1;
            const goalTraining = trainings[0] || null;
            const taskMap = {};
            (D.tasks || []).forEach((t) => { taskMap[t.id] = t; });
            const perTask = {};
            const records = [];

            const addEntry = (tid, score, time, rec) => {
                if (score === null || score === undefined) return;
                if (!perTask[tid]) {
                    const task = taskMap[tid];
                    perTask[tid] = {
                        taskId: tid,
                        taskName: task ? task.name : tid,
                        taskType: task ? task.type : 'basic',
                        best: null, bestTime: null, count: 0,
                        fullTimes: [],
                        maxScore: task ? (task.maxScore || null) : null,
                        attempts: [],
                    };
                }
                const t = perTask[tid];
                t.count++;
                t.attempts.push(score);
                if (score > t.best || (score === t.best && time != null && (t.bestTime == null || time < t.bestTime))) {
                    t.best = score;
                    t.bestTime = time ?? null;
                }
                if (t.maxScore && score === t.maxScore && time != null) t.fullTimes.push(time);
                if (rec) records.push(rec);
            };

            trainings.forEach((training) => {
                const trSuffix = multi ? `（${training.name || '未命名集训'}）` : '';
                // 自主训练
                if (ids.includes('practice')) {
                    (training.practiceRecords || []).forEach((r) => {
                        if (r.studentId !== studentId) return;
                        const task = taskMap[r.taskId];
                        addEntry(r.taskId, r.score, r.time, {
                            taskId: r.taskId,
                            trainingId: training.id,
                            trainingName: training.name || '',
                            date: r.date || (r.submittedAt || '').slice(0, 10) || '-',
                            sourceLabel: `🎯 自主训练${trSuffix}`,
                            competitionType: 'practice',
                            roundLabel: '第' + (r.round || 1) + '轮',
                            taskName: task ? task.name : r.taskId,
                            score: r.score,
                            time: r.time,
                        });
                    });
                }
                // 赛项
                (training.mockCompetitions || []).filter((m) => ids.includes(m.id)).forEach((m) => {
                    if (m.withdrawn && m.withdrawn[studentId]) return;
                    const ss = m.scores && m.scores[studentId];
                    if (!ss) return;
                    Object.entries(ss).forEach(([tid, entry]) => {
                        if (!entry) return;
                        const task = taskMap[tid];
                        const rounds = Shared.getRounds(entry);
                        rounds.forEach((r, idx) => {
                            if (!r) return;
                            const score = (r.score !== undefined && r.score !== null) ? r.score : null;
                            const time = (r.time !== undefined && r.time !== null) ? r.time : null;
                            if (score === null && time === null) return;
                            addEntry(tid, score, time, {
                                taskId: tid,
                                trainingId: training.id,
                                trainingName: training.name || '',
                                date: m.date || '-',
                                sourceLabel: `${Shared.getMockTypeLabel(m)} · ${m.name || Shared.getMockTypeText(m)}${trSuffix}`,
                                competitionType: m.competitionType || 'mock',
                                roundLabel: rounds.length > 1 ? '第' + (idx + 1) + '轮' : '—',
                                taskName: task ? task.name : tid,
                                score,
                                time,
                            });
                        });
                    });
                });
            });

            const taskEntries = Object.values(perTask);
            if (taskEntries.length === 0) return null;

            const bestScores = taskEntries.map((t) => t.best).filter((v) => v != null);
            const bestTimes = taskEntries.map((t) => t.bestTime).filter((v) => v != null);
            // 满分率：各任务最佳分相对满分的平均达成率（与个人成绩卡口径一致）
            const withMax = taskEntries.filter((t) => t.maxScore && t.best != null);
            const fullRate = withMax.length
                ? (withMax.reduce((a, t) => a + (t.best / t.maxScore), 0) / withMax.length) * 100
                : null;
            const avg = bestScores.length ? bestScores.reduce((a, b) => a + b, 0) / bestScores.length : null;
            const best = bestScores.length ? Math.max(...bestScores) : null;
            const bestTime = bestTimes.length ? Math.min(...bestTimes) : null;

            // 稳定性：用各任务相对满分达成率（best/maxScore）的变异系数
            let stability = null;
            const relScores = withMax.map((t) => t.best / t.maxScore);
            if (relScores.length >= 2) {
                const mean = relScores.reduce((a, b) => a + b, 0) / relScores.length;
                const variance = relScores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / relScores.length;
                stability = this.stabilityRating(variance, mean);
            }

            // 目标达标：满分前提用时目标
            const goals = [];
            Object.entries(perTask).forEach(([tid, t]) => {
                const task = taskMap[tid];
                const goalTimes = Shared.getGoalTimes(task, goalTraining, studentId);
                if (!goalTimes || goalTimes.length === 0) return;
                const bestFull = t.fullTimes.length ? Math.min(...t.fullTimes) : null;
                const current = Shared.currentGoal(bestFull, goalTimes);
                goals.push({
                    taskId: tid,
                    taskName: t.taskName,
                    bestFull,
                    current,
                    achieved: current === null && bestFull != null,
                });
            });
            const achieved = goals.filter((g) => g.achieved).length;

            return {
                perTask,
                taskEntries,
                taskCount: taskEntries.length,
                best,
                avg,
                fullRate,
                bestTime,
                stability,
                goals,
                achieved,
                goalTotal: goals.length,
                grade: this.assessGrade(fullRate, avg, stability),
                suggestion: this.assessSuggestion(fullRate, stability),
                records,
                taskMap,
            };
        },

        // ============ 评级 / 建议 ============
        gradeScore(r) {
            let base = 0;
            if (r.fullRate != null) base = r.fullRate;
            else if (r.avg != null) base = r.avg;
            if (r.stability) {
                if (r.stability.label.startsWith('A')) base += 3;
                else if (r.stability.label.startsWith('B')) base += 1;
                else if (r.stability.label.startsWith('D')) base -= 3;
            }
            return base;
        },

        assessGrade(fullRate, avg, stability) {
            let base;
            if (fullRate != null) base = fullRate;
            else if (avg != null) base = avg;
            else return { label: '—', color: 'var(--gray-400)' };
            let score = base;
            if (stability) {
                if (stability.label.startsWith('A')) score += 3;
                else if (stability.label.startsWith('B')) score += 1;
                else if (stability.label.startsWith('D')) score -= 3;
            }
            score = Math.max(0, Math.min(100, score));
            if (score >= 90) return { label: '优', color: '#10b981' };
            if (score >= 75) return { label: '良', color: '#22c55e' };
            if (score >= 60) return { label: '中', color: '#f59e0b' };
            return { label: '待提升', color: '#ef4444' };
        },

        assessSuggestion(fullRate, stability) {
            const parts = [];
            if (fullRate != null) {
                if (fullRate >= 90) parts.push('已达高水平，保持状态');
                else if (fullRate >= 75) parts.push('基本功扎实，冲刺满分');
                else if (fullRate >= 50) parts.push('仍有提升空间，建议针对性训练');
                else parts.push('基础薄弱，建议增加基础练习');
            }
            if (stability) {
                if (stability.label.startsWith('D')) parts.push('成绩波动大，需稳定发挥');
                else if (stability.label.startsWith('A') || stability.label.startsWith('B')) parts.push('发挥稳定');
            }
            return parts.length ? parts.join('；') : '数据不足，暂无法评估';
        },

        stabilityRating(variance, avg) {
            if (!avg) return null;
            const cv = Math.sqrt(variance) / avg;
            if (cv < 0.05) return { label: 'A 非常稳定', color: '#10b981' };
            if (cv < 0.1) return { label: 'B 稳定', color: '#22c55e' };
            if (cv < 0.18) return { label: 'C 一般', color: '#f59e0b' };
            return { label: 'D 波动大', color: '#ef4444' };
        },

        // ============ 渲染（单个学员） ============
        generate() {
            const content = document.getElementById('evalContent');
            if (!content) return;
            const student = (Shared.data.students || []).find((s) => s.id === this.selectedStudentId);
            if (!student) { this.showEmpty('请先从上方「📋 评估计划」点学员卡的「✍️ 进入填写」'); return; }
            const trainings = this.getSelectedTrainings();
            if (trainings.length === 0) { this.showEmpty('暂无可用评估数据（未找到任何集训 / 赛事数据）'); return; }
            const r = this.collectStudentAssessment(student.id, trainings, this.selectedMockIds);
            this._reportRendered = true; // 已渲染报告（或空数据提示），允许打开报告弹窗
            if (!r) {
                content.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>${Shared.escapeHtml(student.name)} 在选定范围内暂无成绩数据</p></div>`;
                return;
            }
            // 每次生成报告：重置量化细则为「填写」模式并清理编辑会话，避免串到其它学员/下一次生成
            this.quantSubMode = 'fill';
            this._quantEditBaseline = null;
            this._quantExitPrompting = false;
            this._quantExitCb = null;
            this._quantExitCancelCb = null;
            // 离开“已出具报告”查看态（重新生成为当前报告）
            if (this.viewingArchiveId) this.viewingArchiveId = null;
            const _arcNotice = document.getElementById('archiveViewNotice');
            if (_arcNotice) _arcNotice.style.display = 'none';
            this._hideIssueBtnForArchive(false);
            content.innerHTML = this.renderReport(student, trainings, r);
            this.drawTaskChart(this._chartModel(student.id), r.taskMap);
            this.drawRadarCharts();
            this.initQuantTable();
            const resetBtn = document.getElementById('quantResetBtn');
            if (resetBtn) resetBtn.addEventListener('click', () => this.resetQuant());
            const qAddDim = document.getElementById('quantAddDimBtn');
            if (qAddDim) qAddDim.addEventListener('click', () => this.addDim());
            const qAddSub = document.getElementById('quantAddSubBtn');
            if (qAddSub) qAddSub.addEventListener('click', () => this.openQuantAddSubModal());
            const qResetDefault = document.getElementById('quantResetDefaultBtn');
            if (qResetDefault) qResetDefault.addEventListener('click', () => this.resetQuantDefault());
            // 结构模板下拉 = 选择；「设为默认」把所选模板存为下次打开的默认；另提供 套用/存为模板/删除
            this.refreshQuantStructSelect('');
            const qtSel = document.getElementById('quantStructTpl');
            if (qtSel) qtSel.addEventListener('change', () => {
                this.updateQuantTplControls(); // 选择变化仅同步按钮显隐（不直接改默认）
            });
            // 「设为默认」：把当前选中的模板设为下次打开本系统时的默认模板
            const qSetDef = document.getElementById('quantTplSetDefault');
            if (qSetDef) qSetDef.addEventListener('click', () => {
                const sel = document.getElementById('quantStructTpl');
                const v = sel ? sel.value : '__default__';
                this.setDefaultLoadName(v === '__default__' ? '' : v);
                this.refreshQuantStructSelect(v);
                if (!this.hasSavedQuantTemplate()) this.initQuantTable(); // 当前学员未保存过结构：立即按新默认展示
                this.toast(v === '__default__' ? '已将默认模板设为「内置默认」' : `已将「${v}」设为默认模板（下次打开本系统默认使用）`);
            });
            // 把所选用户模板应用到当前学员
            const qtApply = document.getElementById('quantTplApply');
            if (qtApply) qtApply.addEventListener('click', () => {
                const sel = document.getElementById('quantStructTpl');
                if (!sel || !sel.value || sel.value === '__default__') return;
                this.applyQuantStruct(sel.value);
            });
            const qtSave = document.getElementById('quantTplSave');
            if (qtSave) qtSave.addEventListener('click', () => {
                const row = document.getElementById('quantTplSaveRow');
                const inp = document.getElementById('quantTplName');
                if (row) row.style.display = 'flex';
                if (inp) inp.focus();
            });
            const qtSaveCancel = document.getElementById('quantTplSaveCancel');
            if (qtSaveCancel) qtSaveCancel.addEventListener('click', () => { const row = document.getElementById('quantTplSaveRow'); if (row) row.style.display = 'none'; });
            const qtSaveConfirm = document.getElementById('quantTplSaveConfirm');
            if (qtSaveConfirm) qtSaveConfirm.addEventListener('click', () => {
                const inp = document.getElementById('quantTplName');
                const name = inp ? inp.value.trim() : '';
                if (!name) { this.toast('请输入模板名称', 'warning'); if (inp) inp.focus(); return; }
                if (this.isReservedStructName(name)) {
                    this.toast('「默认/default」为系统内置模板，用户模板不能占用该名称', 'warning');
                    if (inp) { inp.value = ''; inp.focus(); }
                    return;
                }
                // 已被已出具报告引用的模板只读：不可同名覆盖（如需新版请另存为新模板）
                if (!this.assertTemplateWritable(name)) return;
                this.saveStructureTemplate(name, this.currentQuantTemplate());
                if (inp) inp.value = '';
                const row = document.getElementById('quantTplSaveRow');
                if (row) row.style.display = 'none';
                this.refreshQuantStructSelect(name);
                this.toast(`已保存用户模板「${name}」`);
            });
            const qtDel = document.getElementById('quantTplDel');
            if (qtDel) qtDel.addEventListener('click', () => {
                const sel = document.getElementById('quantStructTpl');
                if (!sel || !sel.value || sel.value === '__default__') return;
                if (this.getDefaultLoadName() === sel.value) this.setDefaultLoadName(''); // 删除的正是默认加载模板则回退系统默认
                this.deleteStructureTemplate(sel.value);
                this.refreshQuantStructSelect('');
                this.toast('已删除用户模板');
            });
            // 导出量化结构模板（可多选）
            const qTplExport = document.getElementById('quantTplExport');
            if (qTplExport) qTplExport.addEventListener('click', () => this.openQuantExportModal());
            // 恢复默认 = 把当前学员结构设回「内置默认」；默认模板由「设为默认」按钮控制
            this.updateQuantTplControls();
            // 量化评估细则：填写 / 编辑 模式切换（仅报告填写视图内出现）
            const qModeToggle = document.getElementById('quantModeToggle');
            if (qModeToggle) {
                qModeToggle.querySelectorAll('.view-btn').forEach((b) => {
                    b.addEventListener('click', () => this.setQuantSubMode(b.dataset.quantmode));
                });
            }
            this.updateQuantModeUI();
            this.startEditCoachComment(); // 教练评语默认开启编辑
            // 左栏：点击框内直接进入编辑
            const origBox = document.getElementById('coachOrigBox');
            if (origBox) origBox.addEventListener('click', (e) => {
                if (this._coachEditing) return;
                if (e.target.closest('button, textarea')) return;
                this.startEditCoachComment();
            });
            // AI 相关按钮在报告渲染后动态创建，需在此绑定
            const aiBtnDynamic = document.getElementById('aiCommentBtn');
            if (aiBtnDynamic) aiBtnDynamic.addEventListener('click', () => this.handleAIGenerate());
            const aiCopyQuick = document.getElementById('aiCopyQuickBtn');
            if (aiCopyQuick) aiCopyQuick.addEventListener('click', () => this.copyAIDataPackage());
            // 右栏：最终评语失去焦点自动保存（无保存按钮）
            const finalInput = document.getElementById('aiFinalInput');
            if (finalInput) {
                const saveFinal = () => {
                    this.saveFinalComment(finalInput.value.trim());
                    this.renderCoachFinal();
                    this._finalizeFinalEdit = null;
                };
                finalInput.addEventListener('blur', saveFinal);
                this._finalizeFinalEdit = saveFinal;
            }
            // 渲染报告中的教练评语（最终评语）
            this.renderCoachFinal();
            // 水印层（按当前设置重新平铺）
            this.renderWatermark();
        },

        getTrainingScopeLabel(trainings) {
            if (trainings.length === 1) return Shared.escapeHtml(trainings[0].name || '（未命名集训）');
            return `${trainings.length} 个集训`;
        },

        getScopeLabel(trainings, mockIds) {
            const ids = mockIds || [];
            const labels = [];
            const allMocks = [];
            trainings.forEach((t) => (t.mockCompetitions || []).forEach((m) => allMocks.push({ m, t })));
            const selectedMocks = allMocks.filter(({ m }) => ids.includes(m.id));
            const allSelected = allMocks.length > 0 && selectedMocks.length === allMocks.length;
            const hasPractice = ids.includes('practice');
            if (allSelected) return hasPractice ? '全部赛项 + 自主训练' : '全部赛项（合并）';
            if (hasPractice) labels.push('自主训练');
            selectedMocks.forEach(({ m, t }) => {
                labels.push(`${m.name || Shared.getMockTypeText(m)}${trainings.length > 1 ? `（${t.name || '未命名集训'}）` : ''}`);
            });
            return labels.length ? labels.join(' + ') : '—';
        },

        // ============ 赛事经历表（报告顶部，扁平表格：赛事 | 基础任务得分 | 成绩） ============
        // 数据来源＝系统里记录的赛事：集训的「赛事名称 / 赛事日期」（与「赛事规划」默认行同一来源），
        // 每个集训（=一场赛事）一行；成绩取该集训官方赛事中该学员的最好成绩
        // 注：内部模拟赛窗口不计入「经历」
        renderCompetitions(student, trainings) {
            const sid = student.id;
            const D = Shared.data;
            const basicTask = (D.tasks || []).find((t) => t.type === 'basic');
            const rows = [];

            trainings.forEach((training) => {
                const compName = (training.competitionName || '').trim() || (training.name || '').trim();
                const comps = (training.mockCompetitions || []).filter((m) => Shared.getMockType(m) === 'official');
                if (!compName && !comps.length) return;
                let withdrawn = false;
                let best = null;
                let bestTime = null;
                let rank = null;
                let prize = '';
                comps.forEach((m) => {
                    if (m.withdrawn && m.withdrawn[sid]) withdrawn = true;
                    const ss = m.scores && m.scores[sid];
                    if (!ss) return;
                    // 基础任务列：优先基础任务，缺失时回退到该学员首个有成绩的任务
                    let taskId = basicTask ? basicTask.id : null;
                    if ((!taskId || !ss[taskId])) {
                        const keys = Object.keys(ss);
                        if (keys.length) taskId = keys[0];
                    }
                    const entry = taskId ? ss[taskId] : null;
                    if (!entry) return;
                    const b = Shared.getBestScore(entry);
                    const bt = Shared.getBestScoreTime(entry);
                    if (b != null && (best == null || b > best)) {
                        best = b;
                        bestTime = bt;
                    }
                    const p = (m.prizes && m.prizes[sid]) || '';
                    if (p) prize = p;
                    const rk = (m.officialRankings && m.officialRankings[sid]) || (m.rankings && m.rankings[sid]) || null;
                    if (rk && (rank == null || Number(rk) < Number(rank))) rank = rk;
                });
                rows.push({
                    date: (training.date || '').trim() || '-',
                    name: compName || Shared.getMockTypeText(comps[0] || {}),
                    withdrawn,
                    participated: best !== null,
                    best,
                    bestTime,
                    rank,
                    prize,
                });
            });

            if (rows.length === 0) return '';

            rows.sort((a, b) => {
                if (a.date === '-' && b.date === '-') return 0;
                if (a.date === '-') return 1;
                if (b.date === '-') return -1;
                return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
            });

            const fmtTime = (t) => {
                if (t == null) return '';
                const n = Number(t);
                return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
            };
            const prizeOf = (r) => {
                // 优先显示正赛中手动录入的奖项；未录入时按名次回退
                if (r.prize) return `<span style="font-weight:700;color:var(--gray-700);">${Shared.escapeHtml(r.prize)}</span>`;
                const n = Number(r.rank);
                if (!n) return '';
                if (n === 1) return '<span style="color:#d4a017;font-weight:700;">一等奖</span>';
                if (n === 2) return '<span style="color:#a8a8a8;font-weight:700;">二等奖</span>';
                if (n === 3) return '<span style="color:#cd7f32;font-weight:700;">三等奖</span>';
                return `第${n}名`;
            };

            const rowHtml = rows.map((r) => {
                const scoreHtml = r.withdrawn
                    ? '<span style="color:#ef4444;">弃权</span>'
                    : (r.participated
                        ? `<span style="font-weight:600;color:var(--gray-700);">${r.best}分/${fmtTime(r.bestTime)}s</span>`
                        : '<span style="color:var(--gray-400);">未参加</span>');
                return `
                    <tr>
                        <td style="color:var(--gray-700);">${Shared.escapeHtml(r.name)}</td>
                        <td style="text-align:center;">${scoreHtml}</td>
                        <td style="text-align:center;">${prizeOf(r)}</td>
                    </tr>`;
            }).join('');

            return `
                <div style="overflow-x:auto;">
                    <table class="score-table">
                        <thead>
                            <tr>
                                <th>赛事</th>
                                <th style="text-align:center;">基础任务得分</th>
                                <th style="text-align:center;">成绩</th>
                            </tr>
                        </thead>
                        <tbody>${rowHtml}</tbody>
                    </table>
                </div>`;
        },

        // ============ 赛事规划表（赛事 + 预计时间；内容随「评估模板」保存，报告内只读展示） ============
        // 数据来源优先级：评估模板的赛事规划 → 旧数据（曾按学员保存）→ 按选定集训生成默认行
        renderCompetitionPlan(trainings) {
            return this.compPlanHtml();
        },
        getCompPlans() {
            const sid = this.selectedStudentId;
            if (!sid) return null;
            try { return JSON.parse(localStorage.getItem('evalCompPlans') || '{}')[sid] || null; } catch (e) { return null; }
        },
        defaultCompPlans(trainings) {
            return (trainings || []).map((t) => ({
                competition: (t.competitionName || '').trim() || (t.name || '').trim() || '',
                date: (t.date || '').trim() || '',
            }));
        },
        // 规整赛事规划行（去空格、丢弃空行）
        normalizeCompPlan(rows) {
            if (!Array.isArray(rows)) return [];
            return rows
                .map((r) => ({ competition: String((r && r.competition) || '').trim(), date: String((r && r.date) || '').trim() }))
                .filter((r) => r.competition || r.date);
        },
        compPlanRows() {
            const tplRows = this.normalizeCompPlan(this.activeReportElements().compPlan);
            if (tplRows.length) return tplRows;
            const saved = this.getCompPlans();
            if (saved && saved.length) return this.normalizeCompPlan(saved);
            return this.defaultCompPlans(this.getSelectedTrainings());
        },
        compPlanHtml() {
            const plans = this.compPlanRows();
            if (plans.length === 0) return '';
            const rowHtml = plans.map((p) => `
                    <tr>
                        <td style="color:var(--gray-700);">${Shared.escapeHtml(p.competition || '—')}</td>
                        <td style="text-align:center;color:var(--gray-600);">${Shared.escapeHtml(p.date || '—')}</td>
                    </tr>`).join('');
            return `
                <div id="compPlanContainer">
                    <div style="overflow-x:auto;">
                        <table class="score-table">
                            <thead>
                                <tr>
                                    <th>赛事</th>
                                    <th style="text-align:center;">预计时间</th>
                                </tr>
                            </thead>
                            <tbody id="compPlanBody">${rowHtml}</tbody>
                        </table>
                    </div>
                </div>`;
        },
        // 按视图模式重渲染量化评估表（填写=可编辑，预览=只读/纯文本）
        refreshQuantTableMode() {
            const container = document.getElementById('quantTableContainer');
            if (!container) return;
            this.initQuantTable();
        },

        // ============ 量化评估（综合）：评分汇总表 + 雷达图 ============
        // 依据量化评估表已打分数据，汇总 维度/子维度 评分，与参考值对比计算同龄指数
        computeQuantSummary() {
            const saved = this.getQuantScores();
            // 编辑模式：用未提交的草稿结构（_quantTemplate），否则用已保存结构
            const template = (this.quantSubMode === 'edit' && this._quantTemplate && this._quantTemplate.length)
                ? this._quantTemplate
                : this.getQuantTemplate();
            const avg = (arr) => (arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
            const dims = template.map((dim, di) => {
                let ci = 0;
                const subs = dim.subs.map((s) => {
                    const vals = s.criteria.map(() => {
                        const key = di + '-' + ci;
                        ci += 1;
                        return Number(saved[key]) || 0;
                    });
                    const refs = s.criteria.map((c) => (c.ref != null ? c.ref : 0));
                    return { name: s.sub, score: avg(vals) || 0, ref: avg(refs) || 0 };
                });
                return {
                    name: dim.dim,
                    icon: dim.icon || '',
                    color: this.dimHex(dim, di),
                    subs,
                    score: avg(subs.map((x) => x.score)) || 0,
                    ref: avg(subs.map((x) => x.ref)) || 0,
                };
            });
            return {
                max: this.MAX_SCORE || 5,
                dims,
                score: avg(dims.map((d) => d.score)) || 0,
                ref: avg(dims.map((d) => d.ref)) || 0,
            };
        },

        buildQuantSummaryHtml(sum) {
            const fmt = (v) => (v != null && v > 0 ? v.toFixed(2) : '0.00');
            const indexOf = (score, ref) => (ref > 0 ? Math.round((score / ref) * 100) + '%' : '—');
            const indexColor = (score, ref) => (ref > 0 ? (score >= ref ? '#10b981' : '#f59e0b') : 'var(--gray-400)');

            const dimRows = sum.dims.map((d) => {
                const main = d.color || '#64748b';
                const light = this.dimLight(main);
                const subRows = d.subs.map((s) => `
                    <tr style="background:${light};">
                        <td style="padding-left:0.6rem;color:var(--gray-600);">${Shared.escapeHtml(s.name)}</td>
                        <td style="text-align:center;color:var(--gray-700);font-weight:600;">${fmt(s.score)}</td>
                        <td style="text-align:center;color:var(--gray-500);">${fmt(s.ref)}</td>
                        <td style="text-align:center;color:${indexColor(s.score, s.ref)};font-weight:600;">${indexOf(s.score, s.ref)}</td>
                    </tr>`).join('');
                const nameTxt = (d.icon ? d.icon + ' ' : '') + Shared.escapeHtml(d.name);
                return `
                    <tr style="background:${main};">
                        <td style="font-weight:700;color:#fff;">${nameTxt}</td>
                        <td style="text-align:center;font-weight:700;color:#fff;">${fmt(d.score)}</td>
                        <td style="text-align:center;color:rgba(255,255,255,0.92);">${fmt(d.ref)}</td>
                        <td style="text-align:center;color:${indexColor(d.score, d.ref)};font-weight:700;background:rgba(255,255,255,0.85);border-radius:4px;">${indexOf(d.score, d.ref)}</td>
                    </tr>
                    ${subRows}`;
            }).join('');

            const radarCard = (id, title, labels, idxVals, maxScale) => `
                <div style="text-align:center;">
                    <div style="font-size:0.78rem;font-weight:600;color:var(--gray-700);line-height:1.15;margin-bottom:0.05rem;">${Shared.escapeHtml(title)}</div>
                    <canvas id="${id}" width="200" height="200" style="display:block;margin:0 auto;width:200px;height:200px;"></canvas>
                </div>`;
            const idx = (score, ref) => (ref > 0 ? score / ref : 0);
            const MS = 1.5;
            // 每个维度一张雷达（按实际维度名/数量动态生成；雷达区严格 2×2 = 前 3 个维度 + 综合评分，超出 3 个维度的雷达不再追加，避免“综合评分”掉到第 3 行）
            const radarDims = sum.dims.slice(0, 3);
            const perRadar = radarDims.map((d, di) =>
                radarCard('radarDim' + di, d.name || ('维度' + (di + 1)), d.subs.map((s) => s.name), d.subs.map((s) => idx(s.score, s.ref)), MS)
            ).join('');
            const radars = `
                ${perRadar}
                ${radarCard('radarOverall', '综合评分', sum.dims.map((d) => d.name), sum.dims.map((d) => idx(d.score, d.ref)), MS)}
            `;

            return `
                <div style="display:flex;gap:0.75rem;align-items:flex-start;">
                    <div style="flex:0 0 auto;width:320px;overflow-x:auto;">
                        <table class="score-table quant-summary-table">
                            <thead>
                                <tr>
                                    <th>评分汇总</th>
                                    <th style="text-align:center;">评分</th>
                                    <th style="text-align:center;">参考值</th>
                                    <th style="text-align:center;">评分/参考值</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${dimRows}
                                <tr style="font-weight:700;background:${this.OVERALL_COLOR.main};">
                                    <td style="color:#fff;">📊 综合评分</td>
                                    <td style="text-align:center;color:#fff;font-weight:700;">${fmt(sum.score)}</td>
                                    <td style="text-align:center;color:rgba(255,255,255,0.92);">${fmt(sum.ref)}</td>
                                    <td style="text-align:center;color:${indexColor(sum.score, sum.ref)};font-weight:700;background:rgba(255,255,255,0.85);border-radius:4px;">${indexOf(sum.score, sum.ref)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="flex:1;min-width:0;display:grid;grid-template-columns:repeat(2, 1fr);gap:0.1rem 0.75rem;">
                        ${radars}
                    </div>
                </div>`;
        },

        // 绘制单个雷达图（n 条轴，仅呈现 评分/参考值 指数状态，100%=参考环）
        drawRadar(canvasId, labels, values, maxScale, size) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const sz = size || 200;
            canvas.width = sz * dpr;
            canvas.height = sz * dpr;
            canvas.style.width = sz + 'px';
            canvas.style.height = sz + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, sz, sz);
            const n = labels.length;
            if (n < 2) return;
            const cx = sz / 2;
            // 半径占画布更大 + 中心下移 1/4R：让三角雷达在画布内垂直居中，上下空白均衡且小
            const R = sz / 2 - 6;
            const cy = sz / 2 + 0.25 * R;
            const angleFor = (i) => -Math.PI / 2 + (2 * Math.PI * i) / n;
            const scale = maxScale > 0 ? maxScale : 1;
            const norm = (v) => Math.max(0, Math.min(1, (v || 0) / scale));
            // 网格环（0.2 步进）
            for (let val = 0.2; val <= scale + 0.001; val += 0.2) {
                const r = (R * val) / scale;
                ctx.beginPath();
                for (let i = 0; i < n; i++) {
                    const a = angleFor(i);
                    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.strokeStyle = '#eef2f7';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            // 网格环数值标注（最小 0，步进 0.2；竖向叠放于正上方轴线左侧，避开顶点圆点，避免横向重叠）
            const labelFont = R <= 55 ? 6.5 : R >= 78 ? 8 : 7;
            ctx.font = labelFont + 'px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let val = 0.2; val <= scale + 0.001; val += 0.2) {
                const r = (R * val) / scale;
                const label = (Math.round(val * 10) / 10).toString();
                ctx.strokeText(label, cx - 7, cy - r);
                ctx.fillText(label, cx - 7, cy - r);
            }
            // 参考环（100%）
            const rRef = (R * 1.0) / scale;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const a = angleFor(i);
                const x = cx + rRef * Math.cos(a), y = cy + rRef * Math.sin(a);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            // 轴线 + 标签（优先上/下布局，避免左右占位压缩雷达尺寸）
            const wrapLabel = (text) => {
                const maxW = sz * 0.2;
                const lines = [];
                let cur = '';
                for (const ch of String(text)) {
                    if (cur && ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; }
                    else cur += ch;
                }
                if (cur) lines.push(cur);
                return lines.length ? lines : [text];
            };
            ctx.fillStyle = '#64748b';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const lh = 12;
            for (let i = 0; i < n; i++) {
                const a = angleFor(i);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
                ctx.strokeStyle = '#e2e8f0';
                ctx.lineWidth = 1;
                ctx.stroke();
                const sinA = Math.sin(a);
                const cosA = Math.cos(a);
                const vx = cx + R * cosA;
                const vy = cy + R * sinA;
                // 顶部/底部轴标签均保持单行；仅侧面兜底时按需换行
                const lines = (sinA < -0.3 || sinA > 0.3) ? [String(labels[i])] : wrapLabel(labels[i]);
                let lx = vx, ly = vy;
                if (sinA < -0.3) {
                    // 上方轴标签：叠放于顶点之上
                    ly = vy - 10;
                } else if (sinA > 0.3) {
                    // 下方轴标签：叠放于顶点之下，尽量贴近图并向内收（超出画布时向中心收缩）
                    ly = vy + 10;
                    const w = ctx.measureText(lines[0]).width;
                    if (cosA > 0) { // 右下顶点：向右溢出则左收
                        const maxCenter = sz - 6 - w / 2;
                        if (lx > maxCenter) lx = maxCenter;
                    } else { // 左下顶点：向左溢出则右收
                        const minCenter = 6 + w / 2;
                        if (lx < minCenter) lx = minCenter;
                    }
                } else {
                    // 侧面标签（兜底）：沿径向外推
                    lx = vx + R * 0.35 * cosA;
                    ly = vy + R * 0.35 * sinA;
                }
                lines.forEach((ln, li) => {
                    const offY = (li - (lines.length - 1) / 2) * lh;
                    ctx.fillText(ln, lx, ly + offY);
                });
            }
            // 指数多边形（评分/参考值，蓝色；越出参考环 = 超过同龄水平）
            if (values && values.length === n) {
                ctx.beginPath();
                for (let i = 0; i < n; i++) {
                    const v = norm(values[i]);
                    const a = angleFor(i);
                    const x = cx + R * v * Math.cos(a), y = cy + R * v * Math.sin(a);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fillStyle = 'rgba(37,99,235,0.18)';
                ctx.fill();
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 2;
                ctx.stroke();
                for (let i = 0; i < n; i++) {
                    const v = norm(values[i]);
                    const a = angleFor(i);
                    ctx.beginPath();
                    ctx.arc(cx + R * v * Math.cos(a), cy + R * v * Math.sin(a), 3, 0, Math.PI * 2);
                    ctx.fillStyle = '#2563eb';
                    ctx.fill();
                }
            }
        },

        drawRadarCharts() {
            const sum = this.computeQuantSummary();
            if (!sum || sum.dims.length === 0) return;
            const idx = (score, ref) => (ref > 0 ? score / ref : 0);
            const MS = 1.5;
            // 按雷达网格实际宽度动态计算画布尺寸，使网格恰好填满且不溢出
            const first = document.getElementById('radarDim0');
            let size = 200;
            if (first && first.parentElement && first.parentElement.parentElement) {
                const grid = first.parentElement.parentElement;
                const gap = 12; // 0.75rem
                const cell = (grid.clientWidth - gap) / 2;
                if (cell > 0) size = Math.max(150, Math.min(180, Math.floor(cell) - 2));
            }
            // 与 buildQuantSummaryHtml 保持一致：仅前 3 个维度雷达 + 综合评分（严格 2×2）
            const radarDims = sum.dims.slice(0, 3);
            radarDims.forEach((d, di) => {
                this.drawRadar('radarDim' + di, d.subs.map((s) => s.name), d.subs.map((s) => idx(s.score, s.ref)), MS, size);
            });
            this.drawRadar('radarOverall', sum.dims.map((d) => d.name), sum.dims.map((d) => idx(d.score, d.ref)), MS, size);
        },

        // 评分改动后即时刷新「量化评估（综合）」汇总表与雷达图
        refreshQuantSummary() {
            const body = document.getElementById('quantSummaryBody');
            if (!body) return;
            body.innerHTML = this.buildQuantSummaryHtml(this.computeQuantSummary());
            this.drawRadarCharts();
        },

        // ============ 导出 PDF 水印 ============
        watermarkDefaults() {
            return { enabled: true, text: '', opacity: 10, angle: 45, fontSize: 28, color: '#64748b', density: 1.2 };
        },
        // 用户自定义水印模板：{ [模板名]: {enabled,text,opacity,angle,fontSize,color,density} }（仅存本机浏览器）
        getWatermarkTemplates() {
            try { return JSON.parse(localStorage.getItem('evalWatermarkTemplates') || '{}'); } catch (e) { return {}; }
        },
        saveWatermarkTemplate(name, settings) {
            const all = this.getWatermarkTemplates();
            all[name] = { ...settings };
            localStorage.setItem('evalWatermarkTemplates', JSON.stringify(all));
        },
        deleteWatermarkTemplate(name) {
            const all = this.getWatermarkTemplates();
            if (Object.prototype.hasOwnProperty.call(all, name)) {
                delete all[name];
                localStorage.setItem('evalWatermarkTemplates', JSON.stringify(all));
            }
        },
        // 刷新模板下拉选项（把已保存模板加入；selectedName 存在则选中）
        refreshWatermarkTemplateSelect(selectedName) {
            const sel = document.getElementById('wmTemplate');
            if (!sel) return;
            sel.innerHTML = '<option value="">（自定义）</option>';
            Object.keys(this.getWatermarkTemplates()).forEach((name) => {
                const op = document.createElement('option');
                op.value = name;
                op.textContent = name;
                sel.appendChild(op);
            });
            sel.value = selectedName && this.getWatermarkTemplates()[selectedName] ? selectedName : '';
            this.updateWatermarkDelBtn();
        },
        updateWatermarkDelBtn() {
            const sel = document.getElementById('wmTemplate');
            const del = document.getElementById('wmTemplateDel');
            if (del) del.style.display = sel && sel.value ? '' : 'none';
        },
        // 把整套水印设置填入「🖨 PDF 水印」标签页字段
        applyWatermarkSettingsToModal(s) {
            if (!s) return;
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            const en = document.getElementById('wmEnabled');
            if (en) en.checked = !!s.enabled;
            set('wmText', s.text || '');
            set('wmOpacity', s.opacity);
            set('wmAngle', s.angle);
            set('wmFontSize', s.fontSize);
            set('wmColor', s.color || '#64748b');
            set('wmDensity', s.density);
        },
        getWatermark() {
            const d = this.watermarkDefaults();
            try { return { ...d, ...(JSON.parse(localStorage.getItem('evalWatermark') || '{}')) }; } catch (e) { return d; }
        },
        saveWatermark(o) {
            try { localStorage.setItem('evalWatermark', JSON.stringify({ ...this.getWatermark(), ...o })); } catch (e) {}
        },
        // 根据设置生成水印平铺层：按文字外包矩形（含旋转）排布，自动避免重叠
        renderWatermark() {
            const box = document.getElementById('reportWatermark');
            if (!box) return;
            box.innerHTML = '';
            const wm = this.activeWatermark(); // 计划若指定水印模板则优先
            const lines = String(wm.text || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
            if (!wm.enabled || !lines.length) return;
            const fontSize = Math.max(10, Math.min(200, parseInt(wm.fontSize, 10) || 28));
            const angle = parseFloat(wm.angle) || 45;
            const lineH = Math.ceil(fontSize * 1.35);
            const density = Math.max(0.5, parseFloat(wm.density) || 1.2);
            const ctx = document.createElement('canvas').getContext('2d');
            ctx.font = `600 ${fontSize}px "Microsoft YaHei","PingFang SC",sans-serif`;
            let W = 0;
            lines.forEach((l) => { W = Math.max(W, ctx.measureText(l).width); });
            const H = lines.length * lineH;
            const rad = (angle * Math.PI) / 180;
            // 旋转后的轴对齐外包矩形尺寸（保证平铺不重叠）
            const bboxW = W * Math.abs(Math.cos(rad)) + H * Math.abs(Math.sin(rad));
            const bboxH = W * Math.abs(Math.sin(rad)) + H * Math.abs(Math.cos(rad));
            const stepX = bboxW * density;
            const stepY = bboxH * density;
            // 覆盖区域：屏幕视口，且至少覆盖一整页 A4（打印时固定层每页重复）
            const areaW = Math.max(window.innerWidth || 800, 794);
            const areaH = Math.max(window.innerHeight || 800, 1123);
            const color = wm.color || '#64748b';
            const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const inner = lines.map((l) => esc(l)).join('\n');
            let html = '';
            for (let y = -stepY; y < areaH + stepY; y += stepY) {
                for (let x = -stepX; x < areaW + stepX; x += stepX) {
                    html += `<div class="wm-tile" style="position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;transform:translate(-50%,-50%) rotate(${angle}deg);color:${color};font-size:${fontSize}px;font-weight:600;line-height:${lineH}px;white-space:pre;text-align:center;">${inner}</div>`;
                }
            }
            box.innerHTML = html;
            box.style.opacity = (Math.max(0, Math.min(100, parseFloat(wm.opacity) || 10)) / 100).toString();
        },
        // 「🖨 PDF 水印」标签页：保存当前水印设置（全局设置，不依赖学员）
        saveWatermarkFromTab() {
            this.saveWatermark(this.collectWatermarkFromModal());
            this.renderWatermark();
            this.toast('水印设置已保存');
        },
        // 模板管理「🖨 PDF 水印」标签页：装载当前水印设置
        loadWatermarkModal() {
            const wm = this.getWatermark();
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            set('wmText', wm.text);
            set('wmOpacity', wm.opacity);
            set('wmAngle', wm.angle);
            set('wmFontSize', wm.fontSize);
            set('wmColor', wm.color);
            set('wmDensity', wm.density);
            const en = document.getElementById('wmEnabled');
            if (en) en.checked = !!wm.enabled;
            this.refreshWatermarkTemplateSelect('');
        },
        // 收集「🖨 PDF 水印」标签页中的水印设置
        collectWatermarkFromModal() {
            const get = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
            const en = document.getElementById('wmEnabled');
            return {
                enabled: en ? en.checked : true,
                text: get('wmText').trim(),
                opacity: parseFloat(get('wmOpacity')),
                angle: parseFloat(get('wmAngle')),
                fontSize: parseInt(get('wmFontSize'), 10),
                color: get('wmColor') || '#64748b',
                density: parseFloat(get('wmDensity')),
            };
        },

        // ============ 报告页面元素（属于「评估模板」：结构 + 元素一起保存） ============
        // 元素字段：{ title, coach, date, aiPrompt, aiDataNote }
        // 存放位置：evalQuantTemplateMeta[模板名].el（'__default__' = 内置默认模板的默认元素）
        // 兼容旧数据：早期把报告元素存在全局键 evalReportElements / evalAIPrompt / evalAIDataNote、
        // 元素模板存在 evalReportElementTemplates（仅迁移时读取，不再写入）
        _mergeElem(base, add) {
            const o = { ...(base || {}) };
            if (!add) return o;
            ['title', 'coach', 'date', 'aiPrompt', 'aiDataNote'].forEach((k) => {
                const v = add[k];
                if (v != null && String(v).trim() !== '') o[k] = v;
            });
            // 赛事规划：模板设置的行列表（未设置/空则沿用下层）
            if (Array.isArray(add.compPlan) && add.compPlan.length) {
                o.compPlan = add.compPlan.map((r) => ({ competition: (r && r.competition) || '', date: (r && r.date) || '' }));
            }
            return o;
        },
        // 某评估模板自带（未合并默认值）的元素字段
        getTemplateElementsRaw(name) {
            const key = name || '__default__';
            const meta = this.getTemplateMeta();
            return (meta[key] && meta[key].el && typeof meta[key].el === 'object') ? { ...meta[key].el } : {};
        },
        // 读取某评估模板生效的元素字段（模板未设的字段回退到默认元素设置）
        // 内置默认（'__default__'）为系统模板：只读，永不写入
        getTemplateElements(name) {
            return this._mergeElem(this.getReportElements(), this.getTemplateElementsRaw(name));
        },
        // 保存某评估模板的元素字段（仅限用户模板；内置默认不可写）
        saveTemplateElements(name, el) {
            const key = name || '';
            if (!key || this.isReservedStructName(key)) return;
            const meta = this.getTemplateMeta();
            const cur = meta[key] || {};
            meta[key] = { ...cur, el: {
                title: (el && el.title) || '',
                coach: (el && el.coach) || '',
                date: (el && el.date) || '',
                aiPrompt: (el && el.aiPrompt) || '',
                aiDataNote: (el && el.aiDataNote) || '',
                compPlan: this.normalizeCompPlan(el && el.compPlan),
            } };
            this.saveTemplateMeta(meta);
        },
        // 默认元素设置（= 内置默认模板的元素；旧全局键作为回退）
        getReportElements() {
            let legacy = {};
            try { legacy = JSON.parse(localStorage.getItem('evalReportElements') || '{}'); } catch (e) { legacy = {}; }
            if (!legacy || typeof legacy !== 'object') legacy = {};
            let legacyPrompt = '';
            let legacyNote = '';
            try {
                legacyPrompt = localStorage.getItem('evalAIPrompt') || '';
                legacyNote = localStorage.getItem('evalAIDataNote') || '';
            } catch (e) { /* ignore */ }
            const el = this.getTemplateElementsRaw('__default__');
            return {
                title: '', coach: '', date: '', compPlan: [],
                aiPrompt: legacyPrompt, aiDataNote: legacyNote,
                ...legacy, ...el,
            };
        },
        // 旧「报告元素模板」（仅用于迁移与旧计划回退）
        getReportElementTemplates() {
            try { return JSON.parse(localStorage.getItem('evalReportElementTemplates') || '{}'); } catch (e) { return {}; }
        },
        // 一次性迁移：把旧「元素模板 / 全局元素设置」并入「评估模板」
        migrateTemplateElements() {
            const FLAG = 'evalTplElemMerged';
            try { if (localStorage.getItem(FLAG)) return; } catch (e) { return; }
            const structs = this.getQuantStructTemplates() || {};
            const legacy = this.getReportElementTemplates() || {};
            const baseEl = {
                title: this.getReportElements().title || '',
                coach: this.getReportElements().coach || '',
                date: this.getReportElements().date || '',
                aiPrompt: this.getReportElements().aiPrompt || '',
                aiDataNote: this.getReportElements().aiDataNote || '',
            };
            // 内置默认＝系统模板：不写入（默认元素由 getReportElements() 的旧全局键回退，保持默认模板原样）
            // 已有结构模板：优先同名旧元素模板，否则沿用当前元素设置
            Object.keys(structs).forEach((n) => {
                if (this.isReservedStructName(n)) return;
                if (Object.keys(this.getTemplateElementsRaw(n)).length) return;
                this.saveTemplateElements(n, legacy[n] || baseEl);
            });
            // 旧元素模板若没有同名结构模板：按内置默认结构补一个评估模板，避免内容丢失
            Object.keys(legacy).forEach((n) => {
                if (!n || structs[n] || this.isReservedStructName(n)) return;
                this.saveStructureTemplate(n, this.defaultQuantTemplate());
                this.saveTemplateElements(n, legacy[n]);
            });
            try { localStorage.setItem(FLAG, '1'); } catch (e) { /* ignore */ }
        },
        // 模板编辑弹窗内的元素字段：装载 / 收集
        _fillEditElemFields(name) {
            const el = this.getTemplateElements(name);
            const set = (id, v) => { const n = document.getElementById(id); if (n) n.value = v == null ? '' : v; };
            set('reportHeaderTitle', el.title);
            set('reportHeaderCoach', el.coach);
            set('reportHeaderDate', el.date);
            set('reportHeaderAIPrompt', el.aiPrompt);
            set('reportHeaderAIDataNote', el.aiDataNote);
            this.renderTplEditCompPlan(el.compPlan);
        },
        // 模板编辑弹窗内的赛事规划行（可增删改；填写报告时不再逐份填写）
        renderTplEditCompPlan(rows) {
            const body = document.getElementById('tplEditCompPlanBody');
            if (!body) return;
            const inputStyle = 'width:100%;padding:0.25rem 0.4rem;border:1px solid var(--gray-300);border-radius:4px;font-size:0.82rem;box-sizing:border-box;';
            const list = Array.isArray(rows) ? rows : [];
            body.innerHTML = list.length
                ? list.map((r, i) => `
                        <tr>
                            <td><input type="text" class="tpl-comp-plan-input" data-field="competition" data-idx="${i}" value="${Shared.escapeHtml((r && r.competition) || '')}" placeholder="赛事名称" style="${inputStyle}"></td>
                            <td><input type="text" class="tpl-comp-plan-input" data-field="date" data-idx="${i}" value="${Shared.escapeHtml((r && r.date) || '')}" placeholder="预计时间" style="${inputStyle}"></td>
                            <td style="text-align:center;width:44px;"><button type="button" class="btn btn-sm btn-outline tpl-comp-plan-del" data-idx="${i}" title="删除此行">🗑</button></td>
                        </tr>`).join('')
                : '<tr><td colspan="3" style="text-align:center;color:var(--gray-400);font-size:0.8rem;">（暂无规划，点「＋ 添加一行」）</td></tr>';
            body.querySelectorAll('button.tpl-comp-plan-del').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const cur = this.collectEditCompPlan();
                    cur.splice(Number(btn.dataset.idx), 1);
                    this.renderTplEditCompPlan(cur);
                });
            });
        },
        // 读取模板弹窗内的赛事规划行（含未填写的空行，保存时再统一过滤）
        collectEditCompPlan() {
            const body = document.getElementById('tplEditCompPlanBody');
            if (!body) return [];
            return [...body.querySelectorAll('input.tpl-comp-plan-input[data-field="competition"]')].map((inp) => {
                const d = body.querySelector(`input.tpl-comp-plan-input[data-field="date"][data-idx="${inp.dataset.idx}"]`);
                return { competition: inp.value.trim(), date: d ? d.value.trim() : '' };
            });
        },
        collectEditElements() {
            const get = (id) => { const n = document.getElementById(id); return n ? String(n.value).trim() : ''; };
            return {
                title: get('reportHeaderTitle'),
                coach: get('reportHeaderCoach'),
                date: get('reportHeaderDate'),
                aiPrompt: get('reportHeaderAIPrompt'),
                aiDataNote: get('reportHeaderAIDataNote'),
                compPlan: this.normalizeCompPlan(this.collectEditCompPlan()),
            };
        },

        // 打开计划学员报告前：把该计划选定模板的元素 / PDF 水印模板作为「本次报告」的覆盖值
        // 注意：不写入全局设置（evalReportElements / evalWatermark / evalAIPrompt），
        // 否则用户对模板元素的手动修改会被反复冲掉
        _applyPlanReportTemplates(plan) {
            this._elemOverride = null;
            this._wmOverride = null;
            if (!plan) return;
            // 评估模板自带元素；旧计划（带 elemTemplateKey）仍按旧「元素模板」回退
            const key = plan.templateKey || '__default__';
            const legacy = plan.elemTemplateKey ? (this.getReportElementTemplates()[plan.elemTemplateKey] || null) : null;
            const merged = this._mergeElem(this._mergeElem({}, legacy), this.getTemplateElementsRaw(key));
            if (Object.keys(merged).length) this._elemOverride = merged;
            if (plan.wmTemplateKey) {
                const w = this.getWatermarkTemplates()[plan.wmTemplateKey];
                if (w) this._wmOverride = { ...w };
            }
        },
        // 当前报告生效的报告元素（计划模板覆盖优先，否则默认元素设置）
        activeReportElements() {
            return this._mergeElem(this.getReportElements(), this._elemOverride);
        },
        // 当前报告生效的水印设置（计划覆盖优先，否则全局）
        activeWatermark() {
            return this._wmOverride ? { ...this.getWatermark(), ...this._wmOverride } : this.getWatermark();
        },
        getReportHeader(student) {
            const sid = student.id;
            const now = new Date();
            const today = now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate();
            const cur = this.activeReportElements(); // 计划若指定元素模板则优先，否则全局
            // 兼容旧数据：早期报告元素按学员存于 evalReportHeader，全局未设置时回退
            let legacy = {};
            try { legacy = JSON.parse(localStorage.getItem('evalReportHeader') || '{}')[sid] || {}; } catch (e) { legacy = {}; }
            // 学员 / 班级：始终自动带出真实数据（不允许在元素编辑中修改）；上课时间不再提供
            return {
                title: cur.title || legacy.title || '训练评估报告',
                studentName: student.name,
                className: Shared.getCurrentClassName(sid),
                coach: cur.coach || legacy.coach || '',
                date: cur.date || legacy.date || today,
            };
        },

        // ============ 教练评语 ============
        getCoachComment() {
            const sid = this.selectedStudentId;
            if (!sid) return '';
            try {
                return JSON.parse(localStorage.getItem('evalCoachComments') || '{}')[sid] || '';
            } catch (e) { return ''; }
        },
        saveCoachComment(text) {
            const sid = this.selectedStudentId;
            if (!sid) return;
            let all = {};
            try { all = JSON.parse(localStorage.getItem('evalCoachComments') || '{}'); } catch (e) { all = {}; }
            all[sid] = text;
            localStorage.setItem('evalCoachComments', JSON.stringify(all));
        },
        // ============ 最终评语（报告展示用） ============
        getFinalComment() {
            const sid = this.selectedStudentId;
            if (!sid) return '';
            try {
                return JSON.parse(localStorage.getItem('evalFinalComments') || '{}')[sid] || '';
            } catch (e) { return ''; }
        },
        saveFinalComment(text) {
            const sid = this.selectedStudentId;
            if (!sid) return;
            let all = {};
            try { all = JSON.parse(localStorage.getItem('evalFinalComments') || '{}'); } catch (e) { all = {}; }
            all[sid] = text;
            localStorage.setItem('evalFinalComments', JSON.stringify(all));
        },
        renderCoachFinal() {
            const body = document.getElementById('coachFinalBody');
            if (!body) return;
            // 优先显示最终评语，无则回退到教练原始评语
            const text = this.getFinalComment() || this.getCoachComment();
            if (!text) {
                body.innerHTML = '<div style="font-size:0.85rem;color:var(--gray-400);">暂无评语</div>';
                return;
            }
            const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
            body.innerHTML = `<ol style="margin:0;padding-left:1.3rem;line-height:1.8;font-size:0.9rem;color:var(--gray-700);">${lines.map((l) => `<li>${Shared.escapeHtml(l)}</li>`).join('')}</ol>`;
        },
        renderCoachComment() {
            const body = document.getElementById('coachCommentBody');
            if (!body) return;
            this._coachEditing = false;
            const text = this.getCoachComment();
            if (!text) {
                body.innerHTML = '<div style="font-size:0.85rem;color:var(--gray-400);">暂无教练评语，请在上方填写（每行一条要点）</div>';
                return;
            }
            const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
            // 有序列表形式展示（每行一条编号要点）
            body.innerHTML = `<ol style="margin:0;padding-left:1.3rem;line-height:1.8;font-size:0.9rem;color:var(--gray-700);">${lines.map((l) => `<li>${Shared.escapeHtml(l)}</li>`).join('')}</ol>`;
        },
        startEditCoachComment() {
            const body = document.getElementById('coachCommentBody');
            if (!body) return;
            this._coachEditing = true;
            const text = this.getCoachComment();
            // 再次编辑：显示纯文本（不自动加序号），保存后以有序列表展示
            body.innerHTML = `
                <textarea id="coachCommentInput" style="width:100%;min-height:120px;padding:0.6rem;border:1px solid var(--gray-300);border-radius:var(--radius-sm);font-size:0.9rem;font-family:inherit;line-height:1.7;resize:vertical;box-sizing:border-box;" placeholder="在此填写教练评语（每行一条要点，保存后以编号列表展示）…">${Shared.escapeHtml(text)}</textarea>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;justify-content:flex-end;">
                    <button type="button" class="btn btn-sm btn-primary" id="coachCommentSaveBtn">💾 保存</button>
                </div>`;
            const input = document.getElementById('coachCommentInput');
            const save = () => {
                if (!document.getElementById('coachCommentInput')) return; // 已保存过则跳过
                // 去除每行开头的编号（"1. " / "1、"），避免展示时重复编号
                const cleaned = String(input.value).split('\n')
                    .map((l) => l.replace(/^\s*\d+[.、．]\s*/, '').trim())
                    .filter(Boolean)
                    .join('\n');
                this.saveCoachComment(cleaned);
                this.renderCoachComment();
                this._finalizeCoachEdit = null;
                this.toast('已保存教练评语');
            };
            // 供切换视图等场景主动收尾编辑（程序化 blur 可能不触发 blur 事件）
            this._finalizeCoachEdit = save;
            if (input) {
                // 离开编辑区也自动保存（兜底）
                input.addEventListener('blur', save);
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
            const saveBtn = document.getElementById('coachCommentSaveBtn');
            if (saveBtn) saveBtn.addEventListener('click', save);
        },

        // ============ AI 生成教练评语 ============
        DEFAULT_AI_PROMPT: '你是一名资深的少儿机器人老师，深谙青少年发展心理规律及特征。\n根据给定的材料，给学员写一份180字左右的评语\n要求：\n1. 一段话描述\n2. 语言尽可能的积极正面，且保持客观公正',

        aiProviders: {
            openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
            deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
            moonshot: { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
            ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
        },

        getAIConfig() {
            try { return JSON.parse(localStorage.getItem('evalAIConfig') || '{}'); } catch (e) { return {}; }
        },

        // 教练评语 AI 要求提示词（默认元素，随数据包一起发送/复制）
        getAIPrompt() {
            const p = this.getReportElements().aiPrompt;
            return (p && String(p).trim()) ? p : this.DEFAULT_AI_PROMPT;
        },

        // 教练评语 AI 数据说明（默认元素，描述数据结构，随数据包一起发送/复制）
        DEFAULT_AI_DATA_NOTE: '以下为学员评估信息，各区块含义：\n- 学员信息：学员姓名、班级、教练、报告填写日期\n- 参赛记录：赛事、任务、得分（分）、用时（秒）、轮次、来源（正赛/模拟赛/自主训练）\n- 任务表现统计：各任务最佳分、练习次数、平均分、满分率、稳定性评级、综合评级\n- 各任务趋势指标：按任务给出 满分率、用时样本、成绩预估（用时）、集中度（用时）、阶段变化（均为相对该学员自身，计算口径见该节内说明）\n- 量化评估（综合）：各维度/子维度 评分、参考值、同龄指数（= 评分÷参考值，超过100%表示高于同龄参考水平）\n- 现有教练评语：教练已填写的评语草稿（可为空）',
        getAIDataNote() {
            const n = this.getReportElements().aiDataNote;
            return (n && String(n).trim()) ? n : this.DEFAULT_AI_DATA_NOTE;
        },

        // 一键选用服务商预设，自动填入接口地址与模型
        applyAIProvider(provider) {
            const p = this.aiProviders[provider];
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            const keyEl = document.getElementById('aiApiKey');
            if (p) {
                set('aiBaseUrl', p.baseUrl);
                set('aiModel', p.model || '');
                if (provider === 'ollama') {
                    if (keyEl) { keyEl.placeholder = '无需密钥（本地 Ollama）'; keyEl.value = ''; }
                } else if (keyEl) {
                    keyEl.placeholder = 'API 密钥（可留空）';
                }
            } else if (keyEl) {
                keyEl.placeholder = 'API 密钥（可留空）';
            }
        },

        // 打包学员评估数据（供 AI 生成评语）
        buildAIDataPackage() {
            const student = (Shared.data.students || []).find((s) => s.id === this.selectedStudentId);
            const trainings = this.getSelectedTrainings();
            const r = student ? this.collectStudentAssessment(student.id, trainings, this.selectedMockIds) : null;
            const h = this.getReportHeader(student);
            const sum = this.computeQuantSummary();
            const lines = [];
            lines.push('【学员信息】');
            lines.push('学员：' + (h.studentName || '—'));
            lines.push('班级：' + (h.className || '—'));
            lines.push('教练：' + (h.coach || '—'));
            lines.push('报告填写日期：' + (h.date || '—'));
            lines.push('');
            lines.push('【参赛记录】');
            if (r && r.records && r.records.length) {
                r.records.forEach((rec) => {
                    const time = rec.time != null ? '/' + rec.time + 's' : '';
                    const round = rec.roundLabel && rec.roundLabel !== '—' ? ' · ' + rec.roundLabel : '';
                    lines.push('- ' + (rec.date || '-') + ' · ' + (rec.sourceLabel || '') + ' · ' + (rec.taskName || '') + (rec.score != null ? ' ' + rec.score : ' —') + time + round);
                });
            } else {
                lines.push('（暂无参赛记录）');
            }
            lines.push('');
            lines.push('【任务表现统计】');
            if (r && r.taskEntries && r.taskEntries.length) {
                r.taskEntries.forEach((t) => {
                    const avg = t.attempts.length ? (t.attempts.reduce((a, b) => a + b, 0) / t.attempts.length).toFixed(1) : '—';
                    lines.push('- ' + (t.taskName || '') + '：最佳 ' + (t.best != null ? t.best : '—') + (t.bestTime != null ? '分/' + t.bestTime + 's' : '') + '，练习 ' + t.count + ' 次，平均 ' + avg);
                });
                if (r.fullRate != null) lines.push('满分率：' + r.fullRate.toFixed(1) + '%');
                if (r.stability) lines.push('稳定性：' + r.stability.label);
                if (r.grade && r.grade.label !== '—') lines.push('综合评级：' + r.grade.label);
            } else {
                lines.push('（暂无任务数据）');
            }
            lines.push('');
            // 【各任务趋势指标】与报告「各任务表现趋势」图右侧分析栏同一口径（同一批数据点、同一套算法）
            lines.push('【各任务趋势指标】');
            const model = student ? this._chartModel(student.id) : { positions: [], rows: [] };
            const trendGroups = [];
            const trendMap = {};
            model.rows.forEach((rec) => {
                if (!trendMap[rec.taskId]) {
                    trendMap[rec.taskId] = { taskId: rec.taskId, name: rec.taskName || rec.taskId, points: [] };
                    trendGroups.push(trendMap[rec.taskId]);
                }
                trendMap[rec.taskId].points.push(rec);
            });
            if (trendGroups.length) {
                lines.push('统计范围：本次评估所选集训下的模拟赛 + 正赛（不含自主训练），按场次轮次展开，弃权轮次不计入。');
                trendGroups.forEach((g) => {
                    const task = (Shared.data.tasks || []).find((t) => t.id === g.taskId) || null;
                    const a = this._taskAnalysis(g.points, task);
                    const bits = [];
                    if (a.score) {
                        bits.push(a.score.fullRate == null
                            ? '满分率 —（任务未设满分值）'
                            : '满分率 ' + Math.round(a.score.fullRate * 100) + '%（' + a.score.full + '/' + a.score.n + '）');
                    }
                    if (a.time) {
                        const t = a.time;
                        bits.push('用时样本 ' + t.n + ' 次（' + (t.scope === 'full' ? '满分场次' : '含非满分场次') + '）');
                        bits.push('成绩预估（用时）' + t.M.toFixed(1) + 's ± ' + (t.off != null ? t.off.toFixed(1) + 's' : '—'));
                        bits.push('集中度（用时）' + (t.disp != null ? Math.round(t.disp * 100) + '%（' + (t.disp < 0.10 ? '集中' : (t.disp < 0.20 ? '一般' : '分散')) + '）' : '—'));
                        if (t.stageDelta) {
                            const d = t.stageDelta;
                            bits.push('阶段变化 ' + (d.pct > 0 ? '变慢 ' : '变快 ') + Math.abs(d.pct * 100).toFixed(0) + '%（本期「' + d.curName + '」' + d.curM.toFixed(1) + 's vs 上期「' + d.prevName + '」' + d.prevM.toFixed(1) + 's）');
                        }
                    }
                    lines.push('- ' + g.name + '：' + (bits.length ? bits.join('；') : '数据不足'));
                });
                lines.push('以上指标的计算口径：');
                lines.push('· 满分率 = 得分达到「任务满分值」的场次数 ÷ 记录条数');
                lines.push('· 用时样本 = 参与用时计算的样本数；优先只用「满分场次」的用时（满分场次 ≥2 条时），不足 2 条则退化为全部有用时的记录');
                lines.push('· 成绩预估（用时）= 中位数 M ± 1.4826×MAD（中位绝对偏差）；M 是该学员的典型用时，± 是波动范围（约 68% 的用时落在此区间内），秒数越小表示越快');
                lines.push('· 集中度（用时）= IQR（四分位距）÷ 中位数，即用时相对该学员自身的离散程度：<10% 集中、<20% 一般、≥20% 分散');
                lines.push('· 阶段变化 = 最近一个集训的中位用时 ÷ 上一个集训的中位用时 − 1（只有 ≥2 个集训时才计算；变快＝更快）');
            } else {
                lines.push('（暂无可分析的成绩记录）');
            }
            lines.push('');
            lines.push('【量化评估（综合）】评分 / 参考值 / 同龄指数');
            if (sum && sum.dims.length) {
                const pct = (score, ref) => (ref > 0 ? Math.round((score / ref) * 100) + '%' : '—');
                sum.dims.forEach((d) => {
                    lines.push((d.icon || '') + ' ' + d.name + '：' + d.score.toFixed(2) + ' / ' + d.ref.toFixed(2) + ' / ' + pct(d.score, d.ref));
                    d.subs.forEach((s) => {
                        lines.push('  - ' + s.name + '：' + s.score.toFixed(2) + ' / ' + s.ref.toFixed(2) + ' / ' + pct(s.score, s.ref));
                    });
                });
                lines.push('📊 综合评分：' + sum.score.toFixed(2) + ' / ' + sum.ref.toFixed(2) + ' / ' + pct(sum.score, sum.ref));
            }
            const dataText = lines.join('\n');
            const el = this.activeReportElements();
            const aiPrompt = el.aiPrompt || this.getAIPrompt();
            const dataNote = el.aiDataNote || this.getAIDataNote();
            const coachComment = (this.getCoachComment() || '').trim();
            let full = aiPrompt + '\n\n【数据说明】\n' + dataNote + '\n\n【评估数据】\n' + dataText;
            if (coachComment) full += '\n\n【现有教练评语】\n' + coachComment;
            return { text: full, prompt: full };
        },

        parseDrafts(text) {
            const s = String(text || '').trim();
            if (!s) return [];
            const parts = s.split(/\n?\s*(?:【\s*版本\s*\d+\s*】|版本\s*\d+\s*[:：])\s*/).map((p) => p.trim()).filter(Boolean);
            if (parts.length >= 2) return parts;
            const parts2 = s.split(/\n\s*\d+\s*[.、]\s*/).map((p) => p.trim()).filter(Boolean);
            if (parts2.length >= 2) return parts2;
            return [s];
        },

        openAICommentModal() {
            const student = (Shared.data.students || []).find((s) => s.id === this.selectedStudentId);
            if (!student) { this.toast('请先选择学员', 'warning'); return; }
            const cfg = this.getAIConfig();
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            // 自动识别已保存配置对应的服务商预设
            const prov = (this.aiProviders && Object.keys(this.aiProviders).find((k) => this.aiProviders[k].baseUrl === cfg.baseUrl)) || '';
            set('aiProvider', prov);
            set('aiBaseUrl', cfg.baseUrl || '');
            set('aiApiKey', cfg.apiKey || '');
            set('aiModel', cfg.model || '');
            if (prov === 'ollama') { const k = document.getElementById('aiApiKey'); if (k) k.placeholder = '无需密钥（本地 Ollama）'; }
            else { const k = document.getElementById('aiApiKey'); if (k) k.placeholder = 'API 密钥（可留空）'; }
            set('aiDataPackage', this.buildAIDataPackage().text);
            set('aiPasteInput', '');
            this.renderAIDrafts([]);
            const modal = document.getElementById('aiCommentModal');
            if (modal) modal.classList.add('open');
        },

        copyAIDataPackage() {
            const text = this.buildAIDataPackage().text;
            const done = () => this.toast('AI 数据包已复制（含提示词、数据说明、评估数据、现有教练评语）');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(() => this.toast('复制失败，请手动复制', 'warning'));
            } else {
                const el = document.getElementById('aiDataPackage');
                if (el) { el.value = text; el.select(); document.execCommand('copy'); }
                done();
            }
        },

        // 保存右侧「最终评语」→ 报告中的教练评语
        saveFinalFromInput() {
            const input = document.getElementById('aiFinalInput');
            if (!input) return;
            const text = input.value.trim();
            if (!text) { this.toast('请先填写最终评语', 'warning'); return; }
            this.saveFinalComment(text);
            this.renderCoachFinal();
            this.toast('已保存最终评语');
        },

        saveAIConfigFromModal() {
            const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
            localStorage.setItem('evalAIConfig', JSON.stringify({
                provider: get('aiProvider'),
                baseUrl: get('aiBaseUrl'),
                apiKey: get('aiApiKey'),
                model: get('aiModel'),
            }));
            this.toast('AI 配置已保存');
        },

        // 调用 OpenAI 兼容接口，返回原始内容（失败抛出）
        async fetchAIContent() {
            const cfg = this.getAIConfig();
            if (!cfg.baseUrl || !cfg.model) throw new Error('未配置接口地址与模型');
            const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
            const headers = { 'Content-Type': 'application/json' };
            if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: cfg.model,
                    temperature: 0.8,
                    messages: [
                        { role: 'system', content: '你是一位资深的少儿机器人老师。请严格遵循用户提示词的要求撰写评语，只基于给定评估数据，不编造数据；若要求输出多个版本，请用【版本1】【版本2】…分别标注。' },
                        { role: 'user', content: this.buildAIDataPackage().prompt },
                    ],
                }),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error('AI 接口返回 ' + res.status + '：' + errText.slice(0, 200));
            }
            const data = await res.json();
            const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!content) throw new Error('AI 未返回内容');
            return content;
        },

        // 区头「✨ AI 生成」：已配置且可用则直接写入右侧最终评语；否则弹配置
        async handleAIGenerate() {
            const cfg = this.getAIConfig();
            if (!cfg.baseUrl || !cfg.model) {
                this.openAICommentModal();
                this.toast('请先配置 AI 接口（服务商/接口地址/密钥/模型）', 'warning');
                return;
            }
            const input = document.getElementById('aiFinalInput');
            const btn = document.getElementById('aiCommentBtn');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中…'; }
            try {
                const content = await this.fetchAIContent();
                const drafts = this.parseDrafts(content);
                const text = drafts[0] || content;
                if (input) input.value = text;
                this.saveFinalComment(text);
                this.renderCoachFinal();
                this.toast('已生成最终评语');
            } catch (e) {
                // 调用失败 → 弹配置让用户处理
                this.openAICommentModal();
                this.toast('AI 调用失败：' + e.message + '，请在弹窗中检查配置', 'warning');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '✨ AI 生成'; }
            }
        },

        // 弹窗内：生成多个版本供选用
        async callAIGenerate() {
            const btn = document.getElementById('aiGenerateBtn');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中…'; }
            try {
                const content = await this.fetchAIContent();
                const drafts = this.parseDrafts(content);
                this.renderAIDrafts(drafts);
                if (!drafts.length) this.toast('未解析到内容，请检查返回格式', 'warning');
            } catch (e) {
                this.toast('AI 调用失败：' + e.message, 'warning');
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '🚀 调用 AI 生成'; }
            }
        },

        renderAIDrafts(drafts) {
            const el = document.getElementById('aiDrafts');
            if (!el) return;
            if (!drafts || !drafts.length) {
                el.innerHTML = '<div style="color:var(--gray-400);font-size:0.85rem;">暂无结果</div>';
                return;
            }
            el.innerHTML = drafts.map((d, i) => `
                <div style="border:1px solid var(--gray-200);border-radius:var(--radius-sm);padding:0.5rem 0.6rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">
                        <span style="font-weight:600;font-size:0.85rem;color:var(--gray-700);">版本 ${i + 1}</span>
                        <button type="button" class="btn btn-sm btn-outline" data-ai-pick="${i}">✅ 选用</button>
                    </div>
                    <div style="white-space:pre-wrap;font-size:0.85rem;color:var(--gray-700);line-height:1.6;">${Shared.escapeHtml(d)}</div>
                </div>`).join('');
            el.querySelectorAll('[data-ai-pick]').forEach((b) => {
                b.addEventListener('click', () => this.applyAIDraft(drafts[Number(b.getAttribute('data-ai-pick'))]));
            });
        },

        applyAIDraft(text) {
            this.saveFinalComment(text);
            const modal = document.getElementById('aiCommentModal');
            if (modal) modal.classList.remove('open');
            const input = document.getElementById('aiFinalInput');
            if (input) input.value = text;
            this.renderCoachFinal();
            this.toast('已写入最终评语');
        },

        parsePasteAndShow() {
            const input = document.getElementById('aiPasteInput');
            if (!input) return;
            const drafts = this.parseDrafts(input.value);
            this.renderAIDrafts(drafts);
            if (!drafts.length) this.toast('未解析到内容，请使用【版本N】或编号分隔', 'warning');
        },

        renderReport(student, trainings, r) {
            // ---- 报告头部：居中标题 + 学员信息行（小字） ----
            const headerInfo = this.getReportHeader(student);
            const headerHtml = `
                <div style="padding:0.4rem 0 0.4rem;">
                    <div class="report-title">${Shared.escapeHtml(headerInfo.title)}</div>
                    <div class="report-meta">
                        ${headerInfo.studentName ? `<span>学员：${Shared.escapeHtml(headerInfo.studentName)}</span>` : ''}
                        ${headerInfo.className ? `<span>班级：${Shared.escapeHtml(headerInfo.className)}</span>` : ''}
                        ${headerInfo.coach ? `<span>教练：${Shared.escapeHtml(headerInfo.coach)}</span>` : ''}
                        ${headerInfo.date ? `<span>报告填写日期：${Shared.escapeHtml(headerInfo.date)}</span>` : ''}
                    </div>
                </div>`;

            // 模块二：训练数据分析（各任务表现 + 教练点评；填写与预览均显示，点评需在填写模式录入）
            const taskChartHtml = `
                <div class="card" data-module="2" style="margin-top:0.75rem;">
                    <div id="taskCharts"></div>
                </div>`;

            // 模块三：量化评估细则（报告填写：只打分；结构由所选量化模板决定，编辑入口统一在「评估模板管理」）
            const quantHtml = `
                <div class="card" data-module="3" style="margin-top:0.75rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">
                        <span style="font-size:0.98rem;font-weight:700;color:var(--gray-800);">📋 量化评估细则</span>
                        <span id="quantTotal" style="margin-left:auto;font-size:0.8rem;color:var(--gray-600);font-weight:600;"></span>
                        <button type="button" class="btn btn-sm btn-outline" id="quantResetBtn" title="清空本表所有得分（不影响结构）">🔄 重置得分</button>
                    </div>
                    <div id="quantTableContainer"></div>
                </div>`;

            // 模块一：综合预览（赛事经历 / 赛事规划 / 量化评估（综合）/ 教练评语）
            const competitionsHtml = this.renderCompetitions(student, trainings);
            const planHtml = this.renderCompetitionPlan(trainings);
            const quantSummaryHtml = this.buildQuantSummaryHtml(this.computeQuantSummary());
            // 赛事经历与赛事规划：均为只读区（内容来自系统记录 / 评估模板），填写界面不呈现，预览与导出显示
            const compColumns = [];
            if (competitionsHtml) compColumns.push(`
                    <div class="report-preview-only" style="flex:1;min-width:280px;">
                        <div class="overview-sec-title">🏆 赛事经历</div>
                        ${competitionsHtml}
                    </div>`);
            if (planHtml) compColumns.push(`
                    <div class="report-preview-only" style="flex:1;min-width:220px;">
                        <div class="overview-sec-title">📅 赛事规划</div>
                        ${planHtml}
                    </div>`);
            const compsSection = compColumns.length
                ? `<div style="display:flex;gap:0.75rem;align-items:flex-start;flex-wrap:wrap;">${compColumns.join('')}</div>`
                : '';
            const module1Html = `
                <div class="card" data-module="1" style="margin-top:0.75rem;">
                    ${compsSection}
                    <div class="report-preview-only" style="margin-top:0.6rem;padding-top:0.6rem;border-top:1px solid var(--gray-100);">
                        <div class="overview-sec-title">📊 量化评估（综合）</div>
                        <div id="quantSummaryBody">${quantSummaryHtml}</div>
                    </div>
                    <div style="margin-top:0.6rem;padding-top:0.6rem;border-top:1px solid var(--gray-100);">
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.4rem;">
                            <span class="overview-sec-title" style="margin-bottom:0;">💬 教练评语</span>
                            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                                <button type="button" class="btn btn-sm btn-outline" id="aiCopyQuickBtn" title="复制 AI 数据包（含提示词/数据说明/评估数据/现有教练评语），可粘贴到任意 AI 生成">🔗 复制AI数据包</button>
                                <button type="button" class="btn btn-sm btn-outline" id="aiCommentBtn" title="已配置 AI 则直接生成最终评语；未配置/调用失败则弹出配置">✨ AI 生成</button>
                            </div>
                        </div>
                        <div style="display:flex;gap:0.75rem;align-items:flex-start;flex-wrap:wrap;margin-top:0.4rem;">
                            <div class="coach-editor-col" style="flex:1;min-width:280px;">
                                <div style="font-size:0.8rem;color:var(--gray-500);font-weight:600;margin-bottom:0.25rem;">📝 教练原始评语</div>
                                <div id="coachOrigBox" style="border:1px solid var(--gray-200);border-radius:var(--radius-sm);padding:0.5rem 0.6rem;cursor:text;">
                                    <div id="coachCommentBody"></div>
                                </div>
                            </div>
                            <div class="coach-editor-col" style="flex:1;min-width:280px;">
                                <div style="font-size:0.8rem;color:var(--gray-500);font-weight:600;margin-bottom:0.25rem;">✅ 最终评语</div>
                                <textarea id="aiFinalInput" placeholder="最终评语：可粘贴 AI 生成的版本，或点击「✨ AI 生成」直接生成…（离开即自动保存）" style="width:100%;min-height:120px;padding:0.6rem;border:1px solid var(--gray-300);border-radius:var(--radius-sm);font-size:0.85rem;font-family:inherit;line-height:1.7;resize:vertical;box-sizing:border-box;">${Shared.escapeHtml(this.getFinalComment())}</textarea>
                            </div>
                        </div>
                        <div id="coachFinalBody" class="report-preview-only" style="margin-top:0.4rem;"></div>
                    </div>
                </div>`;
            // 报告头部置于顶部（不属于模块），随后依次三个模块卡片
            return `${headerHtml}${module1Html}${taskChartHtml}${quantHtml}`;
        },

        // ============ 各任务表现折线图（每任务一张图，得分+用时双线，坐标轴标注数值） ============
        // —— 单个任务的「得分」+「用时」分析：全部相对该学员自身，不引入外部标准 ——
        // 计算某任务的得分/用时分析指标
        _taskAnalysis(points, task) {
            const S = Shared.stats;
            const out = { score: null, time: null };
            const maxScore = (task && task.maxScore) ? Number(task.maxScore) : null;
            const scores = (points || []).map((p) => p.score).filter((v) => v != null);
            // —— 得分：只看「满分率」（满分 = 任务设置的满分值，不涉及外部标准）——
            if (scores.length) {
                const full = maxScore ? scores.filter((v) => v === maxScore).length : 0;
                out.score = {
                    n: scores.length,
                    full,
                    fullRate: maxScore ? full / scores.length : null,
                    hasMax: !!maxScore,
                };
            }
            // —— 发挥（用时）：只用"满分场次"（非满分场次做少了自然快，用时不可比）——
            const fullPts = maxScore ? (points || []).filter((p) => p.time != null && p.score === maxScore) : [];
            const allPts = (points || []).filter((p) => p.time != null);
            const scope = fullPts.length >= 2 ? 'full' : 'all';
            const usePts = scope === 'full' ? fullPts : allPts;
            const times = usePts.map((p) => Number(p.time));
            if (times.length) {
                const M = S.median(times);
                const mad = S.mad(times);
                const off = mad == null ? null : 1.4826 * mad;
                const tmin = Math.min(...times);
                const band = off == null ? null : { lo: Math.max(tmin, M - off), hi: M + off };
                const iqr = S.iqr(times);
                const disp = (M > 0 && iqr != null) ? iqr / M : null;
                // 阶段变化：以「集训」为单位 —— 本期集训的中位用时 vs 上期集训（只有 1 个集训时不分析）
                let stageDelta = null;
                const gmap = {};
                const groups = [];
                usePts.forEach((p) => {
                    const key = p.trainingId || '__none__';
                    if (!gmap[key]) {
                        gmap[key] = { key, name: p.trainingName || '', times: [], lastDate: '' };
                        groups.push(gmap[key]);
                    }
                    gmap[key].times.push(Number(p.time));
                    if (p.date && p.date !== '-' && p.date > gmap[key].lastDate) gmap[key].lastDate = String(p.date);
                });
                if (groups.length >= 2) {
                    groups.sort((x, y) => String(x.lastDate).localeCompare(String(y.lastDate)));
                    const cur = groups[groups.length - 1];
                    const prev = groups[groups.length - 2];
                    const m1 = S.median(cur.times);
                    const m2 = S.median(prev.times);
                    if (m1 != null && m2) {
                        stageDelta = {
                            pct: (m1 - m2) / m2,
                            curName: cur.name || '本期集训', curM: m1, curN: cur.times.length,
                            prevName: prev.name || '上期集训', prevM: m2, prevN: prev.times.length,
                        };
                    }
                }
                out.time = { n: times.length, scope, M, off, band, tmin, iqr, disp, stageDelta, sd: S.sd(times), mean: S.mean(times) };
            }
            return out;
        },
        // 分析栏 HTML（右侧竖排：标签 + 数值，每行带 title 说明）
        _taskAnalysisHtml(a) {
            const pct = (v, d) => (v == null ? '—' : (v * 100).toFixed(d == null ? 0 : d) + '%');
            const sec = (v) => (v == null ? '—' : v.toFixed(1) + 's');
            const row = (k, v, opt) => `<div title="${(opt && opt.tip) ? opt.tip.replace(/"/g, '&quot;') : ''}" style="display:flex;justify-content:space-between;gap:0.4rem;font-size:0.74rem;color:var(--gray-600);line-height:1.5;${(opt && opt.tip) ? 'cursor:help;' : ''}"><span style="white-space:nowrap;">${k}</span><b style="font-weight:600;color:${(opt && opt.color) || 'var(--gray-800)'};text-align:right;">${v}</b></div>`;
            let rows = '';
            if (a.score) {
                const s = a.score;
                const val = s.fullRate == null
                    ? '—（任务未设满分）'
                    : `${pct(s.fullRate)} <span style="font-weight:400;color:var(--gray-400);">(${s.full}/${s.n})</span>`;
                rows += row('满分率', val, { tip: `满分次数 ÷ 记录条数 = ${s.full} / ${s.n}；满分指达到任务设置的满分值` });
            }
            if (a.time) {
                const t = a.time;
                rows += row(t.scope === 'full' ? '满分用时样本' : '用时样本（含非满分）', `${t.n} 次`, {
                    tip: t.scope === 'full'
                        ? '只用"满分场次"的用时：非满分场次做少了自然更快，用时不可比'
                        : '该任务没有足够的满分记录，暂用全部有用时的记录（仅供参考）',
                });
                rows += row('成绩预估（用时）', `${sec(t.M)} <span style="font-weight:400;color:inherit;">±${t.off != null ? t.off.toFixed(1) + 's' : '—'}</span>`, {
                    tip: `典型用时（中位数）± 偏差（1.4826×MAD，≈68% 的满分用时落在此范围）；本次实际范围约 ${t.band ? sec(t.band.lo) + ' ~ ' + sec(t.band.hi) : '样本不足'}，个人最快 ${sec(t.tmin)}`,
                });
                rows += row('集中度（用时）', t.disp == null ? '—' : `${pct(t.disp)} <span style="font-weight:400;color:var(--gray-400);">${t.disp < 0.10 ? '集中' : (t.disp < 0.20 ? '一般' : '分散')}</span>`, { tip: 'IQR ÷ 中位数 = 相对自身离散度；越小越集中（<10% 集中，<20% 一般）' });
                if (t.stageDelta) {
                    const d = t.stageDelta;
                    const slower = d.pct > 0;
                    rows += row('阶段变化', `${slower ? '变慢' : '变快'} ${pct(Math.abs(d.pct))}`, {
                        tip: `以集训为单位：本期「${d.curName}」中位 ${sec(d.curM)}（${d.curN} 次）vs 上期「${d.prevName}」中位 ${sec(d.prevM)}（${d.prevN} 次）；只在有 ≥2 个集训时分析`,
                        color: Math.abs(d.pct) < 0.05 ? 'var(--gray-800)' : (slower ? '#dc2626' : '#16a34a'),
                    });
                }
            }
            return rows || '<div style="font-size:0.74rem;color:var(--gray-400);">数据不足</div>';
        },
        // ============ 任务/赛事点评（每个任务一条，按学员保存） ============
        getTaskComments() {
            const sid = this.selectedStudentId;
            if (!sid) return {};
            try { return JSON.parse(localStorage.getItem('evalTaskComments') || '{}')[sid] || {}; } catch (e) { return {}; }
        },
        getTaskComment(tid) { return this.getTaskComments()[tid] || ''; },
        saveTaskComment(tid, text) {
            const sid = this.selectedStudentId;
            if (!sid || !tid) return;
            let all = {};
            try { all = JSON.parse(localStorage.getItem('evalTaskComments') || '{}'); } catch (e) { all = {}; }
            if (!all[sid]) all[sid] = {};
            const v = (text || '').trim();
            if (v) all[sid][tid] = v; else delete all[sid][tid];
            try { localStorage.setItem('evalTaskComments', JSON.stringify(all)); } catch (e) { /* ignore */ }
        },
        // 单个任务点评（填写=输入框，预览=纯文本；空点评在预览时整块省略）——置于指标面板内、指标下方
        taskCommentHtml(tid) {
            const text = this.getTaskComment(tid);
            const box = 'margin-top:0.35rem;padding-top:0.35rem;border-top:1px dashed var(--gray-200);';
            const label = '<div style="font-size:0.74rem;font-weight:600;color:var(--gray-500);margin-bottom:0.2rem;">📝 教练点评</div>';
            if (this.viewMode === 'preview') {
                if (!text) return '';
                return `<div style="${box}">${label}<div style="font-size:0.78rem;color:var(--gray-700);line-height:1.6;white-space:pre-wrap;">${Shared.escapeHtml(text)}</div></div>`;
            }
            return `<div style="${box}">${label}<textarea data-task-comment="${Shared.escapeHtml(tid)}" rows="2" placeholder="本任务（赛事）点评…" style="width:100%;padding:0.3rem 0.45rem;border:1px solid var(--gray-300);border-radius:var(--radius-sm);font-size:0.78rem;line-height:1.55;font-family:inherit;resize:vertical;box-sizing:border-box;">${Shared.escapeHtml(text)}</textarea></div>`;
        },
        // 按视图模式重渲染所有任务点评区（填写=输入框，预览=文本）
        refreshTaskCommentMode() {
            const box = document.getElementById('taskCharts');
            if (!box) return;
            // 先落盘当前输入框内容，避免切换视图时丢字
            box.querySelectorAll('textarea[data-task-comment]').forEach((ta) => this.saveTaskComment(ta.dataset.taskComment, ta.value));
            box.querySelectorAll('[data-task-comment-box]').forEach((el) => {
                el.innerHTML = this.taskCommentHtml(el.dataset.taskCommentBox);
            });
        },
        // —— 折线图数据：口径与「集训管理 → 学员成绩详情 → 趋势」保持一致 ——
        // 时间轴 = 已选集训下所有场次按日期排序、每场按轮次展开（所有任务共用这条时间轴）
        // 每个数据点 = 某任务在「某场次的某一轮」的成绩；弃权轮次不计入；自主训练（练习）暂不纳入
        _chartModel(studentId) {
            const D = Shared.data;
            const taskMap = {};
            (D.tasks || []).forEach((t) => { taskMap[t.id] = t; });
            const positions = []; // 时间轴上的每个位置 = 一场比赛的一轮
            const rows = [];
            (this.getSelectedTrainings() || []).forEach((training) => {
                const mocks = [...(training.mockCompetitions || [])]
                    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
                mocks.forEach((m) => {
                    if (m.withdrawn && m.withdrawn[studentId]) return;
                    const ss = m.scores && m.scores[studentId];
                    if (!ss) return;
                    // 该场次的最大轮次（与成绩详情一致：同一场次所有任务共用轮次位置）
                    let maxRounds = 0;
                    Object.entries(ss).forEach(([tid, entry]) => {
                        if (!taskMap[tid]) return;
                        const n = Shared.getRounds(entry).length;
                        if (n > maxRounds) maxRounds = n;
                    });
                    const compType = Shared.getMockType(m);
                    for (let ri = 0; ri < maxRounds; ri += 1) {
                        const pos = positions.length;
                        const roundLabel = maxRounds > 1 ? `第${ri + 1}轮` : '';
                        positions.push({
                            trainingId: training.id,
                            trainingName: training.name || '',
                            compName: m.name || '',
                            date: m.date || '',
                            roundLabel,
                            compType,
                            label: roundLabel ? `${m.name || ''}(${roundLabel})` : (m.name || ''),
                        });
                        Object.entries(ss).forEach(([tid, entry]) => {
                            const task = taskMap[tid];
                            if (!task) return;
                            const r = Shared.getRounds(entry)[ri];
                            if (!r || r.withdrawn) return; // 弃权轮次不计入（与成绩详情一致）
                            const score = (r.score === undefined || r.score === null) ? null : r.score;
                            const time = (r.time === undefined || r.time === null) ? null : r.time;
                            if (score === null && time === null) return;
                            rows.push({
                                taskId: tid,
                                taskName: task.name,
                                pos,
                                score,
                                time,
                                date: m.date || '',
                                trainingId: training.id,
                                trainingName: training.name || '',
                                compType,
                                compName: m.name || '',
                            });
                        });
                    }
                });
            });
            return { positions, rows, taskMap };
        },
        drawTaskChart(model, taskMap) {
            const container = document.getElementById('taskCharts');
            if (!container) return;
            const positions = (model && model.positions) || [];
            const records = (model && model.rows) || [];
            const n = positions.length;

            // 按任务分组：各任务共用同一条时间轴（同一场次在每个任务的图里 x 位置一致）
            const order = [];
            const seen = {};
            const series = {};
            const colors = ['#2563eb', '#f59e0b', '#10b981', '#7c3aed', '#0891b2', '#65a30d'];
            const SCORE_COLOR = '#2563eb'; // 得分线统一蓝色实线（得分刻度同色）
            const TIME_COLOR = '#d97706'; // 用时线统一橙色虚线（用时刻度同色）
            const TIME_AXIS_MAX = 150; // 用时轴固定刻度：0~150s（数据超过时自动扩展）
            const OFFICIAL_COLOR = '#ef4444'; // 正赛：显眼的红点
            records.forEach((rec) => {
                const tid = rec.taskId;
                if (!seen[tid]) {
                    seen[tid] = true;
                    order.push(tid);
                    series[tid] = { name: rec.taskName || tid, points: [], firstDate: '' };
                }
                const s = series[tid];
                const pdate = rec.date || '';
                if (pdate && (!s.firstDate || pdate < s.firstDate)) s.firstDate = pdate;
                s.points.push(rec);
            });

            if (order.length === 0) {
                container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--gray-400);">暂无趋势数据</div>';
                return;
            }

            // 任务顺序：基础任务置顶，其余按首次记录时间先后排序
            const isBasic = (k) => !!(taskMap[k] && taskMap[k].type === 'basic');
            const firstOf = (k) => series[k].firstDate || '9999-99-99';
            order.sort((a, b) => {
                const ba = isBasic(a) ? 0 : 1;
                const bb = isBasic(b) ? 0 : 1;
                if (ba !== bb) return ba - bb;
                const fa = firstOf(a);
                const fb = firstOf(b);
                if (fa !== fb) return fa < fb ? -1 : 1;
                return String(series[a].name).localeCompare(String(series[b].name), 'zh');
            });

            // 每个任务一块：左侧折线图 + 右侧分析栏（全部相对该学员自身）
            container.innerHTML = order.map((tid, i) => {
                const s = series[tid];
                const color = colors[i % colors.length];
                const hasTime = s.points.some((p) => p.time != null);
                const hasOfficial = s.points.some((p) => p.compType === 'official');
                const trNames = [];
                s.points.forEach((p) => { if (p.trainingName && !trNames.includes(p.trainingName)) trNames.push(p.trainingName); });
                const ana = this._taskAnalysis(s.points, taskMap[tid] || null);
                return `
                    <div class="task-chart-block" style="margin-top:0.75rem;">
                        <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--gray-700);font-weight:600;margin-bottom:0.25rem;flex-wrap:wrap;justify-content:space-between;">
                            <span style="display:inline-flex;align-items:center;gap:0.3rem;flex-wrap:wrap;">
                                <span style="display:inline-flex;align-items:center;gap:0.3rem;">
                                    <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${color};"></span>
                                    ${Shared.escapeHtml(s.name)}
                                </span>
                                <span style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:500;font-size:0.75rem;color:var(--gray-500);margin-left:0.75rem;" title="蓝色实线=得分（越高越好）">
                                    <span style="display:inline-block;width:12px;height:2px;background:${SCORE_COLOR};"></span> 得分
                                </span>
                                ${hasTime ? `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:500;font-size:0.75rem;color:var(--gray-500);" title="橙色虚线=用时（0s 在最下，秒数越大越高）">
                                    <span style="display:inline-block;width:12px;height:0;border-top:2px dashed ${TIME_COLOR};"></span> 用时
                                </span>` : ''}
                                ${hasOfficial ? `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:500;font-size:0.75rem;color:var(--gray-500);" title="红点=正赛（一场正赛的得分与用时各标一个红点）；模拟赛/练习为普通点">
                                    <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${OFFICIAL_COLOR};border:1.5px solid #fff;box-shadow:0 0 0 1px ${OFFICIAL_COLOR};"></span> 正赛
                                </span>` : ''}
                                ${trNames.length >= 2 ? `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:500;font-size:0.75rem;color:var(--gray-500);" title="竖向虚线=集训分界">
                                    <span style="display:inline-block;width:0;height:11px;border-left:1px dashed #94a3b8;"></span> 集训分界
                                </span>` : ''}
                            </span>
                            <span style="font-size:0.78rem;color:var(--gray-400);font-weight:500;">分析（相对该学员自身）</span>
                        </div>
                        <div style="display:flex;gap:1rem;align-items:stretch;">
                            <div class="task-chart-canvas" style="flex:1;min-width:0;height:180px;position:relative;border:1px solid var(--gray-100);border-radius:var(--radius-sm);background:var(--gray-50);">
                                <canvas data-task-index="${i}"></canvas>
                            </div>
                            <div style="width:250px;flex-shrink:0;border:1px solid var(--gray-100);border-radius:var(--radius-sm);background:var(--gray-50);padding:0.45rem 0.6rem;display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;">${this._taskAnalysisHtml(ana)}<div data-task-comment-box="${Shared.escapeHtml(tid)}">${this.taskCommentHtml(tid)}</div></div>
                        </div>
                    </div>`;
            }).join('');

            if (!this._chartResizeHandlers) this._chartResizeHandlers = {};
            if (!this._chartResizeObservers) this._chartResizeObservers = {};

            order.forEach((tid, i) => {
                const s = series[tid];
                const canvas = container.querySelector(`canvas[data-task-index="${i}"]`);
                const wrap = canvas ? canvas.parentElement : null;
                if (!canvas || !wrap) return;
                const hasTime = s.points.some((p) => p.time != null);
                // 本任务图刻度：得分轴 0~实测最高分；用时轴固定 0~150s（超过 150s 自动扩展，避免裁切）
                let scoreMax = 0, timeMax = TIME_AXIS_MAX;
                s.points.forEach((p) => {
                    if (p.score != null && p.score > scoreMax) scoreMax = p.score;
                    if (p.time != null && p.time > timeMax) timeMax = p.time;
                });
                scoreMax = Math.max(scoreMax, 1);
                const scoreNorm = (v) => Math.max(0, Math.min(1, v / scoreMax));
                // 用时：0s 在最下，用时越长画得越高（与右侧刻度一致）
                const timeNorm = (t) => Math.max(0, Math.min(1, t / timeMax));

                let drawnW = -1;
                const draw = () => {
                    const dpr = window.devicePixelRatio || 1;
                    const rect = wrap.getBoundingClientRect();
                    const W = Math.max(rect.width, 120);
                    // 尺寸未变则不重绘（避免 ResizeObserver 自激）
                    if (Math.abs(W - drawnW) < 0.5 && canvas.width === Math.round(W * dpr)) return;
                    drawnW = W;
                    const H = 180;
                    canvas.width = W * dpr;
                    canvas.height = H * dpr;
                    canvas.style.width = W + 'px';
                    canvas.style.height = H + 'px';
                    const ctx = canvas.getContext('2d');
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    ctx.clearRect(0, 0, W, H);

                    const padL = 34, padR = 48, padT = 14, padB = 14;
                    const cw = W - padL - padR, ch = H - padT - padB;
                    const yAt = (v) => padT + (1 - v) * ch;

                    // 坐标轴刻度：左=得分（分，蓝色，同得分线），右=用时（秒，橙色，0s 在最下、越大越靠上）
                    ctx.font = '9px sans-serif';
                    [0, 0.5, 1].forEach((g) => {
                        const y = padT + (1 - g) * ch;
                        ctx.fillStyle = SCORE_COLOR;
                        ctx.textAlign = 'right';
                        ctx.fillText(String(Math.round(scoreMax * g)), padL - 5, y + 3);
                        ctx.fillStyle = TIME_COLOR;
                        ctx.textAlign = 'left';
                        ctx.fillText((timeMax * g).toFixed(0) + 's', W - padR + 5, y + 3);
                    });
                    ctx.textAlign = 'left';

                    // 网格（25% / 50% / 75% / 100%）
                    ctx.strokeStyle = '#eef2f7';
                    ctx.lineWidth = 1;
                    [0.25, 0.5, 0.75, 1].forEach((g) => {
                        const y = padT + (1 - g) * ch;
                        ctx.beginPath();
                        ctx.moveTo(padL, y);
                        ctx.lineTo(W - padR, y);
                        ctx.stroke();
                    });

                    const pts = s.points;
                    if (n === 0) return;
                    const xAt = (k) => padL + (n === 1 ? cw / 2 : (k / (n - 1)) * cw);

                    // 集训分隔（各任务共用同一条时间轴，故分界位置逐图一致）：竖向虚线 + 各集训名；先画，保证数据线在上层
                    if (n > 1) {
                        const bounds = [];
                        for (let k = 1; k < n; k += 1) {
                            if ((positions[k].trainingId || '') !== (positions[k - 1].trainingId || '')) bounds.push(k);
                        }
                        if (bounds.length) {
                            const segs = [];
                            let start = 0;
                            bounds.forEach((k) => { segs.push([start, k - 1]); start = k; });
                            segs.push([start, n - 1]);
                            // 分界竖线（画在两点之间）
                            ctx.save();
                            ctx.strokeStyle = '#94a3b8';
                            ctx.lineWidth = 1;
                            ctx.setLineDash([4, 3]);
                            bounds.forEach((k) => {
                                const x = (xAt(k - 1) + xAt(k)) / 2;
                                ctx.beginPath();
                                ctx.moveTo(x, padT);
                                ctx.lineTo(x, padT + ch);
                                ctx.stroke();
                            });
                            ctx.restore();
                            // 集训名（各自段落顶部，过窄则不显示文字）
                            segs.forEach(([a, b]) => {
                                const name = positions[a].trainingName || '';
                                if (!name) return;
                                const span = xAt(b) - xAt(a);
                                if (span < 46) return;
                                const maxChars = Math.max(2, Math.floor(span / 11));
                                const txt = name.length > maxChars ? name.slice(0, maxChars) + '…' : name;
                                ctx.fillStyle = '#94a3b8';
                                ctx.font = '10px sans-serif';
                                ctx.textAlign = 'left';
                                ctx.fillText(txt, xAt(a) + 2, padT + 9);
                            });
                        }
                    }

                    // 通用画线：得分线（实线）/ 用时线（虚线）
                    const drawLine = (getVal, color, dash, markOfficial) => {
                        // markOfficial=true 时，该条线上遇到正赛数据点即标红
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 2;
                        ctx.lineJoin = 'round';
                        ctx.lineCap = 'round';
                        if (dash) ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
                        ctx.beginPath();
                        let started = false;
                        pts.forEach((p) => {
                            const v = getVal(p);
                            if (v == null) return;
                            const x = xAt(p.pos);
                            const y = yAt(v);
                            if (!started) { ctx.moveTo(x, y); started = true; }
                            else ctx.lineTo(x, y);
                        });
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // 数据点：正赛在该线上的点标红（得分线/用时线各有一个），其余用线色
                        pts.forEach((p) => {
                            const v = getVal(p);
                            if (v == null) return;
                            const x = xAt(p.pos);
                            const y = yAt(v);
                            const official = p.compType === 'official';
                            const isRed = official && markOfficial;
                            ctx.beginPath();
                            ctx.arc(x, y, isRed ? 4.5 : 3, 0, Math.PI * 2);
                            ctx.fillStyle = isRed ? OFFICIAL_COLOR : color;
                            ctx.fill();
                            ctx.strokeStyle = '#fff';
                            ctx.lineWidth = isRed ? 1.5 : 1;
                            ctx.stroke();
                        });
                    };

                    // 先画用时线（统一灰色虚线，该任务有用时数据才画；正赛红点在此标）
                    if (hasTime) drawLine((p) => (p.time != null ? timeNorm(p.time) : null), TIME_COLOR, true, true);
                    // 再画得分线（统一蓝色实线，后绘制使其在重叠处位于上方；正赛红点在此标）
                    drawLine((p) => (p.score != null ? scoreNorm(p.score) : null), SCORE_COLOR, false, true);
                };

                // 尺寸变化（含从隐藏→显示）时自动重绘，保证折线铺满可用宽度
                if (this._chartResizeHandlers[tid]) window.removeEventListener('resize', this._chartResizeHandlers[tid]);
                if (this._chartResizeObservers[tid]) this._chartResizeObservers[tid].disconnect();
                this._chartResizeHandlers[tid] = draw;
                window.addEventListener('resize', this._chartResizeHandlers[tid]);
                if (typeof ResizeObserver !== 'undefined') {
                    const ro = new ResizeObserver(() => draw());
                    ro.observe(wrap);
                    this._chartResizeObservers[tid] = ro;
                }
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(draw);
                else draw();
            });
        },

        // ============ 量化评估表 ============
        getQuantScores() {
            const sid = this.selectedStudentId;
            if (!sid) return {};
            try {
                return JSON.parse(localStorage.getItem('evalQuantScores') || '{}')[sid] || {};
            } catch (e) { return {}; }
        },

        saveQuantScores(map) {
            const sid = this.selectedStudentId;
            if (!sid) return;
            let all = {};
            try { all = JSON.parse(localStorage.getItem('evalQuantScores') || '{}'); } catch (e) { all = {}; }
            all[sid] = map;
            localStorage.setItem('evalQuantScores', JSON.stringify(all));
        },

        // 读取学员量化模板（未保存时用“默认加载模板”）；填写模式下细则/参考评分可编辑并保存
        // 系统内置默认结构（深拷贝返回：不可被编辑污染，也不传染给其它学员）
        defaultQuantTemplate() {
            const t = JSON.parse(JSON.stringify(this.quantTemplate || []));
            this.normalizeQuantRefs(t);
            return t;
        },
        // 预留名：默认/default 为系统内置模板，用户不可占用/覆盖/删除
        isReservedStructName(name) {
            const n = String(name || '').trim().toLowerCase();
            return !n || n === '默认' || n === 'default';
        },
        // 旧版内置默认模板（知识与技能 / 赛事能力 / 个人能力）检测：仅当保存结构就是这三个维度时判定为旧默认残留
        isLegacyDefaultTemplate(tpl) {
            if (!Array.isArray(tpl) || tpl.length !== 3) return false;
            const names = tpl.map((d) => d && d.dim);
            return ['知识与技能', '赛事能力', '个人能力'].every((n) => names.includes(n));
        },
        // 清除所有学员的历史旧默认结构与其对应评分，使默认模板对所有学员生效
        migrateLegacyQuantTemplates() {
            try {
                const all = JSON.parse(localStorage.getItem('evalQuantTemplate') || '{}');
                const scores = JSON.parse(localStorage.getItem('evalQuantScores') || '{}');
                let changed = false;
                Object.keys(all).forEach((sid) => {
                    if (this.isLegacyDefaultTemplate(all[sid])) {
                        delete all[sid];
                        if (scores[sid]) { delete scores[sid]; changed = true; }
                        changed = true;
                    }
                });
                if (changed) {
                    localStorage.setItem('evalQuantTemplate', JSON.stringify(all));
                    localStorage.setItem('evalQuantScores', JSON.stringify(scores));
                }
            } catch (e) { /* ignore */ }
        },
        // 「默认加载」设置：空=系统内置；否则为某个已保存的用户模板名
        getDefaultLoadName() {
            let v = '';
            try { v = localStorage.getItem('evalQuantDefaultLoad') || ''; } catch (e) { v = ''; }
            return v && this.getQuantStructTemplates()[v] ? v : '';
        },
        setDefaultLoadName(name) {
            try { localStorage.setItem('evalQuantDefaultLoad', name || ''); } catch (e) {}
        },
        // 无自存结构学员打开时使用的模板：优先“默认加载”的用户模板，否则系统内置默认
        defaultLoadTemplate() {
            const name = this.getDefaultLoadName();
            const t = name ? this.getQuantStructTemplates()[name] : null;
            const clone = JSON.parse(JSON.stringify((t && t.length) ? t : (this.quantTemplate || [])));
            this.normalizeQuantRefs(clone);
            return clone;
        },
        hasSavedQuantTemplate() {
            const sid = this.selectedStudentId;
            if (!sid) return false;
            try {
                const saved = JSON.parse(localStorage.getItem('evalQuantTemplate') || '{}')[sid];
                return !!(saved && saved.length);
            } catch (e) { return false; }
        },
        getQuantTemplate() {
            const sid = this.selectedStudentId;
            if (!sid) return this.defaultLoadTemplate();
            try {
                const saved = JSON.parse(localStorage.getItem('evalQuantTemplate') || '{}')[sid];
                if (saved && saved.length) {
                    // 旧版内置默认残留一律走“默认加载”；参考评分统一规整为整数
                    const ch = this.normalizeQuantRefs(saved);
                    if (ch) this.saveQuantTemplate(saved);
                    if (!this.isLegacyDefaultTemplate(saved)) return saved;
                }
            } catch (e) { /* ignore */ }
            return this.defaultLoadTemplate();
        },
        saveQuantTemplate(template) {
            const sid = this.selectedStudentId;
            if (!sid) return;
            let all = {};
            try { all = JSON.parse(localStorage.getItem('evalQuantTemplate') || '{}'); } catch (e) { all = {}; }
            all[sid] = template;
            localStorage.setItem('evalQuantTemplate', JSON.stringify(all));
        },

        // ============ 量化评估「结构模板」：整套 维度/子维度/细则(+参考分) 保存为可复用模板 ============
        getQuantStructTemplates() {
            try { return JSON.parse(localStorage.getItem('evalQuantStructureTemplates') || '{}'); } catch (e) { return {}; }
        },
        saveStructureTemplate(name, tpl) {
            const all = this.getQuantStructTemplates();
            all[name] = JSON.parse(JSON.stringify(tpl)); // 深拷贝，避免后续修改污染模板
            localStorage.setItem('evalQuantStructureTemplates', JSON.stringify(all));
        },
        // ============ 模板关联「项目」（赛项/数据集）：选择模板时自动带入评估范围 ============
        getTemplateMeta() {
            try { return JSON.parse(localStorage.getItem('evalQuantTemplateMeta') || '{}'); } catch (e) { return {}; }
        },
        saveTemplateMeta(meta) {
            try { localStorage.setItem('evalQuantTemplateMeta', JSON.stringify(meta)); } catch (e) { /* ignore */ }
        },
        templateProjects(name) {
            const m = this.getTemplateMeta();
            return (m[name] && Array.isArray(m[name].projects)) ? m[name].projects.slice() : [];
        },
        setTemplateProjects(name, projects) {
            const meta = this.getTemplateMeta();
            if (!projects || !projects.length) { if (meta[name]) delete meta[name]; }
            else meta[name] = { projects: projects.slice() };
            this.saveTemplateMeta(meta);
        },
        // 关联集训名称文案
        getScopeOptionLabel(id) {
            const t = (Shared.data.trainings || []).find((x) => x.id === id);
            return t ? (t.name || '（未命名集训）') : id;
        },
        // 把「关联集训」应用到当前评估范围（= 这些集训下的全部练习/赛项记录）
        _applyScopeProjects(ids) {
            if (!ids || !ids.length) return false;
            const tr = Shared.data.trainings || [];
            const chosen = tr.filter((t) => ids.includes(t.id));
            if (!chosen.length) return false;
            this.selectedTrainingIds = chosen.map((t) => t.id);
            // 覆盖所选集训下的全部数据集（练习/赛项）
            const mock = new Set();
            let hasPractice = false;
            chosen.forEach((t) => {
                if ((t.practiceRecords || []).length) hasPractice = true;
                (t.mockCompetitions || []).forEach((m) => mock.add(m.id));
            });
            this.selectedMockIds = this.getDataOptions()
                .filter((o) => (o.value === 'practice' ? hasPractice : mock.has(o.value)))
                .map((o) => o.value);
            this.updateScopeSummary();
            return true;
        },
        // 填充「量化结构模板」下拉（不含“保留当前结构”选项）
        _fillTemplateOptions(sel, selected) {
            if (!sel) return;
            const tpls = this.getQuantStructTemplates() || {};
            const dl = this.getDefaultLoadName();
            let html = '<option value="__default__">内置默认</option>';
            Object.keys(tpls).forEach((n) => {
                if (this.isReservedStructName(n)) return;
                html += `<option value="${Shared.escapeHtml(n)}">${(n === dl ? '★ ' : '')}${Shared.escapeHtml(n)}</option>`;
            });
            sel.innerHTML = html;
            if (selected && (selected === '__default__' || tpls[selected])) sel.value = selected;
        },
        // 计划弹窗：PDF 水印模板下拉（'' = 沿用当前水印设置）
        _fillWatermarkTplOptions(sel, selected) {
            if (!sel) return;
            const tpls = this.getWatermarkTemplates() || {};
            let html = '<option value="">当前水印设置</option>';
            Object.keys(tpls).forEach((n) => { html += `<option value="${Shared.escapeHtml(n)}">${Shared.escapeHtml(n)}</option>`; });
            sel.innerHTML = html;
            sel.value = (selected && tpls[selected]) ? selected : '';
        },
        deleteStructureTemplate(name) {
            if (this.templateReferenced(name)) {
                this.toast(`模板「${name}」已被历史报告引用，处于只读状态，不可删除`, 'warning');
                return;
            }
            const all = this.getQuantStructTemplates();
            if (Object.prototype.hasOwnProperty.call(all, name)) {
                delete all[name];
                localStorage.setItem('evalQuantStructureTemplates', JSON.stringify(all));
                // 同步清理该模板关联的项目元数据
                const meta = this.getTemplateMeta();
                if (meta[name]) { delete meta[name]; this.saveTemplateMeta(meta); }
            }
        },
        // ============ 量化结构模板导出（多选 → JSON 下载） ============
        openQuantExportModal() {
            this.renderQuantExportList();
            const wmRow = document.getElementById('quantTplExportWmRow');
            if (wmRow) wmRow.style.display = Object.keys(this.getWatermarkTemplates() || {}).length ? 'flex' : 'none';
            const m = document.getElementById('quantTplExportModal');
            if (m) m.classList.add('open');
        },
        closeQuantExportModal() {
            const m = document.getElementById('quantTplExportModal');
            if (m) m.classList.remove('open');
        },
        // 列出可导出的用户模板（勾选；内置默认不参与）
        renderQuantExportList() {
            const box = document.getElementById('quantTplExportList');
            if (!box) return;
            const tpls = this.getQuantStructTemplates() || {};
            const names = Object.keys(tpls).filter((n) => !this.isReservedStructName(n));
            if (!names.length) {
                box.innerHTML = '<div style="font-size:0.85rem;color:var(--gray-400);padding:0.3rem 0;">暂无可导出的用户模板（可在上方「＋ 以当前结构新建模板」创建）</div>';
                return;
            }
            box.innerHTML = names.map((n) => `
                <label><input type="checkbox" value="${Shared.escapeHtml(n)}" checked /> ${Shared.escapeHtml(n)}</label>
            `).join('');
        },
        confirmQuantExport() {
            const checks = Array.from(document.querySelectorAll('#quantTplExportList input[type="checkbox"]:checked'));
            const names = checks.map((c) => c.value);
            if (!names.length) { this.toast('请至少勾选一个要导出的模板', 'warning'); return; }
            const tpls = this.getQuantStructTemplates() || {};
            const data = { app: 'evaluation', type: 'quantStructureTemplates', version: 2, exportedAt: new Date().toISOString(), templates: {} };
            names.forEach((n) => { if (tpls[n]) data.templates[n] = tpls[n]; });
            // 附带所选模板关联的集训与报告元素（含赛事规划，若有）
            const meta = this.getTemplateMeta();
            const tProj = {};
            const tElem = {};
            names.forEach((n) => {
                if (meta[n] && meta[n].projects && meta[n].projects.length) tProj[n] = meta[n].projects.slice();
                const el = this.getTemplateElementsRaw(n);
                if (Object.keys(el).length) tElem[n] = el;
            });
            if (Object.keys(tProj).length) data.templateProjects = tProj;
            if (Object.keys(tElem).length) data.templateElements = tElem;
            // 可选：一并导出 PDF 水印模板
            const wmCb = document.getElementById('quantTplExportWm');
            const wms = this.getWatermarkTemplates() || {};
            if (wmCb && wmCb.checked && Object.keys(wms).length) data.watermarkTemplates = wms;
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const a = document.createElement('a');
            const d = new Date();
            const pad = (x) => String(x).padStart(2, '0');
            a.href = URL.createObjectURL(blob);
            a.download = `评估模板_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 1000);
            this.closeQuantExportModal();
            const wmN = data.watermarkTemplates ? Object.keys(data.watermarkTemplates).length : 0;
            this.toast(`已导出 ${names.length} 个评估模板${wmN ? ' + ' + wmN + ' 个水印模板' : ''}`);
        },
        // ============ 评估模板导入（JSON 文件 → 新增 / 覆盖同名）============
        openQuantImportPicker() {
            const f = document.getElementById('tplMgmtImportFile');
            if (f) { f.value = ''; f.click(); }
        },
        // 读取文件并解析（供 #tplMgmtImportFile 使用）
        importTemplateFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                let data = null;
                try { data = JSON.parse(String(reader.result || '')); } catch (e) { data = null; }
                if (!data || typeof data !== 'object') { this.toast('导入失败：文件不是有效的 JSON', 'warning'); return; }
                this.applyTemplateImport(data);
            };
            reader.onerror = () => this.toast('导入失败：文件读取错误', 'warning');
            reader.readAsText(file);
        },
        // 导入内容只取白名单字段（避免外部文件带入无关/危险字段）
        normalizeElemForImport(el) {
            if (!el || typeof el !== 'object') return null;
            const out = {};
            ['title', 'coach', 'date', 'aiPrompt', 'aiDataNote'].forEach((k) => {
                if (el[k] != null) out[k] = String(el[k]);
            });
            const cp = this.normalizeCompPlan(el.compPlan);
            if (cp.length) out.compPlan = cp;
            return out;
        },
        // 合并导入：模板结构 + 报告元素（含赛事规划）+ 关联集训 + 水印模板
        // 同名冲突：调用的 confirm 决定“覆盖”还是“自动重命名新增”；被历史报告引用的模板结构保持只读
        applyTemplateImport(data) {
            const tpls = (data && data.templates && typeof data.templates === 'object') ? data.templates : {};
            const elems = (data && data.templateElements && typeof data.templateElements === 'object') ? data.templateElements : {};
            const projs = (data && data.templateProjects && typeof data.templateProjects === 'object') ? data.templateProjects : {};
            const wms = (data && data.watermarkTemplates && typeof data.watermarkTemplates === 'object') ? data.watermarkTemplates : {};
            const names = Object.keys(tpls).filter((n) => !this.isReservedStructName(n) && Array.isArray(tpls[n]));
            if (!names.length && !Object.keys(elems).length && !Object.keys(wms).length) {
                this.toast('文件里没有可导入的模板数据', 'warning');
                return;
            }
            const structAll = this.getQuantStructTemplates() || {};
            const exist = names.filter((n) => !!structAll[n]);
            let overwrite = true;
            if (exist.length) {
                overwrite = confirm(
                    `已存在 ${exist.length} 个同名模板：\n${exist.join('、')}\n\n` +
                    '确定＝覆盖同名模板的结构（被历史报告引用的模板结构会自动保留）\n' +
                    '取消＝不覆盖，把导入的模板改名为「原名-导入」后新增。'
                );
            }
            const meta = this.getTemplateMeta();
            const used = {};
            const stat = { added: 0, overwritten: 0, renamed: 0, frozen: 0, skipped: 0 };
            names.forEach((n) => {
                const struct = tpls[n];
                let target = n;
                if (structAll[target]) {
                    if (overwrite) stat.overwritten += 1;
                    else {
                        let k = 1;
                        do { target = `${n}-导入${k > 1 ? k : ''}`; k += 1; }
                        while (structAll[target] || used[target] || this.isReservedStructName(target));
                        stat.renamed += 1;
                    }
                } else {
                    stat.added += 1;
                }
                used[target] = true;
                if (structAll[target] && this.templateReferenced(target)) {
                    stat.frozen += 1; // 结构被历史报告引用：保留原结构，仅更新报告元素/关联
                } else {
                    structAll[target] = JSON.parse(JSON.stringify(struct));
                }
                const el = this.normalizeElemForImport(elems[n]);
                if (el) meta[target] = { ...(meta[target] || {}), el: { ...((meta[target] || {}).el || {}), ...el } };
                const pj = Array.isArray(projs[n]) ? projs[n] : null;
                if (pj) {
                    const valid = pj.filter((id) => (Shared.data.trainings || []).some((t) => t.id === id));
                    if (valid.length) meta[target] = { ...(meta[target] || {}), projects: valid };
                    else if (meta[target]) delete meta[target].projects;
                }
            });
            // 只导入报告元素、没有结构的模板（如从别处单独导出的元素）
            Object.keys(elems).forEach((n) => {
                if (names.includes(n) || used[n] || this.isReservedStructName(n)) return;
                if (!structAll[n]) { stat.skipped += 1; return; }
                const el = this.normalizeElemForImport(elems[n]);
                if (el) meta[n] = { ...(meta[n] || {}), el: { ...((meta[n] || {}).el || {}), ...el } };
            });
            try { localStorage.setItem('evalQuantStructureTemplates', JSON.stringify(structAll)); } catch (e) { /* ignore */ }
            this.saveTemplateMeta(meta);
            // 水印模板（同名直接覆盖）
            let wmN = 0;
            if (Object.keys(wms).length) {
                const all = this.getWatermarkTemplates() || {};
                Object.keys(wms).forEach((n) => {
                    if (!String(n).trim() || !wms[n] || typeof wms[n] !== 'object') return;
                    all[n] = { ...this.watermarkDefaults(), ...wms[n] };
                    wmN += 1;
                });
                if (wmN) {
                    try { localStorage.setItem('evalWatermarkTemplates', JSON.stringify(all)); } catch (e) { /* ignore */ }
                    this.refreshWatermarkTemplateSelect('');
                }
            }
            this.renderTplMgmt();
            if (document.getElementById('quantStructTpl')) this.refreshQuantStructSelect('');
            else this.populateTemplateChoiceSelect();
            const bits = [];
            if (stat.added) bits.push(`新增 ${stat.added}`);
            if (stat.overwritten) bits.push(`覆盖 ${stat.overwritten}`);
            if (stat.renamed) bits.push(`重命名新增 ${stat.renamed}`);
            if (stat.frozen) bits.push(`结构冻结保留 ${stat.frozen}`);
            if (wmN) bits.push(`水印模板 ${wmN}`);
            if (stat.skipped) bits.push(`跳过 ${stat.skipped}`);
            this.toast(bits.length ? `导入完成：${bits.join(' · ')}` : '导入完成：没有发生变化', bits.length ? 'success' : 'warning');
        },
        setQuantExportAll(checked) {
            const box = document.getElementById('quantTplExportList');
            if (!box) return;
            box.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = !!checked; });
        },
        // 报告级「量化结构模板」选择：创建/生成评估前选用（保留当前 / 内置默认 / 用户模板）
        populateTemplateChoiceSelect() {
            const sel = document.getElementById('evalTplChoice');
            if (!sel) return;
            const prev = sel.value;
            const tpls = this.getQuantStructTemplates() || {};
            const dl = this.getDefaultLoadName();
            let html = '<option value="__keep__">（保留学员当前结构）</option>';
            html += `<option value="__default__">${dl ? '' : '★'}内置默认</option>`;
            Object.keys(tpls).forEach((n) => {
                if (this.isReservedStructName(n)) return;
                html += `<option value="${Shared.escapeHtml(n)}">${(n === dl ? '★' : '')}${Shared.escapeHtml(n)}</option>`;
            });
            sel.innerHTML = html;
            if (prev && prev !== '__keep__' && (prev === '__default__' || tpls[prev])) sel.value = prev;
            else sel.value = '__keep__';
        },
        // 生成评估前：选了模板且与学员当前结构不同 → 先应用到学员（无分数静默；有分数需确认）再回调
        applyReportTplChoiceIfNeeded(thenDo) {
            const sel = document.getElementById('evalTplChoice');
            const v = sel ? sel.value : '__keep__';
            if (!v || v === '__keep__') { if (thenDo) thenDo(); return; }
            if (!this.selectedStudentId) { if (thenDo) thenDo(); return; }
            const target = (v === '__default__') ? this.defaultQuantTemplate() : (this.getQuantStructTemplates() || {})[v];
            if (!target || !target.length) { this.toast('所选模板不存在', 'warning'); if (thenDo) thenDo(); return; }
            const label = v === '__default__' ? '内置默认' : v;
            // 模板已关联「项目」→ 选择模板时自动带入评估范围
            if (v !== '__default__') {
                const tProj = this.templateProjects(v);
                if (tProj.length) {
                    this._applyScopeProjects(tProj);
                    this.toast(`已带入模板「${label}」关联的 ${tProj.length} 个项目到评估范围`);
                }
            }
            const cur = this.getQuantTemplate() || [];
            if (this.quantTemplatesEqual(cur, target)) { if (thenDo) thenDo(); return; }
            const hasScores = Object.keys(this.getQuantScores()).length > 0;
            if (hasScores && !confirm(`用模板「${label}」替换当前学员的量化评估结构再生成？原有结构及已打分数将被替换。`)) return;
            this._quantTemplate = JSON.parse(JSON.stringify(target));
            this.saveQuantTemplate(this._quantTemplate);
            this.saveQuantScores({});
            if (this.quantSubMode === 'edit') this._quantEditBaseline = JSON.parse(JSON.stringify(this.getQuantTemplate()));
            this.toast(`已套用模板「${label}」`);
            if (thenDo) thenDo();
        },
        refreshQuantStructSelect(selectedName) {
            const sel = document.getElementById('quantStructTpl');
            if (!sel) return;
            const dl = this.getDefaultLoadName();
            sel.innerHTML = '';
            // 「内置默认」（系统内置，不可删除/覆盖/占用）；当前默认项前面加 ★
            const opD = document.createElement('option');
            opD.value = '__default__';
            opD.textContent = (dl ? '' : '★') + '内置默认';
            sel.appendChild(opD);
            Object.keys(this.getQuantStructTemplates()).forEach((name) => {
                if (this.isReservedStructName(name)) return; // 用户模板不得占用默认名
                const op = document.createElement('option');
                op.value = name;
                op.textContent = (name === dl ? '★' : '') + name;
                sel.appendChild(op);
            });
            const isUser = selectedName && this.getQuantStructTemplates()[selectedName];
            sel.value = selectedName === '__default__' ? '__default__' : (isUser ? selectedName : (dl || '__default__'));
            this.updateQuantTplControls();
            this.populateTemplateChoiceSelect(); // 同步报告级「量化模板」下拉
        },
        // 同步「设为默认」「▶ 套用」「🗑 删除」按钮显隐与当前默认提示
        updateQuantTplControls() {
            const sel = document.getElementById('quantStructTpl');
            const setDef = document.getElementById('quantTplSetDefault');
            const apply = document.getElementById('quantTplApply');
            const del = document.getElementById('quantTplDel');
            const dl = this.getDefaultLoadName();
            const v = sel ? sel.value : '';
            // 「设为默认」：当前所选还不是默认时才显示
            const isDef = v === '__default__' ? dl === '' : (v !== '' && v === dl);
            if (setDef) setDef.style.display = (v && !isDef) ? '' : 'none';
            const isUser = !!v && v !== '__default__';
            if (apply) apply.style.display = isUser ? '' : 'none';
            if (del) del.style.display = isUser ? '' : 'none';
        },
        // 用某个已存结构模板替换当前学员的量化结构（结构替换后清空已打分，重新渲染）
        applyQuantStruct(name) {
            const tpl = this.getQuantStructTemplates()[name];
            const sid = this.selectedStudentId;
            if (!tpl || !tpl.length) { this.toast('模板不存在', 'warning'); return; }
            if (!sid) return;
            if (!confirm(`用结构模板「${name}」替换当前学员的量化评估结构？已打分数值将清空。`)) {
                this.refreshQuantStructSelect('');
                return;
            }
            this._quantTemplate = JSON.parse(JSON.stringify(tpl));
            this.normalizeQuantRefs(this._quantTemplate);
            this.saveQuantTemplate(this._quantTemplate);
            this.saveQuantScores({});
            this.initQuantTable();
            // 套用模板本身即覆盖保存：若正处于「编辑」，同步基线避免误判为“有修改”
            if (this.quantSubMode === 'edit') this._quantEditBaseline = JSON.parse(JSON.stringify(this.getQuantTemplate()));
            this.toast('已套用结构模板「' + name + '」');
        },

        // 恢复为该学员的「内置默认」结构（维度一/二/三 · 子维度一/二/三）
        resetQuantDefault() {
            const sid = this.selectedStudentId;
            if (!sid) return;
            if (!confirm('将该学员的量化结构恢复为「内置默认」（维度一/二/三 · 子维度一/二/三）？现有结构及已打分数将被替换。')) return;
            this._quantTemplate = this.defaultQuantTemplate();
            this.saveQuantTemplate(this._quantTemplate);
            this.saveQuantScores({});
            this.initQuantTable();
            // 恢复默认本身即覆盖保存：若正处于「编辑」，同步基线
            if (this.quantSubMode === 'edit') this._quantEditBaseline = JSON.parse(JSON.stringify(this.getQuantTemplate()));
            this.toast('已恢复为「内置默认」结构');
        },

        // ============ 评分只取整数（0–MAX_SCORE）；仅计算得到的平均分允许小数 ============
        intRef(v) {
            if (v === null || v === undefined || v === '') return v; // 空值保留（如未填参考分）
            const n = Math.round(parseFloat(v));
            return isNaN(n) ? v : Math.max(0, Math.min(this.MAX_SCORE || 5, n));
        },
        // 把模板内所有参考评分规整为整数，返回是否有改动
        normalizeQuantRefs(template) {
            let changed = false;
            (template || []).forEach((d) => (d.subs || []).forEach((s) => (s.criteria || []).forEach((c) => {
                const ni = this.intRef(c.ref);
                if (c.ref !== ni) { c.ref = ni; changed = true; }
            })));
            return changed;
        },
        // 维度 / 子维度 改名（✎ 按钮弹窗输入）
        renameQuantItem(type, di, si) {
            const t = this._quantTemplate;
            if (!t || !t[di]) return;
            const cur = type === 'sub'
                ? (t[di].subs[si] ? t[di].subs[si].sub : '')
                : (t[di].dim || '');
            const name = (window.prompt(type === 'sub' ? '请输入新的子维度名称：' : '请输入新的维度名称：', cur) || '').trim();
            if (!name) return; // 取消或留空则不改
            if (name === cur) return;
            if (type === 'sub') {
                if (!t[di].subs[si]) return;
                t[di].subs[si].sub = name;
            } else {
                t[di].dim = name;
            }
            this.persistQuantStructure(t);
            this.refreshQuantSummary(); // 同步汇总表 / 雷达图名称
            this.initQuantTable();
        },

        // 评价细则中的【关键词】特殊高亮显示（如【科目】），用于报告的细则文本渲染
        renderCriteriaText(text) {
            const esc = (s) => Shared.escapeHtml(s);
            return String(text || '').split(/(【[^】]*】)/g).map((part) => {
                if (/^【[^】]*】$/.test(part)) {
                    const inner = part.slice(1, -1);
                    return `<span style="display:inline-block;background:#dbeafe;color:#1d4ed8;font-weight:700;padding:0 0.15rem;border-radius:3px;line-height:1.3;">${esc(inner)}</span>`;
                }
                return esc(part);
            }).join('');
        },

        initQuantTable() {
            const container = this._quantContainer || document.getElementById('quantTableContainer');
            if (!container) return;
            const tplEdit = !!this._tplEditCtx; // 处于「评估模板管理」内的模板编辑
            // 报告「编辑」或模板编辑模式下保留草稿结构（_quantTemplate）；否则从已保存结构重建
            if (!((this.quantSubMode === 'edit' || tplEdit) && this._quantTemplate && this._quantTemplate.length)) {
                this._quantTemplate = this.getQuantTemplate();
            }
            const template = this._quantTemplate || [];
            const saved = this.getQuantScores();
            const editable = this.viewMode !== 'preview'; // 得分可填（填写）
            const structEdit = editable && (this.quantSubMode === 'edit' || tplEdit); // 结构可改（报告编辑 / 模板编辑）
            const inputBase = 'padding:0.2rem 0.3rem;border:1px solid var(--gray-300);border-radius:4px;font-size:0.85rem;';
            // 结构可编辑（编辑模式）列加宽以便操作；填写 / 预览保持窄竖排
            const dimW = structEdit ? 56 : 27;
            const subW = structEdit ? 56 : 28;
            const vtext = `writing-mode:vertical-rl;text-orientation:upright;font-size:0.85rem;line-height:1.05;color:#000;`;
            let bodyRows = '';
            template.forEach((dim, di) => {
                // 同一维度所有行共用同色浅底（主色最浅一档），不同维度不同色
                const main = this.dimHex(dim, di);
                const rowBg = this.dimRow(main);
                let ci = 0; // 维度内评价细则的唯一序号
                let criteriaCount = 0;
                (dim.subs || []).forEach((s) => { criteriaCount += (s.criteria || []).length; });
                const dimRowspan = Math.max(1, criteriaCount); // 维度列跨该维度所有细则行
                let firstDim = true;
                (dim.subs || []).forEach((s, si) => {
                    let firstSub = true;
                    (s.criteria || []).forEach((c, cii) => {
                        const key = di + '-' + ci;
                        ci += 1;
                        const val = saved[key] !== undefined ? saved[key] : '';
                        // 维度列：预览/导出 = 只读竖排文字；填写 = 竖排名称 + 矩形色块 + 图标按钮列（✎改名 / ＋新增同级维度 / ×删除）
                        const dimCell = firstDim
                            ? (structEdit
                                ? `<td class="quant-dim-name qdim" rowspan="${dimRowspan}" style="width:${dimW}px;min-width:${dimW}px;max-width:${dimW}px;padding:0.25rem 0.05rem;text-align:center;vertical-align:middle;background:${rowBg};">
                                    <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
                                        <span style="${vtext}max-height:12rem;overflow:hidden;white-space:pre;">${Shared.escapeHtml(dim.dim)}</span>
                                        <input type="color" class="quant-dim-color" data-dim="${di}" value="${main}" title="维度颜色" style="width:32px;height:12px;padding:0;border:1px solid rgba(0,0,0,0.15);border-radius:2px;background:none;cursor:pointer;">
                                        <span style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                                            <button type="button" class="quant-rename" data-type="dim" data-dim="${di}" title="重命名维度" style="border:none;background:none;cursor:pointer;color:var(--gray-500);font-size:0.95rem;line-height:1;padding:0 4px;">✎</button>
                                            <button type="button" class="quant-add-dim" data-dim="${di}" title="新增同级维度（插到本维度之后）" style="border:none;background:none;cursor:pointer;color:var(--gray-600);font-size:0.95rem;line-height:1;padding:0 4px;">＋</button>
                                            <button type="button" class="quant-del-dim" data-dim="${di}" title="删除此维度" style="border:none;background:none;cursor:pointer;color:#ef4444;font-size:0.95rem;line-height:1;padding:0 4px;">×</button>
                                        </span>
                                    </div>
                                </td>`
                                : `<td class="quant-dim-name qdim" rowspan="${dimRowspan}" style="width:${dimW}px;min-width:${dimW}px;max-width:${dimW}px;text-align:center;vertical-align:middle;background:${rowBg};"><span style="${vtext}">${Shared.escapeHtml(dim.dim)}</span></td>`)
                            : '';
                        firstDim = false;
                        // 子维度列：预览/导出 = 只读竖排；填写 = 竖排名称 + 图标按钮列（✎改名 / ＋新增细则 / ×删除子维度）
                        const subRowspan = Math.max(1, (s.criteria || []).length);
                        const subCell = firstSub
                            ? (structEdit
                                ? `<td class="qsub" rowspan="${subRowspan}" style="width:${subW}px;min-width:${subW}px;max-width:${subW}px;padding:0.2rem 0.05rem;text-align:center;vertical-align:middle;background:${rowBg};">
                                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                                        <span style="${vtext}max-height:9rem;overflow:hidden;white-space:pre;">${Shared.escapeHtml(s.sub)}</span>
                                        <span style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                                            <button type="button" class="quant-rename" data-type="sub" data-dim="${di}" data-sub="${si}" title="重命名子维度" style="border:none;background:none;cursor:pointer;color:var(--gray-500);font-size:0.95rem;line-height:1;padding:0 4px;">✎</button>
                                            <button type="button" class="quant-add-crit" data-dim="${di}" data-sub="${si}" title="新增评价细则" style="border:none;background:none;cursor:pointer;color:var(--gray-600);font-size:0.95rem;line-height:1;padding:0 4px;">＋</button>
                                            <button type="button" class="quant-del-sub" data-dim="${di}" data-sub="${si}" title="删除此子维度" style="border:none;background:none;cursor:pointer;color:#ef4444;font-size:0.95rem;line-height:1;padding:0 4px;">×</button>
                                        </span>
                                    </div>
                                </td>`
                                : `<td class="qsub" rowspan="${subRowspan}" style="width:${subW}px;min-width:${subW}px;max-width:${subW}px;text-align:center;vertical-align:middle;background:${rowBg};"><span style="${vtext}">${Shared.escapeHtml(s.sub)}</span></td>`)
                            : '';
                        firstSub = false;
                        const critCell = structEdit
                            ? `<td><input type="text" class="quant-crit-text" data-dim="${di}" data-sub="${si}" data-ci="${cii}" value="${Shared.escapeHtml(c.name || '')}" placeholder="评价细则" style="width:100%;min-width:150px;${inputBase}"></td>`
                            : `<td style="color:var(--gray-700);">${c.name ? this.renderCriteriaText(c.name) : '—'}</td>`;
                        const refCell = structEdit
                            ? `<td style="text-align:center;"><input type="number" class="quant-ref" data-dim="${di}" data-sub="${si}" data-ci="${cii}" step="1" min="0" max="${this.MAX_SCORE}" value="${c.ref != null ? this.intRef(c.ref) : ''}" style="width:56px;text-align:center;${inputBase}appearance:textfield;-moz-appearance:textfield;"></td>`
                            : `<td style="text-align:center;color:var(--gray-600);">${c.ref != null ? this.intRef(c.ref) : '—'}</td>`;
                        const delCell = structEdit
                            ? `<td class="quant-op-col" style="text-align:center;width:40px;"><button type="button" class="quant-del" data-dim="${di}" data-sub="${si}" data-ci="${cii}" title="删除此细则" style="border:none;background:none;cursor:pointer;color:#ef4444;font-size:0.95rem;padding:0;">×</button></td>`
                            : '';
                        // 模板编辑（评估模板管理）不显示“得分”列
                        const scoreCell = tplEdit ? '' : `<td style="text-align:center;"><input type="number" class="quant-score" data-key="${key}" data-dim="${di}" min="0" max="${this.MAX_SCORE}" step="1" value="${val}" ${editable ? '' : 'readonly'} style="width:56px;text-align:center;${inputBase}appearance:textfield;-moz-appearance:textfield;"></td>`;
                        bodyRows += `<tr data-dim="${di}" data-sub="${si}" data-ci="${cii}" style="background:${rowBg};">
                            ${dimCell}
                            ${subCell}
                            ${critCell}
                            ${scoreCell}
                            ${refCell}
                            ${delCell}
                        </tr>`;
                    });
                });
            });
            container.innerHTML = `
                <div style="overflow-x:auto;">
                    <table class="score-table quant-table">
                        <thead><tr>
                            <th colspan="2" style="white-space:nowrap;text-align:center;font-size:0.72rem;padding:0.4rem 0.1rem;">评测维度</th>
                            <th>评价细则</th>
                            ${tplEdit ? '' : '<th style="width:76px;text-align:center;">得分</th>'}
                            <th style="width:76px;text-align:center;">参考评分</th>
                            ${structEdit ? '<th class="quant-op-col" style="width:40px;"></th>' : ''}
                        </tr></thead>
                        <tbody>${bodyRows}</tbody>
                    </table>
                </div>`;
            if (!tplEdit) {
                container.querySelectorAll('.quant-score').forEach((inp) => {
                    inp.addEventListener('input', () => this.recalcQuant());
                    inp.addEventListener('change', () => this.recalcQuant());
                });
            }
            if (structEdit) {
                // —— 维度 / 子维度 名称：✎ 按钮弹窗改名（名称只读展示）——
                container.querySelectorAll('.quant-rename').forEach((btn) => {
                    btn.addEventListener('click', () => this.renameQuantItem(
                        btn.dataset.type,
                        Number(btn.dataset.dim),
                        btn.dataset.sub !== undefined ? Number(btn.dataset.sub) : null
                    ));
                });
                // —— 维度颜色 ——
                container.querySelectorAll('.quant-dim-color').forEach((inp) => {
                    inp.addEventListener('change', () => {
                        const t = this._quantTemplate;
                        const di = Number(inp.dataset.dim);
                        if (t && t[di]) { t[di].color = inp.value; this.persistQuantStructure(t); }
                        this.initQuantTable();
                        this.refreshQuantSummary();
                    });
                });
                container.querySelectorAll('.quant-crit-text').forEach((inp) => {
                    inp.addEventListener('change', () => {
                        const t = this._quantTemplate;
                        if (t && t[Number(inp.dataset.dim)] && t[Number(inp.dataset.dim)].subs[Number(inp.dataset.sub)]) {
                            t[Number(inp.dataset.dim)].subs[Number(inp.dataset.sub)].criteria[Number(inp.dataset.ci)].name = inp.value.trim();
                            this.persistQuantStructure(t);
                        }
                    });
                });
                container.querySelectorAll('.quant-ref').forEach((inp) => {
                    inp.addEventListener('input', () => {
                        const t = this._quantTemplate;
                        const di = Number(inp.dataset.dim), si = Number(inp.dataset.sub), cii = Number(inp.dataset.ci);
                        if (t && t[di] && t[di].subs[si]) {
                            const raw = inp.value;
                            let r;
                            if (raw === '') { r = null; } // 留空 = 未填参考分
                            else { r = this.intRef(raw); if (String(raw) !== String(r)) inp.value = r; }
                            t[di].subs[si].criteria[cii].ref = r;
                            this.persistQuantStructure(t);
                            this.recalcQuant();
                        }
                    });
                });
                container.querySelectorAll('.quant-del').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const t = this._quantTemplate;
                        const di = Number(btn.dataset.dim), si = Number(btn.dataset.sub), cii = Number(btn.dataset.ci);
                        if (t && t[di] && t[di].subs[si]) {
                            if (t[di].subs[si].criteria.length <= 1) { this.toast('每个子维度至少保留一条评价细则', 'warning'); return; }
                            t[di].subs[si].criteria.splice(cii, 1);
                            this.persistQuantStructure(t);
                            this.initQuantTable();
                            this.recalcQuant();
                        }
                    });
                });
                container.querySelectorAll('.quant-add-crit').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const t = this._quantTemplate;
                        const di = Number(btn.dataset.dim), si = Number(btn.dataset.sub);
                        if (t && t[di] && t[di].subs[si]) {
                            const crits = t[di].subs[si].criteria;
                            const defRef = crits.length ? crits.reduce((a, c) => a + (c.ref != null ? c.ref : 0), 0) / crits.length : 3;
                            crits.push({ name: '', ref: this.intRef(defRef) });
                            this.persistQuantStructure(t);
                            this.initQuantTable();
                            this.recalcQuant();
                        }
                    });
                });
                // —— 维度单元格按钮：＋=新增同级维度；×=删除维度；✎=改名 ——
                container.querySelectorAll('.quant-add-dim').forEach((btn) => {
                    btn.addEventListener('click', () => this.addDimAfter(Number(btn.dataset.dim)));
                });
                container.querySelectorAll('.quant-del-sub').forEach((btn) => {
                    btn.addEventListener('click', () => this.removeSub(Number(btn.dataset.dim), Number(btn.dataset.sub)));
                });
                container.querySelectorAll('.quant-del-dim').forEach((btn) => {
                    btn.addEventListener('click', () => this.removeDim(Number(btn.dataset.dim)));
                });
            }
            if (!tplEdit) this.recalcQuant();
        },

        // ============ 量化模板结构编辑：维度 / 子维度 增删 ============
        // 追加一个维度（自动命名「维度N」+ 自动配色）
        addDim() {
            const t = (this._quantTemplate || []).slice();
            if (t.length >= 12) { this.toast('维度数量已达上限（12）', 'warning'); return; }
            const n = t.length + 1;
            const color = this.DIM_PALETTE[(n - 1) % this.DIM_PALETTE.length];
            t.push({ dim: '维度' + this.numToCn(n), icon: '', color, subs: [{ sub: '子维度一', criteria: [{ name: '', ref: 4 }] }] });
            this._quantTemplate = t;
            this.persistQuantStructure(t);
            this.initQuantTable();
        },
        // 在指定维度之后新增一个同级维度（插到该维度后面）
        addDimAfter(di) {
            const t = (this._quantTemplate || []).slice();
            if (t.length >= 12) { this.toast('维度数量已达上限（12）', 'warning'); return; }
            const at = Math.max(0, Math.min(Number(di) || 0, t.length - 1));
            const n = t.length + 1;
            const color = this.DIM_PALETTE[(n - 1) % this.DIM_PALETTE.length];
            const nd = { dim: '维度' + this.numToCn(n), icon: '', color, subs: [{ sub: '子维度一', criteria: [{ name: '', ref: 4 }] }] };
            t.splice(at + 1, 0, nd);
            this._quantTemplate = t;
            this.persistQuantStructure(t);
            this.initQuantTable();
        },
        // 在指定维度下追加子维度（自动命名「子维度N」+ 一条空白细则）
        addSubToDim(di) {
            const t = this._quantTemplate || [];
            const dim = t[Number(di)];
            if (!dim) { this.toast('找不到所属维度', 'warning'); return; }
            if (!Array.isArray(dim.subs)) dim.subs = [];
            if (dim.subs.length >= 12) { this.toast('子维度数量已达上限（12）', 'warning'); return; }
            dim.subs.push({ sub: '子维度' + this.numToCn(dim.subs.length + 1), criteria: [{ name: '', ref: 4 }] });
            this._quantTemplate = t;
            this.persistQuantStructure(t);
            this.initQuantTable();
        },
        // 删除整个维度（连同子维度与细则）
        removeDim(di) {
            const t = this._quantTemplate || [];
            const dim = t[di];
            if (!dim) return;
            if (!confirm(`删除整个维度「${dim.dim}」及其所有子维度、评价细则？此操作不可撤销。`)) return;
            t.splice(di, 1);
            this._quantTemplate = t;
            this.persistQuantStructure(t);
            this.initQuantTable();
        },
        // 删除某个子维度（至少保留一个）
        removeSub(di, si) {
            const t = this._quantTemplate || [];
            const dim = t[di];
            if (!dim || !dim.subs[si]) return;
            if (dim.subs.length <= 1) { this.toast('每个维度至少保留一个子维度', 'warning'); return; }
            if (!confirm(`删除子维度「${dim.subs[si].sub}」及其评价细则？`)) return;
            dim.subs.splice(si, 1);
            this._quantTemplate = t;
            this.persistQuantStructure(t);
            this.initQuantTable();
        },
        // —— 新增子维度弹窗（需选择父维度）——
        openQuantAddSubModal() {
            const t = this.getQuantTemplate() || [];
            if (!t.length) { this.toast('暂无可选的维度，请先新增维度', 'warning'); return; }
            const list = document.getElementById('quantAddSubDimList');
            if (list) {
                list.innerHTML = t.map((d, di) => `
                    <label style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;border:1px solid var(--gray-200);border-radius:var(--radius-sm);cursor:pointer;background:#fff;">
                        <input type="radio" name="quantAddSubParent" value="${di}" ${di === 0 ? 'checked' : ''} style="margin:0;" />
                        <span style="width:14px;height:14px;border-radius:4px;background:${this.dimHex(d, di)};flex:none;"></span>
                        <span style="font-size:0.88rem;color:var(--gray-800);">${Shared.escapeHtml(d.dim)}</span>
                    </label>`).join('');
            }
            const modal = document.getElementById('quantAddSubModal');
            if (modal) modal.classList.add('open');
        },
        confirmQuantAddSub() {
            const radio = document.querySelector('#quantAddSubDimList input[name="quantAddSubParent"]:checked');
            if (!radio) { this.toast('请先选择父维度', 'warning'); return; }
            this.addSubToDim(Number(radio.value));
            const modal = document.getElementById('quantAddSubModal');
            if (modal) modal.classList.remove('open');
        },

        recalcQuant() {
            if (this._tplEditCtx) return; // 模板编辑（评估模板管理）不涉及打分
            const container = document.getElementById('quantTableContainer');
            if (!container) return;
            const map = {};
            container.querySelectorAll('.quant-score').forEach((inp) => {
                let v = parseInt(inp.value, 10);
                if (isNaN(v)) v = 0;
                v = Math.max(0, Math.min(this.MAX_SCORE, v));
                inp.value = v || '';
                map[inp.dataset.key] = v;
            });
            // 综合评分一律按平均数计算（整体平均分 / 平均参考评分）
            const totalEl = document.getElementById('quantTotal');
            if (totalEl) {
                const sum = this.computeQuantSummary();
                const pct = sum.ref > 0 ? Math.round((sum.score / sum.ref) * 100) : 0;
                totalEl.textContent = `综合平均 ${sum.score.toFixed(2)} / 参考 ${sum.ref.toFixed(2)}（${pct}%）`;
            }
            this.saveQuantScores(map);
            this.refreshQuantSummary(); // 评分改动即时更新综合表与雷达图
        },

        resetQuant() {
            if (!confirm('确定重置量化评估表吗？')) return;
            const container = document.getElementById('quantTableContainer');
            if (container) container.querySelectorAll('.quant-score').forEach((i) => { i.value = ''; });
            this.saveQuantScores({});
            this.recalcQuant();
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

    window.EvaluationApp = EvaluationApp;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => EvaluationApp.init());
    } else {
        EvaluationApp.init();
    }
})();
