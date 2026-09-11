import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {PROJECT_ID,ENVIRONMENT_ID,safeError} from '../src/config.ts';
import {publicSource} from '../resolver/src/source.ts';

try {
  publicSource();
  const state=JSON.parse(await fs.readFile('.state/resolver.json','utf8'));
  if(state.projectId!==PROJECT_ID||state.environmentId!==ENVIRONMENT_ID||state.serviceId!=='a686bd25-0ef6-415b-a830-b35ccc585923')throw new Error('Unexpected resolver deployment target');
  const env={...process.env,RAILWAY_CALLER:'skill:use-railway@1.4.0',RAILWAY_AGENT_SESSION:'merxet-resolver-phase2-20260909'};
  delete env.RAILWAY_API_TOKEN;delete env.RAILWAY_TOKEN;
  for(const name of ['BUNNY_PUBLIC_STORAGE_ENDPOINT','BUNNY_PUBLIC_STORAGE_ZONE','BUNNY_PUBLIC_STORAGE_KEY','BUNNY_PUBLIC_BASE_URL']) {
    const value=process.env[name];if(!value)throw new Error(`Missing ${name}`);
    await new Promise((resolve,reject)=>{
      const args=['variable','set',name,'--stdin','--project',PROJECT_ID,'--environment',ENVIRONMENT_ID,'--service',state.serviceId,'--skip-deploys'];
      const child=spawn(process.platform==='win32'?'cmd.exe':'railway',process.platform==='win32'?['/d','/c','railway',...args]:args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
      let stderr='';const timer=setTimeout(()=>child.kill(),30000);
      child.stdout.resume();child.stderr.on('data',data=>{if(stderr.length<4000)stderr+=data.toString();});
      child.once('error',reject);child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`Railway variable configuration failed (${code}): ${safeError(stderr)}`));});
      child.stdin.end(value);
    });
    console.log(`Configured ${name}`);
  }
}catch(error){console.error(safeError(error));process.exitCode=1;}
