import {prepareBrandImage} from '../services/brand-cutout.js';
import {dashboardSummary,requestReconnect} from '../services/dashboard.js';
import express from 'express';
import { authenticate, requireWrite, requireOwner, createApiKey, listApiKeys, revokeApiKey, publicUser, createUser, revokeAllMachineAccess } from '../auth.js';
import { all, run, one, now, kvGet, kvSet } from '../db.js';
import { err, hashPassword } from '../util.js';
import * as accounts from '../services/accounts.js';
import * as posts from '../services/posts.js';
import * as media from '../services/media.js';
import * as eng from '../services/engagement.js';
import * as msgs from '../services/messages.js';
import { RULES } from '../services/rules.js';
import { runPublisherTick } from '../services/publisher.js';
import { assertAccount, assertPostView, assertPostEdit, scopeSql, scopeOf, setAssignments, assignedAccounts, assignedCompanies, setCompanyAssignments, ROLES, isOwner } from '../services/scope.js';
import { listCompanies, saveCompany, moveAccount, deleteCompany } from '../services/companies.js';
import { audit, listAudit } from '../services/audit.js';
import { bus } from '../services/events.js';
import { stats as webhookStats } from './webhooks.js';
import { config } from '../config.js';
import * as storytelling from '../services/storytelling.js';
import * as generator from '../services/generator.js';
import * as aiDrafts from '../services/ai-drafts.js';
import {moveCalendarItem,duplicateCalendarPost} from '../services/calendar-workspace.js';
import {listAuditWorkspace} from '../services/audit-workspace.js';

export const api = express.Router();

// ---- rate limit: 120 req / min per credential ----
const buckets = new Map();
api.use(authenticate, (req, res, next) => {
  if (req.path === '/events') return next();
  const key = req.auth.credentialId || `s:${req.auth.user.id}`;
  const LIMIT = 120, WINDOW = 60_000;
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || t - b.start > WINDOW) { b = { start: t, n: 0 }; buckets.set(key, b); }
  b.n++;
  res.set('RateLimit-Limit', String(LIMIT));
  res.set('RateLimit-Remaining', String(Math.max(0, LIMIT - b.n)));
  res.set('RateLimit-Reset', String(Math.ceil((b.start + WINDOW - t) / 1000)));
  if (b.n > LIMIT) return next(err(429, 'rate_limited', "Too many requests. Try again shortly."));
  next();
});
const sessionOnly = (req, _res, next) => (req.auth.via === 'session' ? next() : next(err(403, 'forbidden', "This endpoint is only available from the dashboard.")));
const W = requireWrite;
const U = (req) => req.auth.user;
const privateMedia = (req) => {
  const record = media.getMedia(req.params.id);
  if (!record.in_library && record.user_id !== U(req).id) throw err(404, 'not_found', "Private media not found.");
  return record;
};
api.use((req, _res, next) => {
  if (req.auth.via === 'oauth' && req.method !== 'GET' && /^\/posts(?:\/|$)/.test(req.path)) return next(err(403, 'dashboard_approval_required', "AI only submits drafts. Approve and publish using New Post in the dashboard."));
  next();
});
api.get('/ai/connection', sessionOnly, (req, res) => {
  const apps = all(`SELECT t.id,t.scope,t.last_used_at,c.name FROM oauth_tokens t JOIN oauth_clients c ON c.client_id=t.client_id
    WHERE t.user_id=? AND t.revoked_at IS NULL AND (t.access_expires_at>? OR t.refresh_expires_at>?)`, U(req).id, now(), now());
  res.json({ connected: apps.some(a => a.scope.includes('write')), apps, mcp_url: `${config.publicUrl}/mcp` });
});
api.delete('/ai/connections/:id', sessionOnly, (req, res) => {
  run('UPDATE oauth_tokens SET revoked_at=? WHERE id=? AND user_id=?', now(), req.params.id, U(req).id);
  res.status(204).end();
});
api.get('/ai/drafts', sessionOnly, (req, res) => res.json({ data: aiDrafts.listDrafts(U(req)) }));
api.get('/ai/drafts/:id', sessionOnly, (req, res) => res.json(aiDrafts.getDraft(U(req), req.params.id)));
api.delete('/ai/drafts/:id', sessionOnly, (req, res) => {
  aiDrafts.getDraft(U(req), req.params.id);
  run("UPDATE ai_drafts SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'", req.params.id, U(req).id);
  res.status(204).end();
});
const source = (req) => (req.auth.via === 'session' ? 'dashboard' : req.auth.via === 'oauth' ? 'mcp' : 'api');
const kick = () => setImmediate(() => runPublisherTick().catch(() => {}));

