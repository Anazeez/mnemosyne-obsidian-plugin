var C=Object.create,h=Object.defineProperty,x=Object.getPrototypeOf,R=Object.prototype.hasOwnProperty,T=Object.getOwnPropertyNames,A=Object.getOwnPropertyDescriptor;var g=n=>h(n,"__esModule",{value:!0});var E=(n,e)=>()=>(e||(e={exports:{}},n(e.exports,e)),e.exports),N=(n,e)=>{for(var t in e)h(n,t,{get:e[t],enumerable:!0})},P=(n,e,t)=>{if(e&&typeof e=="object"||typeof e=="function")for(let a of T(e))!R.call(n,a)&&a!=="default"&&h(n,a,{get:()=>e[a],enumerable:!(t=A(e,a))||t.enumerable});return n},f=n=>P(g(h(n!=null?C(x(n)):{},"default",n&&n.__esModule&&"default"in n?{get:()=>n.default,enumerable:!0}:{value:n,enumerable:!0})),n);var $=E((V,_)=>{"use strict";var v="mnemosyne-ariadne/0.0.4+continuity-review",b="mnemosyne.context-runway/1.0",y="mnemosyne-context-checkpoint-proposal",F=/^[a-z0-9][a-z0-9_-]{1,63}$/,O=/^[a-z0-9][a-z0-9._-]{1,63}$/,I=/^(?:[a-z0-9][a-z0-9_-]{1,63}|(?:mandate|thread):[a-z0-9][a-z0-9_-]{1,63})$/;async function u(n){let e=new TextEncoder().encode(String(n)),t=await crypto.subtle.digest("SHA-256",e);return Array.from(new Uint8Array(t)).map(a=>a.toString(16).padStart(2,"0")).join("")}function w(n){let e={identity_id:String(n?.identity_id||"").trim().toLowerCase(),project_id:String(n?.project_id||"").trim().toLowerCase(),scope_key:String(n?.scope_key||"").trim().toLowerCase()};if(!F.test(e.identity_id))throw new Error("invalid_identity_id");if(!O.test(e.project_id))throw new Error("invalid_project_id");if(!I.test(e.scope_key)||e.scope_key.length>96)throw new Error("invalid_scope_key");return e}async function M({source:n,scope:e,current:t,createdAt:a,invocationId:i}){let s=w(e),l=`obsidian:${n.path}`,c=await u(n.content),d=Number(t?.generation||0)+1,p=[{source_ref:l,sha256:c}];return{proposal_schema:"mnemosyne.context-runway-proposal/1.0",review_first:!0,submit_automatically:!1,source:"obsidian-plugin",...s,predecessor_runway_id:t?.runway_id||null,source_invocation_id:i,source_note:{path:n.path,sha256:c},source_hashes:p,idempotency_key:`obsidian-${await u([l,c,t?.runway_id||"genesis",i].join(`
`))}`,payload:{schema:b,runway_id:"assigned-by-worker",...s,generation:d,predecessor_runway_id:t?.runway_id||null,source_invocation_id:i,objective:n.basename,operational_state:n.content.slice(0,8e3),decisions_in_force:[],open_threads:[],next_actions:[],mounted_skills:[],relevant_agents:[],relevant_files:[{source_ref:l,sha256:c}],knowledge_references:[],library_references:[],pending_handoffs:[],constraints:["Review-first proposal; explicit submission required"],prohibited_assumptions:["Semantic similarity does not establish current continuity"],integrity_warnings:[],source_hashes:p,created_at:a}}}async function j(n,e){return n?.source_note?.path!==e?.path?!1:n.source_note.sha256===await u(e.content)}function L(n){return`# Mnemosyne Contextual Checkpoint Proposal

Review-first artifact. Explicit submission required. The source note has not
been modified, moved, renamed, or deleted.

<!-- ${y}:start -->
\`\`\`json
${JSON.stringify(n,null,2)}
\`\`\`
<!-- ${y}:end -->
`}function q(n){let e=`<!-- ${y}:start -->`,t=`<!-- ${y}:end -->`,a=n.indexOf(e),i=n.indexOf(t);if(a<0||i<=a)throw new Error("checkpoint_proposal_marker_missing");let l=n.slice(a+e.length,i).trim().match(/^```json\n([\s\S]+)\n```$/);if(!l)throw new Error("checkpoint_proposal_json_missing");let c=JSON.parse(l[1]);if(c.proposal_schema!=="mnemosyne.context-runway-proposal/1.0"||c.review_first!==!0||c.submit_automatically!==!1)throw new Error("checkpoint_proposal_invalid");return c}function U(n,e="",t=[]){return{...w(n),supplemental_query:String(e||"").slice(0,8e3),supplemental_domains:[...new Set(t)].filter(a=>["knowledge","agents","skills","files","library"].includes(a)),top_k:5}}function B(n){if(!n?.context||!n?.supplemental||!n?.retrieval_receipt_id)throw new Error("invalid_rehydration_response");if(!new Set(["CURRENT_CONTEXT","STALE_CONTEXT","DEGRADED_CONTEXT","NO_CONTEXT","QUARANTINED_CONTEXT","CONTEXT_UNAVAILABLE"]).has(n.context.status))throw new Error("invalid_context_status");let t=[];n.context.status!=="CURRENT_CONTEXT"&&t.push(`Context status is ${n.context.status.toLowerCase().replaceAll("_"," ")}.`),(n.omissions||[]).length>0&&t.push(`${n.omissions.length} inaccessible reference(s) were omitted.`);for(let a of n.supplemental.errors||[])t.push(`Supplemental evidence warning: ${a.code||"unavailable"}.`);return{runway:n.context,supplemental:[...n.supplemental.results||[]],warnings:t,receipt_id:n.retrieval_receipt_id,invocation:n.invocation}}function D(n,e,t){let a=w(e);if(!Number.isInteger(Number(t))||Number(t)<1)throw new Error("invalid_generation");return`${String(n||"").replace(/^\/+|\/+$/g,"")}/${a.project_id}/${a.identity_id}/${a.scope_key}/runway-${t}.md`}function z(n){let e=n.runway.payload||{};return`# Contextual Runway ${n.runway.generation??"Unavailable"}

> Read-only representation. Canonical head remains in Mnemosyne-Worker.

- Identity: ${e.identity_id||"Unavailable"}
- Project: ${e.project_id||"Unavailable"}
- Scope: ${e.scope_key||"Unavailable"}
- Status: ${n.runway.status}
- Runway: ${n.runway.runway_id||"None"}
- Age seconds: ${n.runway.age_seconds??"Unknown"}
- Hash verification: ${n.runway.manifest_hash?"passed":"unavailable"}
- Predecessor: ${e.predecessor_runway_id||"None"}
- Source count: ${(e.source_hashes||[]).length}
- Warning count: ${(n.warnings||[]).length}
- Retrieval receipt: ${n.receipt_id}
- Build identifier: ${v}

## Objective

${e.objective||"No exact context is available."}

## Current Operational State

${e.operational_state||""}

## Warnings

${k(n.warnings)}

## Supplemental Evidence (separate)

${k(n.supplemental)}
`}async function J(n,e,t,a){let i=`obsidian:${n}`,s=(t.payload?.source_hashes||[]).find(d=>d.source_ref===i)?.sha256,l=await u(e),c=(t.authorized_references||[]).map(d=>d.source_ref).filter(d=>d?.startsWith("obsidian:")&&!a.has(d.slice(9)));return{matches:Boolean(s)&&s===l,source_ref:i,missing_local_references:c}}function k(n){return!Array.isArray(n)||n.length===0?"- None":n.map(e=>`- ${typeof e=="string"?e:JSON.stringify(e)}`).join(`
`)}_.exports={BUILD_ID:v,RUNWAY_SCHEMA:b,buildCheckpointProposal:M,buildPublishedRunwayPath:D,buildRehydrateRequest:U,compareNoteToRunway:J,formatCheckpointProposal:L,formatRunwayMarkdown:z,normalizeScope:w,parseCheckpointProposal:q,parseRehydrationResponse:B,sha256Hex:u,verifyProposalSource:j}});g(exports);N(exports,{default:()=>H});var o=f(require("obsidian")),r=f($());var W={workerBaseUrl:"",ariadnePasskey:"",reviewFolder:"System/Ariadne/Review",proposalFolder:"System/Mnemosyne/Runway-Proposals",publishedFolder:"System/Mnemosyne/Runways",identityId:"ariadne",projectId:"project-infinitum",scopeKey:"default"},X="CONTINUITY_OBSIDIAN_ACTIONS",m=class extends o.Plugin{async onload(){await this.loadSettings(),this.addCommand({id:"ariadne-intake-current-note",name:"Ariadne: Intake current note",callback:()=>this.processCurrentNote()}),this.addCommand({id:"mnemosyne-show-latest-contextual-runway",name:"Mnemosyne: Show latest contextual runway",callback:()=>this.showLatestRunway()}),this.addCommand({id:"mnemosyne-propose-contextual-checkpoint",name:"Mnemosyne: Propose contextual checkpoint",callback:()=>this.proposeCheckpoint()}),this.addCommand({id:"mnemosyne-submit-reviewed-checkpoint",name:"Mnemosyne: Submit reviewed checkpoint",callback:()=>this.submitReviewedCheckpoint()}),this.addCommand({id:"mnemosyne-rehydrate-specialist-context",name:"Mnemosyne: Rehydrate specialist context",callback:()=>this.rehydrateContext()}),this.addCommand({id:"mnemosyne-compare-note-latest-runway",name:"Mnemosyne: Compare current note with latest runway",callback:()=>this.compareCurrentNote()}),this.addCommand({id:"mnemosyne-open-runway-lineage",name:"Mnemosyne: Open runway lineage",callback:()=>this.openRunwayLineage()}),this.addSettingTab(new S(this.app,this))}scope(){return(0,r.normalizeScope)({identity_id:this.settings.identityId,project_id:this.settings.projectId,scope_key:this.settings.scopeKey})}requireConfiguration(){if(!this.settings.workerBaseUrl.trim()||!this.settings.ariadnePasskey.trim())throw new Error("Configure the Worker URL and Ariadne passkey first.");return this.scope()}endpoint(e){return`${this.settings.workerBaseUrl.replace(/\/+$/g,"")}${e}`}async requestJson(e,t={}){let a={"Content-Type":"application/json","X-Matrix-Key":this.settings.ariadnePasskey,"X-Ariadne-Key":this.settings.ariadnePasskey,...t.headers||{}},i;try{i=await fetch(this.endpoint(e),{...t,headers:a})}catch{throw new Error("Mnemosyne network request is unavailable.")}if(!i.ok)throw new Error(`Mnemosyne request failed with HTTP ${i.status}.`);try{return await i.json()}catch{throw new Error("Mnemosyne returned an invalid response.")}}async testConnection(){return this.run("mnemosyne.connection",async()=>{this.requireConfiguration();let e=performance.now(),t=await this.requestJson("/v1/memory/self"),a=Math.round(performance.now()-e),i=typeof t?.principal_id=="string"?t.principal_id:typeof t?.credential_id=="string"?t.credential_id:"authenticated principal";new o.Notice(`Connected as ${i} (${a} ms)`)})}async latest(){let e=this.requireConfiguration(),t=new URLSearchParams(e).toString();return this.requestJson(`/v1/continuity/latest?${t}`)}activeMarkdown(){let e=this.app.workspace.getActiveFile();if(!(e instanceof o.TFile)||e.extension!=="md")throw new Error("The active file must be a Markdown note.");return e}async run(e,t){try{await t()}catch(a){let i=a instanceof Error?a.message:`${e} failed.`;new o.Notice(i),console.warn(`[${e}] ${i}`)}}async showLatestRunway(){return this.run("continuity.latest",async()=>{let t=(await this.latest()).context||{};new o.Notice(`${t.status||"CONTEXT_UNAVAILABLE"} \xB7 generation ${t.generation==null?"none":t.generation} \xB7 ${r.BUILD_ID}`)})}async proposeCheckpoint(){return this.run("continuity.propose",async()=>{let e=this.requireConfiguration(),t=this.activeMarkdown(),a=await this.app.vault.read(t),i=await this.latest(),s=new Date().toISOString(),l=await(0,r.buildCheckpointProposal)({source:{path:t.path,basename:t.basename,content:a},scope:e,current:i.context&&i.context.runway_id?i.context:null,createdAt:s,invocationId:`inv_obsidian_${s.replace(/[^0-9]/g,"")}`}),c=this.cleanFolder(this.settings.proposalFolder);await this.ensureFolder(c);let d=`${c}/checkpoint-${this.safeName(t.basename)}-${s.replace(/[:.]/g,"-")}.md`,p=await this.app.vault.create(d,(0,r.formatCheckpointProposal)(l));await this.app.workspace.getLeaf(!1).openFile(p),new o.Notice("Checkpoint proposal created. Review it before explicit submission.")})}async submitReviewedCheckpoint(){return this.run("continuity.submit",async()=>{this.requireConfiguration();let e=this.activeMarkdown(),t=`${this.cleanFolder(this.settings.proposalFolder)}/`;if(!e.path.startsWith(t))throw new Error("Only a reviewed Runway-Proposals note can be submitted.");let a=(0,r.parseCheckpointProposal)(await this.app.vault.read(e)),i=this.app.vault.getAbstractFileByPath(a.source_note.path);if(!(i instanceof o.TFile))throw new Error("The checkpoint source note is unavailable.");let s={path:i.path,basename:i.basename,content:await this.app.vault.read(i)};if(!await(0,r.verifyProposalSource)(a,s))throw new Error("Source hash changed; create and review a new proposal.");let l=await this.requestJson("/v1/continuity/checkpoints",{method:"POST",body:JSON.stringify(a)});new o.Notice(`Checkpoint candidate ${l.runway_id} created. Publication and activation remain separate.`)})}async rehydrateContext(){return this.run("continuity.rehydrate",async()=>{let e=this.requireConfiguration(),t=await this.requestJson("/v1/continuity/rehydrate",{method:"POST",body:JSON.stringify((0,r.buildRehydrateRequest)(e,"",["knowledge","skills","files"]))}),a=(0,r.parseRehydrationResponse)(t);if(!a.runway.runway_id||!a.runway.generation){new o.Notice(`${a.runway.status}: no local Runway copy created.`);return}let i=(0,r.buildPublishedRunwayPath)(this.cleanFolder(this.settings.publishedFolder),e,a.runway.generation);await this.ensureFolder(i.split("/").slice(0,-1).join("/"));let s=this.app.vault.getAbstractFileByPath(i);if(s||(s=await this.app.vault.create(i,(0,r.formatRunwayMarkdown)(a))),!(s instanceof o.TFile))throw new Error("Published Runway path is not a Markdown file.");await this.app.workspace.getLeaf(!1).openFile(s),new o.Notice(`${a.runway.status}: exact Runway opened; supplemental evidence remains separate.`)})}async compareCurrentNote(){return this.run("continuity.compare",async()=>{this.requireConfiguration();let e=this.activeMarkdown(),t=await this.latest(),a=new Set(this.app.vault.getMarkdownFiles().map(s=>s.path)),i=await(0,r.compareNoteToRunway)(e.path,await this.app.vault.read(e),t.context||{},a);new o.Notice(`${i.matches?"Note hash matches the latest Runway":"Note hash is not represented by the latest Runway"}; ${i.missing_local_references.length} local reference(s) missing.`)})}async openRunwayLineage(){return this.run("continuity.lineage",async()=>{let e=this.requireConfiguration(),t=new URLSearchParams(e).toString(),a=await this.requestJson(`/v1/continuity/history?${t}`),i=this.cleanFolder(this.settings.proposalFolder);await this.ensureFolder(i);let s=new Date().toISOString(),l=Array.isArray(a.runways)?a.runways:[],c=`# Contextual Runway Lineage

- Identity: ${e.identity_id}
- Project: ${e.project_id}
- Scope: ${e.scope_key}
- Generated: ${s}
- Build identifier: ${r.BUILD_ID}

${l.length===0?"- No lineage available":l.map(p=>`- generation ${p.generation}: ${p.runway_id} \xB7 ${p.state} \xB7 predecessor ${p.predecessor_runway_id||"none"}`).join(`
`)}
`,d=await this.app.vault.create(`${i}/lineage-${s.replace(/[:.]/g,"-")}.md`,c);await this.app.workspace.getLeaf(!1).openFile(d)})}async processCurrentNote(){return this.run("ariadne.intake",async()=>{this.requireConfiguration();let e=this.activeMarkdown(),t=await this.app.vault.read(e),a=await this.requestJson("/api/ariadne/core/intake",{method:"POST",body:JSON.stringify({title:e.basename,content:t,source:"obsidian-plugin",metadata:{vaultPath:e.path,originalLocation:e.path},reviewFirst:!0})});if(a.mutated!==!1||a.reviewFirst!==!0||!a.proposal)throw new Error("Unsafe or invalid Ariadne response blocked.");let i=this.cleanFolder(this.settings.reviewFolder);await this.ensureFolder(i);let s=new Date().toISOString().replace(/[:.]/g,"-");await this.app.vault.create(`${i}/intake-${s}-${this.safeName(e.basename)}.md`,this.formatIntakeArtifact(e.path,a)),new o.Notice("Ariadne intake proposal written without changing the source note.")})}formatIntakeArtifact(e,t){let a=t.proposal||{};return`# Ariadne Intake Proposal

## Original file path

${e}

## Classification

${a.classification||"Unclassified"}

## Summary

${a.summary||""}

## Proposed destination

${a.proposedDestination||""}

## Proposed tags

${this.mdList(a.proposedTags)}

## Proposed links

${this.mdList(a.proposedLinks)}

## Warnings

${this.mdList(a.warnings)}

## Safety

- reviewFirst: true
- mutated: false
- explicit approval required: true
- source note changed: false
- build identifier: ${r.BUILD_ID}
`}mdList(e){return!Array.isArray(e)||e.length===0?"- None":e.map(t=>`- ${String(t)}`).join(`
`)}cleanFolder(e){return e.replace(/^\/+|\/+$/g,"")}safeName(e){return e.replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,80)||"note"}async ensureFolder(e){let t=e.split("/").filter(Boolean),a="";for(let i of t)a=a?`${a}/${i}`:i,this.app.vault.getAbstractFileByPath(a)||await this.app.vault.createFolder(a)}async loadSettings(){this.settings=Object.assign({},W,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}},H=m,S=class extends o.PluginSettingTab{constructor(e,t){super(e,t);this.plugin=t}display(){let{containerEl:e}=this;e.empty(),e.createEl("h2",{text:`Mnemosyne Ariadne \xB7 ${r.BUILD_ID}`}),this.addText("Worker base URL","No default endpoint is embedded.","workerBaseUrl"),new o.Setting(e).setName("Ariadne passkey").setDesc("Stored only in local Obsidian plugin data.").addText(t=>{t.inputEl.type="password",t.setValue(this.plugin.settings.ariadnePasskey).onChange(async a=>{this.plugin.settings.ariadnePasskey=a.trim(),await this.plugin.saveSettings()})}),new o.Setting(e).setName("Connection").setDesc("Verify the configured Worker without exposing response bodies.").addButton(t=>t.setButtonText("Test Connection").onClick(async()=>{t.setDisabled(!0),t.setButtonText("Connecting...");try{await this.plugin.testConnection()}finally{t.setDisabled(!1),t.setButtonText("Test Connection")}})),this.addText("Identity","Exact canonical credential identity.","identityId"),this.addText("Project","Explicit continuity project.","projectId"),this.addText("Scope","Bounded exact Runway scope.","scopeKey"),this.addText("Review folder","Ariadne review artifacts.","reviewFolder"),this.addText("Runway proposal folder",`Explicit submissions require server gate ${X}.`,"proposalFolder"),this.addText("Published Runway folder","Read-only local representations.","publishedFolder")}addText(e,t,a){new o.Setting(this.containerEl).setName(e).setDesc(t).addText(i=>i.setValue(this.plugin.settings[a]).onChange(async s=>{this.plugin.settings[a]=s.trim(),await this.plugin.saveSettings()}))}};
