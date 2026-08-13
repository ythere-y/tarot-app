# Natural Card Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将抽出牌面的重滤镜调整为自然印刷感，并通过软高光压缩保留浅色细节。

**Architecture:** 保留现有 ShaderMaterial 和 sRGB 纹理流程，只调整正面材质的饱和度、对比度，并在片元着色器末端加入逐通道软高光压缩。冒烟测试锁定视觉参数与处理顺序。

**Tech Stack:** Three.js ShaderMaterial、GLSL、Node.js `node:test`。

## Global Constraints

- 饱和度固定为 `1.04`，对比度固定为 `1.06`。
- 高光压缩只作用于牌面正面最终 RGB，不改变 alpha。
- 不修改牌背、灯光、粒子、手势和正逆位逻辑。

---

### Task 1: 自然牌面色彩

**Files:**
- Modify: `tests/smoke/app-smoke.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: 现有 `cardTexture`、`saturation`、`contrast` uniforms。
- Produces: `saturation=1.04`、`contrast=1.06` 和 GLSL `softClipped` 最终颜色。

- [ ] **Step 1: 修改冒烟测试**，断言新参数及 `softClipped` 高光压缩表达式存在，并删除旧参数断言。
- [ ] **Step 2: 运行 `node --test tests/smoke/app-smoke.test.mjs`**，确认因页面仍为 `1.25/1.15` 而失败。
- [ ] **Step 3: 修改 `index.html`**，设置 `1.04/1.06`，在对比度处理后以 `contrasted / (1.0 + max(contrasted - 0.92, 0.0) * 1.6)` 压缩高光，再 clamp 输出。
- [ ] **Step 4: 运行冒烟测试和 `npm test`**，确认全部通过。
- [ ] **Step 5: 提交**，提交信息为 `style: tune card art to natural print color`。
- [ ] **Step 6: 重启本地服务并请求首页**，确认 HTTP 200 后提供 `http://localhost:8090` 试用。
