import {test} from "node:test";
import assert from "node:assert/strict";
import {parseGeneratedPosts,generationMode} from "../src/ai.ts";

test("Gemini output must match the expected draft schema and count",()=>{
  const valid={posts:[{caption:"A useful introduction",hashtags:["#AI"]}]};
  assert.deepEqual(parseGeneratedPosts(JSON.stringify(valid),1),valid.posts);
  assert.throws(()=>parseGeneratedPosts(JSON.stringify(valid),2));
  assert.throws(()=>parseGeneratedPosts('{"posts":[{"caption":"","hashtags":[]}]}',1));
  assert.throws(()=>parseGeneratedPosts("not JSON",1));
});
test("Gemini takes priority and no key means demo mode",()=>{
  const oldGemini=process.env.GEMINI_API_KEY,oldOpenAI=process.env.OPENAI_API_KEY;
  try{
    delete process.env.GEMINI_API_KEY;delete process.env.OPENAI_API_KEY;
    assert.equal(generationMode(),"Demo templates");
    process.env.OPENAI_API_KEY="test-placeholder";
    assert.equal(generationMode(),"OpenAI API configured");
    process.env.GEMINI_API_KEY="test-placeholder";
    assert.equal(generationMode(),"Gemini API configured");
  }finally{
    if(oldGemini===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldGemini;
    if(oldOpenAI===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldOpenAI;
  }
});
