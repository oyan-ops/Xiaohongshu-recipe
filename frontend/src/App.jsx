import { useState, useEffect } from 'react';
import { authFetch } from './api';
import { supabase } from './supabase';

const XHS_URL_RE = /https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s]+/i;
const extractXhsUrl = (t) => (t && t.match(XHS_URL_RE)?.[0]) || '';

function Login() {
  const signIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };
  return (
    <div className="app">
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32, textAlign: 'center'
      }}>
        <h1 className="serif" style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em' }}>小红书食谱</h1>
        <p style={{ color: 'var(--ink-soft)', maxWidth: 360, lineHeight: 1.6 }}>
          把你收藏的小红书帖子,一键变成结构化食谱。登录后开始建立你自己的食谱库。
        </p>
        <button className="btn" onClick={signIn} style={{ padding: '14px 24px' }}>
          使用 Google 登录
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (authLoading) return <div className="app"><p className="empty">加载中…</p></div>;
  if (!session) return <Login />;
  return <Main session={session} />;
}

function Main({ session }) {
  const [tab, setTab] = useState('extract');
  const [recipes, setRecipes] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const res = await authFetch('/api/recipes');
      const data = await res.json();
      setRecipes(data.recipes || []);
    } finally { setLoadingList(false); }
  };

  useEffect(() => { loadList(); }, []);

  const onExtracted = () => { loadList(); setTimeout(() => setTab('library'), 600); };
  const signOut = () => supabase.auth.signOut();
  const userName = session.user.user_metadata?.name || session.user.email;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>小红书食谱</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="count">{userName} · {recipes.length} 道</span>
            <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={signOut}>退出</button>
          </div>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === 'extract' ? 'active' : ''}`} onClick={() => setTab('extract')}>提取</button>
          <button className={`tab ${tab === 'library' ? 'active' : ''}`} onClick={() => setTab('library')}>我的食谱</button>
        </div>
      </header>

      <main>
        {tab === 'extract'
          ? <div className="slide-up">
              <div className="section-head">
                <h2>提取一道食谱</h2>
                <p>粘贴小红书帖子链接，或整段分享文字。</p>
              </div>
              <Extract onExtracted={onExtracted} />
            </div>
          : <div className="slide-up">
              <Library recipes={recipes} loading={loadingList} reload={loadList} />
            </div>
        }
      </main>
    </div>
  );
}

function Extract({ onExtracted }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [clipHint, setClipHint] = useState('');

  const submit = async (raw) => {
    const target = extractXhsUrl(raw) || (raw || '').trim();
    if (!target) return;
    setLoading(true); setError(null); setStatus(null); setClipHint('');
    try {
      const res = await authFetch('/api/recipe/from-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '抓取失败');
      const n = data.count || 1;
      setStatus(data.duplicate
        ? `这条之前抓过了,直接打开${n > 1 ? `（${n} 道菜）` : ''}`
        : `已保存${n > 1 ? ` ${n} 道菜` : ''},正在跳转到「我的食谱」`);
      onExtracted?.();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const pasteAndExtract = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const found = extractXhsUrl(text);
      if (found) { setUrl(found); submit(found); }
      else if (text?.trim()) { setUrl(text.trim()); setError('剪贴板里没有小红书链接'); }
      else setError('剪贴板是空的');
    } catch {
      setError('无法读取剪贴板,请手动粘贴');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const found = extractXhsUrl(params.get('url') || params.get('text') || params.get('title') || '');
    if (found) {
      setUrl(found);
      submit(found);
      window.history.replaceState({}, '', '/');
      return;
    }
    // best-effort 自动检查剪贴板（多数浏览器需要用户手势,失败就降级到提示按钮）
    (async () => {
      try {
        const text = await navigator.clipboard.readText();
        const f = extractXhsUrl(text);
        if (f) setClipHint(f);
      } catch { /* 没权限就算了 */ }
    })();
  }, []);

  return (
    <div>
      {clipHint && !url && (
        <button
          className="banner success"
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', marginTop: 0, marginBottom: 16 }}
          onClick={() => { setUrl(clipHint); submit(clipHint); }}
        >
          检测到剪贴板里有小红书链接,点击直接提取 →
        </button>
      )}

      <div className="field" style={{ marginBottom: 16 }}>
        <label>链接 / 分享文字</label>
        <input
          className="input"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit(url)}
          placeholder="粘贴小红书链接或整段分享文字"
        />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn coral" onClick={() => submit(url)} disabled={!url.trim() || loading}>
          {loading ? '抓取中…' : '抓取并提取'}
        </button>
        <button className="btn ghost" onClick={pasteAndExtract} disabled={loading}>
          从剪贴板粘贴
        </button>
      </div>

      {error && <div className="banner error">{error}</div>}
      {status && !error && <div className="banner success">{status}</div>}
    </div>
  );
}

function Library({ recipes, loading, reload }) {
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState('');

  const filtered = recipes.filter(r => {
    const term = q.toLowerCase();
    return !term
      || (r.title || '').toLowerCase().includes(term)
      || (r.tags || []).some(t => (t || '').toLowerCase().includes(term));
  });

  const open = async (id) => {
    const res = await authFetch(`/api/recipes/${id}`);
    const data = await res.json();
    setSelected(data.recipe);
  };

  const remove = async (id) => {
    if (!confirm('确定删除这条食谱？')) return;
    await authFetch(`/api/recipes/${id}`, { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    reload();
  };

  if (loading) return <p className="empty">加载中…</p>;

  return (
    <div>
      <div className="search">
        <input
          className="input"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="搜索食谱或标签"
        />
      </div>
      <p className="lib-meta">{filtered.length} 道食谱</p>

      {filtered.length === 0 ? (
        <div className="empty">
          <h3>还没有食谱</h3>
          <p>去「提取」试试吧</p>
        </div>
      ) : (
        <div className="cards">
          {filtered.map(r => (
            <div key={r.id} className="card" onClick={() => open(r.id)}>
              {r.coverImage
                ? <img className="card-img" src={r.coverImage} alt="" loading="lazy" referrerPolicy="no-referrer" />
                : <div className="card-img placeholder" />}
              <div className="card-body">
                <div className="card-title">{r.title || '未命名'}</div>
                {r.description && <div className="card-desc">{r.description}</div>}
                <div className="card-meta">
                  {r.prepTime && <span>准备 {r.prepTime}</span>}
                  {r.cookTime && <><span className="dot">·</span><span>烹饪 {r.cookTime}</span></>}
                  {r.servings && <><span className="dot">·</span><span>{r.servings}</span></>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <RecipeDetail recipe={selected} onClose={() => setSelected(null)} onDelete={() => remove(selected.id)} />}
    </div>
  );
}

function RecipeDetail({ recipe, onClose, onDelete }) {
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = `${recipe.title || 'recipe'}.json`; a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="sheet-close" onClick={onClose}>✕</button>
          {recipe.coverImage && (
            <img className="sheet-img" src={recipe.coverImage} alt="" referrerPolicy="no-referrer" />
          )}
          <h2>{recipe.title || '未命名'}</h2>
          {recipe.description && <p className="desc">{recipe.description}</p>}
          {recipe.author && <p className="author">— {recipe.author}</p>}
        </div>

        <div className="sheet-body">
          {(recipe.servings || recipe.prepTime || recipe.cookTime) && (
            <div className="stats">
              {recipe.servings && <div className="stat"><span className="k">份量</span><span className="v">{recipe.servings}</span></div>}
              {recipe.prepTime && <div className="stat"><span className="k">准备</span><span className="v">{recipe.prepTime}</span></div>}
              {recipe.cookTime && <div className="stat"><span className="k">烹饪</span><span className="v">{recipe.cookTime}</span></div>}
            </div>
          )}

          {recipe.ingredients?.length > 0 && (
            <div className="block">
              <h3>食材</h3>
              <div className="ing-list">
                {recipe.ingredients.map((ing, i) => (
                  <div key={i} className="ing">
                    <div>
                      <span className="name">{ing.name}</span>
                      {ing.notes && <span className="notes">{ing.notes}</span>}
                    </div>
                    {ing.amount && <span className="amount">{ing.amount}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {recipe.steps?.length > 0 && (
            <div className="block">
              <h3>步骤</h3>
              <ol className="steps">
                {recipe.steps.map((s, i) => (
                  <li key={i} className="step">
                    <span className="step-num">{i + 1}</span>
                    <div className="step-text">
                      {s.description}
                      {s.tips && <div className="step-tip">{s.tips}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {recipe.tips?.length > 0 && (
            <div className="block">
              <h3>小贴士</h3>
              <div className="tips">
                {recipe.tips.map((t, i) => <div key={i} className="tip">{t}</div>)}
              </div>
            </div>
          )}

          {recipe.tags?.length > 0 && (
            <div className="tags">
              {recipe.tags.map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          )}

          <div className="actions">
            {recipe.sourceUrl && <a className="btn ghost" href={recipe.sourceUrl} target="_blank" rel="noreferrer">原帖</a>}
            {recipe.videoUrl && <a className="btn ghost" href={recipe.videoUrl} target="_blank" rel="noreferrer">原视频</a>}
            <button className="btn ghost" onClick={exportJSON}>导出 JSON</button>
            <button className="btn danger" onClick={onDelete}>删除</button>
          </div>
        </div>
      </div>
    </div>
  );
}
