import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {App as Bridge} from "@modelcontextprotocol/ext-apps";
import "./style.css";
type Brief={id:string;business:string;description:string;audience:string;platform:string;tone:string;objective:string};
type Post=Brief&{briefId:string;caption:string;hashtags:string[];scheduled:string|null;source:string};
type State={briefs:Brief[];posts:Post[];calendar:Post[];mode:string};
const embedded=window.parent!==window;
const bridge=embedded?new Bridge({name:"Content Studio",version:"0.1.0"}):null;
const blank={business:"",description:"",audience:"",platform:"LinkedIn",tone:"Professional",objective:""};
function Studio(){
 const [data,setData]=useState<State>({briefs:[],posts:[],calendar:[],mode:"Connecting…"});
 const [brief,setBrief]=useState(blank),[selected,setSelected]=useState(""),[tab,setTab]=useState("Drafts"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[caption,setCaption]=useState(""),[tags,setTags]=useState("");
 const apply=(value:unknown)=>{if(value && typeof value==="object" && "posts" in value && "briefs" in value)setData(value as State);};
 async function call(name:string,args:Record<string,unknown>={}){
  setBusy(true);setError("");
  try{
   if(bridge){const result=await bridge.callServerTool({name,arguments:args});if(result.isError)throw new Error(result.content?.map(c=>c.type==="text"?c.text:"").join(" ")||"Tool error");apply(result.structuredContent);}
   else{const res=await fetch("/api/"+name,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args)});const value=await res.json();if(!res.ok)throw new Error(value.error||"Request failed");apply(value);}
  }catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}
 }
 useEffect(()=>{if(bridge){bridge.ontoolresult=r=>apply(r.structuredContent);bridge.connect().catch(e=>setError(String(e)));}else void call("list_drafts");},[]);
 useEffect(()=>{if(!selected&&data.briefs[0])setSelected(data.briefs[0].id);},[data.briefs,selected]);
 return <main><header><div><span className="mark">✳ CONTENT STUDIO</span><h1>Make every post count.</h1><p>Plan, draft and organize your social content in one place.</p></div><span className="badge">{embedded?"MCP Apps":data.mode}</span></header>
 <div className="stats"><div><small>Content briefs</small><strong>{data.briefs.length}</strong></div><div><small>Saved drafts</small><strong>{data.posts.length}</strong></div><div><small>Scheduled locally</small><strong>{data.calendar.length}</strong></div></div>
 {error&&<p role="alert" className="error">{error}</p>}
 <section className="layout"><aside><h2>New content brief</h2><form onSubmit={e=>{e.preventDefault();void call("create_brief",brief);}}>
 {(["business","description","audience","tone","objective"] as const).map(k=><label key={k}>{k}<input required maxLength={1000} value={brief[k]} onChange={e=>setBrief({...brief,[k]:e.target.value})}/></label>)}
 <label>Platform<select value={brief.platform} onChange={e=>setBrief({...brief,platform:e.target.value})}>{["LinkedIn","Instagram","X"].map(p=><option key={p}>{p}</option>)}</select></label><button disabled={busy}>Save brief</button></form>
 <h2>Create draft</h2><label>Choose brief<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select a brief</option>{data.briefs.map(b=><option key={b.id} value={b.id}>{b.business} · {b.platform}</option>)}</select></label>
 <button disabled={busy||!selected} onClick={()=>void call("generate_drafts",{briefId:selected,count:3})}>{data.mode==="Demo templates"?"Generate demo templates":"Generate 3 drafts"}</button>
 <p className="hint">In ChatGPT, ask the model to write and save drafts for a brief. Server generation without an API key produces sample templates only.</p>
 <form onSubmit={e=>{e.preventDefault();void call("save_drafts",{briefId:selected,posts:[{caption,hashtags:tags.split(/\s+/).filter(Boolean)}]});}}><label>Caption<textarea required value={caption} onChange={e=>setCaption(e.target.value)}/></label><label>Hashtags<input value={tags} onChange={e=>setTags(e.target.value)} placeholder="#Technology #AI"/></label><button disabled={busy||!selected}>Save manual draft</button></form></aside>
 <article><nav>{["Drafts","Calendar"].map(t=><button className={tab===t?"active":"secondary"} key={t} onClick={()=>setTab(t)}>{t}</button>)}<button className="secondary" disabled={busy} onClick={()=>void call("list_drafts")}>Refresh</button></nav>
 <h2>{tab==="Drafts"?"Your content":"Content calendar"}</h2><p className="hint">{tab==="Drafts"?"Review and refine before you publish.":"Scheduling is local only; no posts are published."}</p>
 {(tab==="Drafts"?data.posts:data.calendar).length===0&&<div className="empty">Nothing here yet. Create a brief and save your first draft.</div>}
 {(tab==="Drafts"?data.posts:data.calendar).map(p=><Card key={p.id+ p.caption+p.hashtags.join()} post={p} busy={busy} call={call}/>)}</article></section></main>;
}
function Card({post:p,busy,call}:{post:Post;busy:boolean;call:(name:string,args:Record<string,unknown>)=>Promise<void>}){
 const [editing,setEditing]=useState(false),[caption,setCaption]=useState(p.caption),[tags,setTags]=useState(p.hashtags.join(" ")),[date,setDate]=useState("");
 return <div className="card"><div className="cardhead"><strong>{p.business}</strong><span className="badge">{p.platform}</span></div><small>{p.source}</small>{editing?<><textarea value={caption} onChange={e=>setCaption(e.target.value)}/><input value={tags} onChange={e=>setTags(e.target.value)}/><button disabled={busy} onClick={async()=>{await call("update_draft",{id:p.id,caption,hashtags:tags.split(/\s+/).filter(Boolean)});setEditing(false);}}>Save changes</button></>:<><p className="caption">{p.caption}</p><p className="tags">{p.hashtags.join(" ")}</p><button className="secondary" onClick={()=>setEditing(true)}>Edit draft</button></>}
 <div className="schedule"><input aria-label="Schedule date" type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/><button disabled={!date||busy} onClick={()=>void call("schedule_draft",{id:p.id,date:new Date(date).toISOString()})}>Schedule</button></div>{p.scheduled&&<small>Scheduled: {new Date(p.scheduled).toLocaleString()}</small>}</div>;
}
createRoot(document.getElementById("root")!).render(<Studio/>);
