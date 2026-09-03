---
id: R3
prd: prd-1-001
title: 手动同步
acceptance: |
  手动触发将 localStorage 数据同步到 IDB，含 legacy 转换（groups→classes/enrollments、
  scheduleOrder→schedule、groupId 剥离、practiceRecords 补 round）；
  按表顺序写入（students/classes/enrollments/tasks/trainings/state）；
  同步后调用 verify 校验并展示结果；幂等可重复执行；不删除 localStorage 源数据。
proposal: |
  1) migration.html 增加「手动同步到 IDB」按钮，复用现有迁移转换逻辑
  2) 同步流程按 prd-1-design.md「三、手动同步流程」执行
  3) 同步后调 _verifyIDB() 展示通过/差异
status:
  prd: done
  plan: pending
  implement: pending
  test: pending
  review: pending
---

# R2 — 手动同步

## 现状
- migration.html 已有手动迁移流程，但 IDB 仅三表，无法覆盖 tasks/trainings
- legacy 转换逻辑内嵌在 shared.js `loadData` 中，未复用

## 目标
手动将 localStorage 全量数据同步到 IDB，含 legacy 转换与校验。

## 细化描述

### 1. 同步入口（migration.html / migration.js）
- 新增「手动同步到 IDB」按钮 → 读 localStorage → legacy 转换 → 按表写入 → verify

### 2. 转换复用
- 将 shared.js `loadData` 内的 legacy 转换逻辑抽出为可复用函数（如 `_convertLegacy(raw)`），migration 与 loadData 共用

### 3. 幂等与安全
- keyPath 覆盖写，可重复同步；同步不删除 localStorage
- 任一步失败 → 提示并停止，已写部分可重跑（幂等）

### 4. 结果展示
- 复用 `_verifyIDB()`：通过 / 差异列表展示

## 验收对照
- 有旧数据时同步后 devtools verify 全表一致
- 重复同步不产生重复数据
