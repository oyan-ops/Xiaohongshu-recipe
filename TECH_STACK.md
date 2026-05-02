# 小红书食谱 - 技术架构文档

## 📊 技术栈概览

### 前端
- **框架**：React (Vite)
- **状态管理**：React Hooks (useState, useEffect)
- **样式**：CSS Variables + inline styles
- **认证**：Supabase OAuth (Google)

### 后端
- **运行时**：Node.js (Express.js)
- **部署**：Render.com
- **数据库**：Supabase PostgreSQL
- **认证**：Supabase Auth

### 外部服务
- **Supabase**：数据库、认证、实时同步
- **Render**：后端服务器托管
- **认证**：Supabase Auth — Google OAuth、GitHub OAuth、邮箱 Magic Link
- **AI 评估**：Claude API（食谱难度和用时评估）

---

## 🏗️ 架构设计

### 数据库结构

#### 核心表

**1. users 表**
```
id (PK) | email | name | created_at
```
- 存储用户基本信息
- 通过 Supabase Auth 管理

**2. recipes 表**
```
id (PK) | owner_id (FK) | title | ingredients | steps | 
cook_time | cover_image | created_at | updated_at |
effort_minutes | difficulty
```
- 存储食谱内容
- `effort_minutes` 和 `difficulty` 由 AI 自动评估
- `owner_id` 关联用户，用于权限控制

**3. recipe_shares 表**
```
id (PK) | recipe_id (FK) | shared_by_id (FK) | shared_with_id (FK) | 
role ('viewer'/'editor') | created_at
```
- 记录食谱共享关系
- `role` 控制权限：viewer（只读）or editor（可编辑）

**4. folders 表**
```
id (PK) | owner_id (FK) | name | position (INT) | created_at
```
- 用户创建的文件夹
- 用于组织食谱
- `position` 用于拖拽排序（数值越小越靠前）

**5. folder_contents 表**
```
id (PK) | folder_id (FK) | recipe_id (FK) | created_at
```
- 多对多关系：食谱可以在多个文件夹中

**6. folder_shares 表**
```
id (PK) | folder_id (FK) | shared_by_id (FK) | shared_with_id (FK) | 
role ('viewer'/'editor') | created_at
```
- 文件夹级别的共享

**7. meal_plans 表**
```
id (PK) | user_id (FK) | recipe_id (FK) | plan_date (ISO format) |
cooked (boolean) | meal_type ('breakfast'/'lunch'/'dinner'/'snack') |
created_at | owner_id (FK)
```
- 存储计划和历史记录
- `cooked = true` 表示已做过的菜（出现在历史记录中）
- `meal_type` 区分早 / 午 / 晚 / 加餐分组，默认 `dinner`
- `owner_id` 在多人共享计划时记录添加者

**8. plan_invites 表**
```
id (PK) | token (unique) | owner_id (FK) | role ('viewer'/'editor') | 
created_by (FK) | expires_at | created_at | dates (TEXT[])
```
- 存储计划分享邀请
- `token` 是公开链接的唯一标识
- `dates` 存储共享的日期数组（新增，用于日期范围共享）
- `expires_at` 控制邀请有效期

**9. recipe_invites 表**
```
id (PK) | token (unique) | owner_id (FK) | role ('viewer'/'editor') | 
created_by (FK) | expires_at | created_at
```
- 存储食谱库分享邀请

### 行级安全（Row Level Security）

所有表都启用 RLS，规则示例：
```sql
-- 用户只能看到自己的食谱或被共享的食谱
CREATE POLICY "Users can view own recipes" ON recipes
  FOR SELECT USING (owner_id = auth.uid());

-- 编辑者可以修改被共享的食谱
CREATE POLICY "Editors can update shared recipes" ON recipes
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    id IN (SELECT recipe_id FROM recipe_shares 
           WHERE shared_with_id = auth.uid() AND role = 'editor')
  );
```

---

## 🔄 功能实现机制

### 1. 提取食谱

**前端流程**：
1. 用户在 Extract 组件输入 RED 链接或文字
2. 提交到 `/api/extract` 端点
3. 展示提取结果，用户可编辑
4. 点保存调用 `/api/recipes` POST 创建食谱

**后端流程**：
1. `POST /api/extract` 接收链接或文字
2. 调用 Claude API 使用 prompt 解析：
   ```
   Parse this RED post and extract: title, ingredients, steps, 
   cook time, difficulty, nutrition info
   Return as JSON
   ```
3. 返回结构化数据给前端

**关键代码位置**：
- 前端：`App.jsx` 的 `Extract` 组件
- 后端：`server.js` 的 `/api/extract` 路由

---

### 2. 食谱管理（创建、编辑、删除）

**创建食谱**：
- 前端 POST `/api/recipes` with title, ingredients, steps, cook_time
- 后端通过 Supabase RLS 验证用户权限，插入 recipes 表
- 返回新食谱 ID

