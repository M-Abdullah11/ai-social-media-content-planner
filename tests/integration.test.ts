import {test} from "node:test";
import assert from "node:assert/strict";
import {Store} from "../src/store.ts";
import {createApp} from "../src/server.ts";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {once} from "node:events";
const brief={business:"Example Co",description:"Software",audience:"Developers",platform:"LinkedIn",tone:"Professional",objective:"Awareness"};
test("database persistence, validation and atomic writes",()=>{
 const dir=mkdtempSync(join(tmpdir(),"planner-"));const path=join(dir,"db.sqlite");
 try{let store=new Store(path);assert.throws(()=>store.create({}));const b=store.create({...brief,platform:"X"});
 assert.throws(()=>store.save({briefId:b.id,posts:[{caption:"valid",hashtags:[]},{caption:"x".repeat(281),hashtags:[]}]}));assert.equal(store.posts().length,0);
 store.save({briefId:b.id,posts:[{caption:"Hello",hashtags:["#Tech"]}]});const id=store.posts()[0].id;assert.throws(()=>store.schedule({id,date:"2000-01-01T00:00:00Z"}));store.schedule({id,date:"2099-01-01T00:00:00Z"});store.db.close();
 store=new Store(path);assert.equal(store.calendar().length,1);store.edit({id,caption:"Updated",hashtags:[]});assert.equal(store.posts()[0].caption,"Updated");store.db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("REST and official MCP client end-to-end",async()=>{
 const store=new Store();const html=readFileSync("dist/index.html","utf8");const http=createApp(store,html).listen(0,"127.0.0.1");await once(http,"listening");
 const address=http.address();assert.ok(address&&typeof address==="object");const base="http://127.0.0.1:"+address.port;
 const client=new Client({name:"test",version:"1.0.0"});
 try{
  assert.equal((await fetch(base+"/health")).status,200);
  assert.equal((await fetch(base+"/")).status,200);
  const rest=async(name:string,data:unknown)=>fetch(base+"/api/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
  assert.equal((await rest("create_brief",{})).status,400);
  await client.connect(new StreamableHTTPClientTransport(new URL(base+"/mcp")));
  assert.equal((await client.listTools()).tools.length,7);
  const resources=await client.listResources();assert.equal(resources.resources[0].uri,"ui://planner/widget.html");
  const resource=await client.readResource({uri:resources.resources[0].uri});assert.equal(resource.contents[0].mimeType,"text/html;profile=mcp-app");
  const created=await client.callTool({name:"create_brief",arguments:brief});assert.ok(!created.isError);
  const b=store.briefs()[0];
  const saved=await client.callTool({name:"save_drafts",arguments:{briefId:b.id,posts:[{caption:"Launch day!",hashtags:["#AI"]}]}});assert.ok(!saved.isError);
  const id=store.posts()[0].id;assert.equal((await rest("update_draft",{id,caption:"Edited",hashtags:[]})).status,200);
  assert.equal((await rest("schedule_draft",{id,date:"2099-01-01T00:00:00Z"})).status,200);
  const result=await client.callTool({name:"list_calendar",arguments:{}});assert.ok(!result.isError);assert.equal(store.calendar().length,1);
  const invalid=await client.callTool({name:"save_drafts",arguments:{briefId:b.id,posts:[]}});assert.equal(invalid.isError,true);
  if(!process.env.OPENAI_API_KEY&&!process.env.GEMINI_API_KEY){assert.equal((await rest("generate_drafts",{briefId:b.id,count:2})).status,200);assert.equal(store.posts().filter(p=>p.source==="demo template (not AI)").length,2);}
 }finally{await client.close();http.close();store.db.close();}
});
