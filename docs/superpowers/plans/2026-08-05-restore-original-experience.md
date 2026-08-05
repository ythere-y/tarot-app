# Ether Tarot 初版体验恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复由用户手掌或指针水平移动驱动的初版抽牌体验，彻底移除牌阵的时间驱动自动旋转，同时保留当前模块化架构、完整牌组、正逆位、牌义、粒子、历史和降级能力。

**Architecture:** `layoutCarousel` 改为消费显式相位，不再读取墙钟时间；`TarotScene` 持有牌阵相位和标准化水平输入，并在渲染帧中按输入积分角度；应用层根据稳定手势、抽牌阶段和指针事件向场景发送统一旋转输入。UI 只呈现初版直接流程，不拥有旋转或抽牌规则。

**Tech Stack:** TypeScript、Vite、Vitest、Three.js、MediaPipe Tasks Vision、CSS

## Global Constraints

- 页面加载后牌阵必须静止。
- 只有允许浏览的阶段和明确的水平输入才允许旋转。
- `OPEN` 控制手势旋转；`PINCH`、`FIST`、`UNKNOWN`、`LOST` 和摄像头故障必须停止旋转。
- 抓牌、放置、揭示、阅读和归档期间牌阵保持冻结。
- 指针模式必须复用同一个 `setCarouselInput(horizontal)` 场景接口。
- 不加入惯性、回弹、自动巡航或新的运行时依赖。
- 保留 78 张不放回、正逆位、五类牌义、粒子、历史、键盘、二维降级和本地 MediaPipe 资源。
- 所有新行为必须先写失败测试，再写最小实现。
- 不执行远程推送、Issue 更新、PR 或部署。

---

### Task 1: 将牌阵布局从时间驱动改为显式相位

**Files:**
- Modify: `src/scene/card-carousel.ts`
- Modify: `tests/scene/card-carousel.test.ts`

**Interfaces:**
- Consumes: `ids: readonly string[]`、`phaseRadians: number`、`CarouselLayoutOptions`
- Produces: `layoutCarousel(ids, phaseRadians, options): CarouselTransform[]`
- `CarouselLayoutOptions` 保留 `radiusX`、`radiusZ`；删除 `speedRadiansPerSecond`

- [ ] **Step 1: 写入“时间不再自动改变布局”的失败测试**

在 `tests/scene/card-carousel.test.ts` 中把现有时间参数语义改成相位语义，并添加：

```ts
it('keeps the carousel still while the explicit phase is unchanged', () => {
  const ids = Array.from({ length: 12 }, (_, index) => `card-${index}`);

  expect(layoutCarousel(ids, 0)).toEqual(layoutCarousel(ids, 0));
});

it('rotates in opposite directions for positive and negative phase', () => {
  const ids = Array.from({ length: 12 }, (_, index) => `card-${index}`);
  const center = layoutCarousel(ids, 0)[0]!;
  const right = layoutCarousel(ids, 0.2)[0]!;
  const left = layoutCarousel(ids, -0.2)[0]!;

  expect(right.position.z).toBeGreaterThan(center.position.z);
  expect(left.position.z).toBeLessThan(center.position.z);
});
```

同时修改旧测试，使第二个参数表示弧度而不是毫秒。

- [ ] **Step 2: 运行聚焦测试并确认旧时间语义失败**

Run:

```powershell
npx vitest run tests/scene/card-carousel.test.ts
```

Expected: FAIL，因为当前实现仍将第二个参数除以 1000 并乘以自动转速。

- [ ] **Step 3: 实现纯显式相位布局**

将接口改为：

```ts
export interface CarouselLayoutOptions {
  readonly radiusX: number;
  readonly radiusZ: number;
}

export function layoutCarousel(
  ids: readonly string[],
  phaseRadians: number,
  options: CarouselLayoutOptions = DEFAULT_CAROUSEL_LAYOUT,
): CarouselTransform[] {
  const phase = Number.isFinite(phaseRadians) ? phaseRadians : 0;
  // 其余角度、位置、旋转和缩放计算保持不变。
}
```