// Generator credentials and paid jobs are controlled by the signed-in user only.
api.get('/generator/accounts/:id/brand',sessionOnly,(req,res)=>res.json(storytelling.profile(U(req),req.params.id,req.query.memory_session_id||null)));
api.post('/generator/accounts/:id/memory-sessions',sessionOnly,(req,res)=>{const p=storytelling.createMemorySession(U(req),req.params.id,req.body||{});audit(req.auth,'story.memory_session.create','account',req.params.id,{session_id:p.memory_session_id});res.status(201).json(p);});
api.patch('/generator/accounts/:id/memory-sessions/:sid',sessionOnly,(req,res)=>{const p=storytelling.renameMemorySession(U(req),req.params.id,req.params.sid,req.body||{});audit(req.auth,'story.memory_session.rename','account',req.params.id,{session_id:req.params.sid});res.json(p);});
api.delete('/generator/accounts/:id/memory-sessions/:sid',sessionOnly,(req,res)=>{const p=storytelling.deleteMemorySession(U(req),req.params.id,req.params.sid);audit(req.auth,'story.memory_session.delete','account',req.params.id,{session_id:req.params.sid});res.json(p);});
api.delete('/generator/accounts/:id/memory-sessions/:sid/memories/:eid',sessionOnly,(req,res)=>{const p=storytelling.deleteMemory(U(req),req.params.id,req.params.sid,req.params.eid);audit(req.auth,'story.memory.delete','account',req.params.id,{session_id:req.params.sid,memory_id:req.params.eid});res.json(p);});
api.put('/generator/accounts/:id/brand',sessionOnly,(req,res)=>{const p=storytelling.saveProfile(U(req),req.params.id,req.body||{});audit(req.auth,'brand.save','account',req.params.id);res.json(p);});
api.post('/generator/accounts/:id/assets',sessionOnly,async(req,res)=>{const p=storytelling.saveAsset(U(req),req.params.id,req.body||{});const asset=p.assets.find(a=>req.params.asset?a.id===req.params.asset:a.media_id===req.body.media_id);if(asset&&['logo','product'].includes(asset.category))await prepareBrandImage(media.getMedia(asset.media_id),asset.category);audit(req.auth,'brand.asset.save','account',req.params.id);res.json(storytelling.profile(U(req),req.params.id));});
api.patch('/generator/accounts/:id/assets/:asset',sessionOnly,async(req,res)=>{const result=storytelling.saveAsset(U(req),req.params.id,req.body||{},req.params.asset);const asset=result.assets.find(a=>req.params.asset?a.id===req.params.asset:a.media_id===req.body.media_id);if(asset&&['logo','product'].includes(asset.category))await prepareBrandImage(media.getMedia(asset.media_id),asset.category);audit(req.auth,'brand.asset.update','account',req.params.id,{asset_id:req.params.asset});res.json(storytelling.profile(U(req),req.params.id));});
api.delete('/generator/accounts/:id/assets/:asset',sessionOnly,(req,res)=>{const result=storytelling.removeAsset(U(req),req.params.id,req.params.asset);audit(req.auth,'brand.asset.delete','account',req.params.id,{asset_id:req.params.asset});res.json(result);});
api.get('/generator/accounts/:id/story-jobs',sessionOnly,(req,res)=>res.json({data:storytelling.jobs(U(req),req.params.id)}));
api.get('/generator/story-jobs/:id',sessionOnly,(req,res)=>res.json(storytelling.job(U(req),req.params.id)));
api.post('/generator/story-jobs',sessionOnly,(req,res)=>{const result=generator.queueStory(U(req),req.body||{});audit(req.auth,'story.start','story_job',result.id);setImmediate(()=>generator.runGeneratorTick());res.status(result.replayed?200:201).json(result);});
api.delete('/generator/story-jobs/:id',sessionOnly,(req,res)=>{const result=storytelling.cancel(U(req),req.params.id);audit(req.auth,'story.cancel','story_job',result.id);res.json(result);});
api.post('/generator/story-jobs/:id/retry',sessionOnly,(req,res)=>{if(req.body?.confirm_cost!==true)throw err(400,'cost_confirmation_required',"Confirm the retry cost.");const result=generator.retryStory(U(req),req.params.id,req.body||{});audit(req.auth,'story.retry','story_job',result.id);setImmediate(()=>generator.runGeneratorTick());res.json(result);});
api.get('/generator/providers/gemini/models',sessionOnly,async(req,res)=>res.json(await generator.availableGeminiModels(U(req),req.query.refresh==='true')));
api.post('/generator/quick-idea',sessionOnly,async(req,res)=>{const result=await generator.quickIdea(U(req),req.body||{});audit(req.auth,'generator.quick_idea','generator',null,{account_ids:req.body.account_ids,kind:req.body.kind});res.json(result);});
api.get('/generator/settings', sessionOnly, (req, res) => res.json(generator.settings(U(req))));
api.put('/generator/settings', sessionOnly, (req, res) => res.json(generator.saveSettings(U(req), req.body || {})));
api.delete('/generator/settings', sessionOnly, (req, res) => {const result=generator.resetSettings(U(req));audit(req.auth,'generator.settings.reset','generator_settings',U(req).id);res.json(result);});
api.put('/generator/keys/:provider', sessionOnly, (req, res) => {
  generator.saveKey(U(req), req.params.provider, req.body?.key);
  audit(req.auth, 'generator.key.save', 'provider', req.params.provider);
  res.status(204).end();
});
api.delete('/generator/keys/:provider', sessionOnly, (req, res) => {
  generator.deleteKey(U(req), req.params.provider);
  audit(req.auth, 'generator.key.delete', 'provider', req.params.provider);
  res.status(204).end();
});
api.post('/generator/keys/:provider/test', sessionOnly, async (req, res) => res.json(await generator.testKey(U(req), req.params.provider, req.body?.model)));
api.post('/generator/timing', sessionOnly, (req,res) => res.json(generator.timingRecommendation(U(req),req.body?.account_ids)));
api.post('/generator/drafts/delete',sessionOnly,(req,res)=>{const result=generator.deleteContents(U(req),req.body?.ids);audit(req.auth,'generator.bulk_delete','generator_run',null,{count:result.deleted});res.json(result);});
api.get('/generator/plans', sessionOnly, (req,res) => res.json({data:generator.listPlans(U(req))}));
api.post('/generator/plans', sessionOnly, async (req,res) => {
  const plan = await generator.createPlan(U(req),req.body || {});
  audit(req.auth,'generator.plan','generator_plan',plan.id,{count:plan.content_count});
  setImmediate(()=>generator.runGeneratorTick());res.status(plan.replayed ? 200 : 201).json(plan);
});
api.post('/generator/plans/:id/start', sessionOnly, (req,res) => {
  if (req.body?.confirm_cost !== true) throw err(400,'cost_confirmation_required',"Confirm the cost of generating all content.");
  const result=generator.startPlan(U(req),req.params.id); audit(req.auth,'generator.plan.start','generator_plan',req.params.id,result);
  setImmediate(()=>generator.runGeneratorTick());res.json(result);
});
api.post('/generator/runs/:id/start', sessionOnly, (req,res) => {
  if (req.body?.confirm_cost !== true) throw err(400,'cost_confirmation_required',"Confirm the cost of generating this content.");
  const result=generator.startPlanned(U(req),req.params.id);setImmediate(()=>generator.runGeneratorTick());res.json(result);
});
api.patch('/generator/runs/:id', sessionOnly, (req,res) => {
  const result=generator.updateContent(U(req),req.params.id,req.body || {}); audit(req.auth,'generator.edit','generator_run',req.params.id);res.json(result);
});
api.post('/generator/runs/:id/revise', sessionOnly, (req,res) => {
  const result=generator.reviseContent(U(req),req.params.id,req.body || {});audit(req.auth,'generator.revise','generator_run',result.id);
  setImmediate(()=>generator.runGeneratorTick());res.status(result.replayed ? 200 : 201).json(result);
});
api.post('/generator/runs/:id/approve-concept',sessionOnly,(req,res)=>{
  const result=generator.approveConcept(U(req),req.params.id,req.body||{});audit(req.auth,'generator.concept.approve','generator_run',result.id);
  setImmediate(()=>generator.runGeneratorTick());res.json(result);
});
api.post('/generator/runs/:id/slides/revise',sessionOnly,(req,res)=>{
  const result=generator.regenerateSlide(U(req),req.params.id,req.body||{});audit(req.auth,'generator.slide.revise','generator_run',result.id);
  setImmediate(()=>generator.runGeneratorTick());res.json(result);
});
api.delete('/generator/runs/:id/content',sessionOnly,(req,res)=>{
  generator.deleteContent(U(req),req.params.id);audit(req.auth,'generator.draft.delete','generator_run',req.params.id);res.status(204).end();
});
api.post('/generator/runs/:id/approve', sessionOnly, (req,res) => {
  const post=generator.approveContent(U(req),req.params.id,req.body || {});audit(req.auth,'generator.approve','post',post.id);res.json(post);
});
api.get('/generator/runs', sessionOnly, (req, res) => res.json({ data: generator.listRuns(U(req)) }));
api.get('/generator/runs/:id', sessionOnly, (req, res) => res.json(generator.getRun(U(req), req.params.id)));
api.post('/generator/runs', sessionOnly, (req, res) => {
  const result = generator.createRun(U(req), req.body || {});
  audit(req.auth, 'generator.start', 'generator_run', result.id, { slides: result.slide_count });
  setImmediate(() => generator.runGeneratorTick());
  res.status(result.replayed ? 200 : 201).json(result);
});
api.post('/generator/runs/:id/retry', sessionOnly, (req, res) => {
  const result = generator.retryRun(U(req), req.params.id);
  audit(req.auth, 'generator.retry', 'generator_run', result.id);
  setImmediate(() => generator.runGeneratorTick()); res.json(result);
});
api.delete('/generator/runs/:id', sessionOnly, (req, res) => {
  generator.cancelRun(U(req), req.params.id); audit(req.auth, 'generator.cancel', 'generator_run', req.params.id); res.status(204).end();
});
api.post('/generator/runs/:id/draft', sessionOnly, async (req, res) => {
  const result = await generator.handoff(U(req), req.params.id, req.body || {});
  audit(req.auth, 'generator.handoff', 'generator_run', req.params.id, { draft_id: result.draft_id });
  res.json(result);
});