**编辑菜谱名**：
- 前端 PATCH `/api/recipes/:id` with new title
- 调用 `updateRecipeTitle()` 函数更新数据库
- 即时反映在 UI 中

**删除食谱**：
- 前端 DELETE `/api/recipes/:id`
- 后端删除记录，级联删除 folder_contents 关联

**权限控制**：
- 只有 owner 或被授予 editor 权限的用户能修改
- 通过 RLS 在数据库层强制执行

---

### 3. 食谱库管理

**文件夹结构**：
- 用户可创建多个文件夹
- 一个食谱可以在多个文件夹中（通过 folder_contents 表）
- 前端维护 `activeFolder` 状态来过滤显示

**批量操作**：
1. 进入批量模式：点「批量选择」按钮，设置 `batchMode = true`
2. 选择菜谱：点击卡片勾选，或点「全选」
3. 批量移动：
   - 前端收集选中的 recipeId 数组
   - POST `/api/folders/:targetId/add-recipes` with recipe IDs
   - 后端插入 folder_contents 记录
   - 如果来源文件夹只有这些菜，自动从源文件夹移除

**实现细节**：
- `selectedBatch` Set 存储选中的 recipeId
- 批量选择不自动全选（之前改进），由用户显式控制
- 信息栏背景从蓝色改为灰色（视觉优化）

---

### 4. 做菜计划

**核心逻辑**：
```
meal_plans 表中每条记录 = 一个计划项
- date: '2026-05-01'
- recipe_id: 123
- user_id: owner
- cooked: false（计划中）or true（已完成，出现在历史记录）
- owner_id: 添加者（用于多人计划展示谁加的）
```

**计划工作流**：
1. 选择日期 → 点 + 加菜 → 从食谱库选择
2. 后端 POST `/api/plans` 创建 meal_plans 记录
3. 点 ☑ 标记完成 → PATCH `/api/plans/:id` 更新 cooked = true
4. 完成的菜自动出现在「历史记录」tab

**计划分享 - 日期范围**：
1. 点日期后出现「共享计划」按钮
2. 用户选择：
   - **范围模式**：输入起止日期
   - **指定日期模式**：逐个勾选日期
3. 前端生成日期数组并 POST `/api/plans/invite` with dates
4. 后端保存到 `plan_invites` 的新 `dates` 字段（TEXT[]）
5. 生成唯一 token 链接

**接收者体验**：
- 打开 `/plan-invite/{token}` 页面
- 从 plan_invites 读取日期范围信息
- 显示「邀请你查看 5月1日–5月7日 的做菜计划」
- 接受后获得这些日期的只读/编辑权限

---

### 5. 做菜记录 - 热力图

**数据计算**：
1. 过滤所有 `cooked = true` 的 meal_plans
2. 对每条记录计算用时权重：
   ```javascript
   effort_minutes × (1 + difficulty × 0.3)
   // 如果没有 AI 评估则用 parse cookTime
   ```
3. 按日期汇总：workloadByDate[date] = sum of weights
4. 12 周网格：计算颜色等级（0-4）

**实现**：
- `HeatMap` 组件在 PlanView 中，mode='history' 时显示
- 颜色映射：
  - level 0: 灰色（无活动）
  - level 1: 淡绿
  - level 2: 中绿
  - level 3: 深绿
  - level 4: 最深（120+ 分钟）

---

### 6. 菜谱排行榜

**实现机制**：
```javascript
// TopRecipes 组件
const recipeCounts = {};
for (const p of plans) {
  if (!p.cooked || !p.recipe) continue;
  const key = p.recipeId;
  recipeCounts[key] = (recipeCounts[key] || 0) + 1;
}

// 统计每道菜被做过的次数，排序并取前5
const sorted = Object.entries(recipeCounts)
  .map(([recipeId, count]) => ({ recipeId, count, recipe }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 5);
```

**展示**：
- 在历史记录中「常做的菜」部分
- 带编号卡片，显示做过的次数
- 帮助用户了解自己的饮食习惯

---

### 7. 食谱共享

**分享流程**：
1. 用户点「共享」按钮
2. 选择权限（可编辑 / 只读）和有效期
3. 前端 POST `/api/recipes/invite` 创建邀请
4. 后端生成唯一 token，存入 recipe_invites 表
5. 返回分享链接：`/invite/{token}`

**接收者**：
1. 访问 `/invite/{token}` 页面
2. 系统验证 token 是否过期和有效
3. 点「加入」后：
   - 创建 recipe_shares 记录
   - 获得相应权限（viewer / editor）
   - 该用户食谱库中显示被共享的食谱

**权限验证**：
- 每次访问食谱都检查：
  - 是否是 owner（owner_id = current_user_id）
  - 或在 recipe_shares 中有权限记录
- 通过 RLS 在数据库层强制

---

### 8. 计划共享 - 实现细节

**新增字段**：
```sql
ALTER TABLE plan_invites ADD COLUMN dates TEXT[];
-- 存储如 ['2026-05-01', '2026-05-03', '2026-05-05']
```

