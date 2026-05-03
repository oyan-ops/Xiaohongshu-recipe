import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = 'recipe-covers';

const adminClient = () => createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const isAlreadyMirrored = (url) =>
  !url || url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`);

const inferExt = (contentType, url) => {
  if (/jpeg|jpg/i.test(contentType)) return 'jpg';
  if (/png/i.test(contentType)) return 'png';
  if (/webp/i.test(contentType)) return 'webp';
  if (/gif/i.test(contentType)) return 'gif';
  const m = url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
};

// Download `url` (XHS-friendly headers) and upload to Supabase Storage.
// Returns the public URL of the mirrored copy, or the original URL on failure.
export async function mirrorImage(url) {
  if (isAlreadyMirrored(url)) return url;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.xiaohongshu.com/',
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await resp.arrayBuffer());
    const ext = inferExt(contentType, url);
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
    const key = `${hash}.${ext}`;

    const supa = adminClient();
    const { error } = await supa.storage.from(BUCKET).upload(key, buf, {
      contentType,
      upsert: true,
      cacheControl: '31536000',
    });
    if (error && !/already exists/i.test(error.message)) throw error;

    const { data } = supa.storage.from(BUCKET).getPublicUrl(key);
    return data.publicUrl;
  } catch (err) {
    console.warn('mirrorImage failed for', url, err.message);
    return url;
  }
}