// External agents submit private drafts; approval stays in the dashboard.
api.post('/agent/drafts', W, async (req, res) => {
  const draft = await aiDrafts.receiveDraft(req.auth, req.body || {}, { allowApiKey: true });
  audit(req.auth, 'agent.draft.submit', 'ai_draft', draft.id, { replayed: !!draft.replayed });
  res.status(draft.replayed ? 200 : 201).json(draft);
});
api.get('/agent/drafts', (req, res) => res.json({ data: aiDrafts.listDrafts(U(req)) }));
api.get('/agent/drafts/:id', (req, res) => res.json(aiDrafts.getDraft(U(req), req.params.id)));

// ---- me / accounts ----
api.get('/me', (req, res) => res.json({ user: publicUser(U(req)), access: { via: req.auth.via, scope: req.auth.scope }, account_ids: scopeOf(U(req)), integrations: { instagram: accounts.platformConfigured('instagram'), threads: accounts.platformConfigured('threads') } }));
api.get('/accounts', (req, res) => res.json({ data: accounts.listAccounts(U(req)) }));
api.delete('/companies/:id',sessionOnly,requireOwner,(req,res)=>{deleteCompany(req.params.id);audit(req.auth,'company.delete','company',req.params.id);res.status(204).end();});
api.get('/companies', (req, res) => res.json({ data: listCompanies(U(req)) }));
api.post('/companies', sessionOnly, requireOwner, (req, res) => {
  const company = saveCompany(null, req.body?.name);
  audit(req.auth, 'company.create', 'company', company.id, { name: company.name });
  res.status(201).json(company);
});
api.patch('/companies/:id', sessionOnly, requireOwner, (req, res) => {
  const company = saveCompany(req.params.id, req.body?.name);
  audit(req.auth, 'company.update', 'company', company.id, { name: company.name });
  res.json(company);
});
api.put('/accounts/:id/company', sessionOnly, requireOwner, (req, res) => {
  moveAccount(req.params.id, req.body?.company_id);
  audit(req.auth, 'account.company', 'account', req.params.id, { company_id: req.body.company_id });
  res.json(accounts.publicAccount(accounts.getAccount(req.params.id)));
});
api.post('/accounts/:id/profile', W, async (req, res) => {
  assertAccount(U(req), req.params.id);
  let profile;
  try { profile = await accounts.refreshAccountProfile(req.params.id); }
  catch (error) { throw err(422, 'profile_refresh_failed', "Profile could not be refreshed from Meta. Check the connection or reconnect the account."); }
  assertAccount(U(req), req.params.id);
  res.json(profile);
});
api.get('/accounts/:id', (req, res) => { assertAccount(U(req), req.params.id); res.json(accounts.publicAccount(accounts.getAccount(req.params.id))); });
api.delete('/accounts/:id', W, requireOwner, (req, res) => {
  const a = accounts.getAccount(req.params.id);
  accounts.disconnect(a.id);
  audit(req.auth, 'account.disconnect', 'account', a.id, { username: a.username, platform: a.platform });
  res.status(204).end();
});
api.get('/accounts/:id/publishing-limit', async (req, res) => { assertAccount(U(req), req.params.id); res.json(await accounts.publishingLimit(req.params.id)); });
api.get('/accounts/:id/insights', (req, res) => { assertAccount(U(req), req.params.id); res.json(eng.accountInsights(req.params.id, req.query)); });
api.post('/connect/:platform', W, requireOwner, (req, res) => res.json({ url: accounts.beginConnect(req.params.platform, U(req).id, req.body?.return_to) }));
api.get('/platform-rules', (_req, res) => res.json(RULES));