**前端日期选择**：
```javascript
// PlanShareModal 中两种模式
dateMode = 'range' | 'pick'

// Range 模式：展开为日期数组
getSelectedDates() {
  if (dateMode === 'range') {
    return expandDateRange(dateFrom, dateTo);
  } else {
    return Array.from(pickedDates).sort();
  }
}
```

**后端**：
- `createPlanInvite(client, userId, role, ttlDays, dates)` 接受 dates 参数
- INSERT 时 `dates: dates || null`
- `readPlanInvite()` SELECT 时包含 dates 字段

**接收体验**：
- PlanInvitePage 检查 invite.dates
- 如果是连续范围：「5月1日–5月7日」
- 如果不连续：「5月1日等3天」
- 接受后只能看到这些日期的计划

---

## 🔐 认证和授权

### 认证流程
支持三种登录方式（同一份 user 表）：

1. **Google OAuth** — `supabase.auth.signInWithOAuth({ provider: 'google' })`
2. **GitHub OAuth** — `supabase.auth.signInWithOAuth({ provider: 'github' })`
3. **Email Magic Link** — `supabase.auth.signInWithOtp({ email })`，Supabase 自动发邮件，用户点链接回调登录

成功后获得 Session Token，存 localStorage，每次请求在 Authorization header 中。注意：每种 provider 各自创建 user_id，不会自动合并。

### API 授权
```javascript
// 中间件检查 token
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = data.user.id;
  next();
});
```

### 数据库 RLS
- 每个数据库操作都通过 Supabase 客户端
- Supabase 自动注入 auth.uid()
- 表级 policy 确保用户只能访问授权数据

---

## 📝 API 端点概览

### 食谱相关
- `POST /api/extract` - 从链接提取食谱
- `GET /api/recipes` - 列出用户的食谱
- `POST /api/recipes` - 创建食谱
- `PATCH /api/recipes/:id` - 编辑菜谱名
- `DELETE /api/recipes/:id` - 删除食谱
- `PATCH /api/recipes/batch/move` - 批量移动到文件夹
- `POST /api/recipes/batch/delete` - 批量删除
- `POST /api/recipes/invite` - 创建食谱分享邀请
- `GET /api/invites/:token` - 获取分享邀请信息
- `POST /api/invites/:token/accept` - 接受分享邀请

### 文件夹相关
- `GET /api/folders` - 列出用户文件夹（按 position 排序）
- `POST /api/folders` - 创建文件夹
- `PATCH /api/folders/:id` - 改名
- `DELETE /api/folders/:id` - 删除文件夹
- `PATCH /api/folders/reorder` - 拖拽排序后保存新顺序
- `POST /api/folders/:id/add-recipes` - 批量添加食谱到文件夹

### 计划相关
- `GET /api/plans` - 列出计划和历史（含 mealType）
- `POST /api/plans` - 创建计划项（接受 mealType）
- `PATCH /api/plans/:id` - 更新（标记完成）
- `DELETE /api/plans/:id` - 删除计划项
- `POST /api/plans/invite` - 创建计划分享邀请（支持 dates）
- `GET /api/plan-invites/:token` - 获取计划分享信息
- `POST /api/plan-invites/:token/accept` - 接受计划共享

---

## 🚀 部署架构

### 前端
- **托管**：Render Static Site（自定义域名 `myredrecipe.com`，DNS 在 Cloudflare）
- **构建**：`npm run build` → `/dist` 文件夹
- **SPA 路由**：`public/_redirects` (`/*  /index.html  200`)
- **自动部署**：push 到 main 分支触发构建

### 后端
- **平台**：Render.com
- **启动命令**：`node backend/server.js`
- **环境变量**：
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `ANTHROPIC_API_KEY`（AI 评估）
  - `PORT`

### 数据库
- **提供商**：Supabase（PostgreSQL）
- **地区**：（根据项目配置）
- **备份**：Supabase 自动备份
- **灾难恢复**：支持 PITR（Point-In-Time Recovery）

---

## 🔄 数据同步和实时性

### 前端状态管理
- 大多数状态用 React Hooks 管理
- 用户操作 → API 调用 → 更新本地状态
- 无实时推送（当前），用户刷新页面获取最新数据

### 多人协作
- 多用户共享同一文件夹或计划时
- 编辑者的修改通过 API 立即保存
- 其他用户需手动刷新查看更新
- 可通过 Supabase Realtime 升级为实时协作

---

## 🎯 未来改进方向

1. **实时协作**：集成 Supabase Realtime 支持同步编辑
2. **更多 AI 功能**：菜谱推荐、营养分析、采购清单生成
3. **图片识别**：上传菜照自动识别和打标签
4. **移动应用**：React Native 跨平台应用
5. **离线支持**：Service Worker 和本地存储
6. **高级分析**：做菜趋势、成本分析、营养追踪

