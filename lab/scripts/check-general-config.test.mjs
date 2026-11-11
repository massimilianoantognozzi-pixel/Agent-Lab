import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { labRoot } from './prepare.mjs';
import { generalEnvironment,atomicProfileWrite,restoreGeneralSerenaTools } from './configure-general-gui.mjs';
import { ensureLocalFallback, localBaseModel, localFallbackModel } from './local-fallback.mjs';

test('general launch preserves the normal toolchain and drops Codex IPC',()=>{
  const inherited={Path:'C:\\tools',JAVA_HOME:'C:\\jdk',VIRTUAL_ENV:'C:\\project\\venv',GIT_CONFIG_GLOBAL:'C:\\user\\gitconfig',CODEX_APP_TOOLS_PIPE_PATH:'private',ELECTRON_RUN_AS_NODE:'1'};
  const env=generalEnvironment({inherited});
  for(const key of ['Path','JAVA_HOME','VIRTUAL_ENV','GIT_CONFIG_GLOBAL'])assert.equal(env[key],inherited[key]);
  for(const key of ['CODEX_APP_TOOLS_PIPE_PATH','ELECTRON_RUN_AS_NODE','HF_HUB_OFFLINE','TRANSFORMERS_OFFLINE','GIT_CEILING_DIRECTORIES','AIDER_DESK_AIDER_VERSION','AIDER_DESK_NO_UPDATES'])assert.equal(env[key],undefined);
  assert.equal(env.AIDER_DESK_LAB_MODE,'false');assert.equal(env.AIDER_DESK_GENERAL_MODE,'true');
});

test('synthetic test settings do not affect the general launch',()=>{
  const env=generalEnvironment({testRun:true});
  assert.equal(env.GIT_CONFIG_NOSYSTEM,'1');assert.equal(env.AIDER_DESK_NO_UPDATES,'true');
  assert.equal(generalEnvironment({inherited:{}}).GIT_CONFIG_NOSYSTEM,undefined);
});

const makeRequest=(initial)=>{
  let alias=initial;const calls=[];
  const request=async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({route:new URL(url).pathname,body});
    if(url.endsWith('/api/create')){alias={modelfile:'FROM blob-same\nPARSER ministral\nPARAMETER num_ctx 32768\n'};return Response.json({status:'success'});}
    if(body.model===localBaseModel)return Response.json({modelfile:'FROM blob-same\n'});
    return alias?Response.json(alias):Response.json({error:'missing'},{status:404});
  };return {request,calls};
};
test('existing qualified alias never recreates or downloads weights',async()=>{
  const fixture=makeRequest({modelfile:'FROM blob-same\nPARSER ministral\nPARAMETER num_ctx 32768\n'});
  assert.equal((await ensureLocalFallback(fixture)).created,false);
  assert.equal(fixture.calls.length,2);
});
test('missing alias creates metadata with the original weights only',async()=>{
  const fixture=makeRequest(null);const result=await ensureLocalFallback(fixture);
  assert.equal(result.created,true);assert.equal(result.weightsIdentical,true);
  assert.deepEqual(fixture.calls.find(call=>call.route==='/api/create').body,{model:localFallbackModel,from:localBaseModel,parser:'ministral',parameters:{num_ctx:32768},stream:false});
});
test('different existing user alias is preserved and rejected',async()=>{
  const fixture=makeRequest({modelfile:'FROM different-weights\nPARSER ministral\n'});
  await assert.rejects(ensureLocalFallback(fixture),/senza sovrascriverlo/);
  assert.ok(!fixture.calls.some(call=>call.route==='/api/create'));
});
test('alias context cannot contradict the qualified metadata',async()=>{
  const fixture=makeRequest({modelfile:'FROM blob-same\nPARSER ministral\nPARAMETER num_ctx 4096\n'});
  await assert.rejects(ensureLocalFallback(fixture),/senza sovrascriverlo/);
  assert.ok(!fixture.calls.some(call=>call.route==='/api/create'));
});
test('a leftover interrupted migration never blocks a later atomic write',()=>{
  const dir=path.join(labRoot,'work','atomic-config-test-'+randomUUID());fs.mkdirSync(dir,{recursive:true});
  const target=path.join(dir,'config.json');const residue=target+'.general-v3-next';
  fs.writeFileSync(target,'old');fs.writeFileSync(residue,'interrupted');
  atomicProfileWrite(target,'new');assert.equal(fs.readFileSync(target,'utf8'),'new');
  assert.equal(fs.readFileSync(residue,'utf8'),'interrupted');
  assert.deepEqual(fs.readdirSync(dir).sort(),['config.json','config.json.general-v3-next']);
});
test('Serena restores the imposed exclusion and preserves user choices on later launches',()=>{
  const dir=path.join(labRoot,'work','serena-config-test-'+randomUUID());fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'serena.yml'),marker=path.join(dir,'migration.json');
  fs.writeFileSync(file,'excluded_tools:\n- execute_shell_command\n- user_disabled_tool\n');
  restoreGeneralSerenaTools({file,marker});
  assert.ok(!fs.readFileSync(file,'utf8').includes('execute_shell_command'));
  assert.ok(fs.readFileSync(file,'utf8').includes('user_disabled_tool'));
  fs.writeFileSync(file,'excluded_tools:\n- execute_shell_command\n');
  restoreGeneralSerenaTools({file,marker});
  assert.ok(fs.readFileSync(file,'utf8').includes('execute_shell_command'));
});
