# Changelog

本项目的所有重要变更都会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 维护规则

- 每次发布新版本前，必须更新本文件。
- 开发中的变更先记录到 `Unreleased`。
- 发布时，将 `Unreleased` 中的内容移动到新的版本标题下，并补充发布日期。
- 版本标题格式：`## [x.y.z] - YYYY-MM-DD`。
- 分类优先使用：`Added`、`Changed`、`Fixed`、`Removed`、`Security`。

## [Unreleased]

## [0.1.0] - 2026-04-26

### Added

- 支持最多 16 张参考图，按 OpenAI Images edits 的多图参考能力提交。
- 支持上传本地 PNG、JPEG、WebP 图片作为参考图。
- 支持从已生成图片继续添加到参考图列表。
- 支持在会话列表中通过右键菜单进行置顶和删除操作。

### Changed

- 优化参考图预览、移除和清空交互。
- 优化移动端输入栏底部布局，避免左下角拥挤和遮挡。
- 优化 PC 端输入栏底部布局，保持操作按钮横向排列。
- 将 Next.js 开发模式指示器移动到右上角，减少移动端遮挡。

### Fixed

- 修复侧边栏会话长标题导致内容显示不完整的问题。
- 修复历史消息中参考图资源加载不完整的问题。
