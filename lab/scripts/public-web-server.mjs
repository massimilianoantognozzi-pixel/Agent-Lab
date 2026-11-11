import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json', '.pdf': 'application/pdf' };
export const startPublicServer = async (initialRoot, options = {}) => {
  let root = fs.realpathSync(initialRoot);
  const server = http.createServer((request, response) => {
    const fail = status => { response.writeHead(status); response.end(); };
    if (!['GET', 'HEAD'].includes(request.method)) return fail(405);
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; worker-src 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cache-Control', 'no-store');
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === '/__agentlab_axe.js' && options.axeFile) {
        response.setHeader('Content-Type', 'text/javascript'); fs.createReadStream(options.axeFile).pipe(response); return;
      }
      const parts = pathname.split('/').filter(Boolean);
      if (parts.some(part => part === '..' || part.startsWith('.') || /[\\:\0]/.test(part) || /^(?:package(?:-lock)?\.json|tsconfig.*|vite\.config.*|astro\.config.*)$/i.test(part))) return fail(403);
      let file = root;
      for (const part of parts) {
        file = path.join(file, part);
        if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) return fail(403);
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file) && options.spa && !path.extname(file)) file = path.join(root, 'index.html');
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !types[path.extname(file).toLowerCase()] || !fs.existsSync(file) || !fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) return fail(404);
      if (path.extname(file) === '.json' && !relative.replaceAll('\\', '/').startsWith('assets/')) return fail(403);
      response.setHeader('Content-Type', types[path.extname(file).toLowerCase()]);
      if (request.method === 'HEAD') response.end(); else fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch { fail(400); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    update: next => { root = fs.realpathSync(next); },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
};
