import { useState, useEffect } from 'react';
import { authFetch, apiUrl } from './api';
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

  const inviteMatch = window.location.pathname.match(/^\/invite\/([^/?#]+)/);
  if (inviteMatch) return <InvitePage token={inviteMatch[1]} session={session} />;

  if (!session) return <Login />;
  return <Main session={session} />;
}

function InvitePage({ token, session }) {
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetch(apiUrl(`/api/invites/${token}`))
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => ok ? setInvite(d.invite) : setError(d.error || '邀请无效'));
  }, [token]);

  const accept = async () => {
    if (!session) {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href },
      });
      return;
    }
    setAccepting(true);
    try {
      const res = await authFetch(`/api/invites/${token}/accept`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加入失败');
      localStorage.setItem('activeFolder', data.folderId);
      window.location.replace('/');
    } catch (e) { setError(e.message); setAccepting(false); }
  };

  return (
    <div className="app">
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32, textAlign: 'center'
      }}>
        <h1 className="serif" style={{ fontSize: 28, fontWeight: 600 }}>食谱共享邀请</h1>
        {error && <p className="banner error" style={{ display: 'inline-block' }}>{error}</p>}
        {!error && !invite && <p className="empty">加载中…</p>}
        {invite && (
          <>
            <p style={{ color: 'var(--ink-soft)', maxWidth: 380, lineHeight: 1.6 }}>
              有人邀请你加入文件夹 <strong>「{invite.folderName || '(未命名)'}」</strong>
              ,权限为 <strong>{invite.role === 'editor' ? '可编辑' : '只读'}</strong>。
            </p>
            <button className="btn coral" onClick={accept} disabled={accepting} style={{ padding: '14px 24px' }}>
              {accepting ? '加入中…' : session ? '加入文件夹' : '使用 Google 登录并加入'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Main({ session }) {
  const [tab, setTab] = useState('extract');
  const [recipes, setRecipes] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(() => localStorage.getItem('activeFolder') || null);

  const loadFolders = async () => {
    const res = await authFetch('/api/folders');
    const data = await res.json();
    const list = data.folders || [];
    setFolders(list);
    if (list.length > 0 && (!activeFolder || !list.find(f => f.id === activeFolder))) {
      setActiveFolder(list[0].id);
    }
  };

  const loadList = async (folderId) => {
    setLoadingList(true);
    try {
      const target = folderId !== undefined ? folderId : activeFolder;
      const path = target ? `/api/recipes?folder=${target}` : '/api/recipes';
      const res = await authFetch(path);
      const data = await res.json();
      setRecipes(data.recipes || []);
    } finally { setLoadingList(false); }
  };

  useEffect(() => { loadFolders(); }, []);
  useEffect(() => {
    if (activeFolder) localStorage.setItem('activeFolder', activeFolder);
    loadList();
  }, [activeFolder]);

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
              <Extract folders={folders} activeFolder={activeFolder} onExtracted={onExtracted} />
            </div>
          : <div className="slide-up">
              <FolderBar
                folders={folders}
                active={activeFolder}
                setActive={setActiveFolder}
                reload={loadFolders}
              />
              <Library
                recipes={recipes}
                loading={loadingList}
                reload={loadList}
                folders={folders}
                activeFolder={activeFolder}
              />
            </div>
        }
      </main>
    </div>
  );
}

function FolderBar({ folders, active, setActive, reload }) {
  const [shareFor, setShareFor] = useState(null);

  const create = async () => {
    const name = prompt('文件夹名称');
    if (!name?.trim()) return;
    const res = await authFetch('/api/folders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (data.folder) { await reload(); setActive(data.folder.id); }
  };

  const rename = async (f, e) => {
    e.stopPropagation();
    const name = prompt('改名为', f.name);
    if (!name?.trim() || name.trim() === f.name) return;
    await authFetch(`/api/folders/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    reload();
  };

  const remove = async (f, e) => {
    e.stopPropagation();
    if (folders.length <= 1) return alert('至少保留一个文件夹');
    if (!confirm(`删除文件夹「${f.name}」？里面的食谱会变成「无文件夹」。`)) return;
    await authFetch(`/api/folders/${f.id}`, { method: 'DELETE' });
    if (active === f.id) setActive(folders.find(x => x.id !== f.id)?.id || null);
    reload();
  };

  return (
    <>
      <div className="folder-bar">
        {folders.map(f => (
          <div
            key={f.id}
            className={`folder-pill ${active === f.id ? 'active' : ''}`}
            onClick={() => setActive(f.id)}
          >
            <span>{f.name}</span>
            {f.memberCount > 0 && <span className="badge">共享 {f.memberCount}</span>}
            {!f.isOwner && <span className="badge">受邀</span>}
            {active === f.id && f.isOwner && (
              <span className="folder-actions">
                <button onClick={(e) => { e.stopPropagation(); setShareFor(f); }} title="分享">⇪</button>
                <button onClick={(e) => rename(f, e)} title="改名">✎</button>
                <button onClick={(e) => remove(f, e)} title="删除">✕</button>
              </span>
            )}
          </div>
        ))}
        <button className="folder-pill add" onClick={create}>+ 新建</button>
      </div>
      {shareFor && <ShareModal folder={shareFor} onClose={() => setShareFor(null)} />}
    </>
  );
}

function ShareModal({ folder, onClose }) {
  const [role, setRole] = useState('editor');
  const [ttl, setTtl] = useState(7);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/folders/${folder.id}/invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, ttlDays: ttl }),
      });
      const data = await res.json();
      if (data.invite) setLink(`${window.location.origin}/invite/${data.invite.token}`);
    } finally { setLoading(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="sheet-close" onClick={onClose}>✕</button>
          <h2>分享「{folder.name}」</h2>
          <p className="desc">生成一个邀请链接,谁拿到链接谁就能加入这个文件夹。</p>
        </div>
        <div className="sheet-body">
          <div className="field">
            <label>权限</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              <option value="editor">可编辑(增删食谱)</option>
              <option value="viewer">只读</option>
            </select>
          </div>
          <div className="field">
            <label>有效期</label>
            <select className="input" value={ttl} onChange={e => setTtl(+e.target.value)}>
              <option value={1}>1 天</option>
              <option value={7}>7 天</option>
              <option value={30}>30 天</option>
              <option value={0}>永久</option>
            </select>
          </div>
          {!link
            ? <button className="btn coral" onClick={generate} disabled={loading}>
                {loading ? '生成中…' : '生成邀请链接'}
              </button>
            : <>
                <div className="field">
                  <label>邀请链接</label>
                  <input className="input" readOnly value={link} onFocus={e => e.target.select()} />
                </div>
                <button className="btn coral" onClick={copy}>
                  {copied ? '已复制 ✓' : '复制链接'}
                </button>
              </>
          }
        </div>
      </div>
    </div>
  );
}

function Extract({ folders, activeFolder, onExtracted }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [clipHint, setClipHint] = useState('');
  const [destFolder, setDestFolder] = useState(activeFolder);

  useEffect(() => { if (activeFolder) setDestFolder(activeFolder); }, [activeFolder]);

  const submit = async (raw) => {
    const target = extractXhsUrl(raw) || (raw || '').trim();
    if (!target) return;
    setLoading(true); setError(null); setStatus(null); setClipHint('');
    try {
      const res = await authFetch('/api/recipe/from-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, folderId: destFolder }),
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

      {folders.length > 0 && (
        <div className="field" style={{ marginBottom: 16 }}>
          <label>保存到</label>
          <select className="input" value={destFolder || ''} onChange={e => setDestFolder(e.target.value)}>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}
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

function Library({ recipes, loading, reload, folders, activeFolder }) {
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState('');

  const moveTo = async (recipeId, folderId) => {
    await authFetch(`/api/recipes/${recipeId}/folder`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    setSelected(null);
    reload();
  };

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

      {selected && (
        <RecipeDetail
          recipe={selected}
          folders={folders}
          onClose={() => setSelected(null)}
          onDelete={() => remove(selected.id)}
          onMove={(folderId) => moveTo(selected.id, folderId)}
        />
      )}
    </div>
  );
}

function RecipeDetail({ recipe, folders, onClose, onDelete, onMove }) {
  const otherFolders = (folders || []).filter(f => f.id !== recipe.folderId);
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
            {otherFolders.length > 0 && onMove && (
              <select
                className="input"
                style={{ width: 'auto', padding: '12px 14px' }}
                value=""
                onChange={(e) => e.target.value && onMove(e.target.value)}
              >
                <option value="">移到...</option>
                {otherFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
            <button className="btn danger" onClick={onDelete}>删除</button>
          </div>
        </div>
      </div>
    </div>
  );
}
