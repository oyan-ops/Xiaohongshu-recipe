import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { insertRecipe } from '../lib/db.js';

const file = path.join(process.cwd(), 'data', 'recipes.json');
if (!fs.existsSync(file)) {
  console.log('没有 data/recipes.json，跳过迁移');
  process.exit(0);
}

const recipes = JSON.parse(fs.readFileSync(file, 'utf-8'));
console.log(`准备迁移 ${recipes.length} 条食谱...`);

let ok = 0;
for (const r of recipes) {
  try {
    await insertRecipe(r);
    ok++;
    console.log(`✓ ${r.title || r.id}`);
  } catch (e) {
    console.error(`✗ ${r.title || r.id}: ${e.message}`);
  }
}

console.log(`\n完成：${ok}/${recipes.length} 条成功`);
fs.renameSync(file, file + '.migrated');
console.log('原文件已重命名为 recipes.json.migrated');
