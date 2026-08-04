# Ether Tarot 本地开发路线图

## 文档目的

本文档是 Ether Tarot 的本地开发与验收依据。后续开发不依赖 GitHub Issue 状态，也不自动执行远程推送、Issue 更新或 Pull Request 操作。

当前开发基线：

- 分支：`feature/tarot-redesign`
- 开发目录：`.worktrees/tarot-redesign`
- 产品方向：中文优先、单牌占卜、完整 78 张 Rider–Waite 牌组
- 输入方式：手势、鼠标、触摸与键盘
- 运行方式：纯静态 Vite 应用，不依赖远程牌义或运行时 CDN

## 本地工作原则

1. 所有功能先在本地实现并验证。
2. 新功能或缺陷修复必须先添加能够失败的测试，再编写实现。
3. 每个阶段完成后运行聚焦测试和 `npm run check`。
4. 发布候选版本额外运行 `npm run acceptance:smoke`。
5. 未经明确要求，不推送分支、不创建 PR，也不修改远程 Issue。
6. 自动化仿真不能替代真实摄像头、真实手机和目标浏览器的人工验收。

## 阶段状态

### 阶段 1：工程基线

状态：**已完成**

实现内容：

- 迁移到 Vite 与 TypeScript。
- 配置 Vitest、ESLint 和生产构建。
- 建立 `src/`、`tests/`、本地资源和质量检查命令。
- 将 MediaPipe 模型与 WASM 资源准备为同源静态文件。

主要提交：

- `48ea624 build: migrate tarot app to Vite and TypeScript`
- `0ddd1a5 chore: ignore generated build artifacts`

验收：

```powershell
npm ci
npm run check
```

### 阶段 2：完整塔罗数据

状态：**已完成**

实现内容：

- 建立 22 张大阿卡那和 56 张小阿卡那的数据记录。
- 每张牌包含中英文名称、图片、正逆位关键词，以及综合、爱情、事业、财富和成长牌义。
- 校验总数、分组、唯一 ID、唯一图片和全部必填牌义。

主要代码：

- `src/tarot/types.ts`
- `src/tarot/cards.ts`
- `src/tarot/validate.ts`
- `tests/tarot/cards.test.ts`

主要提交：

- `7ba1b6b feat: add complete Rider-Waite card meanings`

### 阶段 3：抽牌状态机

状态：**已完成**

实现内容：

- 使用纯状态转换管理选牌、持牌、放置、揭示、阅读和归档。
- 78 张牌不放回抽取。
- 只在归档完成后减少余牌并写入历史。
- 支持注入随机数和完整重置。

主要代码：

- `src/draw/draw-machine.ts`
- `src/draw/draw-store.ts`
- `tests/draw/`

主要提交：

- `a7a7260 feat: add deterministic tarot draw state machine`

### 阶段 4：本地牌义服务

状态：**已完成**

实现内容：

- 使用可替换的 `InterpretationProvider` 边界。
- 当前实现完全读取本地标准牌义，不调用网络，也不接收 API Key。
- 支持综合、爱情、事业、财富和成长五类主题。

主要代码：

- `src/interpretation/types.ts`
- `src/interpretation/local-provider.ts`
- `tests/interpretation/`

主要提交：

- `a4db20d feat: add replaceable local interpretation provider`

### 阶段 5：稳定手势管线

状态：**已完成**

实现内容：

- 实现张开、捏合、握拳、未知和丢失状态分类。
- 使用连续帧、滞回、停留时间、丢失宽限和指数平滑降低误触。
- 标签页隐藏或模型错误时安全重置。
- 摄像头轨道和 MediaPipe 生命周期可清理。

主要代码：

- `src/gestures/`
- `tests/gestures/`

主要提交：

- `bafc59c feat: add stable MediaPipe gesture pipeline`
- `9b0f30d fix: harden gesture stability and engine lifecycle`
- `e6a466e fix: reset gesture dwell after expired loss grace`

### 阶段 6：Three.js 场景

状态：**已完成**

实现内容：

- 实现椭圆卡牌轮盘、悬停、拿取、返回和中央揭示。
- 正位与逆位牌面使用不同变换。
- 实现归档粒子和减少动态效果模式。
- WebGL 不可用时可以切换至二维降级体验。

