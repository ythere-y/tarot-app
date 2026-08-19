# 抽牌结果牌名字体恢复设计

## 目标

把抽牌完成后显示的牌名恢复为旧版截图中的粗体等宽衬线风格，同时保留当前神谕编辑风界面的其余字体、布局、颜色和动画。

## 范围

- 只修改 `#result-title` 的字体与字重。
- 字体栈使用 `'Courier New', Courier, monospace`，字重使用 `bold`，与旧版样式和参考截图一致。
- 不修改牌义、AI 解读、历史记录、标题、按钮或状态区域的字体。
- 不修改 Three.js 场景、抽牌逻辑、动画时序或响应式字号。

## 实现

在 `index.html` 当前生效的 `#result-title` 规则中，将 `font-family` 从 `Georgia, 'Times New Roman', serif` 改为 `'Courier New', Courier, monospace`，并将 `font-weight` 从 `400` 改为 `bold`。保留现有字号、行高、间距和发光阴影，使变化仅限字形。

## 验证

- 增加一个静态回归断言，确认生效的 `#result-title` 规则使用 `'Courier New', Courier, monospace` 和粗体。
- 运行完整 `npm test`，确认现有抽牌、服务端和动效测试不受影响。
- 检查 Git 差异，确认实现只涉及牌名字体和对应测试。
