# 如何运行 / How to Run

## 前置要求
- Node.js ≥ 18
- 一个 Anthropic API Key（https://console.anthropic.com/）

## 一、配置 API Key

编辑 `backend/.env` 文件：

```
ANTHROPIC_API_KEY=sk-ant-你的真实key
PORT=3001
```

如果文件不存在：
```bash
cd ~/Desktop/xiaohongshu-recipe/backend
cp .env.example .env
```

## 二、安装依赖（首次运行）

```bash
# 后端
cd ~/Desktop/xiaohongshu-recipe/backend
npm install

# 前端
cd ~/Desktop/xiaohongshu-recipe/frontend
npm install
```

## 三、启动服务

**开两个终端窗口**：

### 终端 1 — 启动后端
```bash
cd ~/Desktop/xiaohongshu-recipe/backend
npm run dev
```
看到 `Recipe API running on http://localhost:3001` 即成功。

### 终端 2 — 启动前端
```bash
cd ~/Desktop/xiaohongshu-recipe/frontend
npm run dev
```
看到 `Local: http://localhost:5173/` 即成功。

## 四、使用

打开浏览器访问 **http://localhost:5173**

1. 拖拽或点击上传一张小红书美食图片
2. 点击「✨ 提取食谱」
3. 等待 Claude 识别（约 5–15 秒）
4. 查看结构化食谱 → 点击「📥 导出 JSON」下载

## 五、停止服务

在每个终端按 `Ctrl + C`。

## 常见问题

**Q: `EADDRINUSE: 3001`?**
端口被占用：`lsof -ti:3001 | xargs kill -9`

**Q: 识别返回 401 / 403?**
检查 `.env` 里的 API Key 是否正确、是否有余额。

**Q: 视频上传报错?**
当前版本仅支持图片。请先在小红书视频中截取关键帧再上传。

**Q: 想改端口?**
- 后端：改 `backend/.env` 的 `PORT`
- 前端：改 `frontend/vite.config.js` 的 `server.port` 和 `proxy` 目标
