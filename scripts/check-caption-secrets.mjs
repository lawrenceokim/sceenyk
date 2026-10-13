// Source-only companion to the built-client scan. Never prints matches.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const names=['SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','CLERK_SECRET_KEY','ELEVENLABS_API_KEY','GEMINI_API_KEY','FAL_KEY','WORKER_SHARED_SECRET','INNGEST_EVENT_KEY','INNGEST_SIGNING_KEY','PAYPAL_CLIENT_SECRET'];
const secrets=names.map(n=>process.env[n]).filter(Boolean);
const changed=execFileSync('git',['diff','--name-only'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/);
const added=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/);
let files=0,leaks=0;
for(const file of new Set([...changed,...added])) {
  if(!file||!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
  const body=fs.readFileSync(file,'utf8');files++;if(secrets.some(secret=>body.includes(secret)))leaks++;
}
console.log(JSON.stringify({sourceFilesScanned:files,configuredSecretsChecked:secrets.length,secretLeaks:leaks}));
if(leaks||!files)process.exitCode=1;
