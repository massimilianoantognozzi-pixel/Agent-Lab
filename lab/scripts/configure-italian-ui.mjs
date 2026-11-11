import fs from 'node:fs';
import path from 'node:path';
import {dataDir} from './prepare.mjs';
import {atomicProfileWrite} from './configure-general-gui.mjs';

const file=path.join(dataDir,'config.json');
const config=JSON.parse(fs.readFileSync(file,'utf8'));
config.settings.language='it';
atomicProfileWrite(file,JSON.stringify(config,null,2));
console.log('Interfaccia italiana selezionata nel profilo dedicato.');
