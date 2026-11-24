import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const platform = z.enum(["LinkedIn", "Instagram", "X"]);
const field = z.string().trim().min(1).max(1000);
export const briefSchema = z.object({ business: field, description: field, audience: field, platform, tone: field, objective: field });
export const postSchema = z.object({ caption: z.string().trim().min(1).max(3000), hashtags: z.array(z.string().trim().min(1).max(50)).max(15) });
export const saveSchema = z.object({ briefId: z.string().uuid(), posts: z.array(postSchema).min(1).max(10) });
export const editSchema = z.object({ id: z.string().uuid(), ...postSchema.shape });
export const scheduleSchema = z.object({ id: z.string().uuid(), date: z.iso.datetime({ offset: true }) });
export type Brief = z.infer<typeof briefSchema>;
export type Post = z.infer<typeof postSchema>;
export class Store {
  db: DatabaseSync;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS briefs(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, briefId TEXT NOT NULL REFERENCES briefs(id), caption TEXT NOT NULL, hashtags TEXT NOT NULL, scheduled TEXT, source TEXT NOT NULL);");
  }
  create(input: unknown) {
    const data = briefSchema.parse(input); const id = randomUUID();
    this.db.prepare("INSERT INTO briefs VALUES (?,?)").run(id, JSON.stringify(data));
    return { id, ...data };
  }
  brief(id: string) {
    const row = this.db.prepare("SELECT data FROM briefs WHERE id=?").get(id);
    if (!row) throw new Error("Brief not found");
    return briefSchema.parse(JSON.parse(String(row.data)));
  }
  briefs() { return this.db.prepare("SELECT * FROM briefs ORDER BY rowid DESC LIMIT 100").all().map(r => ({id: String(r.id), ...briefSchema.parse(JSON.parse(String(r.data)))})); }
  posts() {
    return this.db.prepare("SELECT p.*, b.data FROM posts p JOIN briefs b ON p.briefId=b.id ORDER BY p.rowid DESC LIMIT 200").all().map(r => ({
      id: String(r.id), briefId: String(r.briefId), caption: String(r.caption), hashtags: JSON.parse(String(r.hashtags)) as string[], scheduled: r.scheduled ? String(r.scheduled) : null, source: String(r.source), ...briefSchema.parse(JSON.parse(String(r.data)))
    }));
  }
  save(input: unknown, source = "host/user") {
    const { briefId, posts } = saveSchema.parse(input); const brief = this.brief(briefId);
    for (const p of posts) this.validateLength(brief.platform,p.caption,p.hashtags);
    const stmt = this.db.prepare("INSERT INTO posts VALUES (?,?,?,?,NULL,?)");
    this.db.exec("BEGIN");
    try { for (const p of posts) stmt.run(randomUUID(),briefId,p.caption,JSON.stringify(p.hashtags),source); this.db.exec("COMMIT"); }
    catch(e) { this.db.exec("ROLLBACK"); throw e; }
    return this.posts();
  }
  validateLength(p: string, caption: string, tags: string[]) {
    if (p === "X" && Array.from([caption,...tags].join(" ")).length > 280) throw new Error("X draft exceeds 280 characters including hashtags");
  }
  edit(input: unknown) {
    const {id,caption,hashtags} = editSchema.parse(input);
    const row = this.db.prepare("SELECT briefId FROM posts WHERE id=?").get(id);
    if(!row) throw new Error("Draft not found");
    this.validateLength(this.brief(String(row.briefId)).platform,caption,hashtags);
    this.db.prepare("UPDATE posts SET caption=?,hashtags=? WHERE id=?").run(caption,JSON.stringify(hashtags),id);
    return this.posts();
  }
  schedule(input: unknown) {
    const {id,date}=scheduleSchema.parse(input);
    if (Date.parse(date)<=Date.now()) throw new Error("Choose a future date");
    if(!this.db.prepare("UPDATE posts SET scheduled=? WHERE id=?").run(new Date(date).toISOString(),id).changes) throw new Error("Draft not found");
    return this.posts();
  }
  calendar(){return this.posts().filter(p=>p.scheduled).sort((a,b)=>a.scheduled!.localeCompare(b.scheduled!));}
}
