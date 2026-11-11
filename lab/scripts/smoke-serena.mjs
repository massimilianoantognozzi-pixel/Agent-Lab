import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { prepare, laboratoryEnvironment, repoRoot, labRoot, sampleDir, homeDir } from './prepare.mjs';

const require = createRequire(path.join(repoRoot, 'package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
prepare();
const config = JSON.parse(fs.readFileSync(path.join(homeDir, 'mcp-servers.json'))).mcpServers.serena;
const transport = new StdioClientTransport({ command: config.command, args: config.args, cwd: sampleDir, env: { ...laboratoryEnvironment(), ...config.env }, stderr: 'pipe' });
transport.stderr.on('data', chunk => fs.appendFileSync(path.join(labRoot, 'work', 'serena-runtime.log'), chunk));
const client = new Client({ name: 'agent-lab-readonly-check', version: '1.0.0' });
const report = { startedAt: new Date().toISOString(), project: sampleDir };
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  report.tools = tools.map(tool => tool.name);
  report.symbolSchema = tools.find(tool => tool.name === 'find_symbol')?.inputSchema;
  report.overview = await client.callTool({ name: 'get_symbols_overview', arguments: { relative_path: 'calculator.py', depth: 1 } }, undefined, { timeout: 120000 });
  report.symbol = await client.callTool({ name: 'find_symbol', arguments: { name_path_pattern: 'calculate_subtotal', relative_path: 'calculator.py', include_body: true } }, undefined, { timeout: 120000 });
  report.pass = !report.overview.isError && !report.symbol.isError && JSON.stringify(report.symbol).includes('calculate_subtotal');
  if (!report.pass) throw new Error('Serena symbolic read failed');
  console.log(JSON.stringify({ pass: report.pass, tools: report.tools.length, overview: report.overview, symbol: report.symbol }, null, 2));
} catch (error) {
  report.error = error.stack ?? String(error);
  process.exitCode = 1;
  console.error(report.error);
} finally {
  fs.writeFileSync(path.join(labRoot, 'work', 'serena-smoke.json'), JSON.stringify(report, null, 2));
  await client.close();
  await transport.close();
}
