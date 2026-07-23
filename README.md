# Algo Training Journal

这是一个**只做一件事**的项目：  
队员通过 `git commit`（或 VS Code 的提交按钮）提交训练日志 Markdown，GitHub Pages 自动展示：

- 近 365 天训练热力图
- 近 30 天训练频率
- 近 30 天来源统计（平台）
- 近 30 天难度统计（可选）
- 全部训练记录列表

## 1) 队员如何提交

每位队员只维护自己的目录：

```text
logs/<你的名字>/YYYY-MM-DD.md
```

例如：

```text
logs/廖夏/2026-07-23.md
```

## 2) 日志格式（固定）

```md
# 2026-07-23

## 题目
P1001 A+B Problem

## 平台
洛谷

## 难度
入门

## 收获
今天学会了……
```

其中 `## 难度` 可留空，不填会显示为 `未标注`。

## 3) 提交方式

```bash
git pull
# 编辑 logs/<你的名字>/YYYY-MM-DD.md
git add logs/
git commit -m "训练: 2026-07-23"
git push
```

也可以直接用 VS Code Source Control 可视化提交。

## 4) GitHub Pages 部署

本仓库已配置 GitHub Actions 自动部署。  
首次启用时在仓库设置里确认：

- `Settings -> Pages -> Build and deployment -> Source = GitHub Actions`

之后每次 push 到 `main/master` 会自动更新页面。
