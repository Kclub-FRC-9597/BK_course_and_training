// =================================================================
//  Entry App — 工具中心统一入口
//  集中维护全站页面入口清单，新增工具页只需在 TOOLS 中追加一项。
// =================================================================
const EntryApp = {
    // ============ Tool Registry ============
    // 每个工具: { id, title, desc, href, icon, group, badge? }
    // group: 'competition' 赛事 | 'education' 教务 | 'tools' 工具（可扩展）
    // 新增工具页：在此追加一项即可，页面自动渲染。
    TOOLS: [
        // ---- 赛事（统一入口） ----
        { id: 'makex', title: 'MAKEX Inspire', desc: '赛事统一入口：集训 / 成绩 / 任务 / 展示', href: 'stats.html', icon: '🏆', group: 'competition' },
        { id: 'explorer', title: 'MAKEX EXPLORER', desc: '开发中', href: 'explorer.html', icon: '🚧', group: 'competition', badge: '开发中' },

        // ---- 教务 ----
        { id: 'admin', title: '教务管理', desc: '班级 / 学员 / 数据导入导出', href: 'admin.html', icon: '🏫', group: 'education' },
        { id: 'student', title: '个人成绩卡', desc: '学生个人成绩与目标', href: 'student.html', icon: '👤', group: 'education' },
        { id: 'stu_tool', title: '自主训练', desc: '学生自助录入练习成绩', href: 'stu_tool.html', icon: '🎯', group: 'education' },
        { id: 'evaluation', title: '评估管理', desc: '训练评估报告 / 量化评估 / 导出 PDF', href: 'evaluation.html', icon: '📝', group: 'education' },

        // ---- 工具（预留扩展） ----
        { id: 'about', title: '关于', desc: '本工具说明与修订记录', href: 'about.html', icon: 'ℹ️', group: 'tools' },
    ],

    // ============ Group Meta ============
    GROUPS: {
        competition: { label: '🏆 赛事', sub: 'MAKEX Inspire 统一入口' },
        education: { label: '📚 教务', sub: '管理 / 学生 / 数据' },
        tools: { label: '🧰 工具', sub: '附加工具页' },
    },

    // ============ Init ============
    init() {
        this.render();
    },

    // ============ Render ============
    render() {
        const container = document.getElementById('entryGroups');
        if (!container) return;

        const order = ['competition', 'education', 'tools'];
        container.innerHTML = order.map(groupKey => {
            const meta = this.GROUPS[groupKey];
            const items = this.TOOLS.filter(t => t.group === groupKey);
            const cards = items.map(t => this.cardHtml(t)).join('');

            return `
                <div class="entry-group">
                    <div class="entry-group-header">
                        <span class="entry-group-label">${meta.label}</span>
                        <span class="entry-group-sub">${meta.sub}</span>
                    </div>
                    <div class="entry-grid">
                        ${cards}
                    </div>
                </div>`;
        }).join('');
    },

    // ============ Card Html ============
    cardHtml(t) {
        const badge = t.badge ? `<span class="entry-card-badge">${t.badge}</span>` : '';
        return `
            <a class="entry-card" href="${t.href}"${t.id === 'display' ? ' target="_blank" rel="noopener"' : ''}>
                <span class="entry-card-icon">${t.icon}</span>
                <span class="entry-card-title">${t.title}</span>
                ${badge}
                <span class="entry-card-desc">${t.desc}</span>
            </a>`;
    },
};

// =================================================================
//  Boot
// =================================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EntryApp.init());
} else {
    EntryApp.init();
}
