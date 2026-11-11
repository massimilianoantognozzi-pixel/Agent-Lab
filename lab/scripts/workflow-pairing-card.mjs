import qrcodegen from './vendor/qrcodegen.cjs';

const qrSvg = (payload) => {
  const matrix = qrcodegen.QrCode.encodeText(payload, qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = matrix.size + border * 2;
  const pathData = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.getModule(x, y)) pathData.push('M' + (x + border) + ' ' + (y + border) + 'h1v1h-1z');
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size +
    '" role="img" aria-label="QR di associazione" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="' +
    pathData.join('') + '" fill="black"/></svg>';
};

const card = (svg, origin, expiresAt) => [
  '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">",
  '<title>Associa Agent-Lab</title><style>',
  'html{color-scheme:dark;background:#080808;color:#f4f4f4;font:16px/1.5 system-ui,sans-serif}',
  'main{max-width:460px;margin:8vh auto 0;padding:20px;text-align:center}h1{font-size:26px;margin:0 0 8px}',
  'p{color:#b9b9c0;margin:8px 0}svg{display:block;width:min(100%,340px);height:auto;margin:24px auto 12px;background:#fff;border-radius:10px}',
  '</style></head><body><main><h1>Associa il telefono</h1>',
  '<p>Con Tailscale attivo, inquadra il QR con la fotocamera e premi <strong>Associa</strong>.</p>',
  svg,
  '<p>' + origin + '</p>',
  '<p>QR monouso valido fino alle ' + new Date(expiresAt).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }) + '.</p>',
  '</main></body></html>',
].join('\n');


export const renderRemotePairingCard = ({ origin, code, expiresAt }) => {
  const address = new URL(origin);
  if (address.protocol !== 'https:' || address.origin !== origin || !/^[a-f0-9]{32}$/.test(code) || !Number.isFinite(expiresAt)) {
    throw Error('Dati di associazione non validi.');
  }
  return card(qrSvg(origin + '/#pair=' + code), origin, expiresAt);
};
