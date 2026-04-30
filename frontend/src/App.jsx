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

function useCart() {
  const [ids, setIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem('cart', JSON.stringify(ids)); }, [ids]);
  return {
    ids,
    count: ids.length,
    has: (id) => ids.includes(id),
    toggle: (id) => setIds((p) => p.includes(id) ? p.filter(x => x !== id) : [...p, id]),
    remove: (id) => setIds((p) => p.filter(x => x !== id)),
    clear: () => setIds([]),
  };
}

function Main({ session }) {
  const [tab, setTab] = useState('extract');
  const [recipes, setRecipes] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(() => localStorage.getItem('activeFolder') || null);
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart();

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
          <button className={`tab ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>计划</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>记录</button>
        </div>
      </header>

      <main>
        {tab === 'extract' && (
          <div className="slide-up">
            <div className="section-head">
              <h2>提取一道食谱</h2>
              <p>粘贴小红书帖子链接，或整段分享文字。</p>
            </div>
            <Extract folders={folders} activeFolder={activeFolder} onExtracted={onExtracted} />
          </div>
        )}
        {tab === 'library' && (
          <div className="slide-up">
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
              session={session}
              cart={cart}
            />
          </div>
        )}
        {tab === 'plan' && (
          <div className="slide-up">
            <PlanView cart={cart} mode="plan" />
          </div>
        )}
        {tab === 'history' && (
          <div className="slide-up">
            <PlanView cart={cart} mode="history" />
          </div>
        )}
      </main>

      {cart.count > 0 && (
        <button className="cart-fab" onClick={() => setCartOpen(true)}>
          🧺 菜单 <span className="cart-count">{cart.count}</span>
        </button>
      )}
      {cartOpen && <CartDrawer cart={cart} onClose={() => setCartOpen(false)} />}
    </div>
  );
}

function CartDrawer({ cart, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [checked, setChecked] = useState({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(cart.ids.map(id => authFetch(`/api/recipes/${id}`).then(r => r.json()).then(d => d.recipe).catch(() => null)))
      .then(rs => { if (!cancelled) { setItems(rs.filter(Boolean)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [cart.ids.join(',')]);

  const grouped = (() => {
    const map = new Map();
    for (const r of items) {
      for (const ing of r.ingredients || []) {
        const key = (ing.name || '').trim();
        if (!key) continue;
        if (!map.has(key)) map.set(key, { name: key, parts: [] });
        map.get(key).parts.push({ amount: ing.amount, notes: ing.notes, from: r.title });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  })();

  const formatPart = (p) => {
    let s = p.amount || '';
    if (p.notes) s += s ? `（${p.notes}）` : `（${p.notes}）`;
    return `${s} - ${p.from}`;
  };

  const buildText = () => {
    const lines = [];
    lines.push('今日菜单');
    lines.push('━━━━━━━━━━');
    for (const r of items) lines.push(`· ${r.title || '未命名'}`);
    lines.push('');
    lines.push('食材清单');
    lines.push('━━━━━━━━━━');
    for (const g of grouped) {
      if (g.parts.length === 1) {
        const p = g.parts[0];
        lines.push(`${g.name}${p.amount ? ' — ' + p.amount : ''}${p.notes ? '（' + p.notes + '）' : ''}`);
      } else {
        const summary = g.parts.map(p => p.amount || '适量').join(' + ');
        lines.push(`${g.name} — ${summary}`);
        for (const p of g.parts) lines.push(`   · ${p.amount || '适量'}${p.notes ? '（' + p.notes + '）' : ''}(${p.from})`);
      }
    }
    return lines.join('\n');
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(buildText()); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const download = () => {
    const blob = new Blob([buildText()], { type: 'text/plain;charset=utf-8' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = `菜单-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="sheet-close" onClick={onClose}>✕</button>
          <h2>{view === 'list' ? '今日菜单' : '食材清单'}</h2>
          <p className="desc">
            {view === 'list'
              ? `已选 ${items.length} 道菜,合计食材会自动合并。`
              : `${grouped.length} 种食材,逛超市时勾选已购。`}
          </p>
        </div>

        <div className="sheet-body">
          {loading ? (
            <p className="empty">加载中…</p>
          ) : view === 'list' ? (
            <>
              <div className="block">
                <div className="ing-list">
                  {items.length === 0 && <p className="empty" style={{ padding: '20px 0' }}>菜单为空</p>}
                  {items.map((r) => (
                    <div key={r.id} className="ing">
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {r.coverImage && (
                          <img src={r.coverImage} alt="" referrerPolicy="no-referrer"
                            style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                        )}
                        <span className="name">{r.title || '未命名'}</span>
                      </div>
                      <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => cart.remove(r.id)}>
                        移除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="actions">
                <button className="btn coral" onClick={() => setView('groceries')} disabled={items.length === 0}>
                  查看食材清单 →
                </button>
                <button className="btn ghost" onClick={() => { cart.clear(); onClose(); }} disabled={items.length === 0}>
                  清空菜单
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="block">
                <div className="ing-list">
                  {grouped.map((g) => (
                    <div key={g.name} className="ing" onClick={() => setChecked(c => ({ ...c, [g.name]: !c[g.name] }))} style={{ cursor: 'pointer' }}>
                      <div style={{ flex: 1 }}>
                        <span className="name" style={{ textDecoration: checked[g.name] ? 'line-through' : 'none', opacity: checked[g.name] ? 0.5 : 1 }}>
                          <span style={{ marginRight: 10 }}>{checked[g.name] ? '☑' : '☐'}</span>
                          {g.name}
                        </span>
                        <span className="notes">
                          {g.parts.length === 1
                            ? `${g.parts[0].amount || '适量'}${g.parts[0].notes ? '（' + g.parts[0].notes + '）' : ''}`
                            : g.parts.map(p => `${p.amount || '适量'} (${p.from})`).join(' + ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="actions">
                <button className="btn coral" onClick={copy}>{copied ? '已复制 ✓' : '复制为文字'}</button>
                <button className="btn ghost" onClick={download}>下载 .txt</button>
                <button className="btn ghost" onClick={() => setView('list')}>← 返回菜单</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatDateLabel = (iso) => {
  const today = todayISO();
  const d = new Date(iso + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  const wd = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  let label;
  if (diff === 0) label = '今天';
  else if (diff === 1) label = '明天';
  else if (diff === -1) label = '昨天';
  else if (diff > 1 && diff < 7) label = `${diff} 天后`;
  else if (diff < -1 && diff > -7) label = `${-diff} 天前`;
  else label = `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${label} · ${wd}`;
};
const formatFullDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};
const isoFor = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekdayShort = (iso) => ['日','一','二','三','四','五','六'][new Date(iso + 'T00:00:00').getDay()];
const weekdayLong = (iso) => '周' + weekdayShort(iso);
const relativeLabel = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  const t = new Date(todayISO() + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1) return `${diff} 天后`;
  return `${-diff} 天前`;
};
const monthDayLabel = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

function startOfMonth(year, month) { return new Date(year, month, 1); }
function buildMonthGrid(year, month) {
  // returns array of ISO date strings for a 6-row x 7-col grid covering the month, padded with prev/next month days
  const first = startOfMonth(year, month);
  const startWeekday = first.getDay(); // 0 sun
  const start = new Date(first);
  start.setDate(start.getDate() - startWeekday);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    cells.push({ iso: isoFor(d), inMonth: d.getMonth() === month });
  }
  return cells;
}

function parseMinutes(s) {
  if (!s) return 0;
  let mins = 0;
  const h = String(s).match(/(\d+(?:\.\d+)?)\s*(小时|h|hour)/i);
  const m = String(s).match(/(\d+)\s*(分|min)/i);
  if (h) mins += Math.round(parseFloat(h[1]) * 60);
  if (m) mins += parseInt(m[1]);
  if (!h && !m) {
    const n = parseInt(String(s));
    if (!isNaN(n)) mins = n;
  }
  return mins;
}

function HeatMap({ plans }) {
  // 12 weeks ending today, oldest column on the left.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const offsetSinceMonday = (today.getDay() + 6) % 7; // monday=0
  const lastMon = new Date(today); lastMon.setDate(today.getDate() - offsetSinceMonday);
  const startMon = new Date(lastMon); startMon.setDate(lastMon.getDate() - 7 * 11);

  const minutesByDate = {};
  for (const p of plans) {
    if (!p.cooked) continue;
    minutesByDate[p.date] = (minutesByDate[p.date] || 0) + parseMinutes(p.recipe?.cookTime);
  }

  const cells = [];
  for (let w = 0; w < 12; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(startMon);
      cell.setDate(cell.getDate() + w * 7 + d);
      const iso = isoFor(cell);
      const mins = minutesByDate[iso] || 0;
      const future = cell > today;
      let level = 0;
      if (mins > 0 && mins < 30) level = 1;
      else if (mins < 60) level = 2;
      else if (mins < 120) level = 3;
      else if (mins >= 120) level = 4;
      col.push({ iso, mins, level, future });
    }
    cells.push(col);
  }

  const monthLabels = cells.map((col, i) => {
    const d = new Date(col[0].iso + 'T00:00:00');
    if (i === 0) return `${d.getMonth() + 1}月`;
    const prev = new Date(cells[i - 1][0].iso + 'T00:00:00');
    return prev.getMonth() !== d.getMonth() ? `${d.getMonth() + 1}月` : '';
  });

  return (
    <div className="heatmap">
      <div className="heatmap-row">
        <div className="heatmap-row-label" />
        {monthLabels.map((m, i) => <div key={i} className="heatmap-month">{m}</div>)}
      </div>
      {[0, 1, 2, 3, 4, 5, 6].map((d) => (
        <div key={d} className="heatmap-row">
          <div className="heatmap-row-label">{d % 2 === 1 ? ['','一','','三','','五',''][d] : ''}</div>
          {cells.map((col, w) => {
            const c = col[d];
            return (
              <div
                key={w}
                className={`heatmap-cell level-${c.level} ${c.future ? 'future' : ''}`}
                title={`${c.iso}${c.mins ? ` · ${c.mins} 分钟` : ''}`}
              />
            );
          })}
        </div>
      ))}
      <div className="heatmap-legend">
        少 <span className="heatmap-cell level-0" /> <span className="heatmap-cell level-1" />
        <span className="heatmap-cell level-2" /> <span className="heatmap-cell level-3" />
        <span className="heatmap-cell level-4" /> 多
      </div>
    </div>
  );
}

function RangeAddBar({ plans, today, onAdd }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 6);
    return isoFor(d);
  });
  const [done, setDone] = useState(false);

  const inRange = plans.filter(p => p.date >= from && p.date <= to);
  const ids = Array.from(new Set(inRange.map(p => p.recipeId)));

  const apply = () => {
    if (ids.length === 0) return;
    onAdd(ids);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };

  const setQuick = (days) => {
    const d = new Date(); d.setDate(d.getDate() + days - 1);
    setFrom(today);
    setTo(isoFor(d));
  };

  return (
    <div className="range-bar">
      <div className="range-row">
        <span className="range-label">提前买菜</span>
        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        <span style={{ color: 'var(--ink-mute)' }}>到</span>
        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
      </div>
      <div className="range-row">
        <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setQuick(3)}>未来 3 天</button>
        <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setQuick(7)}>未来 7 天</button>
        <button className="btn coral" style={{ padding: '8px 14px', fontSize: 13 }} onClick={apply} disabled={ids.length === 0}>
          {done ? '已加入 ✓' : `加入菜单 (${ids.length} 道)`}
        </button>
      </div>
    </div>
  );
}

function PlanView({ cart, mode }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(null);
  const today = todayISO();
  const initialDate = today;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  const load = async () => {
    setLoading(true);
    try {
      // Pull a generous window: previous month, this month, next month — covers grid + neighbours.
      const start = new Date(viewYear, viewMonth - 1, 1);
      const end = new Date(viewYear, viewMonth + 2, 0);
      const url = `/api/plans?from=${isoFor(start)}&to=${isoFor(end)}`;
      const res = await authFetch(url);
      const data = await res.json();
      setPlans(data.plans || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [mode, viewYear, viewMonth]);

  const remove = async (planId) => {
    await authFetch(`/api/plans/${planId}`, { method: 'DELETE' });
    load();
  };
  const toggleCooked = async (plan) => {
    await authFetch(`/api/plans/${plan.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cooked: !plan.cooked }),
    });
    load();
  };
  const addAllToCart = (recipeIds) => {
    for (const id of recipeIds) if (!cart.has(id)) cart.toggle(id);
  };

  // History mode shows only cooked entries; plan mode shows everything.
  const visiblePlans = mode === 'history' ? plans.filter(p => p.cooked) : plans;
  const byDate = new Map();
  for (const p of visiblePlans) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push(p);
  }

  const grid = buildMonthGrid(viewYear, viewMonth);

  const goPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
    setSelectedDate(today);
  };

  const selectedList = byDate.get(selectedDate) || [];
  const isToday = selectedDate === today;
  const isFuture = selectedDate >= today;
  const allowEdit = mode === 'plan' ? isFuture : true; // history can still toggle/remove

  return (
    <div>
      <div className="section-head">
        {mode === 'history'
          ? <><h2>做菜记录</h2><p>真做过的菜的轨迹 — 在「计划」里点 ☑ 之后才会出现在这里。</p></>
          : <><h2>做菜计划</h2><p>点日历选一天 → 加菜 / 标做过。下方还可以一次性把几天的菜加进购物车。</p></>
        }
      </div>

      {mode === 'history' && <HeatMap plans={plans} />}
      {mode === 'plan' && (
        <RangeAddBar
          plans={plans}
          today={today}
          onAdd={(ids) => addAllToCart(ids)}
        />
      )}

      <div className="cal">
        <div className="cal-head">
          <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={goPrev}>‹</button>
          <div className="cal-title">{viewYear} 年 {viewMonth + 1} 月</div>
          <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={goNext}>›</button>
          <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 12, marginLeft: 8 }} onClick={goToday}>今天</button>
        </div>
        <div className="cal-weekdays">
          {['日','一','二','三','四','五','六'].map((w) => <div key={w}>{w}</div>)}
        </div>
        <div className="cal-grid">
          {grid.map(({ iso, inMonth }) => {
            const has = byDate.has(iso);
            const list = byDate.get(iso) || [];
            const allCooked = list.length > 0 && list.every(p => p.cooked);
            return (
              <button
                key={iso}
                className={[
                  'cal-cell',
                  inMonth ? '' : 'out',
                  iso === today ? 'today' : '',
                  iso === selectedDate ? 'selected' : '',
                  has ? 'has' : '',
                  allCooked ? 'all-cooked' : '',
                ].join(' ')}
                onClick={() => setSelectedDate(iso)}
              >
                <span className="cal-num">{new Date(iso + 'T00:00:00').getDate()}</span>
                {has && <span className="cal-dot" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`plan-day ${isToday ? 'today' : ''}`} style={{ marginTop: 24 }}>
        <div className="plan-day-head">
          <div>
            <div className="plan-big-date">{monthDayLabel(selectedDate)}</div>
            <div className="plan-weekday">{weekdayLong(selectedDate)}</div>
            <div className="plan-relative">{relativeLabel(selectedDate)}</div>
          </div>
          {mode === 'plan' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {selectedList.length > 0 && (
                <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => addAllToCart(selectedList.map(p => p.recipeId))}>全部加入菜单</button>
              )}
              {allowEdit && (
                <button className="btn coral" style={{ padding: '6px 14px', fontSize: 12 }}
                  onClick={() => setShowPicker(selectedDate)}>+ 加菜</button>
              )}
            </div>
          )}
        </div>

        {loading
          ? <p className="empty" style={{ padding: '8px 0', textAlign: 'left', fontSize: 13 }}>加载中…</p>
          : selectedList.length === 0
            ? <p className="empty" style={{ padding: '8px 0', textAlign: 'left', fontSize: 13 }}>
                {mode === 'history' ? '这一天没有记录' : '这一天还没安排,点 + 加菜'}
              </p>
            : (
              <div className="plan-cards">
                {selectedList.map((p) => (
                  <div key={p.id} className={`plan-card ${p.cooked ? 'cooked' : ''}`}>
                    {mode === 'plan' && (
                      <button className="plan-cooked-toggle" onClick={() => toggleCooked(p)}>{p.cooked ? '☑' : '☐'}</button>
                    )}
                    {p.recipe?.coverImage && <img src={p.recipe.coverImage} alt="" referrerPolicy="no-referrer" />}
                    <div className="plan-card-body">
                      <div className="plan-card-title">{p.recipe?.title || '(食谱已删除)'}</div>
                      {p.recipe?.cookTime && <div className="plan-card-meta">烹饪 {p.recipe.cookTime}</div>}
                    </div>
                    {mode === 'plan' && (
                      <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => remove(p.id)}>移除</button>
                    )}
                  </div>
                ))}
              </div>
            )
        }
      </div>

      {showPicker && (
        <RecipePickerModal
          date={showPicker}
          onClose={() => setShowPicker(null)}
          onPicked={async (recipeId) => {
            await authFetch('/api/plans', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ recipeId, date: showPicker }),
            });
            setShowPicker(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RecipePickerModal({ date, onClose, onPicked }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    authFetch('/api/recipes')
      .then(r => r.json())
      .then(d => { setRecipes(d.recipes || []); setLoading(false); });
  }, []);

  const filtered = recipes.filter(r => !q || (r.title || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="sheet-close" onClick={onClose}>✕</button>
          <h2>添加菜到 {formatDateLabel(date)}</h2>
        </div>
        <div className="sheet-body">
          <input className="input" placeholder="搜索食谱" value={q} onChange={e => setQ(e.target.value)} />
          {loading ? <p className="empty">加载中…</p> : (
            <div className="ing-list">
              {filtered.map(r => (
                <div key={r.id} className="ing" onClick={() => onPicked(r.id)} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
                    {r.coverImage && <img src={r.coverImage} alt="" referrerPolicy="no-referrer" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />}
                    <span className="name">{r.title || '未命名'}</span>
                  </div>
                  <span className="amount">+</span>
                </div>
              ))}
              {filtered.length === 0 && <p className="empty">没有匹配的食谱</p>}
            </div>
          )}
        </div>
      </div>
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
  const [members, setMembers] = useState(null);

  const loadMembers = async () => {
    const res = await authFetch(`/api/folders/${folder.id}/members`);
    if (res.ok) setMembers(await res.json());
  };

  useEffect(() => { loadMembers(); }, [folder.id]);

  const removeMember = async (userId) => {
    if (!confirm('确认移除该成员?')) return;
    await authFetch(`/api/folders/${folder.id}/members/${userId}`, { method: 'DELETE' });
    loadMembers();
  };

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

  const displayName = (u) => u?.name || u?.email || u?.userId?.slice(0, 8);

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="sheet-close" onClick={onClose}>✕</button>
          <h2>分享「{folder.name}」</h2>
          <p className="desc">生成一个邀请链接,谁拿到链接谁就能加入这个文件夹。</p>
        </div>
        <div className="sheet-body">
          {members && (
            <div className="block">
              <h3>成员 ({1 + members.members.length})</h3>
              <div className="ing-list">
                <div className="ing">
                  <div>
                    <span className="name">{displayName(members.owner)}</span>
                    <span className="notes">拥有者</span>
                  </div>
                </div>
                {members.members.map((m) => (
                  <div key={m.userId} className="ing">
                    <div>
                      <span className="name">{displayName(m)}</span>
                      <span className="notes">{m.role === 'editor' ? '可编辑' : '只读'}</span>
                    </div>
                    <button className="btn danger" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => removeMember(m.userId)}>
                      移除
                    </button>
                  </div>
                ))}
                {members.members.length === 0 && (
                  <p className="empty" style={{ padding: '12px 0', textAlign: 'left' }}>暂无成员,生成下方链接邀请。</p>
                )}
              </div>
            </div>
          )}

          <div className="field">
            <label>新邀请权限</label>
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
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch {
        throw new Error(`服务器返回异常 (HTTP ${res.status})。请稍后重试。${text.slice(0, 120)}`);
      }
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

function Library({ recipes, loading, reload, folders, activeFolder, session, cart }) {
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState('');
  const [userMap, setUserMap] = useState({});

  const currentFolder = (folders || []).find((f) => f.id === activeFolder);
  const isShared = currentFolder && (!currentFolder.isOwner || currentFolder.memberCount > 0);

  useEffect(() => {
    if (!isShared) return;
    const ids = Array.from(new Set(recipes.map((r) => r.userId).filter(Boolean)));
    const missing = ids.filter((id) => !userMap[id]);
    if (missing.length === 0) return;
    authFetch('/api/users/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: missing }),
    })
      .then((r) => r.json())
      .then((d) => setUserMap((prev) => ({ ...prev, ...(d.users || {}) })));
  }, [recipes, isShared]);

  const labelFor = (userId) => {
    if (!userId || userId === session?.user?.id) return null;
    const u = userMap[userId];
    return u?.name || u?.email?.split('@')[0] || null;
  };

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
              {cart && (
                <button
                  className={`card-cart ${cart.has(r.id) ? 'in' : ''}`}
                  onClick={(e) => { e.stopPropagation(); cart.toggle(r.id); }}
                >
                  {cart.has(r.id) ? '✓ 已加入' : '+ 加入菜单'}
                </button>
              )}
              <div className="card-body">
                <div className="card-title">{r.title || '未命名'}</div>
                {r.description && <div className="card-desc">{r.description}</div>}
                <div className="card-meta">
                  {r.prepTime && <span>准备 {r.prepTime}</span>}
                  {r.cookTime && <><span className="dot">·</span><span>烹饪 {r.cookTime}</span></>}
                  {r.servings && <><span className="dot">·</span><span>{r.servings}</span></>}
                </div>
                {labelFor(r.userId) && (
                  <div className="card-meta" style={{ paddingTop: 0 }}>
                    <span>{labelFor(r.userId)} 添加</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <RecipeDetail
          recipe={selected}
          folders={folders}
          addedBy={labelFor(selected.userId)}
          onClose={() => setSelected(null)}
          onDelete={() => remove(selected.id)}
          onMove={(folderId) => moveTo(selected.id, folderId)}
        />
      )}
    </div>
  );
}

function RecipeDetail({ recipe, folders, addedBy, onClose, onDelete, onMove }) {
  const otherFolders = (folders || []).filter(f => f.id !== recipe.folderId);
  const [planDate, setPlanDate] = useState(todayISO());
  const [planAdded, setPlanAdded] = useState(false);

  const addToPlan = async () => {
    const res = await authFetch('/api/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: recipe.id, date: planDate }),
    });
    const data = await res.json();
    setPlanAdded(true);
    setTimeout(() => setPlanAdded(false), 1500);
  };
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
          {addedBy && <p className="author" style={{ marginTop: 4 }}>由 {addedBy} 添加</p>}
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

          <div className="block">
            <h3>加入计划</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="date"
                className="input"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                style={{ width: 'auto', flex: '0 1 200px' }}
              />
              <button className="btn coral" onClick={addToPlan}>
                {planAdded ? '已加入 ✓' : '加入这天'}
              </button>
            </div>
          </div>

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
