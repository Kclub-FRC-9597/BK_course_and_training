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
            this.initScope(); // 默认全选
            this.populateClassSelect();
            this.bindEvents();
            this.updateScopeSummary();
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
            // 赛事规划：按视图模式重渲染（填写=可编辑输入框，预览=纯文本）
            this.refreshCompPlanMode();
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
            // 班级变化 → 重建学员列表
            const clsSel = document.getElementById('evalClassSelect');
            if (clsSel) clsSel.addEventListener('change', () => {
                this.selectedClassId = clsSel.value;
                this.selectedStudentId = null;
                this.populateStudentSelect();
                if (this.selectedStudentId && this.selectedTrainingIds.length > 0) this.generate();
                else this.showEmpty('请选择学员与集训，生成评估报告');
            });
            // 学员变化 → 生成
            const stuSel = document.getElementById('evalStudentSelect');
            if (stuSel) stuSel.addEventListener('change', () => {
                this.selectedStudentId = stuSel.value || null;
                if (this.selectedStudentId && this.selectedTrainingIds.length > 0) this.generate();
                else this.showEmpty('请选择学员与集训，生成评估报告');
            });
            // 生成按钮（生成后滚动到报告，便于立即查看 / 导出）
            const genBtn = document.getElementById('evalGenerateBtn');
            if (genBtn) genBtn.addEventListener('click', () => {
                if (!this.selectedStudentId) { this.toast('请先选择学员', 'warning'); return; }
                if (this.selectedTrainingIds.length === 0) { this.toast('请至少选择一个集训', 'warning'); return; }
                this.generate();
                this.toast('已生成评估报告');
                const evalContent = document.getElementById('evalContent');
                if (evalContent) evalContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            // 导出 PDF（浏览器打印，可另存为 PDF）
            const printBtn = document.getElementById('evalPrintBtn');
            if (printBtn) printBtn.addEventListener('click', () => window.print());
            // 编辑报告页面元素（标题 / 学员信息）
            const headerEditBtn = document.getElementById('evalHeaderEditBtn');
            if (headerEditBtn) headerEditBtn.addEventListener('click', () => this.openReportHeaderModal());
            const rhSave = document.getElementById('reportHeaderSave');
            if (rhSave) rhSave.addEventListener('click', () => this.saveReportHeaderModal());
            const rhCancel = document.getElementById('reportHeaderCancel');
            if (rhCancel) rhCancel.addEventListener('click', () => {
                const modal = document.getElementById('reportHeaderModal');
                if (modal) modal.classList.remove('open');
            });
            const rhModal = document.getElementById('reportHeaderModal');
            if (rhModal) rhModal.addEventListener('click', (e) => { if (e.target === rhModal) rhModal.classList.remove('open'); });
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
            if (!student) { this.showEmpty('请选择学员，生成评估报告'); return; }
            const trainings = this.getSelectedTrainings();
            if (trainings.length === 0) { this.showEmpty('请选择集训，生成评估报告'); return; }
            const r = this.collectStudentAssessment(student.id, trainings, this.selectedMockIds);
            if (!r) {
                content.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>${Shared.escapeHtml(student.name)} 在选定范围内暂无成绩数据</p></div>`;
                return;
            }
            content.innerHTML = this.renderReport(student, trainings, r);
            this.drawTaskChart(r.records, r.taskMap);
            this.drawRadarCharts();
            this.initQuantTable();
            this.initCompPlanTable();
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
                this.saveStructureTemplate(name, this.getQuantTemplate());
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
            // 恢复默认 = 把当前学员结构设回「内置默认」；默认模板由「设为默认」按钮控制
            this.updateQuantTplControls();
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

        // ============ 参赛记录表（报告顶部，扁平表格：赛事 | 基础任务得分 | 成绩） ============
        renderCompetitions(student, trainings) {
            const sid = student.id;
            const ids = this.selectedMockIds || [];
            const D = Shared.data;
            const basicTask = (D.tasks || []).find((t) => t.type === 'basic');
            const rows = [];

            trainings.forEach((training) => {
                // 仅展示正赛（官方赛事），不含集训内部的模拟赛记录
                const comps = (training.mockCompetitions || []).filter((m) => ids.includes(m.id) && Shared.getMockType(m) === 'official');
                comps.forEach((m) => {
                    // 赛事名称：填写孩子参加的集训的赛事名称，为空则回退集训名称，再回退类型文本
                    const compName = (training.competitionName || '').trim() || (training.name || '').trim() || Shared.getMockTypeText(m);
                    const withdrawn = !!(m.withdrawn && m.withdrawn[sid]);
                    const ss = !withdrawn ? (m.scores && m.scores[sid]) : null;
                    // 基础任务列：优先基础任务，缺失时回退到该学员首个有成绩的任务
                    let taskId = basicTask ? basicTask.id : null;
                    if ((!taskId || !(ss && ss[taskId])) && ss) {
                        const keys = Object.keys(ss);
                        if (keys.length) taskId = keys[0];
                    }
                    const entry = taskId && ss ? ss[taskId] : null;
                    const best = entry ? Shared.getBestScore(entry) : null;
                    const bestTime = entry ? Shared.getBestScoreTime(entry) : null;
                    const prize = (m.prizes && m.prizes[sid]) || '';
                    const rank = (m.officialRankings && m.officialRankings[sid]) || (m.rankings && m.rankings[sid]) || null;
                    rows.push({ date: m.date || '-', name: compName, withdrawn, participated: best !== null, best, bestTime, rank, prize });
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

        // ============ 赛事规划表（赛事 + 预计时间，填写模式下可编辑） ============
        // 未保存过时按选定集训生成默认行（赛事名=集训 competitionName，未填回退集训名；预计时间=集训日期）
        renderCompetitionPlan(trainings) {
            return this.compPlanHtml();
        },
        getCompPlans() {
            const sid = this.selectedStudentId;
            if (!sid) return null;
            try { return JSON.parse(localStorage.getItem('evalCompPlans') || '{}')[sid] || null; } catch (e) { return null; }
        },
        saveCompPlans(rows) {
            const sid = this.selectedStudentId;
            if (!sid) return;
            let all = {};
            try { all = JSON.parse(localStorage.getItem('evalCompPlans') || '{}'); } catch (e) { all = {}; }
            all[sid] = rows;
            localStorage.setItem('evalCompPlans', JSON.stringify(all));
        },
        defaultCompPlans(trainings) {
            return (trainings || []).map((t) => ({
                competition: (t.competitionName || '').trim() || (t.name || '').trim() || '',
                date: (t.date || '').trim() || '',
            }));
        },
        compPlanRows() {
            const saved = this.getCompPlans();
            return (saved && saved.length) ? saved : this.defaultCompPlans(this.getSelectedTrainings());
        },
        compPlanHtml() {
            const plans = this.compPlanRows();
            if (plans.length === 0) return '';
            const editable = this.viewMode !== 'preview';
            const inputStyle = 'width:100%;min-width:120px;padding:0.25rem 0.4rem;border:1px solid var(--gray-300);border-radius:4px;font-size:0.85rem;';
            const rowHtml = plans.map((p, i) => {
                if (editable) {
                    return `
                        <tr>
                            <td style="min-width:150px;"><input type="text" class="comp-plan-input" data-field="competition" data-idx="${i}" value="${Shared.escapeHtml(p.competition || '')}" placeholder="赛事名称" style="${inputStyle}"></td>
                            <td style="min-width:120px;"><input type="text" class="comp-plan-input" data-field="date" data-idx="${i}" value="${Shared.escapeHtml(p.date || '')}" placeholder="预计时间" style="${inputStyle}"></td>
                            <td style="text-align:center;width:44px;"><button type="button" class="btn btn-sm btn-outline comp-plan-del" data-idx="${i}" title="删除此行">🗑</button></td>
                        </tr>`;
                }
                return `
                    <tr>
                        <td style="color:var(--gray-700);">${Shared.escapeHtml(p.competition || '—')}</td>
                        <td style="text-align:center;color:var(--gray-600);">${Shared.escapeHtml(p.date || '—')}</td>
                    </tr>`;
            }).join('');
            return `
                <div id="compPlanContainer">
                    <div style="overflow-x:auto;">
                        <table class="score-table">
                            <thead>
                                <tr>
                                    <th>赛事</th>
                                    <th style="text-align:center;">预计时间</th>
                                    ${editable ? '<th style="width:44px;"></th>' : ''}
                                </tr>
                            </thead>
                            <tbody id="compPlanBody">${rowHtml}</tbody>
                        </table>
                    </div>
                    ${editable ? '<div style="margin-top:0.35rem;"><button type="button" class="btn btn-sm btn-outline" id="compPlanAddBtn">＋ 添加一行</button></div>' : ''}
                </div>`;
        },
        // 读取赛事规划表格当前行
        readCompPlanRows() {
            const body = document.getElementById('compPlanBody');
            if (!body) return [];
            return [...body.querySelectorAll('tr')].map((tr) => {
                const comp = tr.querySelector('input[data-field="competition"]');
                const date = tr.querySelector('input[data-field="date"]');
                return { competition: comp ? comp.value.trim() : '', date: date ? date.value.trim() : '' };
            });
        },
        initCompPlanTable() {
            const body = document.getElementById('compPlanBody');
            if (!body) return;
            const rerender = () => {
                const container = document.getElementById('compPlanContainer');
                if (!container) return;
                container.innerHTML = this.compPlanHtml();
                this.initCompPlanTable();
            };
            body.querySelectorAll('input.comp-plan-input').forEach((inp) => {
                inp.addEventListener('input', () => this.saveCompPlans(this.readCompPlanRows()));
            });
            body.querySelectorAll('button.comp-plan-del').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const idx = Number(btn.dataset.idx);
                    const list = this.readCompPlanRows();
                    list.splice(idx, 1);
                    this.saveCompPlans(list);
                    rerender();
                });
            });
            const addBtn = document.getElementById('compPlanAddBtn');
            if (addBtn) addBtn.addEventListener('click', () => {
                const list = this.readCompPlanRows();
                list.push({ competition: '', date: '' });
                this.saveCompPlans(list);
                rerender();
            });
        },
        // 按视图模式重渲染赛事规划（填写=可编辑，预览=纯文本）
        refreshCompPlanMode() {
            const container = document.getElementById('compPlanContainer');
            if (!container) return;
            container.innerHTML = this.compPlanHtml();
            this.initCompPlanTable();
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
            const template = this.getQuantTemplate();
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
            // 每个维度一张雷达（按实际维度名/数量动态生成）
            const perRadar = sum.dims.map((d, di) =>
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
            sum.dims.forEach((d, di) => {
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
        // 把整套水印设置填入弹窗字段
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
            const wm = this.getWatermark();
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
        // 编辑元素弹窗：装载当前水印设置
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
        // 收集编辑元素弹窗中的水印设置
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

        // ============ 报告页面元素（标题 + 学员信息行） ============
        getReportHeader(student) {
            const sid = student.id;
            let stored = {};
            try { stored = JSON.parse(localStorage.getItem('evalReportHeader') || '{}')[sid] || {}; } catch (e) { stored = {}; }
            const now = new Date();
            const today = now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate();
            // 学员 / 班级：始终自动带出真实数据（不允许在编辑元素中修改）；上课时间不再提供
            return {
                title: stored.title || '训练评估报告',
                studentName: student.name,
                className: Shared.getCurrentClassName(sid),
                coach: stored.coach || '',
                date: stored.date || today,
            };
        },

        saveReportHeader(fields) {
            const sid = this.selectedStudentId;
            if (!sid) return;
            let all = {};
            try { all = JSON.parse(localStorage.getItem('evalReportHeader') || '{}'); } catch (e) { all = {}; }
            all[sid] = { ...(all[sid] || {}), ...fields };
            localStorage.setItem('evalReportHeader', JSON.stringify(all));
        },

        openReportHeaderModal() {
            const student = (Shared.data.students || []).find((s) => s.id === this.selectedStudentId);
            if (!student) { this.toast('请先选择学员', 'warning'); return; }
            const h = this.getReportHeader(student);
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            set('reportHeaderTitle', h.title);
            set('reportHeaderCoach', h.coach);
            set('reportHeaderDate', h.date);
            set('reportHeaderAIPrompt', this.getAIPrompt());
            set('reportHeaderAIDataNote', this.getAIDataNote());
            this.loadWatermarkModal();
            const modal = document.getElementById('reportHeaderModal');
            if (modal) modal.classList.add('open');
        },

        saveReportHeaderModal() {
            const sid = this.selectedStudentId;
            if (!sid) return;
            const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
            this.saveReportHeader({
                title: get('reportHeaderTitle'),
                coach: get('reportHeaderCoach'),
                date: get('reportHeaderDate'),
            });
            this.saveAIPrompt(get('reportHeaderAIPrompt'));
            this.saveAIDataNote(get('reportHeaderAIDataNote'));
            this.saveWatermark(this.collectWatermarkFromModal());
            const modal = document.getElementById('reportHeaderModal');
            if (modal) modal.classList.remove('open');
            this.renderWatermark();
            this.toast('已保存，报告头部已刷新');
            this.generate();
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

        // 教练评语 AI 要求提示词（全局设置，随数据包一起发送/复制）
        getAIPrompt() {
            const stored = localStorage.getItem('evalAIPrompt');
            return (stored && stored.trim()) ? stored : this.DEFAULT_AI_PROMPT;
        },
        saveAIPrompt(text) {
            localStorage.setItem('evalAIPrompt', text || '');
        },

        // 教练评语 AI 数据说明（全局设置，描述数据结构，随数据包一起发送/复制）
        DEFAULT_AI_DATA_NOTE: '以下为学员评估信息，各区块含义：\n- 学员信息：学员姓名、班级、教练、报告填写日期\n- 参赛记录：赛事、任务、得分（分）、用时（秒）、轮次、来源（正赛/模拟赛/自主训练）\n- 任务表现统计：各任务最佳分、练习次数、平均分、满分率、稳定性评级、综合评级\n- 量化评估（综合）：各维度/子维度 评分、参考值、同龄指数（= 评分÷参考值，超过100%表示高于同龄参考水平）\n- 现有教练评语：教练已填写的评语草稿（可为空）',
        getAIDataNote() {
            const stored = localStorage.getItem('evalAIDataNote');
            return (stored && stored.trim()) ? stored : this.DEFAULT_AI_DATA_NOTE;
        },
        saveAIDataNote(text) {
            localStorage.setItem('evalAIDataNote', text || '');
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
            const aiPrompt = this.getAIPrompt();
            const dataNote = this.getAIDataNote();
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

            // 模块二：训练数据分析（各任务表现，导出/预览显示）
            const taskChartHtml = `
                <div class="card report-preview-only" data-module="2" style="margin-top:0.75rem;">
                    <div id="taskCharts"></div>
                </div>`;

            // 模块三：量化评估细则（填写模式下可编辑：维度/子维度/细则 可增删改；结构可存为模板复用）
            const quantHtml = `
                <div class="card" data-module="3" style="margin-top:0.75rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">
                        <span style="font-size:0.98rem;font-weight:700;color:var(--gray-800);">📋 量化评估细则</span>
                        <span id="quantTotal" style="margin-left:auto;font-size:0.8rem;color:var(--gray-600);font-weight:600;"></span>
                        <button type="button" class="btn btn-sm btn-outline" id="quantAddDimBtn" title="在末尾新增一个维度（自动命名+配色）">＋ 新增维度</button>
                        <button type="button" class="btn btn-sm btn-outline" id="quantAddSubBtn" title="弹出选择父维度后新增子维度">＋ 新增子维度</button>
                        <button type="button" class="btn btn-sm btn-outline" id="quantResetDefaultBtn" title="把当前学员结构恢复为「内置默认」（维度一/二/三 · 子维度一/二/三）">↩ 恢复默认</button>
                        <span class="report-edit-only" style="display:inline-flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">
                            <span style="font-size:0.78rem;color:var(--gray-500);white-space:nowrap;">结构模板</span>
                            <select id="quantStructTpl" title="下拉选择模板；点「设为默认」把选中模板设为下次打开本系统时的默认模板；点「▶ 套用」才应用到当前学员" style="max-width:200px;padding:0.25rem 0.4rem;border:1px solid var(--gray-300);border-radius:var(--radius-sm);font-size:0.8rem;background:#fff;color:var(--gray-800);">
                                <option value="__default__">内置默认</option>
                            </select>
                            <button type="button" class="btn btn-sm btn-outline" id="quantTplSetDefault" title="把当前选中的模板设为默认：下次打开本系统时默认使用（内置默认=维度一/二/三 · 子维度一/二/三，用户不可修改）">设为默认</button>
                            <button type="button" class="btn btn-sm btn-outline" id="quantTplApply" style="display:none;" title="把所选用户模板应用到当前学员（替换其结构并清空已打分）">▶ 套用</button>
                            <button type="button" class="btn btn-sm btn-outline" id="quantTplSave" title="把当前整套结构存为可复用用户模板">💾 存为模板</button>
                            <button type="button" class="btn btn-sm btn-outline" id="quantTplDel" style="display:none;" title="删除选中的用户模板">🗑</button>
                        </span>
                        <button type="button" class="btn btn-sm btn-outline" id="quantResetBtn">🔄 重置</button>
                    </div>
                    <div class="report-edit-only" id="quantTplSaveRow" style="display:none;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.45rem;">
                        <span style="font-size:0.8rem;color:var(--gray-600);white-space:nowrap;">模板名称</span>
                        <input type="text" id="quantTplName" placeholder="如：机器人综合评估 V1" style="flex:1;min-width:160px;padding:0.3rem 0.5rem;border:1px solid var(--gray-300);border-radius:var(--radius-sm);font-size:0.82rem;" />
                        <button type="button" class="btn btn-sm btn-primary" id="quantTplSaveConfirm">✔ 保存</button>
                        <button type="button" class="btn btn-sm btn-outline" id="quantTplSaveCancel">取消</button>
                    </div>
                    <div id="quantTableContainer"></div>
                </div>`;

            // 模块一：综合预览（赛事经历 / 赛事规划 / 量化评估（综合）/ 教练评语）
            const competitionsHtml = this.renderCompetitions(student, trainings);
            const planHtml = this.renderCompetitionPlan(trainings);
            const quantSummaryHtml = this.buildQuantSummaryHtml(this.computeQuantSummary());
            // 赛事经历（左，预览/导出显示）+ 赛事规划（右，填写模式下可编辑）并排两栏
            const compColumns = [];
            if (competitionsHtml) compColumns.push(`
                    <div class="report-preview-only" style="flex:1;min-width:280px;">
                        <div class="overview-sec-title">🏆 赛事经历</div>
                        ${competitionsHtml}
                    </div>`);
            if (planHtml) compColumns.push(`
                    <div style="flex:1;min-width:220px;">
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

        // ============ 各任务表现折线图（每任务一张图，得分+用时双线，不标注数值） ============
        drawTaskChart(records, taskMap) {
            const container = document.getElementById('taskCharts');
            if (!container) return;

            // 按任务分组（保持记录先后顺序），仅保留有数据的任务
            const order = [];
            const seen = {};
            const series = {};
            const colors = ['#2563eb', '#f59e0b', '#10b981', '#7c3aed', '#ef4444', '#0891b2', '#65a30d'];
            const SCORE_COLOR = '#2563eb'; // 得分线统一蓝色实线
            const TIME_COLOR = '#64748b'; // 用时线统一灰色虚线
            records.forEach((rec) => {
                if (rec.score == null) return;
                const tid = rec.taskId;
                const task = taskMap[tid] || null;
                if (!seen[tid]) {
                    seen[tid] = true;
                    order.push(tid);
                    series[tid] = {
                        name: rec.taskName || (task ? task.name : tid),
                        color: colors[(order.length - 1) % colors.length],
                        points: [],
                        max: task ? (task.maxScore || null) : null,
                    };
                }
                series[tid].points.push({ score: rec.score, time: rec.time != null ? rec.time : null });
            });

            if (order.length === 0) {
                container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--gray-400);">暂无趋势数据</div>';
                return;
            }

            // 每个任务一块：左侧折线图 + 右侧数据统计（平均数 / 标准差）
            container.innerHTML = order.map((tid, i) => {
                const s = series[tid];
                const hasTime = s.points.some((p) => p.time != null);
                const scores = s.points.map((p) => p.score);
                const n = scores.length;
                const avg = n > 0 ? scores.reduce((a, b) => a + b, 0) / n : null;
                const std = n > 0 ? Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / n) : null;
                return `
                    <div class="task-chart-block" style="margin-top:0.75rem;">
                        <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--gray-700);font-weight:600;margin-bottom:0.25rem;flex-wrap:wrap;justify-content:space-between;">
                            <span style="display:inline-flex;align-items:center;gap:0.3rem;flex-wrap:wrap;">
                                <span style="display:inline-flex;align-items:center;gap:0.3rem;">
                                    <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${s.color};"></span>
                                    ${Shared.escapeHtml(s.name)}
                                </span>
                                <span style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:500;font-size:0.75rem;color:var(--gray-500);margin-left:0.75rem;">
                                    <span style="display:inline-block;width:12px;height:2px;background:${SCORE_COLOR};"></span> 得分
                                </span>
                                ${hasTime ? `<span style="display:inline-flex;align-items:center;gap:0.3rem;font-weight:500;font-size:0.75rem;color:var(--gray-500);">
                                    <span style="display:inline-block;width:12px;height:0;border-top:2px dashed ${TIME_COLOR};"></span> 用时
                                </span>` : ''}
                            </span>
                            <span style="font-size:0.78rem;color:var(--gray-400);font-weight:500;">数据统计</span>
                        </div>
                        <div style="display:flex;gap:1rem;align-items:stretch;">
                            <div class="task-chart-canvas" style="flex:1;min-width:0;height:180px;position:relative;border:1px solid var(--gray-100);border-radius:var(--radius-sm);background:var(--gray-50);">
                                <canvas data-task-index="${i}"></canvas>
                            </div>
                            <div style="width:180px;flex-shrink:0;border:1px solid var(--gray-100);border-radius:var(--radius-sm);background:var(--gray-50);padding:0.5rem 0.7rem;display:flex;flex-direction:column;justify-content:center;">
                                <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--gray-600);padding:0.25rem 0;">
                                    <span>平均数</span><span style="font-weight:600;color:var(--gray-800);">${avg != null ? avg.toFixed(1) : '—'}</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--gray-600);padding:0.25rem 0;">
                                    <span>标准差</span><span style="font-weight:600;color:var(--gray-800);">${std != null ? std.toFixed(1) : '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>`;
            }).join('');

            const allScores = order.reduce((a, tid) => a.concat(series[tid].points.map((p) => p.score)), []);
            const globalMax = allScores.length ? Math.max(...allScores) : 1;
            if (!this._chartResizeHandlers) this._chartResizeHandlers = {};

            order.forEach((tid, i) => {
                const s = series[tid];
                const canvas = container.querySelector(`canvas[data-task-index="${i}"]`);
                const wrap = canvas ? canvas.parentElement : null;
                if (!canvas || !wrap) return;
                const scoreNorm = (v) => {
                    const max = s.max || globalMax;
                    return max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
                };
                const times = s.points.map((p) => p.time).filter((t) => t != null);
                const maxT = times.length ? Math.max(...times) : null;
                const minT = times.length ? Math.min(...times) : null;
                const timeNorm = (t) => {
                    if (maxT == null || minT == null) return 1;
                    return maxT === minT ? 1 : Math.max(0, Math.min(1, (maxT - t) / (maxT - minT)));
                };

                const draw = () => {
                    const dpr = window.devicePixelRatio || 1;
                    const rect = wrap.getBoundingClientRect();
                    const W = Math.max(rect.width, 120);
                    const H = 180;
                    canvas.width = W * dpr;
                    canvas.height = H * dpr;
                    canvas.style.width = W + 'px';
                    canvas.style.height = H + 'px';
                    const ctx = canvas.getContext('2d');
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    ctx.clearRect(0, 0, W, H);

                    const padL = 16, padR = 16, padT = 14, padB = 14;
                    const cw = W - padL - padR, ch = H - padT - padB;

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
                    if (pts.length === 0) return;
                    const n = pts.length;
                    const xAt = (i2) => padL + (n === 1 ? cw / 2 : (i2 / (n - 1)) * cw);
                    const yAt = (v) => padT + (1 - v) * ch;

                    // 通用画线：得分线（实线）/ 用时线（虚线）
                    const drawLine = (getVal, color, dash) => {
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 2;
                        ctx.lineJoin = 'round';
                        ctx.lineCap = 'round';
                        if (dash) ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
                        ctx.beginPath();
                        let started = false;
                        pts.forEach((p, k) => {
                            const v = getVal(p);
                            if (v == null) return;
                            const x = xAt(k);
                            const y = yAt(v);
                            if (!started) { ctx.moveTo(x, y); started = true; }
                            else ctx.lineTo(x, y);
                        });
                        ctx.stroke();
                        ctx.setLineDash([]);

                        // 数据点
                        pts.forEach((p, k) => {
                            const v = getVal(p);
                            if (v == null) return;
                            const x = xAt(k);
                            const y = yAt(v);
                            ctx.beginPath();
                            ctx.arc(x, y, 3, 0, Math.PI * 2);
                            ctx.fillStyle = color;
                            ctx.fill();
                            ctx.strokeStyle = '#fff';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        });
                    };

                    // 先画用时线（统一灰色虚线，该任务有用时数据才画）
                    if (times.length) drawLine((p) => (p.time != null ? timeNorm(p.time) : null), TIME_COLOR, true);
                    // 再画得分线（统一蓝色实线，后绘制使其在重叠处位于上方）
                    drawLine((p) => scoreNorm(p.score), SCORE_COLOR, false);
                };

                if (this._chartResizeHandlers[tid]) window.removeEventListener('resize', this._chartResizeHandlers[tid]);
                this._chartResizeHandlers[tid] = draw;
                window.addEventListener('resize', this._chartResizeHandlers[tid]);
                draw();
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
        deleteStructureTemplate(name) {
            const all = this.getQuantStructTemplates();
            if (Object.prototype.hasOwnProperty.call(all, name)) {
                delete all[name];
                localStorage.setItem('evalQuantStructureTemplates', JSON.stringify(all));
            }
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
            this.saveQuantTemplate(t);
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
            const container = document.getElementById('quantTableContainer');
            if (!container) return;
            this._quantTemplate = this.getQuantTemplate();
            const template = this._quantTemplate || [];
            const saved = this.getQuantScores();
            const editable = this.viewMode !== 'preview';
            const inputBase = 'padding:0.2rem 0.3rem;border:1px solid var(--gray-300);border-radius:4px;font-size:0.85rem;';
            // 填写模式下列加宽以便编辑（预览/导出保持窄竖排）
            const dimW = editable ? 56 : 27;
            const subW = editable ? 56 : 28;
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
                            ? (editable
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
                            ? (editable
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
                        const critCell = editable
                            ? `<td><input type="text" class="quant-crit-text" data-dim="${di}" data-sub="${si}" data-ci="${cii}" value="${Shared.escapeHtml(c.name || '')}" placeholder="评价细则" style="width:100%;min-width:150px;${inputBase}"></td>`
                            : `<td style="color:var(--gray-700);">${c.name ? this.renderCriteriaText(c.name) : '—'}</td>`;
                        const refCell = editable
                            ? `<td style="text-align:center;"><input type="number" class="quant-ref" data-dim="${di}" data-sub="${si}" data-ci="${cii}" step="1" min="0" max="${this.MAX_SCORE}" value="${c.ref != null ? this.intRef(c.ref) : ''}" style="width:56px;text-align:center;${inputBase}appearance:textfield;-moz-appearance:textfield;"></td>`
                            : `<td style="text-align:center;color:var(--gray-600);">${c.ref != null ? this.intRef(c.ref) : '—'}</td>`;
                        const delCell = editable
                            ? `<td class="quant-op-col" style="text-align:center;width:40px;"><button type="button" class="quant-del" data-dim="${di}" data-sub="${si}" data-ci="${cii}" title="删除此细则" style="border:none;background:none;cursor:pointer;color:#ef4444;font-size:0.95rem;padding:0;">×</button></td>`
                            : '';
                        bodyRows += `<tr data-dim="${di}" data-sub="${si}" data-ci="${cii}" style="background:${rowBg};">
                            ${dimCell}
                            ${subCell}
                            ${critCell}
                            <td style="text-align:center;"><input type="number" class="quant-score" data-key="${key}" data-dim="${di}" min="0" max="${this.MAX_SCORE}" step="1" value="${val}" ${editable ? '' : 'readonly'} style="width:56px;text-align:center;${inputBase}appearance:textfield;-moz-appearance:textfield;"></td>
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
                            <th style="width:76px;text-align:center;">得分</th>
                            <th style="width:76px;text-align:center;">参考评分</th>
                            ${editable ? '<th class="quant-op-col" style="width:40px;"></th>' : ''}
                        </tr></thead>
                        <tbody>${bodyRows}</tbody>
                    </table>
                </div>`;
            container.querySelectorAll('.quant-score').forEach((inp) => {
                inp.addEventListener('input', () => this.recalcQuant());
                inp.addEventListener('change', () => this.recalcQuant());
            });
            if (editable) {
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
                        if (t && t[di]) { t[di].color = inp.value; this.saveQuantTemplate(t); }
                        this.initQuantTable();
                        this.refreshQuantSummary();
                    });
                });
                container.querySelectorAll('.quant-crit-text').forEach((inp) => {
                    inp.addEventListener('change', () => {
                        const t = this._quantTemplate;
                        if (t && t[Number(inp.dataset.dim)] && t[Number(inp.dataset.dim)].subs[Number(inp.dataset.sub)]) {
                            t[Number(inp.dataset.dim)].subs[Number(inp.dataset.sub)].criteria[Number(inp.dataset.ci)].name = inp.value.trim();
                            this.saveQuantTemplate(t);
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
                            this.saveQuantTemplate(t);
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
                            this.saveQuantTemplate(t);
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
                            this.saveQuantTemplate(t);
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
            this.recalcQuant();
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
            this.saveQuantTemplate(t);
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
            this.saveQuantTemplate(t);
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
            this.saveQuantTemplate(t);
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
            this.saveQuantTemplate(t);
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
            this.saveQuantTemplate(t);
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
