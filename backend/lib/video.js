import { spawn } from 'child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// Use the npm-shipped static binaries so this works on hosts without a system
// ffmpeg (e.g. Render's native Node runtime). Fall back to PATH if a platform
// build is missing.
const FFMPEG = ffmpegStatic || 'ffmpeg';
const FFPROBE = ffprobeStatic?.path || 'ffprobe';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const XHS_HEADERS = { 'Referer': 'https://www.xiaohongshu.com/', 'User-Agent': UA };

// Run a child process, resolve on exit code 0, reject otherwise (incl. ENOENT
// when ffmpeg/ffprobe isn't installed — the caller treats this as "skip frames").
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-300)}`));
    });
  });
}

async function probeDuration(file) {
  return new Promise((resolve) => {
    const child = spawn(FFPROBE, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1', file,
    ]);
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('error', () => resolve(NaN));
    child.on('close', () => resolve(parseFloat(out.trim())));
  });
}

/**
 * Download an XHS video and extract evenly-spaced frames as Claude image blocks.
 * Recipe videos almost always burn the steps/seasonings into on-screen subtitles,
 * so these frames give the model the real content instead of letting it guess.
 * Returns [] on any failure so extraction can degrade gracefully to images-only.
 */
export async function extractVideoFrames(videoUrl, { maxFrames = 12 } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'xhs-vid-'));
  try {
    const resp = await fetch(videoUrl, { headers: XHS_HEADERS });
    if (!resp.ok) throw new Error(`video fetch HTTP ${resp.status}`);
    const videoPath = path.join(dir, 'v.mp4');
    await writeFile(videoPath, Buffer.from(await resp.arrayBuffer()));

    const duration = await probeDuration(videoPath);
    const interval = Number.isFinite(duration) && duration > 0
      ? Math.max(2, duration / maxFrames)
      : 3;
    const fps = 1 / interval;

    await run(FFMPEG, [
      '-hide_banner', '-loglevel', 'error', '-i', videoPath,
      '-vf', `fps=${fps},scale='min(768,iw)':-2`,
      '-q:v', '4',
      path.join(dir, 'f-%03d.jpg'),
    ]);

    const files = (await readdir(dir))
      .filter((f) => f.startsWith('f-'))
      .sort()
      .slice(0, maxFrames);

    const blocks = [];
    for (const f of files) {
      const data = await readFile(path.join(dir, f));
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: data.toString('base64') },
      });
    }
    return blocks;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