紧凑布局继续忽略相位，避免少量余牌发生不必要运动。

- [ ] **Step 4: 运行聚焦测试**

Run:

```powershell
npx vitest run tests/scene/card-carousel.test.ts
```

Expected: PASS，布局只由牌组和显式相位决定。

- [ ] **Step 5: 本地提交**

```powershell
git add src/scene/card-carousel.ts tests/scene/card-carousel.test.ts
git commit -m "refactor: make tarot carousel phase explicit"
```

### Task 2: 在 Three.js 场景中实现无惯性的水平旋转输入

**Files:**
- Modify: `src/scene/tarot-scene.ts`
- Modify: `src/scene/quality.ts`
- Modify: `tests/scene/tarot-scene.test.ts`

**Interfaces:**
- Consumes: `setCarouselInput(horizontal: number)`
- Produces: `carouselPhase`、标准化 `carouselInput` 和帧间隔积分
- `horizontal` 必须限制在 `-1..1`；非有限值抛出 `RangeError`

- [ ] **Step 1: 写入静止、方向、停止和暂停的失败测试**

扩展测试帧控制器，保存 `requestFrame` 回调并手动推进时间：

```ts
scene.setCards(makeCards(12).map(({ id }) => id));
scene.setCarouselInput(0);
frames.step(0);
frames.step(1_000);
expect(scene.carouselAngle).toBe(0);

scene.setCarouselInput(1);
frames.step(1_100);
expect(scene.carouselAngle).toBeGreaterThan(0);

const stoppedAt = scene.carouselAngle;
scene.setCarouselInput(0);
frames.step(1_200);
expect(scene.carouselAngle).toBe(stoppedAt);
```

另测：

```ts
expect(() => scene.setCarouselInput(Number.NaN)).toThrow(RangeError);
scene.setSuspended(true);
scene.setCarouselInput(1);
scene.setSuspended(false);
frames.step(10_000);
expect(scene.carouselAngle).toBe(stoppedAt);
```

- [ ] **Step 2: 运行场景测试并确认接口缺失**

Run:

```powershell
npx vitest run tests/scene/tarot-scene.test.ts
```

Expected: FAIL，因为 `setCarouselInput` 和只读 `carouselAngle` 尚不存在。

- [ ] **Step 3: 实现场景旋转状态**

在 `TarotScene` 中加入：

```ts
private carouselPhase = 0;
private carouselInput = 0;
private previousRenderTime: number | undefined;

get carouselAngle(): number {
  return this.carouselPhase;
}

setCarouselInput(horizontal: number): void {
  this.assertUsable();
  if (!Number.isFinite(horizontal)) {
    throw new RangeError('Carousel input must be finite');
  }
  this.carouselInput = clamp(horizontal, -1, 1);
}
```

渲染帧使用：

```ts
const deltaSeconds =
  this.previousRenderTime === undefined
    ? 0
    : Math.min(Math.max(time - this.previousRenderTime, 0), 100) / 1_000;
this.previousRenderTime = time;

if (this.selectedId === null && this.order.length > 7) {
  this.carouselPhase +=
    this.carouselInput * this.quality.carouselRadiansPerSecond * deltaSeconds;
}
this.applyCarouselLayout();
```

`setSuspended(true)`、`dispose()` 和恢复时清空 `previousRenderTime`。`pickCard()` 成功时把 `carouselInput` 归零。`setCards()` 和归档后继续保留当前相位，避免牌阵跳回初始角度。

在 `SceneQuality` 中增加桌面/移动/减少动态效果对应的 `carouselRadiansPerSecond`，建议分别为 `1.15`、`0.9`、`0.55`。

- [ ] **Step 4: 运行场景与质量测试**

Run:

