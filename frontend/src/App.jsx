import { useState, useEffect } from 'react';
import { apiUrl } from './api';

const XHS_URL_RE = /https?:\/\/(?:www\.)?(?:xiaohongshu\.com|xhslink\.com)\/[^\s]+/i;
const extractXhsUrl = (t) => (t && t.match(XHS_URL_RE)?.[0]) || '';

const EMOJIS = ['🍝','🍜','🍲','🥘','🍛','🍚','🍱','🍣','🍤','🥟','🥗','🍞','🥐','🧁','🍰','🍪','🥞','🍳','🍕','🌮','🌯','🍔','🍟','🥩','🍗','🍖','🥓','🌽','🥕','🥬','🍅','🥑','🍇','🍓','🍑','🍊','🍋','🍌','🥭','🍍','🍵','🥤','☕','🍦'];
const COVERS = ['#FFF1F1','#F0FFF8','#FFFBF0','#FFFEF0','#F0F7FF','#FFF0F8','#F4F0FF','#F0FFF4'];
const hash = (s='') => { let h=0; for (let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h); };
const decorate = (r) => {
  const h = hash(r.id || r.title || '');
  return { ...r, _emoji: r._emoji || EMOJIS[h % EMOJIS.length], _cover: r._cover || COVERS[h % COVERS.length] };
};

export default function App() {
  const [tab, setTab] = useState('extract');
  const [recipes, setRecipes] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const res = await fetch(apiUrl('/api/recipes'));
      const data = await res.json();
      setRecipes((data.recipes || []).map(decorate));
    } finally { setLoadingList(false); }
  };

  useEffect(() => { loadList(); }, []);

  const onExtracted = () => { loadList(); setTimeout(() => setTab('library'), 600); };

  return (
    <div style={{maxWidth:640, margin:'0 auto', minHeight:'100vh', display:'flex', flexDirection:'column', background:'#fff'}}>
      <header className="sticky top-0 z-40 bg-white-90 border-b border-gray-100 backdrop-blur">
        <div className="px-5 pt-5">
          <div className="flex items-center gap-2-5 mb-4">
            <span style={{fontSize:26}} className="float">🍜</span>
            <h1 className="text-xl font-900 text-gray-900 tracking-tight">小红书食谱</h1>
            <span className="ml-auto text-xs font-700 px-2-5 py-1 rounded-full text-white bg-coral">{recipes.length} 收藏</span>
          </div>
          <div className="flex relative">
            {[{k:'extract',l:'✨ 提取食谱'},{k:'library',l:'📚 我的食谱'}].map(({k,l}) => (
              <button key={k} onClick={()=>setTab(k)}
                className={`flex-1 pb-3 text-sm font-700 transition-colors ${tab===k?'text-coral':'text-gray-400 hover-text-gray-600'}`}>
                {l}
              </button>
            ))}
            <div className="absolute bottom-0 h-half rounded-full tab-indicator bg-coral"
              style={{width:'50%', left: tab==='extract'?0:'50%'}} />
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 py-6">
        {tab === 'extract'
          ? <div className="slide-up">
              <div className="mb-5">
                <h2 className="text-lg font-900 text-gray-900">提取食谱</h2>
                <p className="text-sm font-500 text-gray-400 mt-1 leading-relaxed">粘贴小红书帖子链接或整段分享文字，AI 自动整理成结构化食谱。</p>
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
  const [done, setDone] = useState(false);

  const submit = async (raw) => {
    const target = extractXhsUrl(raw) || raw.trim();
    if (!target) return;
    setLoading(true); setError(null); setDone(false);
    try {
      const res = await fetch(apiUrl('/api/recipe/from-link'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '抓取失败');
      setDone(true);
      onExtracted?.();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const found = extractXhsUrl(params.get('url') || params.get('text') || params.get('title') || '');
    if (found) {
      setUrl(found);
      submit(found);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-700 text-gray-400 uppercase tracking-wide">小红书链接或分享文字</label>
        <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit(url)}
          placeholder="粘贴小红书链接或整段分享文字"
          className="w-full px-4 py-3-5 rounded-2xl border-2 border-gray-200 text-sm font-500 text-gray-900 transition-all" />
        <button onClick={()=>submit(url)} disabled={!url.trim() || loading}
          className="w-full py-3-5 rounded-2xl text-sm font-800 text-white btn-bounce flex items-center justify-center gap-2"
          style={{background: (!url.trim()||loading) ? '#f3f4f6' : '#FF4D4F', color:(!url.trim()||loading)?'#9ca3af':'#fff', cursor:(!url.trim()||loading)?'not-allowed':'pointer'}}>
          {loading ? <><span className="spin">⭐</span> 抓取中…</> : '✨ 抓取并提取'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-coral-mid bg-coral-light text-sm font-600 text-coral-dark fade-in">
          ❌ {error}
        </div>
      )}
      {done && !error && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-green-100 bg-green-50 bounce-in">
          <span className="text-xl">✅</span>
          <div>
            <p className="text-sm font-700 text-gray-900">食谱已保存！</p>
            <p className="text-xs font-500 text-gray-400 mt-half">即将跳转到「我的食谱」</p>
          </div>
        </div>
      )}
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
      || (r.tags || []).some(t => (t||'').toLowerCase().includes(term));
  });

  const open = async (id) => {
    const res = await fetch(apiUrl(`/api/recipes/${id}`));
    const data = await res.json();
    setSelected(decorate(data.recipe));
  };

  const remove = async (id) => {
    if (!confirm('确定删除这条食谱？')) return;
    await fetch(apiUrl(`/api/recipes/${id}`), { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    reload();
  };

  if (loading) return <p className="text-sm font-500 text-gray-400 text-center py-16">加载中…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <span className="absolute left-4 top-half translate-y-neg-half text-gray-300 text-sm">🔍</span>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索食谱或标签…"
          className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-gray-200 text-sm font-500 text-gray-900 transition-all" />
      </div>
      <p className="text-xs font-600 text-gray-400">{filtered.length} 道食谱</p>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <span style={{fontSize:48}}>🍽️</span>
          <p className="font-800 text-gray-700">还没有食谱</p>
          <p className="text-sm font-500 text-gray-400">去「提取食谱」试试吧 ✨</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((r, i) => (
            <div key={r.id} style={{animationDelay:`${i*0.06}s`}}>
              <RecipeCard recipe={r} onClick={() => open(r.id)} />
            </div>
          ))}
        </div>
      )}

      {selected && <RecipeDetail recipe={selected} onClose={() => setSelected(null)} onDelete={() => remove(selected.id)} />}
    </div>
  );
}

