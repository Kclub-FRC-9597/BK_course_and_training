---
id: prd-1
title: 存储层双引擎支持
tags: [indexeddb, storage, dual-engine, sync]
status: draft               # draft → approved
approved_by: null
approved_date: null
summary: 开发前期支持将 localStorage 数据手动同步到 IndexedDB，并提供默认引擎（idb/ls）选择，为后续 IDB 迁移打基础。
structure:
  - type: sub
    path: prd-1-001/
    title: 引擎与同步
  - type: sub
    path: prd-1-002/
    title: 数据库层与工具
---

# prd-1 — 存储层双引擎支持

## 背景
项目数据当前以 localStorage（`makexScoreData`）为主，`shared_indexdb.js` 已有部分 IndexedDB 支持（students/classes/enrollments 三表 + `sts_storage_mode` 引擎切换）。开发前期需要：手动将数据同步到 IDB，并能选择默认引擎（idb/ls），为后续完整迁移 IDB 打基础。

## 目标
- 提供**默认引擎选择**：默认使用 `idb` 或 `ls`，可配置、持久化、加载时生效
- 提供**手动同步**：将 localStorage 数据手动同步到 IDB（含 legacy 转换），不自动执行、不删源数据
- **存储接口抽象**：ls / idb 实现统一存储接口，Shared 只依赖接口；预留第三方数据库 / 小型数据服务器后端
- 数据库层补齐（v2 六表 + 版本管理），保证同步覆盖全部数据类型
- 工具页（devtools/migration）适配引擎选择与手动同步流程

## 设计方案
- 双引擎架构、存储接口抽象、默认引擎配置、数据库结构 v2、手动同步流程见 **prd-1-design.md**

## 决策记录
- 目标模式：开发前期双引擎（idb/ls），非 IDB 唯一源（用户确认）
- 同步方式：手动同步 LS→IDB，非全自动迁移（用户确认）
- 默认引擎：支持选择默认使用 idb 或 ls（用户确认）
- 接口分离：存储层必须接口抽象，后期引入第三方数据库/数据服务器（用户确认）
