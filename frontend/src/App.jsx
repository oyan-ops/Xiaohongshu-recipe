import { useState, useRef, useEffect } from 'react';
import { apiUrl } from './api';

export default function App() {
  const [tab, setTab] = useState('extract');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="container">
      <h1>🍳 小红书食谱转换工具</h1>
      <p className="subtitle">上传美食图片，AI 自动提取食材与步骤</p>

      <div className="tabs">
        <button
          className={tab === 'extract' ? 'tab active' : 'tab'}
          onClick={() => setTab('extract')}
        >✨ 提取食谱</button>
        <button
          className={tab === 'library' ? 'tab active' : 'tab'}
          onClick={() => setTab('library')}
        >📚 我的食谱</button>
      </div>

      {tab === 'extract' && <Extract onSaved={() => setRefreshKey((k) => k + 1)} />}
      {tab === 'library' && <Library refreshKey={refreshKey} />}
    </div>
  );
}

function Extract({ onSaved }) {
  const [mode, setMode] = useState('link');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const fromLink = async () => {
    if (!linkUrl.trim()) return;
    setLoading(true);
    setError(null);
    setRecipe(null);
    try {
      const res = await fetch(apiUrl('/api/recipe/from-link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '抓取失败');
      setRecipe(data.recipe);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setRecipe(null);
    setError(null);
    if (f.type.startsWith('image/')) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const extract = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('media', file);
      if (sourceUrl.trim()) fd.append('sourceUrl', sourceUrl.trim());
      const res = await fetch(apiUrl('/api/recipe/extract'), { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '识别失败');
      setRecipe(data.recipe);
      onSaved?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const exportJSON = () => {
    if (!recipe) return;
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recipe.title || 'recipe'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null); setPreview(null); setRecipe(null); setError(null); setSourceUrl('');
  };

  return (
    <>
      <div className="mode-switch">
        <button
          className={mode === 'link' ? 'mode active' : 'mode'}
          onClick={() => setMode('link')}
        >🔗 粘贴链接</button>
        <button
          className={mode === 'image' ? 'mode active' : 'mode'}
          onClick={() => setMode('image')}
        >📸 上传图片</button>
      </div>

      {mode === 'link' && (
        <div className="link-mode">
          <div className="url-input">
            <label>小红书帖子链接</label>
            <input
              type="url"
              placeholder="https://www.xiaohongshu.com/explore/..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={fromLink} disabled={!linkUrl.trim() || loading}>
              {loading ? '抓取中...' : '✨ 抓取并提取食谱'}
            </button>
            {linkUrl && <button className="ghost" onClick={() => { setLinkUrl(''); setRecipe(null); setError(null); }}>清除</button>}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            首次使用前需将小红书 cookies 保存到 <code>backend/cookies.txt</code>
          </p>
        </div>
      )}

      {mode === 'image' && <>
      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <p style={{ fontSize: 18 }}>📸 拖拽或点击上传图片</p>
        <p className="hint">支持 JPG / PNG / WEBP（视频请先截取关键帧）</p>
        {file && <p style={{ marginTop: 12, color: '#ff2442' }}>已选择：{file.name}</p>}
        {preview && <img src={preview} className="preview" alt="预览" />}
      </div>

      <div className="url-input">
        <label>🔗 原帖链接（可选）</label>
        <input
          type="url"
          placeholder="粘贴小红书帖子链接，方便回看原视频"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={extract} disabled={!file || loading}>
          {loading ? '识别中...' : '✨ 提取食谱'}
        </button>
        {file && <button className="ghost" onClick={reset}>清除</button>}
      </div>
      </>}

      {loading && <p className="loading">Claude 正在分析，请稍候...</p>}
      {error && <div className="error">❌ {error}</div>}

      {recipe && <RecipeView recipe={recipe} onExport={exportJSON} />}
    </>
  );
}

function Library({ refreshKey }) {
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await fetch(apiUrl('/api/recipes'));
    const data = await res.json();
    setList(data.recipes || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [refreshKey]);

  const open = async (id) => {
    const res = await fetch(apiUrl(`/api/recipes/${id}`));
    const data = await res.json();
    setSelected(data.recipe);
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    if (!confirm('确定删除这条食谱？')) return;
    await fetch(apiUrl(`/api/recipes/${id}`), { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    load();
  };

  const exportJSON = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.title || 'recipe'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <p className="loading">加载中...</p>;
  if (list.length === 0) return <p className="loading">还没有保存的食谱，去「提取食谱」试试吧～</p>;

  return (
    <div className="library">
      <div className="recipe-list">
        {list.map((r) => (
          <div
            key={r.id}
            className={`recipe-card ${selected?.id === r.id ? 'active' : ''}`}
            onClick={() => open(r.id)}
          >
            <div className="recipe-card-title">{r.title || '未命名'}</div>
            {r.description && <div className="recipe-card-desc">{r.description}</div>}
            <div className="recipe-card-meta">
              <span>{new Date(r.extractedAt).toLocaleDateString('zh-CN')}</span>
              {r.sourceUrl && <span>🔗 原帖</span>}
              <button className="delete-btn" onClick={(e) => remove(r.id, e)}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {selected && <RecipeView recipe={selected} onExport={exportJSON} />}
    </div>
  );
}

function RecipeView({ recipe, onExport }) {
  return (
    <div className="recipe">
      <h2>{recipe.title}</h2>
      {recipe.description && <p style={{ color: '#666' }}>{recipe.description}</p>}

      {(recipe.sourceUrl || recipe.videoUrl) && (
        <p style={{ marginTop: 8 }}>
          {recipe.sourceUrl && <>🔗 <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">查看原帖</a></>}
          {recipe.videoUrl && <> ｜ 🎬 <a href={recipe.videoUrl} target="_blank" rel="noreferrer">原视频</a></>}
          {recipe.author && <span style={{ color: '#888', marginLeft: 8 }}>— {recipe.author}</span>}
        </p>
      )}

      <div className="meta">
        {recipe.servings && <span>👥 {recipe.servings}</span>}
        {recipe.prepTime && <span>⏱ 准备 {recipe.prepTime}</span>}
        {recipe.cookTime && <span>🔥 烹饪 {recipe.cookTime}</span>}
      </div>

      {recipe.ingredients?.length > 0 && (
        <div className="section">
          <h3>🥬 食材</h3>
          <ul className="ingredients">
            {recipe.ingredients.map((i, idx) => (
              <li key={idx}>
                {i.name}<span className="amount">{i.amount}</span>
                {i.notes && <span className="tips">（{i.notes}）</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recipe.steps?.length > 0 && (
        <div className="section">
          <h3>👩‍🍳 步骤</h3>
          <ol className="steps">
            {recipe.steps.map((s, idx) => (
              <li key={idx}>
                {s.description}
                {s.tips && <div className="tips">💡 {s.tips}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {recipe.tips?.length > 0 && (
        <div className="section">
          <h3>💡 小贴士</h3>
          <ul>{recipe.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {recipe.tags?.length > 0 && (
        <div className="section tags">
          {recipe.tags.map((t, i) => <span key={i}>#{t}</span>)}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button onClick={onExport}>📥 导出 JSON</button>
      </div>
    </div>
  );
}
