# Web 编码规范（HTML / CSS / JavaScript）

## 文件组织
- 页面命名: snake_case（如 stats.html / student.js）
- 每个页面一对: `<页面名>.html` + `<页面名>.js`
- 共享资源: style.css / header.js / shared.js，按依赖顺序加载（shared → header → 页面）
- 公共代码放入共享文件，禁止在页面内重复粘贴

## HTML
- 文档声明: `<!doctype html>` + `<html lang="zh-CN">`
- 缩进: 4 空格
- 自闭合标签: ` />`（如 `<meta charset="UTF-8" />`）
- 语义化标签优先: header / nav / main / section / footer
- 中文页面使用 UTF-8 字符集

## CSS
- 设计令牌: 颜色/圆角/阴影/过渡集中在 `:root` 变量（如 `--primary`、`--radius`）
- 命名: kebab-case，组件级可加 BEM（block__element--modifier）
- 颜色: 一律使用 CSS 变量，不写死十六进制
- 布局: 优先 flex / grid，避免浮动
- 选择器: 控制嵌套深度，避免过深后代选择器

## JavaScript
- 模块: 全局命名空间对象（如 `Shared`），避免污染全局作用域
- 命名: camelCase（变量/函数），PascalCase（构造函数/命名空间）
- 缩进: 4 空格
- 引号: 单引号优先
- 声明: `const` / `let`，不用 `var`
- 分节注释: `// ============ Section ============`
- 页面脚本: 通过 id 绑定事件，禁止内联 onclick

## 数据层
- 持久化: localStorage / IndexedDB，统一经 shared 层封装访问
- 序列化: JSON.parse / JSON.stringify 走统一入口
- 迁移: 遗留字段迁移逻辑集中在专用模块（如 migration.js），不在页面散落
- 错误处理: try/catch + console.warn，不静默吞错

## 验证
- JS 语法检查: `node --check <file>.js`
- 浏览器控制台: 无未捕获异常、无 404、无重复报错
- 多页面回归: 页面切换后数据一致，刷新后状态保留

## 测试
- 测试位置: test/ 目录
- 优先纯函数单测（可 node 直接运行）
- 页面交互: 手动清单 + 控制台验证

## 分层约束
- shared.js: 数据层与工具，不直接操作 DOM
- header.js: 公共导航，不包含业务逻辑
- 各页面 js: 只处理本页 DOM 与业务，不跨页直接读写
- 数据变更统一走 shared 层接口，页面间不互相持有引用
