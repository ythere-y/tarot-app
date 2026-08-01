# Ether Tarot 首次发布验收清单

验收日期：2026-08-02（Asia/Singapore）

验收结论：**有条件通过**。本机能够执行的自动化、生产构建、HTTP 资源和 Chrome 仿真矩阵均通过；物理摄像头与真实移动设备仍需发布负责人补签。

## 验收环境

- Windows，Node.js 24.18.1，npm 11.16.0。
- 桌面浏览器：Google Chrome 150.0.7871.187，Playwright headless。
- 移动浏览器：Pixel 7 / Android 14 / Chrome 143 设备描述符，触屏与粗指针仿真；不是物理设备。
- 摄像头：Chrome fake-media 640×480 流与浏览器权限拒绝场景；不是物理摄像头。
- 生产预览：`http://127.0.0.1:4173/`。

## 自动化发布门禁

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `npm ci` | 通过 | 退出码 0；安装 197 个包；审计 0 个漏洞。当前 PowerShell 起初未包含 Node 安装目录，临时把 `C:\Program Files\nodejs` 加入 `PATH` 后按原命令执行。npm 输出 esbuild `allowScripts` 提示，但安装和后续构建均成功。 |
| `npm run check` | 通过 | ESLint、Vitest、TypeScript 与 Vite 构建全部退出 0。最终复核为 17 个测试文件、169 个测试全部通过。 |
| `npm run build` | 通过 | TypeScript 检查和 Vite 生产构建退出 0。 |

## 78 张确定性会话

使用注入的确定性随机序列驱动真实 `DrawStore` 状态机完成 78 个完整的选择、确认、翻面、阅读、归档循环。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 无重复牌 | 通过 | 78 次归档得到 78 个唯一 `cardId`。 |
| 余牌仅在归档后递减 | 通过 | 选择、揭示、阅读和归档进行中保持原计数；`ARCHIVE_COMPLETE` 后严格从 77 递减到 0。 |
| 逆位牌面 | 通过 | 确定性会话产生 39 个逆位结果；`frontTransformFor('reversed')` 的回归测试确认牌面 Z 轴旋转为 π。真实 Chrome 强制逆位抽到“高塔 · 逆位”。 |
| 逆位历史缩略图 | 通过 | 真实 Chrome 的归档项标记为 `data-orientation="reversed"`，图片计算样式为 `matrix(-1, 0, 0, -1, 0, 0)`，即旋转 180°。 |
| 第 79 次抽牌被阻止 | 通过 | 完成态继续派发完整抽牌事件序列后快照逐字节不变。 |
| 重置恢复 78 张 | 通过 | 确定性状态机恢复为 `READY`、78 张、0 条历史；真实 Chrome 确认对话框后也恢复为 78 张和 0 条历史。 |

## 输入与恢复矩阵

| 场景 | 结果 | 浏览器 / 设备 | 证据与限制 |
| --- | --- | --- | --- |
| 桌面 Chrome / Edge + 摄像头 | 部分通过 | Chrome 150 / Windows，fake-media | 摄像头状态到达 `ready`，视频 `readyState=4`、640×480、持续播放；本地 MediaPipe 初始化成功。**未在本机物理摄像头验证，也未验证 Edge。** |
| 移动 Safari / Chrome + 触屏 | 部分通过 | Pixel 7 / Android 14 / Chrome 143 仿真 | 浏览器触摸事件完成 `HOLDING → PLACED → READING → ARCHIVING → CAROUSEL`，余牌 78→77，历史新增 1 条；无 HTTP 或控制台错误。**未在真实手机或移动 Safari 物理验证。** |
| 纯鼠标模式 | 通过 | Chrome 150 / Windows | 真实鼠标拖放、揭示和归档完整循环通过；归档完成前余牌保持 78，完成后为 77；重置恢复 78。 |
| 拒绝摄像头权限 | 通过 | Chrome 150 / Windows，权限清空 | 显示 `Camera permission was denied`，自动切换指针模式，并显示“重试摄像头”和“使用鼠标 / 触屏”；无 HTTP 或应用控制台错误。 |
| 执牌期间暂时丢失手部 | 通过（自动化仿真） | Vitest / jsdom | 集成测试在 250 ms 宽限期内不释放，超过宽限期仅释放一次并进入 `PLACED`。**未通过物理摄像头制造真实手部丢失。** |
| 慢速牌面加载 | 通过 | Chrome 150 / Windows，所有牌面延迟 2500 ms | 揭示阶段显示 `Loading the selected card face…` 和 `data-status="loading"`，余牌保持 78；响应后进入阅读态，无 HTTP 或控制台错误。 |
| `prefers-reduced-motion` | 通过 | Chrome 150 / Windows，`reduce` 仿真 | `matchMedia` 返回 true；完整循环通过，归档约 213 ms；自动化测试同时确认无粒子、减少阴影与短淡出路径。 |
| WebGL 不可用时 2D 降级 | 通过 | Chrome 150 / Windows，WebGL 上下文强制不可用 | 页面无 canvas，显示“二维星轨”说明与完整可用的 2D 牌面；鼠标完成揭示和归档，余牌 78→77，历史新增 1 条；无 HTTP 或控制台错误。 |

## 生产托管路径

- `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` 成功启动，入口返回 HTTP 200。
- 对 `dist/` 中全部 87 个文件逐一通过预览 HTTP 请求：87/87 返回 200。
- 覆盖 78 张牌面、`cover.jpg`、入口 HTML、CSS、应用脚本，以及 5 个本地 MediaPipe 模型/WASM 文件。
- 仿真摄像头实际启动时，`vision_wasm_internal.js`、`vision_wasm_internal.wasm` 和 `hand_landmarker.task` 均从同一预览源返回 200。
- 浏览器观察到的资源源仅为 `http://127.0.0.1:4173`，无 CDN 请求或外部运行时依赖。
- 修复后未出现 HTTP 4xx/5xx 或请求失败。MediaPipe 将 `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.` 通过 `console.error` 输出；这是上游信息日志，不是加载或运行失败。

## 验收中修正的缺陷

### 浏览器默认 favicon 请求返回 404

- 复现：生产预览首次启动摄像头时，Chrome 请求 `/favicon.ico` 并收到 404。
- 根因：入口 HTML 没有声明图标，构建产物也没有默认 `favicon.ico`。
- 修正：在 `index.html` 中声明内嵌 SVG 图标，避免新增绝对部署路径。
- 回归：新增文档壳测试。测试先因缺少 `link[rel~="icon"]` 失败，修正后通过；重建并重新加载真实预览后，favicon 相关 4xx 为 0。

## 发布前仍需人工补签

- [ ] 在至少一台带真实摄像头的桌面设备上验证手势完整循环和暂时手部丢失。
- [ ] 在至少一台真实 iOS Safari 或 Android Chrome 设备上验证触摸完整循环、方向变化和页面恢复。
- [ ] 如目标支持 Edge，再在目标 Edge 版本做一次摄像头与鼠标烟雾测试。

在这些物理设备项补签前，不应把本清单描述为“已完成全部跨设备物理验收”。
