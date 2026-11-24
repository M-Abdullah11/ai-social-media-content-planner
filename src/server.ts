import express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { Store, briefSchema,saveSchema,editSchema,scheduleSchema } from "./store.ts";
import { generate,generateSchema,generationMode } from "./ai.ts";

export function createApp(store:Store, html:string) {
  const app=express(); app.disable("x-powered-by"); app.use(express.json({limit:"64kb"}));
  app.use((_req,res,next)=>{res.set("X-Content-Type-Options","nosniff");next();});
  const snapshot=()=>({briefs:store.briefs(),posts:store.posts(),calendar:store.calendar(),mode:generationMode()});
  const run=async (name:string,args:unknown)=>{
    switch(name){
      case "create_brief": {const created=store.create(args);return {...snapshot(),created};}
      case "save_drafts": store.save(args); break;
      case "update_draft": store.edit(args); break;
      case "schedule_draft": store.schedule(args); break;
      case "generate_drafts": {const {briefId,count}=generateSchema.parse(args); const result=await generate(store.brief(briefId),count);store.save({briefId,posts:result.posts},result.source);break;}
      case "list_drafts": case "list_calendar": break;
      default: throw new Error("Unknown operation");
    }
    return snapshot();
  };
  const uri="ui://planner/widget.html";
  const definitions=[
    ["create_brief","Create a content brief with business, audience and marketing objective.",briefSchema.shape,false],
    ["save_drafts","Save captions and hashtags already written by the host or user for an existing brief. Ask before saving.",saveSchema.shape,false],
    ["generate_drafts","Generate drafts with Gemini (preferred) or OpenAI if configured. Without a key this returns clearly labeled demo templates. Prefer writing drafts in the host and using save_drafts.",generateSchema.shape,false],
    ["list_drafts","Review content briefs and drafts.",{},true],
    ["update_draft","Edit a saved caption and hashtags.",editSchema.shape,false],
    ["schedule_draft","Schedule a draft locally; never publishes to social media.",scheduleSchema.shape,false],
    ["list_calendar","Review the local content calendar.",{},true]
  ] as const;
  function mcp(){
    const server=new McpServer({name:"social-content-planner",version:"0.1.0"});
    registerAppResource(server,"planner",uri,{},async()=>({contents:[{uri,mimeType:RESOURCE_MIME_TYPE,text:html}]}));
    for(const [name,description,inputSchema,readOnly] of definitions){
      registerAppTool(server,name,{description,inputSchema:inputSchema as Record<string,z.ZodType>,annotations:{readOnlyHint:readOnly,destructiveHint:false,openWorldHint:false},_meta:{ui:{resourceUri:uri}}},async(args:unknown)=>{
        try{const data=await run(name,args);return {content:[{type:"text",text:JSON.stringify(data)}],structuredContent:data};}
        catch(e){return {isError:true,content:[{type:"text",text:message(e)}]};}
      });
    }
    return server;
  }
  app.get("/",(_req,res)=>res.type("html").send(html));
  app.get("/health",(_req,res)=>res.json({ok:true}));
  app.get("/api/state",(_req,res)=>res.json(snapshot()));
  app.post("/api/:tool",async(req,res)=>{try{res.json(await run(req.params.tool,req.body));}catch(e){res.status(400).json({error:message(e)});}});
  app.post("/mcp",async(req,res)=>{
    const server=mcp();const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on("close",()=>{void transport.close();void server.close();});
    try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}catch{if(!res.headersSent)res.status(500).json({error:"MCP request failed"});}
  });
  app.all("/mcp",(_req,res)=>res.status(405).set("Allow","POST").end());
  return app;
}
function message(e:unknown){return e instanceof z.ZodError ? e.issues.map(i=>i.path.join(".")+": "+i.message).join("; ") : e instanceof Error && ["Brief not found","Draft not found","Choose a future date","X draft exceeds 280 characters including hashtags","Unknown operation","Gemini request failed. Check API key, model availability, quota and network access.","Gemini returned invalid drafts. Please retry."].includes(e.message)?e.message:"Operation failed. Check server configuration and inputs.";}
if(process.argv[1] && resolve(process.argv[1])===resolve(import.meta.filename)){
  const host=process.env.HOST||"127.0.0.1";
  if(host!=="127.0.0.1" && process.env.PUBLIC_DEMO!=="true") throw new Error("Public exposure requires PUBLIC_DEMO=true; use disposable synthetic data only.");
  if((host!=="127.0.0.1" || process.env.PUBLIC_DEMO==="true") && (process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)) throw new Error("Unauthenticated public demo cannot use API keys.");
  createApp(new Store(process.env.DB_PATH||"planner.sqlite"),readFileSync("dist/index.html","utf8")).listen(Number(process.env.PORT||3000),host,()=>console.log("Planner listening on "+host));
}