// ---- posts ----
api.post('/posts', W, (req, res) => {
  const draftId = req.body?.ai_draft_id;
  if (draftId) {
    if (req.auth.via !== 'session') throw err(403, 'dashboard_approval_required', "Drafts can only be approved from the dashboard.");
    const previous = aiDrafts.approvedPost(U(req), draftId);
    if (previous) return res.json(posts.publicPost(posts.getPost(previous)));
  }
  const key = req.get('Idempotency-Key') || null;
  if (key && key.length > 200) throw err(400, 'validation_failed', "Idempotency-Key is too long.");
  const { post, replayed } = posts.createPost(U(req), req.body || {}, { idempotencyKey: key, source: draftId ? 'mcp' : source(req) });
  if (draftId) { aiDrafts.markApproved(U(req), draftId, post.id); audit(req.auth, 'ai.draft.approve', 'ai_draft', draftId, { post_id: post.id }); }
  if (!replayed) {
    audit(req.auth, post.scheduled_at ? 'post.schedule' : 'post.publish', 'post', post.id, { accounts: post.targets.map((t) => `@${t.username}`), scheduled_at: post.scheduled_at });
    if (!post.scheduled_at) kick();
  }
  res.status(replayed ? 200 : 201).set('Idempotent-Replayed', String(replayed)).json(post);
});
api.get('/posts', (req, res) => res.json(posts.listPosts(req.query, U(req))));
api.post('/calendar/move',sessionOnly,(req,res)=>{const result=moveCalendarItem(U(req),req.body||{});audit(req.auth,'calendar.move',req.body?.kind==='generator'?'generator_run':'post',result.id,{scheduled_at:result.scheduled_at,account_ids:result.targets.map(t=>t.account_id)});res.json(result);});
api.post('/posts/:id/duplicate',sessionOnly,(req,res)=>{const result=duplicateCalendarPost(U(req),req.params.id,req.body?.request_id);if(!result.replayed)audit(req.auth,'post.duplicate','post',req.params.id,{draft_id:result.id});res.status(result.replayed?200:201).json(result);});
api.get('/dashboard/summary',sessionOnly,(req,res)=>res.json(dashboardSummary(U(req),req.query)));
api.post('/dashboard/reconnect-request',sessionOnly,(req,res)=>{const result=requestReconnect(U(req),req.body?.account_id);if(!result.replayed)audit(req.auth,'account.reconnect_request','account',req.body.account_id);res.json(result);});
api.get('/calendar', (req, res) => {
  if (!req.query.from || !req.query.to) throw err(400, 'validation_failed', "from and to are required in ISO 8601 format.");
  res.json({ data: posts.calendar(new Date(req.query.from).toISOString(), new Date(req.query.to).toISOString(), U(req)) });
});
api.get('/posts/:id', (req, res) => { assertPostView(U(req), req.params.id); res.json(posts.publicPost(posts.getPost(req.params.id))); });
api.patch('/posts/:id', W, (req, res) => {
  assertPostEdit(U(req), req.params.id);
  const p = posts.updatePost(req.params.id, req.body || {}, U(req));
  audit(req.auth, 'post.update', 'post', p.id, { fields: Object.keys(req.body || {}) });
  res.json(p);
});
api.delete('/posts/:id', W, (req, res) => { assertPostEdit(U(req), req.params.id); const p = posts.cancelPost(req.params.id); audit(req.auth, 'post.cancel', 'post', p.id); res.json(p); });
api.post('/posts/:id/publish', W, (req, res) => { assertPostEdit(U(req), req.params.id); const p = posts.publishNow(req.params.id); audit(req.auth, 'post.publish_now', 'post', p.id); kick(); res.json(p); });
api.post('/posts/:id/retry', W, (req, res) => { assertPostEdit(U(req), req.params.id); const p = posts.retryPost(req.params.id); audit(req.auth, 'post.retry', 'post', p.id); kick(); res.json(p); });
api.post('/posts/:id/remove', W, (req, res) => { assertPostEdit(U(req), req.params.id); posts.removePost(req.params.id); audit(req.auth, 'post.remove', 'post', req.params.id); res.status(204).end(); });
api.get('/posts/:id/insights', (req, res) => { assertPostView(U(req), req.params.id); res.json(eng.postInsights(req.params.id)); });

