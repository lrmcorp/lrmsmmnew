// One main production action. Models and workflow remain an optional disclosure.
import { t } from './strings.en.js';
export function generatorStudio({h,icon,story,campaign,accountPicker,schedule,workflow,onMode,onEditBrief,keyCount}) {
 let mode='storyline';const tabs={},panels={};
 const canvas=h('details',{class:'studio-agents'},h('summary',{},h('span',{class:'studio-section-icon'},icon('team')),h('span',{},h('b',{},t('generator.agents.model')),h('small',{},t('legacy.advanced_settings_optional'))),h('span',{class:'studio-disclosure'},t('generator.canvas.open'))),workflow.element);
 const storyTarget=h('section',{class:'panel studio-story-target'},story.accountControl);
 const modeTabs=h('div',{class:'studio-mode-tabs',role:'tablist','aria-label':t('legacy.content_mode')},...['storyline','campaign'].map((id,i)=>{
  const button=h('button',{type:'button',id:'studio-tab-'+id,role:'tab','aria-controls':'studio-panel-'+id,'aria-selected':i===0?'true':'false',tabindex:i===0?0:-1,onclick:()=>chooseMode(id),onkeydown:e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?'storyline':e.key==='End'?'campaign':id==='storyline'?'campaign':'storyline';chooseMode(next);tabs[next].focus();
  }},icon(id==='storyline'?'sparkles':'pen'),h('span',{},h('b',{},id==='storyline'?t('generator.storyline'):t('generator.campaign.new'))));tabs[id]=button;return button;
 }));
 panels.storyline=h('div',{id:'studio-panel-storyline',role:'tabpanel','aria-labelledby':'studio-tab-storyline'},story.element);
 panels.campaign=h('div',{id:'studio-panel-campaign',role:'tabpanel','aria-labelledby':'studio-tab-campaign',hidden:true},campaign);
 const element=h('div',{class:'generator-studio','data-mode':mode},h('div',{class:'studio-mode-row'},modeTabs),h('div',{class:'workflow-setup studio-context'},storyTarget,accountPicker,schedule),!keyCount?h('a',{href:'#/settings',class:'studio-key-warning'},t('legacy.add_a_personal_api_key_in_ai_settings')):null,h('div',{class:'studio-editors'},panels.storyline,panels.campaign),canvas);
 canvas.addEventListener('toggle',()=>{canvas.querySelector('.studio-disclosure').textContent=canvas.open?t('generator.canvas.close'):t('generator.canvas.open');});accountPicker.hidden=true;
 function chooseMode(next){mode=next;element.dataset.mode=mode;for(const id of ['storyline','campaign']){panels[id].hidden=id!==mode;tabs[id].setAttribute('aria-selected',String(id===mode));tabs[id].tabIndex=id===mode?0:-1;}accountPicker.hidden=mode!=='campaign';storyTarget.hidden=mode!=='storyline';onMode(mode);}
 return {element,dispose(){},chooseMode,mode:()=>mode,setStoryContext(){},setCampaignRun(){},update(){},showAgents(){canvas.open=true;canvas.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});},editBrief(){chooseMode('campaign');onEditBrief();}};
}
