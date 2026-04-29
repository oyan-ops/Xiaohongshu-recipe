# 小红书食谱转换工具

使用 Claude Vision API 将小红书美食图片转换为结构化食谱。

## 启动

### 1. 后端
```bash
cd backend
npm install
cp .env.example .env   # 填入你的 ANTHROPIC_API_KEY
npm run dev            # http://localhost:3001
```

### 2. 前端
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

## 功能

- 拖拽 / 点击上传图片
- Claude Opus 4.7 视觉识别食材与步骤
- 结构化食谱展示（食材、步骤、小贴士、标签）
- 一键导出 JSON

## 说明

- 视频暂不支持直接识别，请先截取关键帧上传
- 单文件上限 100MB