// ---- media (shared team library) ----
const raw = express.raw({ type: () => true, limit: '101mb' });
const rawPart = express.raw({ type: () => true, limit: '9mb' });
const ownUpload = (req, _res, next) => {
  if (!one('SELECT 1 FROM media WHERE id=? AND user_id=?', req.params.id, U(req).id)) throw err(404, 'not_found', "Upload not found.");
  next();
};
api.post('/media/from-url', W, async (req, res) => res.status(201).json(await media.fromUrl(U(req).id, req.body?.url, req.body || {})));
api.post('/media/upload', W, raw, async (req, res) => {
  const inLib = req.query.in_library !== 'false';
  res.status(201).json(await media.saveBuffer(U(req).id, req.body, { originalName: req.get('X-File-Name') ? decodeURIComponent(req.get('X-File-Name')) : null, inLibrary: inLib, alt_text: req.query.alt_text }));
});
api.get('/media/usage', (_req, res) => res.json(media.usage()));
api.post('/media/uploads', W, (req, res) => res.status(201).json(media.createUpload(U(req).id, req.body || {})));
api.get('/media/:id/parts', ownUpload, (req, res) => res.json(media.listParts(req.params.id)));
api.put('/media/:id/parts/:n', W, ownUpload, rawPart, (req, res) => { media.putPart(req.params.id, req.params.n, req.body); res.status(204).end(); });
api.post('/media/:id/complete', W, ownUpload, async (req, res) => res.json(await media.completeUpload(req.params.id)));
api.get('/media', (req, res) => res.json(media.listMedia(req.query)));
api.get('/media/:id', (req, res) => res.json(media.publicMedia(privateMedia(req))));
api.patch('/media/:id', W, (req, res) => {
  privateMedia(req);
  if (req.body?.in_library != null) run('UPDATE media SET in_library=? WHERE id=?', req.body.in_library ? 1 : 0, req.params.id);
  res.json(req.body?.alt_text !== undefined ? media.setAlt(req.params.id, req.body.alt_text) : media.publicMedia(media.getMedia(req.params.id)));
});
api.delete('/media/:id', W, (req, res) => { privateMedia(req); media.deleteMedia(req.params.id); audit(req.auth, 'media.delete', 'media', req.params.id); res.status(204).end(); });

