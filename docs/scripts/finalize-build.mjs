import { copyFile } from 'node:fs/promises';
// Static hosts can return the fully rendered error document with HTTP 404.
await copyFile(new URL('../build/404/index.html', import.meta.url), new URL('../build/404.html', import.meta.url));
console.log('Prepared static 404.html.');
