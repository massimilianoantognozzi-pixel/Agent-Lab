import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { renderRemotePairingCard } from './workflow-pairing-card.mjs';
import { agentLabPrivateOrigin } from './agentlab-private-origin.mjs';
import { newRemotePairing } from './workflow-pairing-state.mjs';
import { labRoot } from './prepare.mjs';

const directory = path.join(labRoot, 'profile', 'workflow-pilot', 'data');
const pairingFile = path.join(directory, 'remote-pairing.json');
const qrFile = path.join(directory, 'remote-pairing-qr.html');

const atomicText = async (file, text) => {
  const temporary = file + '.' + randomUUID();
  await fs.writeFile(temporary, text, { flag: 'wx' });
  try {
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
};

const readPairing = async () => {
  const record = JSON.parse(await fs.readFile(pairingFile, 'utf8'));
  if (typeof record.project !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(record.project)) {
    throw Error('Progetto Agent-Lab non configurato.');
  }
  return record.project;
};


try {
  if (process.argv[2] === 'qr') {
    const project = await readPairing();
    const origin = await agentLabPrivateOrigin();
    if (!origin) throw Error('Il collegamento HTTPS privato di Agent-Lab non è attivo.');
    const remote = JSON.parse(await fs.readFile(path.join(directory, 'remote-session.json'), 'utf8'));
    if (remote.url !== 'http://127.0.0.1:24363/' || remote.webOrigin !== origin) throw Error('Riavvia Agent-Lab Completo dopo aver attivato Tailscale Serve.');
    const response = await fetch(remote.url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw Error('Agent-Lab Completo non risponde.');
    const pairing = await newRemotePairing(directory, project);
    await atomicText(pairingFile, JSON.stringify(pairing, null, 2));
    await atomicText(qrFile, renderRemotePairingCard({ origin, code: pairing.code, expiresAt: pairing.expiresAt }));
    console.log('QR monouso pronto sul PC.');
  } else if (process.argv[2] === 'revoke') {
    await atomicText(path.join(directory, 'remote-device-revocation.json'), JSON.stringify({ generation: randomUUID() }));
    await fs.rm(qrFile, { force: true });
    console.log('Telefono disassociato. Per associarlo di nuovo genera un QR.');
  } else {
    throw Error('Operazione di associazione non valida.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
