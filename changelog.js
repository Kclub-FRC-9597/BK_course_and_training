// =================================================================
//  Changelog — 修订记录（功能层）
//  记录本系统的版本修订历史（新的在前）
//  布局依赖 header.js；加载顺序：shared.js → shared_indexdb.js → header.js → changelog.js
// =================================================================
if (!window.ChangelogApp) {
const ChangelogApp = {
    CHANGES: [
        { date: '2026-08-11', tag: '新增', type: 'feat', title: '新增 about 独立入口', desc: 'header 右侧新增 about 独立入口：正文为工具说明；原放置在后台的修订记录（changelog）移入 about 显示' },
        { date: '2026-08-11', tag: '优化', type: 'refactor', title: '统一 header 按钮显示样式', desc: '统一 header 按钮显示样式：分类 tab / 自主训练 / about 采用一致三态（普通 / 悬停 / 激活）' },
        { date: '2026-08-11', tag: '新增', type: 'feat', title: '新增目标设定', desc: '集训新增「目标设定」弹窗（全局 / 个体页签），可配置目标档位；个体默认沿用全局档位；已结束集训（含正赛）不显示目标' },
        { date: '2026-08-11', tag: '优化', type: 'refactor', title: '集训成绩显示：用时 / 得分位置对调', desc: '集训页成绩统一改为「用时在前、得分在后」：用时为主显示（粗体主色），得分以「分」为单位作为次要信息；覆盖最佳成绩概览、综合最佳、记录行与统计行' },
        { date: '2026-08-10', tag: '新增', type: 'feat', title: '任务满分用时目标（目标档位 + 当前目标）', desc: '移除「目标设定」记录类型；任务可配置目标时间档位（如 100/80/70s，满分前提达成）；集训概览与个人成绩卡显示「当前目标」（下一档更快目标）与达标徽章；个人成绩卡支持 模拟练习/自主训练/整合 切换；学员可按任务覆盖目标档位' },
        { date: '2026-08-07', tag: '新增', type: 'feat', title: '学生独立成绩录入页（stu_tool）', desc: '新增成绩录入独立页面，首次进入需设定姓名，之后直接进入录入；数据本设备独立保存，可导出 CSV 交给老师汇总' },
        { date: '2026-08-07', tag: '新增', type: 'feat', title: '成绩录入：得分默认满分 + 自动记录时间', desc: '录入支持任务类型（基础/随机）+ 得分（默认填满分，快捷录入）+ 用时，提交自动记录时间；修改已提交成绩不改变原记录时间' },
        { date: '2026-08-07', tag: '新增', type: 'feat', title: '失误点标注（点选多选 + 自定义）', desc: '录入时可选失误点：drop失败/取环丢环/机器死机失控/车旋转角度过大/车前进距离太大/对柱不准/对环不准，支持多选；也可手动输入其他失误类型' },
        { date: '2026-08-07', tag: '新增', type: 'feat', title: '成绩分析（满分区间/满分率/失误率）', desc: '成绩录入页顶部提供分析：满分预测区间（满分用时平均±标准差）、满分率、失误率；失误=未满分/未填用时/用时明显偏多（满分样本≥8条时用中位数×1.5判定），基础/随机分开统计' },
        { date: '2026-08-07', tag: '新增', type: 'feat', title: '顶部导航新增「成绩录入」学员入口', desc: 'header 右侧独立入口直达成绩录入页，方便学员快速进入' },
        { date: '2026-08-07', tag: '新增', type: 'feat', title: '个人成绩卡：来源切换 + 自主训练录入', desc: '成绩卡支持按来源查看（正赛/模拟赛/自主训练/全部）；新增自主训练录入与练习记录列表，可导出/导入' },
        { date: '2026-08-07', tag: '优化', type: 'refactor', title: '成绩录入卡片高亮', desc: '录入成绩卡片改为暖橙高亮背景与边框，作为页面重点，方便学生快速定位' },
        { date: '2026-08-01', tag: '优化', type: 'refactor', title: '主站「赛事」改为登录后显示', desc: '未登录时隐藏导航赛事入口、主页 Scouting 工具区与页脚工具列，访问仍由路由拦截' },
        { date: '2026-08-01', tag: '新增', type: 'feat', title: '修订记录按日期分组折叠', desc: '修订记录按日期分组展示，支持按日期展开/折叠' },
        { date: '2026-08-01', tag: '修复', type: 'fix', title: '集训成绩录入后主内容不自动刷新', desc: '关闭成绩录入弹窗后即时刷新主内容，成绩/排名无需手动刷新页面' },
        { date: '2026-08-01', tag: '优化', type: 'refactor', title: '拆分新增班级 / 新增学员卡片', desc: '避免同一行输入框与按钮混淆，各卡片职责单一' },
        { date: '2026-08-01', tag: '新增', type: 'feat', title: '学员视图切换（按班级 / 按学员）', desc: '按学员视图平铺展示「学员 | 所属班级」，可点击班级快速改班' },
        { date: '2026-08-01', tag: '重构', type: 'refactor', title: '班级管理 + 学员管理合并为教务管理', desc: '单页展示，学员按班级分组折叠，含空班与「待分班」虚拟分组，班级可直接删除' },
        { date: '2026-08-01', tag: '新增', type: 'feat', title: '数据迁移页', desc: '数据备份 / 跨设备同步（localStorage 导出/导入）统一入口' },
        { date: '2026-08-01', tag: '新增', type: 'feat', title: '开发者工具页', desc: '存储引擎切换 + STS_DB 数据库管理独立成页，移出数据迁移页' },
        { date: '2026-08-01', tag: '优化', type: 'refactor', title: '集训详情「编辑学员」更名「设置」', desc: '按钮实为集训参数配置，标题更名避免误导' },
        { date: '2026-08-01', tag: '优化', type: 'refactor', title: '主站右上角改为「开放工具」', desc: '移除 MAKEX 外链，保留 Inspire 入口' },
        { date: '2026-08-01', tag: '优化', type: 'refactor', title: '移除 header 开发提示与统计条', desc: '精简头部，保留常驻数据存储提示' },
    ],

    init() {
        this.render();
    },

    escapeHtml(str) { return Shared.escapeHtml(str); },

    render() {
        const container = document.getElementById('changelogList');
        if (!container) return;
        const typeColor = { feat: '#dbeafe', fix: '#fee2e2', refactor: '#fef3c7' };
        const typeText = { feat: '#1d4ed8', fix: '#b91c1c', refactor: '#92400e' };
        const collapsedDates = this.getCollapsedDates();

        // 按日期分组（CHANGES 已按新在前排序）
        const groups = [];
        const groupMap = new Map();
        this.CHANGES.forEach((c) => {
            if (!groupMap.has(c.date)) {
                const g = { date: c.date, items: [] };
                groupMap.set(c.date, g);
                groups.push(g);
            }
            groupMap.get(c.date).items.push(c);
        });

        const html = groups.map((g) => {
            const collapsed = collapsedDates.has(g.date);
            const itemsHtml = g.items.map((c) => {
                const bg = typeColor[c.type] || 'var(--gray-100)';
                const color = typeText[c.type] || 'var(--gray-600)';
                return `<div class="changelog-item">
                    <span class="changelog-tag" style="background:${bg};color:${color};">${this.escapeHtml(c.tag)}</span>
                    <div class="changelog-body">
                        <div class="changelog-title">${this.escapeHtml(c.title)}</div>
                        <div class="changelog-desc">${this.escapeHtml(c.desc)}</div>
                    </div>
                </div>`;
            }).join('');
            return `<div class="changelog-group" data-date="${this.escapeHtml(g.date)}">
                <div class="changelog-date-header" title="点击展开/折叠">
                    <span class="changelog-arrow">${collapsed ? '▶' : '▼'}</span>
                    <span class="changelog-date-label">${this.escapeHtml(g.date)}</span>
                    <span class="changelog-date-count">${g.items.length} 条</span>
                </div>
                <div class="changelog-group-body${collapsed ? ' collapsed' : ''}">${itemsHtml}</div>
            </div>`;
        }).join('');
        container.innerHTML = `<div class="changelog">${html}</div>`;

        // 日期头点击展开/折叠
        container.querySelectorAll('.changelog-date-header').forEach((h) => {
            h.addEventListener('click', () => this.toggleDate(h.closest('.changelog-group')));
        });
    },

    // ---- 日期折叠状态（localStorage 持久化） ----
    getCollapsedDates() {
        try {
            const raw = localStorage.getItem('changelog_collapsed_dates');
            return new Set(raw ? JSON.parse(raw) : []);
        } catch (e) { return new Set(); }
    },
    saveCollapsedDates(set) {
        localStorage.setItem('changelog_collapsed_dates', JSON.stringify([...set]));
    },
    toggleDate(groupEl) {
        const date = groupEl.dataset.date;
        const body = groupEl.querySelector('.changelog-group-body');
        const arrow = groupEl.querySelector('.changelog-arrow');
        const collapsed = groupEl.classList.toggle('collapsed');
        if (body) body.classList.toggle('collapsed', collapsed);
        if (arrow) arrow.textContent = collapsed ? '▶' : '▼';
        const set = this.getCollapsedDates();
        if (collapsed) set.add(date); else set.delete(date);
        this.saveCollapsedDates(set);
    },
};

window.ChangelogApp = ChangelogApp;
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ChangelogApp.init());
} else {
    window.ChangelogApp.init();
}
