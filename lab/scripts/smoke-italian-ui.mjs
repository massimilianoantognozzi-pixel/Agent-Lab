import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {repoRoot,labRoot,laboratoryEnvironment} from './prepare.mjs';

const require=createRequire(path.join(repoRoot,'package.json'));const {_electron}=require('playwright');
const report={startedAt:new Date().toISOString(),checks:{},pageErrors:[],errors:[]};
const file=path.join(labRoot,'work/locale-it','gui-proof.json');
const artifacts=path.join(labRoot,'artifacts','italian-ui');fs.mkdirSync(artifacts,{recursive:true});
const testRoot=path.join(labRoot,'work/locale-it','ui-profile-'+Date.now());
const data=path.join(testRoot,'data'),home=path.join(testRoot,'home'),workspace=path.join(testRoot,'workspace');
for(const directory of [data,home,workspace])fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(workspace,'README.md'),'# Verifica della sola interfaccia\nNessuna richiesta al modello o accesso a progetti reali.\n');
fs.writeFileSync(path.join(home,'mcp-servers.json'),JSON.stringify({mcpServers:{}}));
fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({settingsVersion:22,providers:[],openProjects:[],recentProjects:[],settings:{language:'it',onboardingFinished:true,telemetryEnabled:false,telemetryInformed:true,aiderDeskAutoUpdate:false,memory:{enabled:false},extensions:{repositories:[],disabled:[]},server:{enabled:false},taskSettings:{smartTaskState:false,autoGenerateTaskName:false,defaultProjectMode:'agent',renameBranchOnNameGeneration:false}}},null,2));
const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
let app,page;
try{
  app=await _electron.launch({executablePath:require('electron'),args:[path.join(labRoot,'work/locale-it/build/main/index.js')],cwd:repoRoot,env:{...laboratoryEnvironment(),AIDER_DESK_DATA_DIR:data,AIDER_DESK_HOME_DIR:home,AIDER_DESK_RESOURCES_DIR:path.join(repoRoot,'resources'),AIDER_DESK_LAB_WORKSPACE_ROOT:workspace,AIDER_DESK_PORT:'24339'},timeout:60000});
  for(const stream of [app.process().stdout,app.process().stderr])stream.on('data',chunk=>fs.appendFileSync(path.join(labRoot,'work/locale-it','electron.log'),chunk));
  const until=Date.now()+60000;
  while(!page&&Date.now()<until){for(const window of app.windows())if(await window.evaluate(()=>Boolean(window.api)).catch(()=>false)){page=window;break;}if(!page)await new Promise(resolve=>setTimeout(resolve,250));}
  if(!page)throw new Error('Interfaccia non pronta.');
  await page.setViewportSize({width:1280,height:900});
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  const settings=await page.evaluate(()=>window.api.loadSettings());
  if(settings.language!=='it')throw new Error('Lingua italiana non selezionata.');
  await page.evaluate(async dir=>{await window.api.addOpenProject(dir);const tasks=await window.api.getTasks(dir);const task=tasks[0]??await window.api.createNewTask(dir,{name:'Verifica interfaccia italiana',activate:true});await window.api.loadTask(dir,task.id);},workspace);
  report.nativeMenus=await app.evaluate(({Menu})=>Menu.getApplicationMenu()?.items.map(item=>item.label));
  report.checks.italianNativeMenus=report.nativeMenus?.includes('Modifica')&&report.nativeMenus?.includes('Impostazioni');
  await page.getByText('Autonoma',{exact:true}).first().waitFor({state:'visible',timeout:60000});
  await page.getByText('Cosa puoi fare',{exact:true}).first().waitFor({state:'visible',timeout:30000});
  report.checks.italianHome=true;
  await page.screenshot({path:path.join(artifacts,'home.png')});
  await page.keyboard.press('Control+s');
  await page.getByText('Italiano',{exact:true}).first().waitFor({state:'visible',timeout:30000});
  report.checks.italianSettings=await page.getByText('Lingua',{exact:true}).first().isVisible();
  await page.screenshot({path:path.join(artifacts,'settings.png')});
  await page.getByText('Italiano',{exact:true}).first().click();
  await page.getByText('Inglese',{exact:true}).last().click();
  await page.getByText('Appearance',{exact:true}).first().waitFor({state:'visible',timeout:30000});
  report.checks.englishStillWorks=true;
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByText('Guidata',{exact:true}).first().waitFor({state:'visible',timeout:30000});
  report.checks.italianRestored=true;
  await page.keyboard.press('Control+m');
  await page.getByText('Libreria modelli',{exact:true}).first().waitFor({state:'visible',timeout:30000});
  report.checks.italianModels=true;
  await page.screenshot({path:path.join(artifacts,'models.png')});
  await page.keyboard.press('Escape');
  report.pass=Object.values(report.checks).every(Boolean)&&report.pageErrors.length===0;
}catch(error){report.errors.push(error.stack??String(error));report.pass=false;}
finally{
  if(app){const child=app.process();await app.close().then(()=>{report.appClosed=true;report.appExitCode=child.exitCode;}).catch(error=>report.errors.push(error.message));}
  save();console.log(JSON.stringify({pass:report.pass,checks:report.checks,errors:report.errors.map(error=>error.split('\n')[0])}));
}
if(!report.pass)process.exitCode=1;
