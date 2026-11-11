import http from 'node:http';

const allowed = /^\/(?:|manifest\.webmanifest|remote-sw\.js|icon-(?:192|512)\.png|api\/(?:pair|tasks(?:\/[a-zA-Z0-9-]{1,80})?|action|revoke))$/;
const server = http.createServer({ requestTimeout: 10_000, headersTimeout: 10_000, maxHeaderSize: 8192 }, (incoming, outgoing) => {
  if (!incoming.url || !allowed.test(incoming.url) || (incoming.method !== 'GET' && incoming.method !== 'POST')) {
    outgoing.writeHead(404).end();
    return;
  }
  const headers = {};
  for (const name of ['authorization', 'cookie', 'content-type', 'content-length', 'origin']) {
    if (incoming.headers[name]) headers[name] = incoming.headers[name];
  }
  const proxy = http.request({
    hostname: 'host.docker.internal',
    port: 24363,
    path: incoming.url,
    method: incoming.method,
    headers,
    timeout: 10_000,
  }, response => {
    const forwarded = {};
    for (const name of ['content-type', 'content-security-policy', 'cache-control', 'referrer-policy', 'x-content-type-options', 'set-cookie']) {
      if (response.headers[name]) forwarded[name] = response.headers[name];
    }
    outgoing.writeHead(response.statusCode ?? 502, forwarded);
    response.pipe(outgoing);
  });
  proxy.on('timeout', () => proxy.destroy());
  proxy.on('error', () => {
    if (!outgoing.headersSent) outgoing.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    outgoing.end('Agent-Lab non è aperto sul PC.');
  });
  incoming.on('aborted', () => proxy.destroy());
  incoming.pipe(proxy);
});
server.listen(8080, '127.0.0.1');
