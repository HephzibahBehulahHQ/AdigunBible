import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../dist-legacy/', import.meta.url);
const destination = 'https://adigunbible.hephzibahbehulah.com/';

await mkdir(output);
await copyFile(new URL('../CNAME', import.meta.url), new URL('CNAME', output));
await writeFile(new URL('index.html', output), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${destination}">
<link rel="canonical" href="${destination}">
<title>AdigunBible has moved</title>
<p>Open <a href="${destination}">AdigunBible at its new address</a>.</p>
</html>
`);

