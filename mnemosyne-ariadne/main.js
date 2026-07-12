var h=Object.create,d=Object.defineProperty,m=Object.getPrototypeOf,y=Object.prototype.hasOwnProperty,f=Object.getOwnPropertyNames,k=Object.getOwnPropertyDescriptor;var u=i=>d(i,"__esModule",{value:!0});var v=(i,e)=>{for(var a in e)d(i,a,{get:e[a],enumerable:!0})},A=(i,e,a)=>{if(e&&typeof e=="object"||typeof e=="function")for(let t of f(e))!y.call(i,t)&&t!=="default"&&d(i,t,{get:()=>e[t],enumerable:!(a=k(e,t))||a.enumerable});return i},S=i=>A(u(d(i!=null?h(m(i)):{},"default",i&&i.__esModule&&"default"in i?{get:()=>i.default,enumerable:!0}:{value:i,enumerable:!0})),i);u(exports);v(exports,{default:()=>P});var s=S(require("obsidian")),p={workerBaseUrl:"https://mnemosyne-worker.izeesub.workers.dev",ariadnePasskey:"",reviewFolder:"System/Ariadne/Review"},g=class extends s.Plugin{async onload(){await this.loadSettings(),this.addCommand({id:"ariadne-intake-current-note",name:"Ariadne: Intake current note",checkCallback:e=>this.app.workspace.getActiveFile()?(e||this.processCurrentNote(),!0):!1}),this.addSettingTab(new w(this.app,this))}async processCurrentNote(){new s.Notice("Ariadne command handler entered.");let e=this.app.workspace.getActiveFile();if(!e){new s.Notice("No active note.");return}if(!(e instanceof s.TFile)||e.extension!=="md"){new s.Notice("Active file is not a Markdown note.");return}if(!this.settings.ariadnePasskey.trim()){new s.Notice("Missing Ariadne passkey. Configure plugin settings.");return}let a=await this.app.vault.read(e),t=e.basename,o=`${this.settings.workerBaseUrl.replace(/\/+$/g,"")}/api/ariadne/core/intake`,c={title:t,content:a,source:"obsidian-plugin",metadata:{vaultPath:e.path,originalLocation:e.path},reviewFirst:!0};new s.Notice("Ariadne intake started.");let n;try{n=await fetch(o,{method:"POST",headers:{"Content-Type":"application/json","X-Matrix-Key":this.settings.ariadnePasskey,"X-Ariadne-Key":this.settings.ariadnePasskey},body:JSON.stringify(c)})}catch(l){console.error(l),new s.Notice(`Ariadne network error: ${l instanceof Error?l.message:String(l)}`);return}if(!n.ok){let l=await n.text();new s.Notice(`Ariadne intake failed: HTTP ${n.status}`),console.error(l);return}let r=await n.json();if(r.mutated!==!1||r.reviewFirst!==!0||!r.proposal){new s.Notice("Unsafe or invalid Ariadne response blocked."),console.error(r);return}await this.writeReviewArtifact(e,r),new s.Notice("Ariadne intake proposal written.")}async writeReviewArtifact(e,a){let t=this.settings.reviewFolder.replace(/^\/+|\/+$/g,"");await this.ensureFolder(t);let o=new Date().toISOString().replace(/[:.]/g,"-"),c=e.basename.replace(/[^a-zA-Z0-9_-]/g,"-"),n=`${t}/intake-${o}-${c}.md`,r=this.formatIntakeArtifact(e.path,a);await this.app.vault.create(n,r)}formatIntakeArtifact(e,a){let t=a.proposal||{};return`# Ariadne Intake Proposal

## Original file path

${e}

## Classification

${t.classification||"Unclassified"}

## Summary

${t.summary||""}

## Proposed destination

${t.proposedDestination||""}

## Proposed tags

${this.mdList(t.proposedTags)}

## Proposed links

${this.mdList(t.proposedLinks)}

## Warnings

${this.mdList(t.warnings)}

## Safety

- reviewFirst: true
- mutated: false
- approval required: true
- original note moved: false
- original note renamed: false
- original note deleted: false
- direct vault knowledge mutation: false
`}mdList(e){return!Array.isArray(e)||e.length===0?"- None":e.map(a=>`- ${String(a)}`).join(`
`)}async ensureFolder(e){let a=e.split("/").filter(Boolean),t="";for(let o of a)t=t?`${t}/${o}`:o,this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t)}async loadSettings(){this.settings=Object.assign({},p,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}},P=g,w=class extends s.PluginSettingTab{constructor(e,a){super(e,a);this.plugin=a}display(){let{containerEl:e}=this;e.empty(),e.createEl("h2",{text:"Mnemosyne Ariadne"}),new s.Setting(e).setName("Worker base URL").setDesc("Mnemosyne Worker base URL.").addText(a=>a.setPlaceholder(p.workerBaseUrl).setValue(this.plugin.settings.workerBaseUrl).onChange(async t=>{this.plugin.settings.workerBaseUrl=t.trim(),await this.plugin.saveSettings()})),new s.Setting(e).setName("Ariadne passkey").setDesc("Stored locally in Obsidian plugin data.").addText(a=>{a.inputEl.type="password",a.setPlaceholder("Ariadne passkey").setValue(this.plugin.settings.ariadnePasskey).onChange(async t=>{this.plugin.settings.ariadnePasskey=t.trim(),await this.plugin.saveSettings()})}),new s.Setting(e).setName("Review folder").setDesc("Where Ariadne proposal notes are written.").addText(a=>a.setPlaceholder(p.reviewFolder).setValue(this.plugin.settings.reviewFolder).onChange(async t=>{this.plugin.settings.reviewFolder=t.trim()||p.reviewFolder,await this.plugin.saveSettings()}))}};
