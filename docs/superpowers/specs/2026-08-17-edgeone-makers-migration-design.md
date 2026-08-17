# EdgeOne Makers 最小迁移设计

## 目标

让现有塔罗游戏在 EdgeOne Makers 上运行，并继续通过服务端调用 DeepSeek。迁移只处理平台兼容性，不重做游戏界面、手势交互、塔罗逻辑或内容。

## 架构

- `index.html`、`src/client/` 和 `tarot_img/` 继续作为静态资源发布。
- 新增一个 Node.js Cloud Function，响应 `POST /api/reading`。
- Cloud Function 复用现有 `src/server/reading-service.mjs`，不引入 Express、数据库、KV、中间件或新的服务层。
- `server.mjs` 保留给原有本地启动方式，不参与 Makers 线上请求。
- 浏览器端继续请求相对地址 `/api/reading`，无需区分本地和线上域名。

## DeepSeek 调用

- 模型保持 `deepseek-v4-pro`。
- 使用非思考模式：`thinking: { type: "disabled" }`。
- 删除 `reasoning_effort`。
- `max_tokens` 设为 `500`。
- 保留现有 12 秒超时和四字段 JSON 输出约束。
- `DEEPSEEK_API_KEY` 与 `DEEPSEEK_MODEL` 从运行时环境变量读取。
- Git 只保留空值的 `.env.example`；真实 `.env` 和线上 Key 不进入仓库。

## 静态依赖

当前 `/vendor/anime.esm.js` 由本地 Node Server 从 `node_modules` 提供，Makers 静态托管不会提供该路由。迁移时将 Anime.js 改为固定版本的 jsDelivr ESM 地址。项目已经通过 jsDelivr 加载 MediaPipe，因此不增加新的基础设施依赖。

## 最小错误处理

Cloud Function 只完成运行所需的处理：

- 仅接受 `POST` JSON 请求；
- 读取四个现有业务字段；
- 调用 DeepSeek 并返回现有四字段结果；
- Key 缺失、超时或上游失败时返回通用 JSON 错误，不暴露 Key 或上游响应正文。

不实现 KV、限流、数据库、用户系统、监控后台或额外业务功能。

## 验证

- 保持现有自动化测试通过。
- 为 Cloud Function 增加最小成功与失败测试。
- 运行构建或语法检查。
- 通过 `edgeone makers dev --name tarot-app --skip-env-sync` 启动本地 Makers 环境，并使用 `http://127.0.0.1:8088/` 验证页面和 `/api/reading`。
- 使用本地 `.env` 做一次真实 DeepSeek 链路检查；测试输出不得包含 API Key。

## 完成标准

- 游戏首页能由 Makers 开发服务器打开。
- 现有抽牌与交互仍可使用。
- AI 解读请求能经过 `/api/reading` 获得合法结果。
- 未配置或不可用的 DeepSeek 服务会显示安全的错误信息。
- `.env` 与真实 API Key 未被 Git 跟踪。
