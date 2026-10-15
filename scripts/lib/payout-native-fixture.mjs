// Optional native PostgreSQL fixture for actual independent backend contention.
// Portable binaries only; a fresh password-protected loopback cluster is created
// in %TEMP% and stopped in finally. No service installation or hosted credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';

export async function payoutNativeFixture(){
  const root=fs.readFileSync(path.join(os.tmpdir(),'sceenyk-payout-native-directory.txt'),'utf8').trim();
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'sceenyk-payout-native-'),'TEMPORARY_BINARIES_ONLY');
  const bin=path.join(root,'pgsql','bin'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sceenyk-payout-native-data-'));
  const password=randomBytes(32).toString('hex'),pwfile=path.join(directory,'password');fs.writeFileSync(pwfile,password);
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const env={...process.env,PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'postgres',PGPASSWORD:password,PGDATABASE:'postgres',PGCONNECT_TIMEOUT:'5'};
  let active=0,maximumActive=0,role=null,closed=false;
  const run=(exe,args,input='',connection=false)=>new Promise((resolve,reject)=>{
    if(connection){active++;maximumActive=Math.max(maximumActive,active);}
    const child=spawn(path.join(bin,exe+'.exe'),args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);
    child.on('error',error=>{if(connection)active--;reject(error);});
    // Windows postgres can retain pg_ctl's inherited pipe handles after pg_ctl
    // exits. Its exit status is authoritative; query output still waits for close.
    child.on(exe==='pg_ctl'?'exit':'close',code=>{if(connection)active--;if(exe==='pg_ctl'){child.stdout.destroy();child.stderr.destroy();}if(code===0)resolve(out);else{const error=new Error('NATIVE_POSTGRES_OPERATION_FAILED');error.code=err.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]??'XX000';reject(error);}});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
  const literal=value=>value===null||value===undefined?'NULL':typeof value==='number'?(assert.ok(Number.isFinite(value)),String(value)):typeof value==='boolean'?(value?'true':'false'):Array.isArray(value)?(value.length?'ARRAY['+value.map(literal).join(',')+']':"'{}'") : "'"+String(typeof value==='object'?JSON.stringify(value):value).replaceAll("'","''")+"'";
  const substitute=(sql,args)=>sql.replace(/\$(\d+)\b/g,(_,n)=>literal(args[Number(n)-1]));
  const execute=(sql,asRole=role)=>run('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],(asRole?'set role '+asRole+';':'')+sql,true);
  const query=async(sql,args=[],asRole=role)=>{
    const text=substitute(sql,args).replace(/;\s*$/,'');
    if(/^\s*(insert|update|delete)\b/i.test(text)&&! /\breturning\b/i.test(text)){await execute(text,asRole);return{rows:[]};}
    const wrapped=/^\s*(insert|update|delete)\b/i.test(text)?`with q as (${text}) select coalesce(json_agg(q),'[]') from q;`:`select coalesce(json_agg(q),'[]') from (${text})q;`;
    const output=await execute(wrapped,asRole);return{rows:JSON.parse(output.trim())};
  };
  const pg={
    query,
    async exec(sql){const set=sql.trim().match(/^set role (anon|authenticated|service_role);?$/i);if(set){role=set[1];return;}if(/^reset role;?$/i.test(sql.trim())){role=null;return;}await execute(sql);},
    async close(){if(!closed){closed=true;await run('pg_ctl',['-D',path.join(directory,'data'),'-m','fast','-w','stop']);}},
    stats:()=>({maximumIndependentClients:maximumActive}),
  };
  try{
    await run('initdb',['-D',path.join(directory,'data'),'-U','postgres','--auth=scram-sha-256','--pwfile='+pwfile,'--locale=C','--encoding=UTF8']);
    await run('pg_ctl',['-D',path.join(directory,'data'),'-l',path.join(directory,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -c fsync=off`,'-w','start']);
    await pg.exec('create role anon;create role authenticated;create role service_role bypassrls;');
    for(const f of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await pg.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  }catch(error){await pg.close().catch(()=>{});throw error;}
  const one=async(sql,args=[])=>((await query(sql,args)).rows[0]),scalar=async(sql,args=[])=>((await one(sql,args))?.value);
  const db={
    async rpc(name,args={}){
      assert.match(name,/^[a-z_]+$/);
      try{const result=await query(`select public.${name}(${Object.keys(args).map((key,i)=>(assert.match(key,/^[a-z_]+$/),`${key}=>$${i+1}`)).join(',')}) value`,Object.values(args),'service_role');return{data:result.rows[0].value,error:null};}
      catch(error){return{data:null,error:{code:error.code,message:error.message}};}
    },
    from(table){assert.match(table,/^[a-z_]+$/);const filters=[],args=[];let fields='*',sort='';return{
      select(v){assert.match(v,/^[a-z_*,]+$/);fields=v;return this;},eq(key,value){assert.match(key,/^[a-z_]+$/);args.push(value);filters.push(`${key}=$${args.length}`);return this;},order(key){assert.match(key,/^[a-z_]+$/);sort=' order by '+key;return this;},
      then(resolve,reject){return this.execute(false).then(resolve,reject);},maybeSingle(){return this.execute(true);},single(){return this.execute(true);},
      async execute(single){try{const rows=(await query(`select ${fields} from public.${table}${filters.length?' where '+filters.join(' and '):''}${sort}`,args,'service_role')).rows;return{data:single?rows[0]??null:rows,error:null};}catch(error){return{data:null,error:{code:error.code,message:error.message}};}},
    };},
  };
  const call=async(name,args)=>{const r=await db.rpc(name,args);assert.equal(r.error,null,'NATIVE_FIXTURE_RPC_'+name);return r.data;};
  return{pg,db,call,one,scalar};
}
