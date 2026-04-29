import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svg = fs.readFileSync(path.join('public', 'icon.svg'));
for (const size of [192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(path.join('public', `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}
