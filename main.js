var f=Object.create,l=Object.defineProperty,m=Object.getPrototypeOf,y=Object.prototype.hasOwnProperty,v=Object.getOwnPropertyNames,k=Object.getOwnPropertyDescriptor;var u=s=>l(s,"__esModule",{value:!0});var A=(s,e)=>{for(var i in e)l(s,i,{get:e[i],enumerable:!0})},$=(s,e,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let t of v(e))!y.call(s,t)&&t!=="default"&&l(s,t,{get:()=>e[t],enumerable:!(i=k(e,t))||i.enumerable});return s},S=s=>$(u(l(s!=null?f(m(s)):{},"default",s&&s.__esModule&&"default"in s?{get:()=>s.default,enumerable:!0}:{value:s,enumerable:!0})),s);u(exports);A(exports,{default:()=>P});var a=S(require("obsidian")),d={workerBaseUrl:"https://mnemosyne-worker.izeesub.workers.dev",ariadnePasskey:"",reviewFolder:"System/Ariadne/Review"},g=class extends a.Plugin{async onload(){await this.loadSettings(),this.addCommand({id:"ariadne-intake-current-note",name:"Ariadne: Intake current note",checkCallback:e=>this.app.workspace.getActiveFile()?(e||this.processCurrentNote("intake"),!0):!1}),this.addCommand({id:"ariadne-review-current-note",name:"Ariadne: Review current note",checkCallback:e=>this.app.workspace.getActiveFile()?(e||this.processCurrentNote("review"),!0):!1}),this.addSettingTab(new w(this.app,this))}async processCurrentNote(e){let i=this.app.workspace.getActiveFile();if(!i){new a.Notice("No active note.");return}if(!(i instanceof a.TFile)||i.extension!=="md"){new a.Notice("Active file is not a Markdown note.");return}if(!this.settings.ariadnePasskey.trim()){new a.Notice("Missing Ariadne passkey. Configure plugin settings.");return}let t=await this.app.vault.read(i),n=i.basename,c=e==="review"?`${this.settings.workerBaseUrl}/api/ariadne/core/review`:`${this.settings.workerBaseUrl}/api/ariadne/core/intake`,p=e==="review"?{title:n,content:t,currentLocation:i.path,metadata:{vaultPath:i.path},reviewFirst:!0}:{title:n,content:t,source:"obsidian-plugin",metadata:{vaultPath:i.path},reviewFirst:!0};new a.Notice(`Ariadne ${e} started.`);let r=await fetch(c,{method:"POST",headers:{"Content-Type":"application/json","X-Matrix-Key":this.settings.ariadnePasskey},body:JSON.stringify(p)});if(!r.ok){let h=await r.text();new a.Notice(`Ariadne ${e} failed: HTTP ${r.status}`),console.error(h);return}let o=await r.json();if(o.mutated!==!1||o.reviewFirst!==!0){new a.Notice("Unsafe Ariadne response blocked."),console.error(o);return}await this.writeReviewArtifact(i,e,o),new a.Notice(`Ariadne ${e} proposal written.`)}async writeReviewArtifact(e,i,t){let n=this.settings.reviewFolder.replace(/^\/+|\/+$/g,"");await this.ensureFolder(n);let c=new Date().toISOString().replace(/[:.]/g,"-"),p=e.basename.replace(/[^a-zA-Z0-9_-]/g,"-"),r=`${n}/${i}-${c}-${p}.md`,o=i==="review"?this.formatReviewArtifact(e.path,t):this.formatIntakeArtifact(e.path,t);await this.app.vault.create(r,o)}formatIntakeArtifact(e,i){let t=i.proposal||{};return`# Ariadne Intake Proposal

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

- mutated: false
- approval required: true
`}formatReviewArtifact(e,i){let t=i.review||{};return`# Ariadne Review Proposal

## Original file path

${e}

## Summary

${t.summary||""}

## Quality

${t.quality||""}

## Ambiguities

${this.mdList(t.ambiguities)}

## Missing information

${this.mdList(t.missingInformation)}

## Duplicate risk

${t.duplicateRisk||""}

## Suggested destination

${t.suggestedDestination||""}

## Suggested tags

${this.mdList(t.suggestedTags)}

## Suggested links

${this.mdList(t.suggestedLinks)}

## Confidence

${typeof t.confidence=="number"?t.confidence:"Unspecified"}

## Warnings

${this.mdList(t.warnings)}

## Safety

- mutated: false
- approval required: true
`}mdList(e){return!Array.isArray(e)||e.length===0?"- None":e.map(i=>`- ${String(i)}`).join(`
`)}async ensureFolder(e){let i=e.split("/").filter(Boolean),t="";for(let n of i)t=t?`${t}/${n}`:n,this.app.vault.getAbstractFileByPath(t)||await this.app.vault.createFolder(t)}async loadSettings(){this.settings=Object.assign({},d,await this.loadData())}async saveSettings(){await this.saveData(this.settings)}},P=g,w=class extends a.PluginSettingTab{constructor(e,i){super(e,i);this.plugin=i}display(){let{containerEl:e}=this;e.empty(),e.createEl("h2",{text:"Mnemosyne Ariadne"}),new a.Setting(e).setName("Worker base URL").setDesc("Mnemosyne Worker base URL.").addText(i=>i.setPlaceholder(d.workerBaseUrl).setValue(this.plugin.settings.workerBaseUrl).onChange(async t=>{this.plugin.settings.workerBaseUrl=t.trim(),await this.plugin.saveSettings()})),new a.Setting(e).setName("Ariadne passkey").setDesc("Stored locally in Obsidian plugin data.").addText(i=>{i.inputEl.type="password",i.setPlaceholder("X-Matrix-Key").setValue(this.plugin.settings.ariadnePasskey).onChange(async t=>{this.plugin.settings.ariadnePasskey=t.trim(),await this.plugin.saveSettings()})}),new a.Setting(e).setName("Review folder").setDesc("Where Ariadne proposal notes are written.").addText(i=>i.setPlaceholder(d.reviewFolder).setValue(this.plugin.settings.reviewFolder).onChange(async t=>{this.plugin.settings.reviewFolder=t.trim()||d.reviewFolder,await this.plugin.saveSettings()}))}};
