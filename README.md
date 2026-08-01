# 以太塔罗 / Ether Tarot

一个以手势优先方式完成单张抽牌的静态网页应用。浏览器在本地运行 MediaPipe 手部识别与 Three.js 场景；牌面、模型和解读数据都随构建产物发布。

![以太塔罗启动画面](docs/main.png)

## 功能与边界

- **78 张 Rider–Waite（韦特）体系牌**：22 张大阿卡那、56 张小阿卡那；每张牌均有本地牌面、中英文名称、正位与逆位关键词，以及通用、感情、事业、财富、成长五类中文释义。
- **单张、无放回抽牌**：抽出的牌会进入左下角历史记录，剩余数量随归档完成后递减；重置可开始新的完整牌组。
- **手势与指针双输入**：摄像头不可用、权限被拒绝或不想使用手势时，可直接切换鼠标／触屏，两个输入方式共用同一套抽牌状态机。
- **本地解读，不调用 AI 服务**：解读由仓库内置的标准牌义直接查询生成；没有 API 密钥、账户、数据库、云端历史或后台服务。它适合作为自我反思的提示，不构成医疗、心理、法律或财务建议。

## 操作流程

首次进入后，点击“开启手势抽牌”并允许摄像头权限。手势会经过稳定帧和停留时间确认，按以下顺序完成一轮抽牌：

1. 张开手掌，在牌阵上移动指针并选择目标牌。
2. 捏合拇指与食指，拿起牌并移动到中央揭示区。
3. 松开捏合；牌在揭示区内即被放置，区外则回到牌阵。
4. 在已放置的牌上握拳约 0.5 秒，确认并翻开正位或逆位牌面。
5. 阅读牌义；可切换通用、感情、事业、财富与成长主题。
6. 再次张开手掌约 0.3 秒，牌会归档到历史记录，并返回下一轮牌阵。

鼠标与触屏备用流程：移动指针到牌面后按下并拖动，松开到揭示区；随后再次点击确认翻牌，阅读后再点击归档。摄像头错误面板提供“重试摄像头”和“使用鼠标 / 触屏”两个恢复选项。

## 本地开发

### 前置条件

- [Node.js LTS](https://nodejs.org/)（包含 npm）
- 支持 WebGL 的现代浏览器；使用手势还需要可用摄像头

```bash
git clone https://github.com/Fengfengex/tarot-app.git
cd tarot-app
npm ci
npm run dev
```

Vite 会输出本地访问地址。需要检查代码、测试、类型检查及生产构建时运行：

```bash
npm run check
```

也可以先构建再预览生产输出：

```bash
npm run build
npm run preview
```

### 摄像头与本地模型

`getUserMedia` 只能在安全上下文中使用：本地开发请通过 Vite 提供的 `localhost` 地址访问；部署到线上必须使用 HTTPS。不要直接双击打开 `index.html`。

手部识别使用随应用提供的 MediaPipe Hand Landmarker 模型与 WASM 运行时，浏览器不会为识别流程请求第三方 CDN。生产构建会保留这些文件及本地 `tarot_img/` 牌面资源。

## 部署

`vite.config.ts` 已设置 `base: "./"`，同一份构建可用于仓库子路径的 GitHub Pages、Vercel 根路径及其他 HTTPS 静态主机。

### GitHub Pages

仓库包含 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)。推送到 `main`（或在 Actions 页面手动运行工作流）会执行：

```text
npm ci → npm run check → 上传 dist → 部署 GitHub Pages
```

首次启用时，在 GitHub 仓库的 **Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**。部署成功后，站点地址通常为 `https://Fengfengex.github.io/tarot-app/`。

### Vercel

仓库根目录的 [`vercel.json`](vercel.json) 声明 Vite、`npm run build` 和 `dist` 输出目录。

1. 在 Vercel 导入 GitHub 仓库 `Fengfengex/tarot-app`。
2. 选择要部署的分支；配置会自动读取，构建命令为 `npm run build`，输出目录为 `dist`。
3. 点击 Deploy。后续对已连接分支的推送会触发新的部署。

部署地址必须保持 HTTPS，才能使用摄像头手势；鼠标／触屏模式不依赖摄像头。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| Vite + TypeScript | 静态构建、开发服务器与类型检查 |
| Three.js | 牌阵、翻牌、粒子归档与 WebGL 场景 |
| MediaPipe Tasks Vision | 浏览器端单手关键点与手势识别 |
| Vitest + ESLint | 自动化测试与静态检查 |

## 资源与许可

源代码：<https://github.com/Fengfengex/tarot-app>

塔罗牌义仅供娱乐与自我探索使用。