// ---- comments ----
api.get('/comments', (req, res) => res.json(eng.listComments({ ...req.query, reply_status: req.query.reply_status ?? 'unreplied', include_own: req.query.include_own === 'true' }, U(req))));
api.post('/comments/sync', W, async (req, res) => {
  let n = 0;
  for (const a of all("SELECT * FROM accounts WHERE status='active'")) if (scopeOf(U(req)) === null || scopeOf(U(req)).includes(a.id)) n += await eng.syncAccountComments(a);
  res.json({ synced: n });
});
api.post('/comments/:id/reply', W, async (req, res) => {
  const r = await eng.replyToComment(req.params.id, req.body?.message, U(req));
  audit(req.auth, 'comment.reply', 'comment', req.params.id, { text: String(req.body?.message).slice(0, 200) });
  res.json(r);
});
api.post('/comments/:id/hide', W, async (req, res) => {
  const r = await eng.hideComment(req.params.id, req.body?.hidden !== false, U(req));
  audit(req.auth, r.hidden ? 'comment.hide' : 'comment.unhide', 'comment', req.params.id);
  res.json(r);
});
api.patch('/comments/:id', W, (req, res) => res.json(eng.setCommentStatus(req.params.id, req.body?.reply_status, U(req))));

// ---- direct messages (Instagram) ----
api.get('/conversations', (req, res) => res.json(msgs.listConversations(U(req), req.query)));
api.get('/conversations/:id', (req, res) => res.json(msgs.getConversation(U(req), req.params.id, req.query)));
api.post('/conversations/:id/messages', W, async (req, res) => {
  const r = await msgs.sendMessage(U(req), req.params.id, req.body?.text);
  audit(req.auth, 'message.send', 'conversation', req.params.id, { to: `@${r.participant.username}`, text: String(req.body?.text).slice(0, 200) });
  res.status(201).json(r);
});
api.patch('/conversations/:id', W, (req, res) => res.json(msgs.setConversationStatus(U(req), req.params.id, req.body?.status)));
api.post('/messages/sync', W, async (req, res) => {
  res.json(await msgs.syncUserMessages(U(req), req.body?.account_id));
});
api.get('/messages/sync-status', (req, res) => res.json({ data: msgs.messageSyncStatus(U(req)) }));
api.get('/messages/unreplied', (req, res) => res.json(msgs.unrepliedSummary(U(req), req.query.older_than ? Number(req.query.older_than) : undefined)));

