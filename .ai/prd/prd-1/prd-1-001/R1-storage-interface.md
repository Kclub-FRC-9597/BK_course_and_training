---
id: R1
prd: prd-1-001
title: 存储接口抽象
acceptance: |
  定义统一存储接口（Storage Adapter），ls / idb 引擎实现同一接口；
  Shared 数据层只依赖接口，不直接操作 localStorage/IndexedDB；
  接口设计预留第三方数据库 / 小型数据服务器后端（server 适配器）扩展；
  新增后端只需实现接口，不改 Shared 与页面代码。
proposal: |
  按 prd-1-design.md「存储接口抽象层」实现：
  1) 定义接口契约：init/readAll/writeAll/readState/writeState/verify/name
  2) 实现 LSAdapter 与 IDBAdapter；Shared 通过当前引擎 adapter 读写
  3) 提供 adapter 注册/选择机制，预留 ServerAdapter
status:
  prd: done
  plan: pending
  implement: pending
  test: pending
  review: pending
---

# R1 — 存储接口抽象

## 现状
- shared.js 直接读写 localStorage；shared_indexdb.js 提供 IDB 函数
- 引擎逻辑与业务耦合，新增后端需改 Shared 与页面

## 目标
定义统一存储接口，ls/idb 实现同一契约，未来可平滑接入第三方数据库 / 数据服务器。

## 细化描述

### 1. 接口契约（StorageAdapter）
```js
{
  name: 'ls' | 'idb' | 'server',   // 后端标识
  init(): Promise,                  // 初始化/连接
  readAll(table): Promise<Array>,   // 读整表
  writeAll(table, records): Promise<boolean>, // 写整表（覆盖式）
  readState(key): Promise<any>,
  writeState(key, value): Promise<boolean>,
  verify(snapshot): Promise<{pass, steps}>,
}
```

### 2. 适配器实现
- `LSAdapter`：localStorage `makexScoreData`（JSON 快照，兼容现有）
- `IDBAdapter`：STS_DB 各 object store（配合 R4）
- `ServerAdapter`：**预留**（未来小数据服务器 HTTP），本期只定义契约不实现

### 3. Shared 接入
- `Shared.storage` 指向当前引擎 adapter；`loadData/saveData` 走接口
- `sts_storage_mode` 决定用哪个 adapter（联动 R2 默认引擎）

## 验收对照
- Shared 代码中无直接 `localStorage.setItem/getItem` 与 `indexedDB.open`（除 adapter 内部）
- 新增一个模拟 server adapter 只需实现接口，Shared/页面零改动（可在 devtools 验证）
