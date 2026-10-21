// Standalone local server. Only explicit public assets are served.
import http from 'node:http';
import path from 'node:path';
import {readFile,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL("../",import.meta.url));
const files=["index.html", "404.html", "script.js", "styles.css", "fav.png", "fav1.png", "dmc.json", "dmc-gaps.json", "dmc-validation-summary.json"], directories=[];
const port=Number(process.env.PORT || 10220);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 const reject=code=>{res.writeHead(code);res.end();};
 if(!['GET','HEAD'].includes(req.method)) return reject(405);
 try{
  const url=new URL(req.url,'http://localhost');
  const identity=false && url.pathname==='/__devdashboard/identity';
  const relative=url.pathname==='/'||identity?'index.html':decodeURIComponent(url.pathname.slice(1));
  if(relative.includes('\\')||relative.split('/').some(s=>!s||s.startsWith('.'))||(!files.includes(relative)&&!directories.includes(relative.split('/')[0]))) return reject(404);
  const rr=await realpath(root), actual=await realpath(path.join(root,relative));
  if(!actual.startsWith(rr+path.sep)||!mime[path.extname(actual).toLowerCase()]) return reject(404);
  const body=identity?Buffer.from(JSON.stringify({application:'duallands'})):await readFile(actual);
  res.writeHead(200,{'Content-Type':identity?'application/json':mime[path.extname(actual).toLowerCase()],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
 }catch{reject(404);}
});
server.listen(port,'127.0.0.1',()=>console.log('Local server http://127.0.0.1:'+port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
