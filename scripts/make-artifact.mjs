// Turns the single-file build (dist-single/index.html) into a page body suitable for
// hosts that wrap content in their own <html>/<head>/<body> skeleton.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = src.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';

const pick = (re) => [...head.matchAll(re)].map((m) => m[0]);
const title = pick(/<title>[\s\S]*?<\/title>/gi);
const metas = pick(/<meta name="(?:claude:viewport-fit-sides|description)"[^>]*>/gi);
const links = pick(/<link rel="(?:preconnect|stylesheet)"[^>]*>/gi);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/gi);
const scripts = pick(/<script[^>]*>[\s\S]*?<\/script>/gi);

const out = [...title, ...metas, ...links, ...styles, body.trim(), ...scripts].join('\n');
writeFileSync(new URL('../dist-single/artifact.html', import.meta.url), out);
console.log('artifact.html', (out.length / 1024).toFixed(0) + ' KB', { title: title.length, styles: styles.length, scripts: scripts.length });
