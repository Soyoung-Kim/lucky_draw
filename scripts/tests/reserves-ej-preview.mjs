// Local-only QA harness. Never deploy: it replaces the API module only on this test server.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
if (!process.env.EJ_PGLITE_MODULE) throw new Error('Set EJ_PGLITE_MODULE first.');
const {PGlite} = await import(pathToFileURL(process.env.EJ_PGLITE_MODULE).href);
const db = new PGlite();
const root = fileURLToPath(new URL('../../',import.meta.url));
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec((await readFile(path.join(root,'supabase/migrations/202610260001_reserves_ej.sql'),'utf8')).replaceAll('clock_timestamp()',"timestamptz '2026-10-26 10:00:00+09'"));
http.createServer(async (req,res) => {
 try {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/__ej' && req.method === 'POST') {
   let body = ''; for await (const chunk of req) body += chunk;
   const payload = JSON.parse(body);
   res.setHeader('Content-Type','application/json');
   if (payload.action === 'login') {
    if (payload.admin_id !== 'preview' || payload.password !== 'preview') throw new Error('로컬 테스트 계정: preview / preview');
    return res.end(JSON.stringify({admin_session_token:'local-test-only'}));
   }
   if (!['calendar','request'].includes(payload.action) && payload.admin_session_token !== 'local-test-only') throw new Error('Admin login is required');
   const result = await db.query('select public.ej_action($1,$2::jsonb) as result',[payload.action,JSON.stringify(payload)]);
   return res.end(JSON.stringify(result.rows[0].result));
  }
  if (url.pathname === '/scripts/api.js') {
   res.setHeader('Content-Type','text/javascript');
   return res.end(`export async function invokeFunction(name,payload){const r=await fetch('/__ej',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}`);
  }
  let file = path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (url.pathname.endsWith('/')) file = path.join(file,'index.html');
  let content = await readFile(file);
  if (file.endsWith('.html')) content = content.toString().replace('<body>','<body><div style="padding:8px;text-align:center;background:#e8eccf;font-size:12px">로컬 테스트 · 운영 데이터와 무관 · 2026.10.26 기준</div>');
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(file)] || 'text/plain');
  res.end(content);
 } catch(error) { res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:error.message})); }
}).listen(4174,'127.0.0.1',()=>console.log('Local test: http://127.0.0.1:4174/reserves-ej/ (admin: preview / preview)'));
