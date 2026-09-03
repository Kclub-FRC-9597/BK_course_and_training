---
id: R4
prd: prd-1-002
title: 数据库层补齐
acceptance: |
  STS_DB 版本 = 2；建齐 students/classes/enrollments/tasks/trainings/state 六表；
  onupgradeneeded 从 v1 升 v2 只增表不重复建；
  提供各表读写封装；IDB 不可用时降级并提示。
proposal: |
  按 prd-1-design.md「二、目标数据库结构」在 shared_indexdb.js 实现：
  1) DB_VERSION = 2，onupgradeneeded 判重后新增 tasks/trainings/state
  2) trainings 整文档存储；state keyPath 'key' 的 key-value 表
  3) 新增各表读写封装；保留 enrollments 索引
  4) open 失败 resolve null，调用方降级到 ls
status:
  prd: done
  plan: pending
  implement: pending
  test: pending
  review: pending
---

# R3 — 数据库层补齐

## 现状
- `_DB_VERSION = undefined`，仅 students/classes/enrollments 三表

## 目标
补齐 v2 六表 + 版本管理，支撑手动同步覆盖全部数据类型。

## 细化描述

### 1. 版本与建表（shared_indexdb.js `_initIDB`）
- 新增 `S._DB_VERSION = 2`，`indexedDB.open('STS_DB', 2)`
- `onupgradeneeded`：对每个表先 `contains()` 判重，只补新建 `tasks` / `trainings` / `state`
- `trainings` keyPath `'id'` 整文档；`state` keyPath `'key'`

### 2. 读写封装（shared_indexdb.js）
- `_readTasksFromIDB()` / `_writeTasksToIDB(tasks)`
- `_readTrainingsFromIDB()` / `_writeTrainingsToIDB(trainings)`
- `_readStateFromIDB(key)` / `_writeStateToIDB(key, value)`
- 复用现有 students/classes/enrollments 读写

### 3. 降级策略
- `indexedDB.open` onerror → resolve null → 调用方回退 ls；`console.warn`

## 验收对照
- devtools 表管理显示 6 张表；升级后旧 3 表数据仍在
- IDB 禁用时页面仍可用（走 ls 兜底）
