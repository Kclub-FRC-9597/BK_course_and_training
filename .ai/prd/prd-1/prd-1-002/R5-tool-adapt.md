---
id: R5
prd: prd-1-002
title: 工具页适配
acceptance: |
  devtools 支持引擎设置（R2）、手动同步触发（R3）、全表 verify（六表）；
  migration 页保留手动迁移/导入，提供「同步到 IDB」入口，可重复执行；
  表管理 UI 与 v2 六表结构一致。
proposal: |
  1) devtools.js：引擎设置 UI、同步按钮、_verifyIDB 改六表对比
  2) migration.js：适配双引擎，提供同步与重建入口
status:
  prd: done
  plan: pending
  implement: pending
  test: pending
  review: pending
---

# R4 — 工具页适配

## 现状
- devtools 已有引擎切换 + verify（三表）
- migration 已有手动迁移流程

## 目标
工具页适配双引擎 + 手动同步 + 全表校验。

## 细化描述

### 1. devtools.js
- 引擎设置 UI（联动 R2）：radio ls/idb + 保存，显示当前引擎
- 「手动同步到 IDB」按钮（联动 R3）
- 表管理 UI 与 v2 六表一致；`_verifyIDB()` 改六表逐字段对比

### 2. migration.js
- 同步入口（联动 R2）；保留导入/重建；已同步可重复执行

## 验收对照
- devtools 一键同步 + verify 六表通过
- 切换引擎设置后刷新生效
