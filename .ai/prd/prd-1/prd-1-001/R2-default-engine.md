---
id: R2
prd: prd-1-001
title: 默认引擎选择
acceptance: |
  提供默认引擎设置（idb/ls），持久化到 sts_storage_mode；首次无配置默认 ls；
  加载时按默认引擎读取数据填 Shared.data，保存按默认引擎写入；
  切换默认引擎后新加载/保存生效。
proposal: |
  1) 定义默认值常量 DEFAULT_ENGINE = 'ls'，_getEngine() 无配置时返回默认
  2) devtools 新增「引擎设置」入口：选择 ls/idb 写入 sts_storage_mode
  3) loadData/saveData 按默认引擎分支（idb 分支配合 R4 全表读写）
status:
  prd: done
  plan: pending
  implement: pending
  test: pending
  review: pending
---

# R1 — 默认引擎选择

## 现状
- `sts_storage_mode` 已有（无配置默认 'ls'），但无设置入口，默认硬编码
- `_getEngine()` 返回 localStorage 值或 'ls'

## 目标
支持选择默认使用 idb 还是 ls，持久化并在加载/保存时生效。

## 细化描述

### 1. 默认值配置（shared_indexdb.js）
- 新增 `S.DEFAULT_ENGINE = 'ls'` 常量
- `_getEngine()`：无配置（key 不存在或非法值）时返回 `DEFAULT_ENGINE`

### 2. 设置入口（devtools.html / devtools.js）
- 新增「引擎设置」区：radio `ls` / `idb` + 保存按钮 → `Shared._setEngine(mode)`
- 显示当前引擎；切换后提示「下次加载生效」

### 3. 加载/保存分支（shared.js）
- `loadData()`：engine === 'idb' → 全表 getAll 填 data；否则读 localStorage `makexScoreData`
- `saveData()`：按默认引擎写对应后端；写入失败降级到另一引擎并 `console.warn`

## 验收对照
- devtools 切换默认引擎 → 刷新后按新引擎读取
- 首次访问（无 sts_storage_mode）默认 ls，行为与现状一致
