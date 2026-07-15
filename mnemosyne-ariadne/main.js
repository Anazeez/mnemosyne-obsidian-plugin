var C=Object.create,h=Object.defineProperty,R=Object.getPrototypeOf,x=Object.prototype.hasOwnProperty,A=Object.getOwnPropertyNames,E=Object.getOwnPropertyDescriptor;var g=t=>h(t,"__esModule",{value:!0});var T=(t,e)=>()=>(e||(e={exports:{}},t(e.exports,e)),e.exports),N=(t,e)=>{for(var a in e)h(t,a,{get:e[a],enumerable:!0})},P=(t,e,a)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of A(e))!x.call(t,n)&&n!=="default"&&h(t,n,{get:()=>e[n],enumerable:!(a=E(e,n))||a.enumerable});return t},f=t=>P(g(h(t!=null?C(R(t)):{},"default",t&&t.__esModule&&"default"in t?{get:()=>t.default,enumerable:!0}:{value:t,enumerable:!0})),t);var $=T((V,_)=>{"use strict";var v="mnemosyne-ariadne/0.0.4+continuity-review",b="mnemosyne.context-runway/1.0",y="mnemosyne-context-checkpoint-proposal",F=/^[a-z0-9][a-z0-9_-]{1,63}$/,O=/^[a-z0-9][a-z0-9._-]{1,63}$/,I=/^(?:[a-z0-9][a-z0-9_-]{1,63}|(?:mandate|thread):[a-z0-9][a-z0-9_-]{1,63})$/;async function u(t){let e=new TextEncoder().encode(String(t)),a=await crypto.subtle.digest("SHA-256",e);return Array.from(new Uint8Array(a)).map(n=>n.toString(16).padStart(2,"0")).join("")}function w(t){let e={identity_id:String(t?.identity_id||"").trim().toLowerCase(),project_id:String(t?.project_id||"").trim().toLowerCase(),scope_key:String(t?.scope_key||"").trim().toLowerCase()};if(!F.test(e.identity_id))throw new Error("invalid_identity_id");if(!O.test(e.project_id))throw new Error("invalid_project_id");if(!I.test(e.scope_key)||e.scope_key.length>96)throw new Error("invalid_scope_key");return e}async function j({source:t,scope:e,current:a,createdAt:n,invocationId:i}){let s=w(e),l=`obsidian:${t.path}`,c=await u(t.content),d=Number(a?.generation||0)+1,p=[{source_ref:l,sha256:c}];return{proposal_schema:"mnemosyne.context-runway-proposal/1.0",review_first:!0,submit_automatically:!1,source:"obsidian-plugin",...s,predecessor_runway_id:a?.runway_id||null,source_invocation_id:i,source_note:{path:t.path,sha256:c},source_hashes:p,idempotency_key:`obsidian-${await u([l,c,a?.runway_id||"genesis",i].join(`
`))}`,payload:{schema:b,runway_id:"assigned-by-worker",...s,generation:d,predecessor_runway_id:a?.runway_id||null,source_invocation_id:i,objective:t.basename,operational_state:t.content.slice(0,8e3),decisions_in_force:[],open_threads:[],next_actions:[],mounted_skills:[],relevant_agents:[],relevant_files:[{source_ref:l,sha256:c}],knowledge_references:[],library_references:[],pending_handoffs:[],constraints:["Review-first proposal; explicit submission required"],prohibited_assumptions:["Semantic similarity does not establish current continuity"],integrity_warnings:[],source_hashes:p,created_at:n}}}async function L(t,e){return t?.source_note?.path!==e?.path?!1:t.source_note.sha256===await u(e.content)}function M(t){return`# Mnemosyne Contextual Checkpoint Proposal

Review-first artifact. Explicit submission required. The source note has not
been modified, moved, renamed, or deleted.

<!-- ${y}:start -->
\`\`\`json
${JSON.stringify(t,null,2)}
\`\`\`
<!-- ${y}:end -->
`}function U(t){let e=`<!-- ${y}:start -->`,a=`<!-- ${y}:end -->`,n=t.indexOf(e),i=t.indexOf(a);if(n<0||i<=n)throw new Error("checkpoint_proposal_marker_missing");let l=t.slice(n+e.length,i).trim().match(/^```json\n([\s\S]+)\n```$/);if(!l)throw new Error("checkpoint_proposal_json_missing");let c=JSON.parse(l[1]);if(c.proposal_schema!=="mnemosyne.context-runway-proposal/1.0"||c.review_first!==!0||c.submit_automatically!==!1)throw new Error("checkpoint_proposal_invalid");return c}function q(t,e="",a=[]){return{...w(t),supplemental_query:String(e||"").slice(0,8e3),supplemental_domains:[...new Set(a)].filter(n=>["knowledge","agents","skills","files","library"].includes(n)),top_k:5}}function D(t){if(!t?.context||!t?.supplemental||!t?.retrieval_receipt_id)throw new Error("invalid_rehydration_response");if(!new Set(["CURRENT_CONTEXT","STALE_CONTEXT","DEGRADED_CONTEXT","NO_CONTEXT","QUARANTINED_CONTEXT","CONTEXT_UNAVAILABLE"]).has(t.context.status))throw new Error("invalid_context_status");let a=[];t.context.status!=="CURRENT_CONTEXT"&&a.push(`Context status is ${t.context.status.toLowerCase().replaceAll("_"," ")}.`),(t.omissions||[]).length>0&&a.push(`${t.omissions.length} inaccessible reference(s) were omitted.`);for(let n of t.supplemental.errors||[])a.push(`Supplemental evidence warning: ${n.code||"unavailable"}.`);return{runway:t.context,supplemental:[...t.supplemental.results||[]],warnings:a,receipt_id:t.retrieval_receipt_id,invocation:t.invocation}}function B(t,e,a){let n=w(e);if(!Number.isInteger(Number(a))||Number(a)<1)throw new Error("invalid_generation");return`${String(t||"").replace(/^\/+|\/+$/g,"")}/${n.project_id}/${n.identity_id}/${n.scope_key}/runway-${a}.md`}function z(t){let e=t.runway.payload||{};return`# Contextual Runway ${t.runway.generation??"Unavailable"}

> Read-only representation. Canonical head remains in Mnemosyne-Worker.

- Identity: ${e.identity_id||"Unavailable"}
- Project: ${e.project_id||"Unavailable"}
- Scope: ${e.scope_key||"Unavailable"}
- Status: ${t.runway.status}
- Runway: ${t.runway.runway_id||"None"}
- Age seconds: ${t.runway.age_seconds??"Unknown"}
- Hash verification: ${t.runway.manifest_hash?"passed":"unavailable"}
- Predecessor: ${e.predecessor_runway_id||"None"}
- Source count: ${(e.source_hashes||[]).length}
- Warning count: ${(t.warnings||[]).length}
- Retrieval receipt: ${t.receipt_id}
- Build identifier: ${v}

## Objective

${e.objective||"No exact context is available."}

## Current Operational State

${e.operational_state||""}

## Warnings

${k(t.warnings)}

## Supplemental Evidence (separate)

${k(t.supplemental)}
`}async function J(t,e,a,n){let i=`obsidian:${t}`,s=(a.payload?.source_hashes||[]).find(d=>d.source_ref===i)?.sha256,l=await u(e),c=(a.authorized_references||[]).map(d=>d.source_ref).filter(d=>d?.startsWith("obsidian:")&&!n.has(d.slice(9)));return{matches:Boolean(s)&&s===l,source_ref:i,missing_local_references:c}}function k(t){return!Array.isArray(t)||t.length===0?"- None":t.map(e=>`- ${typeof e=="string"?e:JSON.stringify(e)}`).join(`
`)}_.exports={BUILD_ID:v,RUNWAY_SCHEMA:b,buildCheckpointProposal:j,buildPublishedRunwayPath:B,buildRehydrateRequest:q,compareNoteToRunway:J,formatCheckpointProposal:M,formatRunwayMarkdown:z,normalizeScope:w,parseCheckpointProposal:U,parseRehydrationResponse:D,sha256Hex:u,verifyProposalSource:L}});g(exports);N(exports,{default:()=>H});var o=f(require("obsidian")),r=f($());var X={workerBaseUrl:"",ariadnePasskey:"",reviewFolder:"System/Ariadne/Review",proposalFolder:"System/Mnemosyne/Runway-Proposals",publishedFolder:"System/Mnemosyne/Runways",identityId:"ariadne",projectId:"project-infinitum",scopeKey:"default"},W="CONTINUITY_OBSIDIAN_ACTIONS",m=class extends o.Plugin{async onload(){await this.loadSettings(),this.addCommand({id:"ariadne-intake-current-note",name:"Ariadne: Intake current note",callback:()=>this.processCurrentNote()}),this.addCommand({id:"mnemosyne-show-latest-contextual-runway",name:"Mnemosyne: Show latest contextual runway",callback:()=>this.showLatestRunway()}),this.addCommand({id:"mnemosyne-propose-contextual-checkpoint",name:"Mnemosyne: Propose contextual checkpoint",callback:()=>this.proposeCheckpoint()}),this.addCommand({id:"mnemosyne-submit-reviewed-checkpoint",name:"Mnemosyne: Submit reviewed checkpoint",callback:()=>this.submitReviewedCheckpoint()}),this.addCommand({id:"mnemosyne-rehydrate-specialist-context",name:"Mnemosyne: Rehydrate specialist context",callback:()=>this.rehydrateContext()}),this.addCommand({id:"mnemosyne-compare-note-latest-runway",name:"Mnemosyne: Compare current note with latest runway",callback:()=>this.compareCurrentNote()}),this.addCommand({id:"mnemosyne-open-runway-lineage",name:"Mnemosyne: Open runway lineage",callback:()=>this.openRunwayLineage()}),this.addSettingTab(new S(this.app,this))}scope(){return(0,r.normalizeScope)({identity_id:this.settings.identityId,project_id:this.settings.projectId,scope_key:this.settings.scopeKey})}requireConfiguration(){if(!this.settings.workerBaseUrl.trim()||!this.settings.ariadnePasskey.trim())throw new Error("Configure the Worker URL and Ariadne passkey first.");return this.scope()}endpoint(e){return`${this.settings.workerBaseUrl.replace(/\/+$/g,"")}${e}`}async requestJson(e,a={}){let n={"Content-Type":"application/json","X-Matrix-Key":this.settings.ariadnePasskey,"X-Ariadne-Key":this.settings.ariadnePasskey,...a.headers||{}},i;try{i=await fetch(this.endpoint(e),{...a,headers:n})}catch{throw new Error("Mnemosyne network request is unavailable.")}if(!i.ok)throw new Error(`Mnemosyne request failed with HTTP ${i.status}.`);try{return await i.json()}catch{throw new Error("Mnemosyne returned an invalid response.")}}async latest(){let e=this.requireConfiguration(),a=new URLSearchParams(e).toString();return this.requestJson(`/v1/continuity/latest?${a}`)}activeMarkdown(){let e=this.app.workspace.getActiveFile();if(!(e instanceof o.TFile)||e.extension!=="md")throw new Error("The active file must be a Markdown note.");return e}async run(e,a){try{await a()}catch(n){let i=n instanceof Error?n.message:`${e} failed.`;new o.Notice(i),console.warn(`[${e}] ${i}`)}}async showLatestRunway(){return this.run("continuity.latest",async()=>{let a=(await this.latest()).context||{};new o.Notice(`${a.status||"CONTEXT_UNAVAILABLE"} \xB7 generation ${a.generation==null?"none":a.generation} \xB7 ${r.BUILD_ID}`)})}async proposeCheckpoint(){return this.run("continuity.propose",async()=>{let e=this.requireConfiguration(),a=this.activeMarkdown(),n=await this.app.vault.read(a),i=await this.latest(),s=new Date().toISOString(),l=await(0,r.buildCheckpointProposal)({source:{path:a.path,basename:a.basename,content:n},scope:e,current:i.context&&i.context.runway_id?i.context:null,createdAt:s,invocationId:`inv_obsidian_${s.replace(/[^0-9]/g,"")}`}),c=this.cleanFolder(this.settings.proposalFolder);await this.ensureFolder(c);let d=`${c}/checkpoint-${this.safeName(a.basename)}-${s.replace(/[:.]/g,"-")}.md`,p=await this.app.vault.create(d,(0,r.formatCheckpointProposal)(l));await this.app.workspace.getLeaf(!1).openFile(p),new o.Notice("Checkpoint proposal created. Review it before explicit submission.")})}async submitReviewedCheckpoint(){return this.run("continuity.submit",async()=>{this.requireConfiguration();let e=this.activeMarkdown(),a=`${this.cleanFolder(this.settings.proposalFolder)}/`;if(!e.path.startsWith(a))throw new Error("Only a reviewed Runway-Proposals note can be submitted.");let n=(0,r.parseCheckpointProposal)(await this.app.vault.read(e)),i=this.app.vault.getAbstractFileByPath(n.source_note.path);if(!(i instanceof o.TFile))throw new Error("The checkpoint source note is unavailable.");let s={path:i.path,basename:i.basename,content:await this.app.vault.read(i)};if(!await(0,r.verifyProposalSource)(n,s))throw new Error("Source hash changed; create and review a new proposal.");let l=await this.requestJson("/v1/continuity/checkpoints",{method:"POST",body:JSON.stringify(n)});new o.Notice(`Checkpoint candidate ${l.runway_id} created. Publication and activation remain separate.`)})}async rehydrateContext(){return this.run("continuity.rehydrate",async()=>{let e=this.requireConfiguration(),a=await this.requestJson("/v1/continuity/rehydrate",{method:"POST",body:JSON.stringify((0,r.buildRehydrateRequest)(e,"",["knowledge","skills","files"]))}),n=(0,r.parseRehydrationResponse)(a);if(!n.runway.runway_id||!n.runway.generation){new o.Notice(`${n.runway.status}: no local Runway copy created.`);return}let i=(0,r.buildPublishedRunwayPath)(this.cleanFolder(this.settings.publishedFolder),e,n.runway.generation);await this.ensureFolder(i.split("/").slice(0,-1).join("/"));let s=this.app.vault.getAbstractFileByPath(i);if(s||(s=await this.app.vault.create(i,(0,r.formatRunwayMarkdown)(n))),!(s instanceof o.TFile))throw new Error("Published Runway path is not a Markdown file.");await this.app.workspace.getLeaf(!1).openFile(s),new o.Notice(`${n.runway.status}: exact Runway opened; supplemental evidence remains separate.`)})}async compareCurrentNote(){return this.run("continuity.compare",async()=>{this.requireConfiguration();let e=this.activeMarkdown(),a=await this.latest(),n=new Set(this.app.vault.getMarkdownFiles().map(s=>s.path)),i=await(0,r.compareNoteToRunway)(e.path,await this.app.vault.read(e),a.context||{},n);new o.Notice(`${i.matches?"Note hash matches the latest Runway":"Note hash is not represented by the latest Runway"}; ${i.missing_local_references.length} local reference(s) missing.`)})}async openRunwayLineage(){return this.run("continuity.lineage",async()=>{let e=this.requireConfiguration(),a=new URLSearchParams(e).toString(),n=await this.requestJson(`/v1/continuity/history?${a}`),i=this.cleanFolder(this.settings.proposalFolder);await this.ensureFolder(i);let s=new Date().toISOString(),l=Array.isArray(n.runways)?n.runways:[],c=`# Contextual Runway Lineage

- Identity: ${e.identity_id}
- Project: ${e.project_id}
- Scope: ${e.scope_key}
- Generated: ${s}
- Build identifier: ${r.BUILD_ID}

${l.length===0?"- No lineage available":l.map(p=>`- generation ${p.generation}: ${p.runway_id} \xB7 ${p.state} \xB7 predecessor ${p.predecessor_runway_id||"none"}`).join(`
`)}
`,d=await this.app.vault.create(`${i}/lineage-${s.replace(/[:.]/g,"-")}.md`,c);await this.app.workspace.getLeaf(!1).openFile(d)})}async processCurrentNote(){return this.run("ariadne.intake",async()=>{this.requireConfiguration();let e=this.activeMarkdown(),a=await this.app.vault.read(e),n=await this.requestJson("/api/ariadne/core/intake",{method:"POST",body:JSON.stringify({title:e.basename,content:a,source:"obsidian-plugin",metadata:{vaultPath:e.path,originalLocation:e.path},reviewFirst:!0})});if(n.mutated!==!1||n.reviewFirst!==!0||!n.proposal)throw new Error("Unsafe or invalid Ariadne response blocked.");let i=this.cleanFolder(this.settings.reviewFolder);await this.ensureFolder(i);let s=new Date().toISOString().replace(/[:.]/g,"-");await this.app.vault.create(`${i}/intake-${s}-${this.safeName(e.basename)}.md`,this.formatIntakeArtifact(e.path,n)),new o.Notice("Ariadne intake proposal written without changing the source note.")})}formatIntakeArtifact(e,a){let n=a.proposal||{};return`# Ariadne Intake Proposal

## Original file path

${e}

## Classification

${n.classification||"Unclassified"}

## Summary

${n.summary||""}

## Proposed destination

${n.proposedDestination||""}

## Proposed tags

${this.mdList(n.proposedTags)}

## Proposed links

${this.mdList(n.proposedLinks)}

## Warnings

${this.mdList(n.warnings)}

## Safety

- reviewFirst: true
- mutated: false
- explicit approval required: true
- source note changed: false
- build identifier: ${r.BUILD_ID}
`}mdList(e){return!Array.isArray(e)||e.length===0?"- None":e.map(a=>`- ${String(a)}`).join(`
`)}cleanFolder(e){return e.replace(/^\/+|\/+$/g,"")}safeName(e){return e.replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,80)||"note"}async ensureFolder(e){let a=e.split("/").filter(Boolean),n="";for(let i of a)n=n?`${n}/${i}`:i,this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n)}async loadSettings(){this.settings=Object.assign({},X,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}},H=m,S=class extends o.PluginSettingTab{constructor(e,a){super(e,a);this.plugin=a}display(){let{containerEl:e}=this;e.empty(),e.createEl("h2",{text:`Mnemosyne Ariadne \xB7 ${r.BUILD_ID}`}),this.addText("Worker base URL","No default endpoint is embedded.","workerBaseUrl"),new o.Setting(e).setName("Ariadne passkey").setDesc("Stored only in local Obsidian plugin data.").addText(a=>{a.inputEl.type="password",a.setValue(this.plugin.settings.ariadnePasskey).onChange(async n=>{this.plugin.settings.ariadnePasskey=n.trim(),await this.plugin.saveSettings()})}),this.addText("Identity","Exact canonical credential identity.","identityId"),this.addText("Project","Explicit continuity project.","projectId"),this.addText("Scope","Bounded exact Runway scope.","scopeKey"),this.addText("Review folder","Ariadne review artifacts.","reviewFolder"),this.addText("Runway proposal folder",`Explicit submissions require server gate ${W}.`,"proposalFolder"),this.addText("Published Runway folder","Read-only local representations.","publishedFolder")}addText(e,a,n){new o.Setting(this.containerEl).setName(e).setDesc(a).addText(i=>i.setValue(this.plugin.settings[n]).onChange(async s=>{this.plugin.settings[n]=s.trim(),await this.plugin.saveSettings()}))}};
