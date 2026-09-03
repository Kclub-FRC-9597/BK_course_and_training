---
id: prd-1-design
prd: prd-1
title: 双引擎架构与手动同步方案
status: draft
summary: 开发前期双引擎（idb/ls）架构：默认引擎配置、数据库结构 v2、手动同步流程与工具页适配。
---

# prd-1-design — 双引擎架构与手动同步方案

## 一、双引擎架构

### 引擎模型
- 两个存储后端：`ls`（localStorage，现状主存储）与 `idb`（IndexedDB STS_DB）
- 全局默认引擎：`sts_storage_mode`（localStorage key）→ 可选值 `ls` / `idb`
- 加载时按默认引擎读取数据填 `Shared.data`；保存时写入默认引擎
- 开发前期：双引擎并行，手动同步保持两边一致；**不删除任一引擎**

### 存储接口抽象（Storage Adapter）
> 核心架构约束：后期将引入第三方数据库 / 小型数据服务器，因此存储层必须接口分离，Shared 与页面只依赖接口，不直接操作具体后端。

统一接口契约：
```js
interface StorageAdapter {
  name: 'ls' | 'idb' | 'server';
  init(): Promise;
  readAll(table): Promise<Array>;
  writeAll(table, records): Promise<boolean>;
  readState(key): Promise<any>;
  writeState(key, value): Promise<boolean>;
  verify(snapshot): Promise<{ pass, steps }>;
}
```

| 适配器 | 后端 | 状态 |
|---|---|---|
| `LSAdapter` | localStorage `makexScoreData` | 本期实现 |
| `IDBAdapter` | STS_DB 各 object store | 本期实现（配合 R4） |
| `ServerAdapter` | 第三方数据库 / 小数据服务器（HTTP） | **预留**，仅定义契约 |

- `Shared.storage` 指向当前引擎 adapter；`sts_storage_mode` 决定使用哪个
- 新增后端只需实现接口并注册，Shared / 页面零改动

### 默认引擎配置
- 提供设置入口（devtools「引擎设置」）：选择默认 `ls` 或 `idb`，写入 `sts_storage_mode`
- 首次进入无配置 → 默认 `ls`（兼容现有行为）
- 切换默认引擎后，下次加载按新引擎读数据

## 二、目标数据库结构（STS_DB v2）

**数据库名**: `STS_DB`
**版本**: `2`（从现有未声明版本的 v1 升级而来）

| Object Store | keyPath | 索引 | 记录结构 |
|---|---|---|---|
| `students` | `id` | — | `{ id, name }` |
| `classes` | `id` | — | `{ id, name }` |
| `enrollments` | `id` | `by_student`(studentId) / `by_class`(classId) / `by_status`(status) | `{ id, studentId, classId, status, leftAt? }` |
| `tasks` | `id` | — | `{ id, name, type, maxScore?, goalTimes? }` |
| `trainings` | `id` | — | 整文档（mockCompetitions / practiceRecords / studentGoals） |
| `state` | `key` | — | key-value：`{ key, value }` |

> v1（现状 3 表）→ v2：只增 `tasks` / `trainings` / `state`，不改旧表 keyPath/索引，保证兼容。

### trainings 文档结构（整文档存储）

```js
{
  id: string,
  name: string,
  date: 'YYYY-MM-DD',
  studentIds: string[],
  tasks: [{ taskId, rounds }],
  mockCompetitions: [{
    id, name, date,
    competitionType,        // 'mock' | 'official' | ...
    type,                   // roundType 'single' | ...
    tasks: [{ taskId, rounds }],
    scores: { studentId: { taskId: { round1: {score,time}, ... } } },
    rankings: {},
    comments: {},
    group: 'senior' | 'junior',
    participantCount: number|null,
    schedule?: { list, roundId }   // 历史迁移字段，可选
  }],
  practiceRecords: [{ id, date, studentId, taskId, round, score, time? }],
  studentGoals: [{ id, studentId, taskId, goalTimes }]
}
```

### state 表键约定（key-value）

| key | 类型 | 说明 |
|---|---|---|
| `currentTrainingId` | string\|null | 当前集训 id |
| `challengeTaskFilter` | string\|null | 挑战任务筛选 |
| `migrated` | boolean | 同步/迁移标记（预留） |

## 三、手动同步流程（LS → IDB）

```text
入口: migration.html「手动同步到 IDB」按钮（或 devtools 同步按钮）
  ↓
① 读 localStorage makexScoreData（parsed）
② legacy 转换（与现 loadData 一致）：
   - rawGroups → classes + enrollments
   - scheduleOrder → 各 mock.schedule
   - students 剥离 groupId/group
   - practiceRecords 补 round
③ 按表顺序写 IDB：students → classes → enrollments → tasks → trainings → state
④ 调用 _verifyIDB() 校验：逐字段对比 LS 与 IDB
⑤ 展示结果（通过 / 差异列表）
```

- 同步为**手动触发**，不自动执行
- 同步不删除 localStorage 源数据（可反复同步）
- 幂等：keyPath 覆盖写，重复执行不重复插入

## 四、引擎读取/保存规则

| 场景 | 行为 |
|---|---|
| 加载 | 按 `sts_storage_mode` 读：`idb` → 全表 getAll 填 data；`ls` → 读 makexScoreData |
| 保存 | 按默认引擎写对应后端；写入失败降级到另一引擎并提示 |
| 手动同步 | 独立于默认引擎，始终 LS → IDB |
| 跨标签页 | 保留现有 storage 事件联动（基于 localStorage） |

## 五、风险与注意
- 双引擎数据可能不一致 → 以手动同步 + verify 校验保证
- 开发前期不删 localStorage，同步后仍保留备份
- 异步改造集中在 loadData/saveData 与同步入口，页面渲染逻辑尽量不动
