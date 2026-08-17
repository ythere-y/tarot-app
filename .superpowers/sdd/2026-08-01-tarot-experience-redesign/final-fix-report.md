# Tarot Experience Redesign 最终修复报告

- 日期：2026-08-02
- 工作树：`D:\VS_code\project\tarot-app\.worktrees\tarot-redesign`
- 修复基线：`8bf3d0430dd3bb27723de64ee6f85e0d1f8fde9a`
- 实现提交：`fd6b441`（`fix: resolve final tarot review findings`）
- 发布结论：有条件通过。代码、自动化测试、依赖锁文件和仓库内合规文档已完成；真实设备/浏览器验收和素材权利确认仍是发布前外部门禁。

## 审查项处理

### 1. 页面隐藏期间的手势计时与 HOLDING 状态

- 根因：原来的 `visibilitychange` 只暂停渲染场景，没有重置手势稳定器、驻留计时、滤波状态或手势锁存；因此隐藏时间可能被算入 500 ms 握拳和 300 ms 张手驻留。
- 修复：隐藏与恢复时统一重置稳定器、滤波器、当前手势和 UI 进度。隐藏时若处于 `HOLDING`，通过现有场景释放流程安全归还卡牌，避免视觉对象和状态机不同步。
- RED：新增隐藏跨越握拳计时、隐藏跨越张手驻留、隐藏时释放 `HOLDING` 的集成测试，修复前均失败。
- GREEN：隐藏时间不再计入驻留；恢复后必须重新满足完整 500 ms/300 ms；`HOLDING` 能安全回到可继续选择的状态。

### 2. 摄像头运行时模型错误的输入模式切换

- 根因：运行时 `onError` 直接把输入模式改成指针，没有经过摄像头停止、手势重置和持牌释放流程。
- 修复：启动失败和运行时失败统一进入 `handoffCameraFailure`/`stopGestureInput` 路径；停止引擎、废弃过期回调、重置识别状态、切换指针模式，并安全释放正在持有的卡牌。
- RED：新增“运行时模型错误发生于 `HOLDING`”测试，修复前摄像头未停止且卡牌未释放。
- GREEN：失败后进入指针模式，摄像头停止，手势状态清零，卡牌可继续用其他输入方式选择。

### 3. 解读 Provider 合同

- 请求合同调整为 `question?`、`locale: 'zh-CN'`，保留 `cardId`、`orientation`、`topic` 扩展字段。
- 响应合同调整为 `title`、`summary`、`guidance`、`source: 'standard' | 'ai'`，并保留卡牌关联字段。
- `LocalProvider` 和 UI 已迁移到新字段，标准本地结果明确返回 `source: 'standard'`。
- RED：精确字段和文案断言在旧实现上失败。
- GREEN：所有主题与正逆位组合均通过精确 `title`、`summary`、`guidance`、`source` 测试；可选问题不会改变本地标准结果。

### 4. 核心抽牌区域键盘可访问性

- 新增可聚焦、带语义和阶段化 `aria-label` 的核心抽牌按钮。
- Enter/Space 复用同一应用状态机和场景方法完成：选牌 → 放置 → 确认 → 归档，没有建立独立捷径状态。
- 锁定阶段按钮禁用；解锁后仅在用户原先聚焦该控件且焦点未被主动移动时恢复焦点，避免抢焦点。
- RED：原 UI 不存在可聚焦核心控制，也无法用键盘推进状态机；真实 Chrome smoke 还暴露了按钮在 `REVEALING` 禁用后焦点丢失的问题。
- GREEN：Enter 和 Space、锁定、焦点恢复、完整键盘抽牌流程均有自动化覆盖。

### 5. 官方 npm registry 锁文件

- 在隔离的临时目录中以 `https://registry.npmjs.org` 全量重建 `package-lock.json`，没有删除或覆盖工作树中其他内容。
- 扫描结果：248 个包条目均含 `resolved` 与 `integrity`；248 个 URL 全部指向 `registry.npmjs.org`；无 npmmirror、淘宝或 cnpm URL。
- `npm ci --registry=https://registry.npmjs.org` 和官方 registry 的 `npm audit` 均通过。

### 6. 外部平台验收状态

以下项目没有被声明为已通过，仍保留为发布前人工门禁：

- 真实摄像头设备；
- Firefox；
- Edge；
- iOS/macOS Safari；
- Android Chrome。

仓库自动化仅证明当前机器已安装 Chrome 上的强制 2D 键盘流程和静态资源 HTTP 可达性。

## 次要项处理

- 手势 UI 改为显示稳定帧与驻留时间合成的真实连续进度，不再只有 0/1。
- 摄像头授权区和页脚附近均明确提示“摄像头仅在本地处理，不上传”。
- 新增 `npm run acceptance:smoke`：构建后用临时本地 HTTP 服务逐个校验 `dist` 文件，再用已安装 Chrome 强制走 2D 渲染，执行完整 Enter/Space 键盘抽牌流程，并检查页面错误、请求失败和外部请求。
- `package.json` 作者更新为 `Fengfengex`。
- 新增 MIT `LICENSE` 和 `THIRD_PARTY_NOTICES`。通知准确区分：
  - 项目原创代码与文档：MIT；
  - `@mediapipe/tasks-vision` 包及仓库内复制的 WASM 运行时：上游声明 Apache-2.0；
  - 手势模型文件：仓库未记录来源 URL、版本或单独资产许可证，需所有者确认；
  - 78 张牌面 JPEG 和封面：来源、作者、版权与许可证未记录，需所有者确认。

MIT 声明不扩展覆盖未确认权利的模型或图像素材。

## RED → GREEN 证据

首次针对性运行：

```text
npm run test:run -- tests/gestures/stabilizer.test.ts tests/interpretation/local-provider.test.ts tests/app/integration.test.ts tests/ui/app-view.test.ts
```

- RED：23 个失败，分别覆盖旧 Provider 字段、隐藏计时、隐藏/运行时 `HOLDING` 释放、键盘流程、手势进度和隐私文案缺口。
- GREEN：同一组 4 个测试文件共 68 个测试通过。
- 随后补充隐藏跨越 300 ms 张手驻留和 Chrome 焦点回归测试；最终完整套件共 17 个测试文件、180 个测试通过。

## 最终验证

```text
npm ci --registry=https://registry.npmjs.org
```

- 通过；安装 198 个包，审计 199 个包，0 个漏洞。
- npm 输出了 esbuild 构建脚本策略提示，但没有导致安装或验证失败。

```text
npm audit --registry=https://registry.npmjs.org --audit-level=low
```

- 通过；0 个漏洞。

```text
npm run check
```

- 通过：lint、类型检查、17 个测试文件/180 个测试、生产构建全部成功。

```text
npm run acceptance:smoke
```

- 通过：87 个 `dist` 文件全部返回 HTTP 200；Chrome 在强制 2D 模式完成键盘抽牌、确认和归档流程；无页面错误、失败请求或外部来源请求。

```text
git diff --check
```

- 通过，无空白错误。

独立代码复核没有发现 Critical 问题；唯一 Important 意见是检查清单曾保留旧测试数量。清单已更新为重新运行所得的 17 个文件/180 个测试。

## 尚未解决的发布门禁

1. 真实摄像头设备及 Firefox、Edge、Safari、Android Chrome 的人工验收需要外部设备/环境，仓库自动化不能替代。
2. 模型文件和牌面/封面图像的来源、版权与再分发许可需要仓库所有者提供并确认；确认前不应把这些素材视为由项目 MIT 许可证覆盖。

这两项不阻塞代码提交，但阻塞“无条件可发布”的结论。
