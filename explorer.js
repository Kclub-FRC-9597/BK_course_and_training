// =================================================================
//  Explorer — MAKEX EXPLORER（开发中占位）
//  布局依赖 header.js；加载顺序：shared.js → shared_indexdb.js → header.js → explorer.js
// =================================================================
if (!window.ExplorerApp) {
const ExplorerApp = {
    init() {
        Shared.loadData();
    },
};

window.ExplorerApp = ExplorerApp;
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ExplorerApp.init());
} else {
    window.ExplorerApp.init();
}