// ---- insights ----
api.post('/insights/sync', W, async (_req, res) => {
  const last = Number(kvGet('insights:manual') || 0);
  if (Date.now() - last < 5 * 60_000) throw err(429, 'rate_limited', "Statistics can only be synchronized once every 5 minutes.");
  kvSet('insights:manual', Date.now());
  await eng.syncInsights();
  res.json({ ok: true, synced_at: now() });
});

// ---- live events (Server-Sent Events) ----
api.get('/events', (req, res) => {
  const user = U(req);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const send = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
  send('hello', { at: now() });
  const onEvent = (e) => {
    const s = scopeOf(user);
    if (e.data.account_id && s !== null && !s.includes(e.data.account_id)) return;
    send(e.type, e.data);
  };
  bus.on('event', onEvent);
  const hb = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(hb); bus.off('event', onEvent); });
});

// ---- counts for badges ----
api.get('/stats', (req, res) => {
  const [w, p] = scopeSql(U(req), 'account_id');
  const [wt, pt] = scopeSql(U(req), 't.account_id');
  const [wa, pa] = scopeSql(U(req), 'id');
  const u = msgs.unrepliedSummary(U(req));
  res.json({
    accounts: one(`SELECT COUNT(*) n FROM accounts WHERE status='active' AND ${wa}`, ...pa).n,
    scheduled: one(`SELECT COUNT(DISTINCT p.id) n FROM posts p JOIN post_targets t ON t.post_id=p.id WHERE p.status='scheduled' AND p.removed_at IS NULL AND ${wt}`, ...pt).n,
    failed_7d: one(`SELECT COUNT(*) n FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE t.status='failed' AND p.updated_at > ? AND ${wt}`, new Date(Date.now() - 7 * 864e5).toISOString(), ...pt).n,
    unreplied: one(`SELECT COUNT(*) n FROM comments WHERE reply_status='unreplied' AND from_self=0 AND hidden=0 AND ${w}`, ...p).n,
    messages_waiting: u.waiting,
    messages_overdue: u.overdue,
    overdue_threshold_seconds: u.threshold_seconds,
  });
});

// ---- dashboard-only: API keys, connected apps ----
api.get('/api-keys', sessionOnly, (req, res) => res.json({ data: listApiKeys(U(req).id) }));
api.post('/api-keys', sessionOnly, (req, res) => {
  const k = createApiKey(U(req).id, req.body?.name, req.body?.scope || 'read');
  audit(req.auth, 'api_key.create', 'api_key', k.id, { name: k.name, scope: k.scope });
  res.status(201).json(k);
});
api.delete('/api-keys/:id', sessionOnly, (req, res) => {
  if (!revokeApiKey(U(req).id, req.params.id)) throw err(404, 'not_found', "Key not found.");
  audit(req.auth, 'api_key.revoke', 'api_key', req.params.id);
  res.status(204).end();
});
api.get('/apps', sessionOnly, (req, res) => res.json({
  data: all(`SELECT t.id, t.scope, t.created_at, t.last_used_at, c.name AS client_name, c.client_id FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id=t.client_id
             WHERE t.user_id=? AND t.revoked_at IS NULL ORDER BY t.created_at DESC`, U(req).id),
}));
api.delete('/apps/:id', sessionOnly, (req, res) => { run('UPDATE oauth_tokens SET revoked_at=? WHERE id=? AND user_id=?', now(), req.params.id, U(req).id); audit(req.auth, 'ai_app.revoke', 'oauth_token', req.params.id); res.status(204).end(); });