function RecipeCard({ recipe, onClick }) {
  return (
    <div onClick={onClick} className="card-hover cursor-pointer bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-card bounce-in">
      <div style={{background: recipe._cover, padding:'20px 20px 14px', position:'relative'}}>
        <span style={{fontSize:36}}>{recipe._emoji}</span>
        {recipe.tags?.[0] && (
          <div className="absolute top-3 right-3 flex flex-wrap gap-1 justify-end max-w-60">
            <Tag label={recipe.tags[0]} />
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-800 text-gray-900 text-sm leading-snug mb-1">{recipe.title || '未命名'}</h3>
        {recipe.description && <p className="text-xs font-500 text-gray-400 leading-relaxed line-clamp-2 mb-3">{recipe.description}</p>}
        <div className="flex items-center gap-3 text-xs font-600 text-gray-400">
          {recipe.prepTime && <span>⏱ {recipe.prepTime}</span>}
          {recipe.cookTime && <><span className="text-gray-200">·</span><span>🔥 {recipe.cookTime}</span></>}
          {recipe.servings && <><span className="text-gray-200">·</span><span>{recipe.servings}</span></>}
        </div>
      </div>
    </div>
  );
}

function Tag({ label }) {
  return (
    <span className="inline-flex items-center px-2-5 py-0-5 rounded-full text-xs font-600 bg-coral-light text-coral-dark whitespace-nowrap">
      {label}
    </span>
  );
}

function Stat({ icon, label }) {
  return (
    <div className="flex items-center gap-1-5 bg-gray-50 rounded-xl px-3 py-2 text-xs font-600 text-gray-700 border border-gray-100">
      <span>{icon}</span><span>{label}</span>
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
    <div className="fixed inset-0 z-50 fade-in" style={{background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div className="absolute bottom-0 left-0 right-0 sheet-up no-scroll-bar"
        style={{background:'#fff', borderRadius:'24px 24px 0 0', maxHeight:'92vh', overflowY:'auto', maxWidth:640, margin:'0 auto'}}
        onClick={e => e.stopPropagation()}>

        <div style={{background: recipe._cover, borderRadius:'24px 24px 0 0', padding:'32px 24px 20px'}}>
          <div className="flex items-start justify-between gap-4">
            <div style={{fontSize:52, lineHeight:1}} className="float">{recipe._emoji}</div>
            <button onClick={onClose}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-white-70 border border-gray-200 flex items-center justify-center text-gray-500 hover-bg-white transition-all text-sm font-700">✕</button>
          </div>
          <h2 className="mt-3 text-xl font-900 text-gray-900 leading-tight">{recipe.title || '未命名'}</h2>
          {recipe.description && <p className="mt-1-5 text-sm font-500 text-gray-500 leading-relaxed">{recipe.description}</p>}
          {recipe.author && <p className="mt-1 text-xs font-600 text-gray-400">— {recipe.author}</p>}
        </div>

        <div className="px-6 py-5 flex flex-col gap-6">
          {(recipe.servings || recipe.prepTime || recipe.cookTime) && (
            <div className="flex flex-wrap gap-2">
              {recipe.servings && <Stat icon="🍽️" label={recipe.servings} />}
              {recipe.prepTime && <Stat icon="⏱️" label={`准备 ${recipe.prepTime}`} />}
              {recipe.cookTime && <Stat icon="🔥" label={`烹饪 ${recipe.cookTime}`} />}
            </div>
          )}

          {recipe.ingredients?.length > 0 && (
            <section>
              <h3 className="text-sm font-800 text-gray-900 uppercase tracking-wide mb-3">食材</h3>
              <ul className="flex flex-col gap-2">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-500 text-gray-800">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-coral-light text-coral text-xs font-800 flex items-center justify-center mt-half">{i+1}</span>
                    <span>
                      {ing.name}
                      {ing.amount && <span className="text-gray-500"> · {ing.amount}</span>}
                      {ing.notes && <span className="text-gray-400"> （{ing.notes}）</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recipe.steps?.length > 0 && (
            <section>
              <h3 className="text-sm font-800 text-gray-900 uppercase tracking-wide mb-3">步骤</h3>
              <ol className="flex flex-col gap-3">
                {recipe.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 p-3-5 rounded-2xl border border-gray-100 bg-gray-50-60 text-sm text-gray-800">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-coral text-white text-xs font-800 flex items-center justify-center mt-half">{i+1}</span>
                    <span className="leading-relaxed font-500">
                      {s.description}
                      {s.tips && <div className="mt-1 text-xs font-500 text-coral-dark">💡 {s.tips}</div>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {recipe.tips?.length > 0 && (
            <section>
              <h3 className="text-sm font-800 text-gray-900 uppercase tracking-wide mb-3">小贴士</h3>
              <div className="flex flex-col gap-2">
                {recipe.tips.map((tip, i) => (
                  <div key={i} className="flex gap-2-5 p-3 rounded-xl bg-coral-light border border-coral-mid text-sm font-500 text-gray-800">
                    <span className="text-base flex-shrink-0">💡</span>
                    <span className="leading-relaxed">{tip}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {recipe.tags?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recipe.tags.map(t => <Tag key={t} label={`#${t}`} />)}
            </div>
          )}

          {(recipe.sourceUrl || recipe.videoUrl) && (
            <div className="flex flex-wrap gap-3 pt-1">
              {recipe.sourceUrl && (
                <a href={recipe.sourceUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2-5 rounded-xl bg-coral text-white text-sm font-700 btn-bounce"
                  style={{textDecoration:'none'}}>📌 原帖</a>
              )}
              {recipe.videoUrl && (
                <a href={recipe.videoUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2-5 rounded-xl border-2 border-coral text-coral text-sm font-700 btn-bounce"
                  style={{textDecoration:'none'}}>🎬 原视频</a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={exportJSON}
              className="inline-flex items-center gap-2 px-4 py-2-5 rounded-xl border-2 border-gray-200 text-gray-700 text-sm font-700 btn-bounce bg-white">
              📥 导出 JSON
            </button>
            <button onClick={onDelete}
              className="inline-flex items-center gap-2 px-4 py-2-5 rounded-xl border-2 border-coral-mid text-coral-dark text-sm font-700 btn-bounce bg-coral-light">
              🗑 删除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
