import fs from 'fs';
import path from 'path';

const COOKIES_PATH = path.join(process.cwd(), 'cookies.txt');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const loadCookies = () => {
  if (process.env.XHS_COOKIES) return process.env.XHS_COOKIES.trim();
  if (fs.existsSync(COOKIES_PATH)) return fs.readFileSync(COOKIES_PATH, 'utf-8').trim();
  throw new Error('未找到小红书 cookies。本地需保存到 backend/cookies.txt；部署环境请设置 XHS_COOKIES 环境变量');
};

export async function fetchXhsPost(url) {
  const cookieStr = loadCookies();

  const resp = await fetch(url, {
    headers: {
      'Cookie': cookieStr,
      'User-Agent': UA,
      'Referer': 'https://www.xiaohongshu.com/',
    },
    redirect: 'follow',
  });

  if (!resp.ok) throw new Error(`抓取失败：HTTP ${resp.status}`);
  const html = await resp.text();

  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*<\/script>/s);
  if (!m) throw new Error('未找到 __INITIAL_STATE__，cookies 可能已过期，请重新导出');

  let data;
  try {
    data = JSON.parse(m[1].replace(/undefined/g, 'null'));
  } catch (e) {
    throw new Error('解析 __INITIAL_STATE__ JSON 失败：' + e.message);
  }

  const noteMap = data?.note?.noteDetailMap;
  if (!noteMap) throw new Error('帖子数据缺失，cookies 可能已过期或链接无效');
  const noteId = Object.keys(noteMap)[0];
  const note = noteMap[noteId]?.note;
  if (!note) throw new Error('帖子数据为空');

  const images = (note.imageList || [])
    .map((i) => i.urlDefault || i.url)
    .filter(Boolean);

  let videoUrl = null;
  if (note.type === 'video' && note.video?.media?.stream) {
    const stream = note.video.media.stream;
    const v = stream.h264?.[0] || stream.h265?.[0] || stream.av1?.[0];
    videoUrl = v?.masterUrl || null;
  }

  return {
    noteId,
    title: note.title || '',
    desc: note.desc || '',
    type: note.type,
    author: note.user?.nickname || '',
    images,
    coverImage: images[0] || null,
    videoUrl,
    sourceUrl: url,
  };
}