```powershell
npx vitest run tests/scene/tarot-scene.test.ts tests/scene/card-carousel.test.ts
```

Expected: PASS；静止、正反方向、停止、暂停和抓牌冻结均通过。

- [ ] **Step 5: 本地提交**

```powershell
git add src/scene/tarot-scene.ts src/scene/quality.ts tests/scene
git commit -m "feat: drive tarot rotation from horizontal input"
```

### Task 3: 将稳定手势和指针事件接入统一旋转接口

**Files:**
- Modify: `src/app/app.ts`
- Modify: `tests/app/integration.test.ts`
- Modify: `tests/app/resilience.test.ts`

**Interfaces:**
- Extends: `TarotScenePort.setCarouselInput(horizontal: number): void`
- Consumes: 稳定 `GestureKind`、`PointerPoint.x`、`DrawPhase`
- Produces: `-1..1` 的旋转输入；中心死区为 `0.08`

- [ ] **Step 1: 写入手势驱动和停止条件的失败集成测试**

在 `FakeScene` 中记录：

```ts
readonly carouselInputs: number[] = [];

setCarouselInput(horizontal: number): void {
  this.carouselInputs.push(horizontal);
}
```

新增测试：

```ts
engine.emit(openFrameAt({ x: 0.8 }));
expect(scene.carouselInputs.at(-1)).toBeGreaterThan(0);

engine.emit(openFrameAt({ x: 0.5 }));
expect(scene.carouselInputs.at(-1)).toBe(0);

engine.emit(pinchFrameAt({ x: 0.8 }));
expect(scene.carouselInputs.at(-1)).toBe(0);

engine.emitLost();
expect(scene.carouselInputs.at(-1)).toBe(0);
```

另测摄像头错误、切换指针模式、页面隐藏、开始抓牌和应用销毁都会发送 `0`。

- [ ] **Step 2: 运行集成与韧性测试并确认接口未调用**

Run:

```powershell
npx vitest run tests/app/integration.test.ts tests/app/resilience.test.ts
```

Expected: FAIL，`carouselInputs` 为空或最后输入没有归零。

- [ ] **Step 3: 实现手势旋转映射**

在应用层加入纯辅助函数：

```ts
export function carouselInputFromPointer(
  x: number,
  deadZone = 0.08,
): number {
  const offset = clamp(x, 0, 1) - 0.5;
  if (Math.abs(offset) <= deadZone) {
    return 0;
  }
  const magnitude = (Math.abs(offset) - deadZone) / (0.5 - deadZone);
  return Math.sign(offset) * clamp(magnitude, 0, 1);
}
```

`handleGestureFrame` 只在稳定手势为 `OPEN` 且阶段为 `CAROUSEL` 时调用非零输入。使用镜像后的现有指针坐标，因此屏幕方向与手掌移动方向一致；若人工验收方向相反，只在该映射边界翻转符号，不修改场景数学。

所有停止路径统一调用：

```ts
scene?.setCarouselInput(0);
```

停止路径包括 `PINCH`、`FIST`、`UNKNOWN`、`LOST`、相机错误、指针模式切换、页面隐藏、场景重建、开始抓牌和销毁。

- [ ] **Step 4: 实现指针浏览**

指针模式下：

- `pointermove` 且没有活动抓牌时，根据水平位置发送旋转输入；
- `pointerleave`、`pointerdown`、`pointerup`、`pointercancel` 和 `lostpointercapture` 发送 `0`；
- 当前已处于 `HOLDING` 时，`pointermove` 只移动卡牌，不旋转牌阵；
- 键盘推进始终发送 `0`。

绑定和清理 `pointerleave` 监听器时沿用现有 `bind`/`dispose` 生命周期。

- [ ] **Step 5: 运行应用聚焦测试**

Run:

```powershell
npx vitest run tests/app/integration.test.ts tests/app/resilience.test.ts
```

Expected: PASS；OPEN 左右移动、中心停止和所有失效路径均有确定性断言。

