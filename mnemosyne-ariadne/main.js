var f=Object.create,p=Object.defineProperty,k=Object.getPrototypeOf,A=Object.prototype.hasOwnProperty,v=Object.getOwnPropertyNames,T=Object.getOwnPropertyDescriptor;var h=i=>p(i,"__esModule",{value:!0});var P=(i,e)=>{for(var t in e)p(i,t,{get:e[t],enumerable:!0})},S=(i,e,t)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of v(e))!A.call(i,n)&&n!=="default"&&p(i,n,{get:()=>e[n],enumerable:!(t=T(e,n))||t.enumerable});return i},$=i=>S(h(p(i!=null?f(k(i)):{},"default",i&&i.__esModule&&"default"in i?{get:()=>i.default,enumerable:!0}:{value:i,enumerable:!0})),i);h(exports);P(exports,{default:()=>b});var s=$(require("obsidian")),g={workerBaseUrl:"https://mnemosyne-worker.izeesub.workers.dev",ariadnePasskey:"",reviewFolder:"System/Ariadne/Review"},u=class extends s.Plugin{async onload(){await this.loadSettings(),this.addCommand({id:"ariadne-intake-current-note",name:"Ariadne: Intake current note",checkCallback:e=>this.app.workspace.getActiveFile()?(e||this.processCurrentNote(),!0):!1}),this.addSettingTab(new m(this.app,this))}async processCurrentNote(){new s.Notice("Ariadne command handler entered.");let e=this.app.workspace.getActiveFile();if(!e){new s.Notice("No active note.");return}if(!(e instanceof s.TFile)||e.extension!=="md"){new s.Notice("Active file is not a Markdown note.");return}if(!this.settings.ariadnePasskey.trim()){new s.Notice("Missing Ariadne passkey. Configure plugin settings.");return}let t=await this.app.vault.read(e),n=e.basename,r=`${this.settings.workerBaseUrl.replace(/\/+$/g,"")}/api/ariadne/core/intake`,d={title:n,content:t,source:"obsidian-plugin",metadata:{vaultPath:e.path,originalLocation:e.path},reviewFirst:!0};new s.Notice("Ariadne intake started.");let o;try{o=await fetch(r,{method:"POST",headers:{"Content-Type":"application/json","X-Matrix-Key":this.settings.ariadnePasskey,"X-Ariadne-Key":this.settings.ariadnePasskey},body:JSON.stringify(d)})}catch(a){console.error(a),new s.Notice(`Ariadne network error: ${a instanceof Error?a.message:String(a)}`);return}if(!o.ok){let a=await o.text();new s.Notice(`Ariadne intake failed: HTTP ${o.status}`),console.error(a);return}let l=await o.json();if(l.mutated!==!1||l.reviewFirst!==!0||!l.proposal){new s.Notice("Unsafe or invalid Ariadne response blocked."),console.error(l);return}await this.writeReviewArtifact(e,l),new s.Notice("Ariadne intake proposal written.")}async writeReviewArtifact(e,t){let n=this.settings.reviewFolder.replace(/^\/+|\/+$/g,"");await this.ensureFolder(n);let r=new Date().toISOString().replace(/[:.]/g,"-"),d=e.basename.replace(/[^a-zA-Z0-9_-]/g,"-"),o=`${n}/intake-${r}-${d}.md`,l=this.formatIntakeArtifact(e.path,t);await this.app.vault.create(o,l)}formatIntakeArtifact(e,t){let n=t.proposal||{};return`# Ariadne Intake Proposal

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
- approval required: true
- original note moved: false
- original note renamed: false
- original note deleted: false
- direct vault knowledge mutation: false
`}mdList(e){return!Array.isArray(e)||e.length===0?"- None":e.map(t=>`- ${String(t)}`).join(`
`)}async ensureFolder(e){let t=e.split("/").filter(Boolean),n="";for(let r of t)n=n?`${n}/${r}`:r,this.app.vault.getAbstractFileByPath(n)||await this.app.vault.createFolder(n)}async loadSettings(){this.settings=Object.assign({},g,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}},b=u,m=class extends s.PluginSettingTab{constructor(e,t){super(e,t);this.plugin=t}display(){let{containerEl:e}=this;e.empty(),e.createEl("h2",{text:"Mnemosyne Ariadne"}),new s.Setting(e).setName("Worker base URL").setDesc("Mnemosyne Worker base URL.").addText(t=>t.setPlaceholder(g.workerBaseUrl).setValue(this.plugin.settings.workerBaseUrl).onChange(async n=>{this.plugin.settings.workerBaseUrl=n.trim(),await this.plugin.saveSettings()})),new s.Setting(e).setName("Ariadne passkey").setDesc("Stored locally in Obsidian plugin data.").addText(t=>{t.inputEl.type="password",t.setPlaceholder("Ariadne passkey").setValue(this.plugin.settings.ariadnePasskey).onChange(async n=>{this.plugin.settings.ariadnePasskey=n.trim(),await this.plugin.saveSettings()})}),new s.Setting(e).setName("Connection").setDesc("Verify connectivity to the Mnemosyne Worker.").addButton(t=>{t.setButtonText("Test Connection").onClick(async()=>{let n=this.plugin.settings.workerBaseUrl.replace(/\/+$/g,""),r=this.plugin.settings.ariadnePasskey.trim();if(!r){new s.Notice("No API key configured.");return}let d=performance.now();t.setDisabled(!0),t.setButtonText("Connecting...");let o=new AbortController,l=window.setTimeout(()=>o.abort(),5e3);try{let a=await fetch(`${n}/v1/memory/self`,{method:"GET",headers:{"X-Matrix-Key":r,"X-Ariadne-Key":r},signal:o.signal}),c=Math.round(performance.now()-d);if(!a.ok){let y=await a.text();console.error("Ariadne connection failed:",y),new s.Notice(`Mnemosyne connection failed: HTTP ${a.status} (${c} ms)`);return}let w=await a.json();new s.Notice(`Connected as ${w.principal_id||w.credential_id||"Ariadne"} (${c} ms)`),console.log("Ariadne connection identity:",w)}catch(a){let c=a instanceof Error?a.name==="AbortError"?"Connection timed out after 5 seconds.":a.message:String(a);console.error("Ariadne connection error:",a),new s.Notice(`Mnemosyne connection error: ${c}`)}finally{window.clearTimeout(l),t.setDisabled(!1),t.setButtonText("Test Connection")}})}),new s.Setting(e).setName("Review folder").setDesc("Where Ariadne proposal notes are written.").addText(t=>t.setPlaceholder(g.reviewFolder).setValue(this.plugin.settings.reviewFolder).onChange(async n=>{this.plugin.settings.reviewFolder=n.trim()||g.reviewFolder,await this.plugin.saveSettings()}))}};