主要代码：

- `src/scene/`
- `tests/scene/`

主要提交：

- `3d64b8e feat: build cinematic tarot carousel and reveal`
- `f6c9cc7 fix: harden tarot scene visibility and archiving`

### 阶段 7：中文响应式界面

状态：**已完成**

实现内容：

- 中文为主要文案，英文牌名作为辅助信息。
- 显示余牌、摄像头状态、手势进度、牌义主题和历史缩略图。
- 支持键盘焦点、实时状态区域、减少动态效果和移动布局。
- 摄像头失败时提供重试与鼠标/触摸入口。

主要代码：

- `src/ui/`
- `tests/ui/`

主要提交：

- `851fb5c feat: add bilingual celestial tarot interface`
- `026d1aa fix: preserve accessible tarot UI state`

### 阶段 8：完整应用组合

状态：**已完成**

实现内容：

- 将状态机、手势引擎、Three.js 场景、界面和牌义服务组合为完整应用。
- 手势、鼠标、触摸和键盘共享同一抽牌规则。
- 动画完成后才推进状态，避免重复揭示或重复归档。
- 页面隐藏、恢复和销毁时释放监听器、媒体流与渲染资源。

主要代码：

- `src/app/`
- `src/main.ts`
- `tests/app/`

主要提交：

- `7020a5e feat: compose complete gesture-first tarot flow`
- `254e0c6 fix: harden tarot app lifecycle recovery`

### 阶段 9：性能与异常恢复

状态：**已完成**

实现内容：

- 优先加载牌背并按需加载牌面。
- 限制像素比、粒子数量和手势推理频率。
- 处理摄像头拒绝、无设备、模型失败、图片失败和 WebGL 失败。
- 防止失败图片产生无界重试。

主要提交：

- `c21d98d perf: harden tarot loading and runtime fallbacks`
- `f9db96b fix: stop speculative face retry loops`

### 阶段 10：静态部署与发布文档

状态：**本地配置已完成**

实现内容：

- 提供 GitHub Pages 工作流配置。
- 提供 Vercel 静态构建配置。
- README 记录本地运行、同源模型、操作方式和部署步骤。
- 增加许可证与第三方资源声明文件。

主要文件：

- `.github/workflows/deploy-pages.yml`
- `vercel.json`
- `README.md`
- `LICENSE`
- `THIRD_PARTY_NOTICES`

主要提交：

- `21136db ci: add static deployment and release guide`

说明：配置已在本地完成；本文档不授权实际远程部署。

### 阶段 11：发布验收

状态：**自动化已完成，真实设备待人工补签**

已完成：

- 完整自动化测试与生产构建。
- 78 张确定性不重复抽取。
- 第 79 次抽牌阻止与重置。
- 鼠标、键盘、触摸仿真、摄像头拒绝和 WebGL 降级。
- 慢速牌面、减少动态效果和同源静态资源检查。
- 生产构建全部文件的 HTTP 烟雾验证。

证据：

- `docs/testing/2026-08-01-release-checklist.md`
- `scripts/verify-acceptance.mjs`
- `8bf3d04 test: record tarot release acceptance`
- `f762252 docs: record final tarot fix verification`

## 本地验证命令

完整质量门禁：

```powershell
npm ci
npm run check
```

生产烟雾验收：

```powershell
npm run acceptance:smoke
```

本地开发：

```powershell
npm run dev
```

生产预览：

```powershell
npm run build
npm run preview
```

## 尚未完成的人工门禁

- [ ] 使用真实桌面摄像头完成一次完整手势抽牌。
- [ ] 在目标 Edge 和 Firefox 版本验证鼠标、键盘、权限拒绝与资源加载。
- [ ] 在真实 iOS Safari 验证触摸、横竖屏变化和页面恢复。
- [ ] 如果支持 Android，在真实 Android Chrome 验证完整触摸流程。
- [ ] 核实 MediaPipe 模型和 79 张塔罗 JPEG 的来源、再分发权、署名与许可。

在上述事项完成前，只能表述为“自动化发布门禁通过”，不能声称完成全部跨设备物理验收或拥有全部第三方资源发布授权。