- [ ] **Step 6: 本地提交**

```powershell
git add src/app/app.ts tests/app/integration.test.ts tests/app/resilience.test.ts
git commit -m "feat: control tarot carousel with open palm"
```

### Task 4: 恢复初版直接界面文案并完成回归验收

**Files:**
- Modify: `src/ui/copy.ts`
- Modify: `src/ui/app-view.ts`
- Modify: `src/ui/styles.css`
- Modify: `tests/ui/app-view.test.ts`
- Modify: `tests/app/integration.test.ts`
- Modify: `README.md`
- Modify: `docs/development/LOCAL_DEVELOPMENT_ROADMAP.md`

**Interfaces:**
- Consumes: 现有 `AppViewModel`
- Produces: 初版直接控制提示、输入状态、余牌、中央结果和历史
- 不改变 draw store、scene 或 interpretation 接口

- [ ] **Step 1: 写入初版控制提示的失败 UI 测试**

新增断言：

```ts
expect(view.host.textContent).toContain('张开手掌，左右移动牌阵');
expect(view.host.textContent).toContain('捏合抓牌');
expect(view.host.textContent).toContain('握拳确认');
expect(view.host.textContent).toContain('剩余卡牌');
```

同时保留并重新运行摄像头重试、鼠标/触摸切换、历史缩略图、逆位和键盘可访问性测试。

- [ ] **Step 2: 运行 UI 测试并确认旧文案失败**

Run:

```powershell
npx vitest run tests/ui/app-view.test.ts
```

Expected: FAIL，因为当前界面仍使用新版仪式化引导文案。

- [ ] **Step 3: 调整界面和样式**

- 顶部控制区保留输入切换、摄像头状态、当前手势和余牌。
- 场景引导固定显示三个短步骤：`张开手掌，左右移动牌阵`、`捏合抓牌`、`握拳确认`。
- 结果出现前隐藏空的牌义面板；确认后在中央显示牌名、正逆位和当前主题牌义。
- 历史继续位于左下或移动端底部，并保留真实缩略图方向。
- 删除暗示牌阵会自动巡航的文案。
- CSS 减少持续装饰动画，但保留焦点、错误、加载、粒子和 reduced-motion 样式。

- [ ] **Step 4: 更新本地文档**

README 的操作流程明确写为：

```text
OPEN 左右移动 → PINCH 抓牌 → FIST 确认 → 粒子归档
```

在 `LOCAL_DEVELOPMENT_ROADMAP.md` 增加“初版体验恢复”阶段和验证命令，不引用 GitHub Issue 或远程状态。

- [ ] **Step 5: 运行完整自动化门禁**

Run:

```powershell
npm run check
npm run acceptance:smoke
```

Expected:

- ESLint 退出 0；
- 全部 Vitest 测试通过；
- TypeScript 和 Vite 构建通过；
- 生产烟雾测试请求全部本地资源成功；
- 键盘二维降级抽牌循环继续通过。

- [ ] **Step 6: 启动本地人工验收**

Run:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

人工检查：

- 页面加载后牌阵静止；
- OPEN 左右移动才旋转；
- 手掌停止即停止；
- PINCH 后牌阵冻结并拖动卡牌；
- FIST 只确认一次；
- 鼠标模式可完成等价流程；
- 正逆位、牌义、粒子、历史和余牌继续正确。

- [ ] **Step 7: 本地提交**

```powershell
git add src/ui tests/ui tests/app README.md docs/development
git commit -m "feat: restore original gesture-first tarot experience"
```

## 最终本地完成标准

- [ ] `git status --short` 只包含明确保留的本地变更或为空。
- [ ] `npm run check` 最新运行退出 0。
- [ ] `npm run acceptance:smoke` 最新运行退出 0。
- [ ] 本地浏览器完成人工验收。
- [ ] 不执行 `git push`、GitHub Issue 更新、PR 创建或部署。