// ---- user management (Owner only) ----
const publicMember = (u) => ({ ...publicUser(u), account_ids: u.role === 'owner' ? null : assignedAccounts(u.id), company_ids: u.role === 'owner' ? null : assignedCompanies(u.id) });
api.get('/users', sessionOnly, requireOwner, (_req, res) => res.json({ data: all('SELECT * FROM users ORDER BY created_at').map(publicMember) }));
api.post('/users', sessionOnly, requireOwner, (req, res) => {
  const role = ROLES.includes(req.body?.role) ? req.body.role : 'rep';
  const u = createUser({ ...req.body, role });
  if (role === 'rep' && Array.isArray(req.body?.account_ids)) setAssignments(u.id, req.body.account_ids);
  if (role === 'rep' && req.body?.company_ids !== undefined) setCompanyAssignments(u.id, req.body.company_ids);
  audit(req.auth, 'user.create', 'user', u.id, { email: u.email, role, account_ids: req.body?.account_ids, company_ids: req.body?.company_ids });
  res.status(201).json(publicMember(one('SELECT * FROM users WHERE id=?', u.id)));
});
api.patch('/users/:id', sessionOnly, requireOwner, (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) throw err(404, 'not_found', "User not found.");
  const b = req.body || {};
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) throw err(400, 'validation_failed', "role must be owner or rep.");
    if (u.id === U(req).id && b.role !== 'owner') throw err(400, 'validation_failed', "You cannot downgrade your own role.");
    if (u.role === 'owner' && b.role !== 'owner' && one("SELECT COUNT(*) n FROM users WHERE role='owner'").n <= 1) throw err(400, 'validation_failed', "At least one Owner is required.");
    run('UPDATE users SET role=? WHERE id=?', b.role, u.id);
  }
  if (b.name !== undefined) run('UPDATE users SET name=? WHERE id=?', String(b.name).slice(0, 100) || null, u.id);
  if (b.password) {
    if (b.password.length < 8) throw err(400, 'validation_failed', "Password must contain at least 8 characters.");
    run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(b.password), u.id);
    run('DELETE FROM sessions WHERE user_id=?', u.id);
    revokeAllMachineAccess(u.id);
  }
  if (Array.isArray(b.account_ids)) setAssignments(u.id, b.account_ids);
  if (b.company_ids !== undefined) setCompanyAssignments(u.id, b.company_ids);
  audit(req.auth, 'user.update', 'user', u.id, { email: u.email, role: b.role, account_ids: b.account_ids, company_ids: b.company_ids, password_reset: !!b.password });
  res.json(publicMember(one('SELECT * FROM users WHERE id=?', u.id)));
});
api.put('/users/:id/accounts', sessionOnly, requireOwner, (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id);
  if (!u) throw err(404, 'not_found', "User not found.");
  setAssignments(u.id, req.body?.account_ids);
  audit(req.auth, 'user.assign', 'user', u.id, { email: u.email, account_ids: req.body?.account_ids });
  res.json(publicMember(u));
});
api.delete('/users/:id', sessionOnly, requireOwner, (req, res) => {
  if (req.params.id === U(req).id) throw err(400, 'validation_failed', "You cannot delete yourself.");
  const u = one('SELECT email FROM users WHERE id=?', req.params.id);
  run('DELETE FROM users WHERE id=?', req.params.id);
  audit(req.auth, 'user.delete', 'user', req.params.id, { email: u?.email });
  res.status(204).end();
});

// ---- admin (Owner only): audit log, failed posts, system ----
api.get('/admin/audit', requireOwner, (req, res) => res.json(listAuditWorkspace(req.query)));
api.get('/admin/failed-posts', requireOwner, (req, res) => res.json({
  data: all(`SELECT t.id AS target_id, t.post_id, t.platform, t.error_code, t.error_message, t.attempts, p.content, p.updated_at, a.username
             FROM post_targets t JOIN posts p ON p.id=t.post_id LEFT JOIN accounts a ON a.id=t.account_id
             WHERE t.status='failed' AND p.removed_at IS NULL ORDER BY p.updated_at DESC LIMIT ?`, Math.min(Number(req.query.limit) || 50, 200)),
}));
api.get('/admin/overview', requireOwner, (_req, res) => res.json({
  users: one('SELECT COUNT(*) n FROM users').n,
  accounts: one("SELECT COUNT(*) n FROM accounts WHERE status!='disconnected'").n,
  accounts_expired: one("SELECT COUNT(*) n FROM accounts WHERE status='expired'").n,
  posts_24h: one("SELECT COUNT(*) n FROM post_targets WHERE published_at > ?", new Date(Date.now() - 864e5).toISOString()).n,
  failed_24h: one("SELECT COUNT(*) n FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE t.status='failed' AND p.updated_at > ?", new Date(Date.now() - 864e5).toISOString()).n,
  storage: media.usage(),
  webhooks: webhookStats,
  realtime_hint: webhookStats.received ? 'Meta webhook active' : 'No webhook received yet — comments and messages sync periodically (polling)',
}));
export { isOwner, config };
