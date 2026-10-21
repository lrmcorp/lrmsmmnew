# 07 · UI copy (English only, no emoji)

The whole app UI is **English**. Use these strings verbatim (keys map to `strings.en.js`, see `03` §0.8). If you need a string that isn't here, write it in the same voice and add it to the table in your PR.

**Voice:** plain, short, friendly, second person ("you"). Buttons say exactly what happens ("Approve 24 posts", not "Submit"). Errors say what happened and what to do; no apologies, no blame. Sentence case everywhere (only the first word and proper nouns capitalised), except proper product names (Content Generator, Brand Kit, Story Bible).

**No emoji in the interface:** not in labels, buttons, toasts, empty states, placeholders, tooltips or notifications. (Post captions are content: they default to Indonesian and may include emoji; see `gen.lang.*` and `gen.brandkit.emoji`.) Use line icons from `icons.js`. Don't use pictographic or dingbat characters as icons either (no ✓ ✕ ✦ ✎ ⚙ ⚠ ⏱ 🔒 etc.); use the icon component. Plain typography is fine: `…` `·` `–` `×` `>` `<`.

**Formats:** dates `Sat, 1 Nov` · slots `Sat, 1 Nov · 12:15` · ranges `21 Oct – 3 Nov` · times 24-hour `19:15` with `WIB` when the timezone matters · numbers `2,322` · percentages `-1.6%`. Locale `en-GB`, timezone `Asia/Jakarta`.

## Navigation and shell
| Key | Text |
|---|---|
| nav.group.content | Content |
| nav.group.engagement | Engagement |
| nav.group.workspace | Workspace |
| nav.home | Home |
| nav.generator | Content Generator |
| nav.drafts | Drafts |
| nav.compose | New Post |
| nav.calendar | Content Calendar |
| nav.messages | Messages |
| nav.comments | Comments |
| nav.insights | Insights |
| nav.accounts | Companies & Accounts |
| nav.media | Media Library |
| nav.team | Team & Access |
| nav.developer | API & AI |
| nav.audit | Audit Log |
| nav.settings | Personal settings |
| nav.search | Search pages, accounts, sessions |
| nav.signout | Sign out |
| role.owner / role.rep | Owner / Representative |

## Global
| Key | Text |
|---|---|
| autosave.saving | Saving… |
| autosave.saved | Saved {HH:MM} |
| autosave.failed | Not saved: {reason}. Try again |
| dialog.cancel | Cancel |
| dialog.back | Back |
| dialog.cost.chip | API cost |
| dialog.danger.chip | Cannot be undone |
| toast.undo | Undo |
| error.network | You're offline. Your changes haven't been sent yet; we'll retry automatically. |
| error.429 | Your {provider} API quota ran out. Add quota in your {provider} dashboard, then try again. |
| error.401 | Your {provider} API key is invalid or was revoked. Update it in Personal settings > AI connections. |
| error.timeout | {provider} isn't responding. Try again in a few minutes. |
| error.technical | Technical details |
| error.page | This page couldn't load. {reason} |
| error.page.retry | Reload |
| notfound.title | Page not found |
| notfound.cta | Go to Home |

## Scope bar (S4) and account picker (S3)
| Key | Text |
|---|---|
| scope.company.all | All companies |
| scope.company.unassigned | Unassigned |
| scope.company.count | {n} accounts |
| scope.company.manage | Manage companies |
| scope.accounts.all | All accounts ({n}) |
| scope.accounts.count | {n} of {m} accounts |
| scope.accounts.mobile | {n} accounts |
| scope.accounts.sheet.title | Choose accounts · {company} |
| scope.accounts.sheet.cta | Show {n} accounts |
| scope.view | View |
| scope.reset | Reset |
| scope.notice | Showing {n} accounts in {company}: {list}. This filter applies on every page. |
| scope.notice.cta | Show all accounts |
| picker.count | {n} of {m} selected |
| picker.all | Select all |
| picker.more | {n} more · Search accounts |
| picker.search | Search @handle or brand name |
| picker.dot.help | Orange dot = no Brand Kit yet. Details are in the session summary. |
| picker.tooltip | {brand name} · {followers} followers · {Brand Kit ready / No Brand Kit} |
| picker.disabled.story | Complete the Brand Kit to use story mode |
| view.month / week / list / by_account | Month / Week / List / By account |
| view.grid / cards / calendar | Grid / Cards / Calendar |
| view.single / compare | Single account / Compare |
| view.by_date / by_post / latest | By date / By post / Latest |

## Content Generator
| Key | Text |
|---|---|
| gen.title | Content Generator |
| gen.sub | Pick accounts, write a direction, and AI prepares drafts for you to review. |
| gen.step1 | 1 · Which accounts? |
| gen.step1.story | 1 · Story account |
| gen.step2 | 2 · What do you want to make? |
| gen.step2.story | 2 · Direction for this session |
| gen.step3 | 3 · When should it go out? |
| gen.mode.story | Continue story |
| gen.mode.campaign | New campaign |
| gen.brief.placeholder | Example: 11.11 promo for lash clusters, aimed at beginners, warm tone, CTA to the link in bio. List any claims to avoid. |
| gen.direction.placeholder | Optional: focus for this session. Example: "Move into the holiday collection, keep it soft and elegant, introduce 2 new products." Leave empty to continue the story as is. |
| gen.ideas | Quick ideas: |
| gen.idea.promo | Promo: describe the offer, the dates and any conditions. |
| gen.idea.edu | Product education: explain how to use it and the main benefit. |
| gen.idea.testi | Testimonial: feature a real customer experience, without overclaiming. |
| gen.idea.bts | Behind the scenes: show the process or the team behind the product. |
| gen.format | Format |
| gen.format.single / carousel | Single / Carousel |
| gen.slides | Slides |
| gen.source | Images |
| gen.source.ai / own | AI creates / My photos |
| gen.schedule.sentence | Create {n} posts per account, from {start} to {end}, at {times} WIB. |
| gen.schedule.sentence.story | Continue with {n} episodes from {start} to {end}, at {times} WIB. |
| gen.schedule.addtime | + time |
| gen.schedule.presets | 2 weeks · 1 month · This week · From next Monday |
| gen.schedule.spread.even | Evenly across the date range |
| gen.schedule.spread.days | Specific days |
| gen.schedule.rhythm | {n} posts over {d} days is about one post every {x} days per account. |
| gen.scheduler.toggle | Let the AI Scheduler adjust times based on account insights |
| gen.summary | Session summary |
| gen.summary.total | {total} posts |
| gen.summary.total.sub | {a} accounts × {n} posts |
| gen.summary.images | {n} images |
| gen.summary.pace | about {x} posts/day/account |
| gen.summary.team | AI team |
| gen.ready | Ready to generate |
| gen.ready.accounts.none | Select at least 1 account |
| gen.ready.accounts.ok | {n} accounts, all Brand Kits ready |
| gen.ready.brandkit.missing | {@account} has no Brand Kit. Set it up now (2 minutes) or skip this account |
| gen.ready.brief.missing | Write a campaign direction |
| gen.ready.key.missing | No {provider} API key yet. Add one in Personal settings |
| gen.cta.campaign | Generate {total} posts |
| gen.cta.story | Plan {n} episodes |
| gen.cta.note.campaign | Step 1 creates concepts only. Images are made after you approve the concepts. |
| gen.cta.note.story | The plan and proposals appear in Drafts. No image cost until you approve concepts. |
| gen.preflight.title | Start session "{title}"? |
| gen.preflight.col | Stage · Amount · When |
| gen.preflight.row1 | Concept + caption + review · {n} posts · Now |
| gen.preflight.row2 | Images ({model}) · {n} images · After concepts are approved |
| gen.preflight.row3 | Publishing · 0 · Only after you approve |
| gen.preflight.cost | Charged to your {provider} API key at the provider's rates. You can pause the session at any time. |
| gen.preflight.notify | Notify me when concepts are ready to review |
| gen.preflight.cta | Start {n} concepts |
| gen.started.toast | Session started · Open |
| gen.running | In progress |
| gen.running.review.now | Concepts are ready while you wait. Review {n} concepts now |
| gen.running.leave | You can leave this page. We'll notify you when it's ready to review. |
| gen.running.pause / open | Pause / Open session |
| gen.failed | Stopped |
| gen.failed.safe | The other {n} posts are safe and ready to review. |
| gen.failed.retry | Retry {n} |
| gen.failed.switch | Switch to {provider} |
| gen.recent | Recent sessions |
| gen.recent.all | All sessions in Drafts |
| gen.recent.empty | No sessions yet. Your first session will show up here. |
| gen.ready.toast | Concepts for "{title}" are ready to review · Open |
| gen.agents | AI team & models |
| gen.agents.sub | Applies to this session · {mode} mode |
| gen.preset.economy | Economy: light models for every step. For ideas and tests. |
| gen.preset.balanced | Balanced: detailed concepts, light reviews. Recommended. |
| gen.preset.quality | Quality: best model at every step. Slower. |
| gen.preset.custom | Custom |
| gen.models.recommended / other / hidden | Recommended / Other text models / Hidden: not suitable for this agent |
| gen.agents.canvas | Open as canvas |
| gen.agents.default / apply | Save as default / Apply |
| gen.agents.instructions | Instructions |
| agent.concept / revision / visual / image / final | Concept Creator / Concept Reviewer / Visual Conceptor / Image Creator / Final Reviewer |
| agent.storyteller / manager / scheduler | Storyteller / Social Media Manager / Scheduler |
| gen.brandkit.quick | Quick Brand Kit · 2 minutes |
| gen.brandkit.steps | Identity · Rules · Assets |
| gen.brandkit.q1 | What does this brand sell, and to whom? |
| gen.brandkit.tone | Tone of voice |
| gen.brandkit.lang | Caption language |
| gen.brandkit.emoji | Emoji in captions |
| gen.brandkit.emoji.on / off | Allowed (default) / Not allowed |
| gen.lang | Caption language |
| gen.lang.options | Indonesian / English / Mixed |
| gen.lang.default | {language} (Brand Kit default) |
| gen.lang.peraccount | Per account (Brand Kit) |
| gen.lang.help | Default for this account. Can be changed per session. |
| gen.summary.lang | {language} captions |
| gen.brandkit.fill | Not sure? Fill from bio and the last 12 posts. You can edit the result. |
| gen.brandkit.later / next | Later / Next: {step} |
| story.bible | Story Bible |
| story.arc | Story arc |
| story.arc.done | The first arc is complete ({n} episodes). This session starts episodes {a}–{b}. |
| story.view | View Story Bible |
| story.edit.text | Edit as text |

## Drafts
| Key | Text |
|---|---|
| draft.title | Drafts |
| draft.sub | Every session from the Content Generator. Review, then approve to the calendar. |
| draft.new | New session |
| draft.tab.action / running / done / all | Needs action / In progress / Done / All |
| draft.search | Search sessions |
| draft.sort | Newest · Next scheduled · Expiring first |
| draft.mode.story / campaign | Story / Campaign |
| draft.state.plan | Plan only |
| draft.state.concept | Review concepts |
| draft.state.review | Review images |
| draft.state.failed | Needs fixing |
| draft.state.running | In progress |
| draft.state.done | Done |
| draft.state.expired | Drafts deleted |
| draft.cta.plan | Create {n} concepts |
| draft.cta.concept | Review concepts |
| draft.cta.review | Review {n} |
| draft.cta.failed | Fix {n} |
| draft.cta.running | View progress |
| draft.cta.done | View |
| draft.cta.expired | Recreate from plan |
| draft.meta.created | created {date} |
| draft.meta.edited | Edited {relative} |
| draft.expiry | Auto-deletes in {n} days |
| draft.expiry.soon | Auto-deletes tomorrow at {HH:MM} |
| draft.expiry.today | Auto-deletes today at {HH:MM} |
| draft.noexpiry | Does not expire |
| draft.empty.none.title | No sessions yet |
| draft.empty.none.body | Create a session in the Content Generator. Every concept and image the AI makes shows up here for you to review. |
| draft.empty.none.cta | Open Content Generator |
| draft.empty.filter | No sessions for {filter} in "{tab}" |
| draft.empty.filter.cta | Clear filter |
| draft.empty.expired.title | This session's drafts were deleted automatically |
| draft.empty.expired.body | Nothing changed for 7 days, so the images and captions were cleaned up. The plan and story memory are kept. |
| draft.plan.callout | The plan is ready; concepts haven't been created. Check the order below, select all or some, then create concepts. Images are made only after you approve the concepts. |
| draft.plan.cols | Ep. · Planned episode · Type · Schedule · Scheduler reason |
| draft.plan.needsvideo | needs video |
| draft.plan.shift | Shift all dates |
| draft.plan.delete | Delete plan |
| draft.concept.stage | Step 1 of 2. Approve concepts, AI creates images, then you review the images. |
| draft.concept.counts | Concepts · {n} / Images · {n} / Approved · {n} |
| draft.concept.verdict | OK / Note / Claim |
| draft.concept.apply | Apply suggestion |
| draft.concept.approve.next | Approve and go to concept {n} |
| draft.concept.skip | Skip this concept |
| draft.concept.bulk | Approve {n} concepts and create {m} images |
| draft.concept.regen | Regenerate all concepts |
| draft.revise.placeholder | Ask for a revision: "shorter caption" |
| draft.filter | All · Ready · Approved · Failed · In progress |
| draft.status.ready / approved / failed / progress | Ready / Approved / Failed / In progress |
| draft.approve.one | Approve to calendar |
| draft.approve.many | Approve {n} ready |
| draft.approve.dialog.title | Approve {n} posts to the calendar? |
| draft.approve.dialog.body | Posts publish automatically on schedule. You can still change or cancel them from the Calendar before they go out. |
| draft.approve.conflict | {n} posts clash with posts already scheduled at the same time. Shift by 15 minutes |
| draft.approve.progress | Approving {i} of {n}… |
| draft.approve.done.title | {n} posts added to the calendar |
| draft.approve.done.body | First post goes out {slot} WIB. {rest} posts in this session are still waiting. |
| draft.approve.done.stay / open | Stay in session / Open Calendar |
| draft.retry.failed | Retry failed ({n}) |
| draft.direction | View direction |
| draft.bulk.selected | {n} selected |
| draft.bulk.shift | Shift schedule |
| draft.bulk.revise | Revise with AI |
| draft.delete.title | Delete {n} drafts? |
| draft.delete.body | Images not used by other posts are deleted too. Drafts already on the calendar are not affected. |
| draft.slide.revise | Revise this slide |
| draft.slide.revise.title | What should change in slide {n}? |
| draft.slide.revise.hint | Only slide {n} and the final review run again. API cost applies. |
| draft.slide.replace / reorder | Replace with photo / Reorder |
| draft.slide.versions | Previous versions · slide {n} |
| draft.caption.improve | Improve with AI |
| draft.alsopublish | Also publish to |
| draft.send.compose | Send to New Post |
| draft.prompt.details | Prompt and direction for this post |
| draft.shortcuts | Left/Right move · A approve · E edit |
| draft.mobile.skip / approve | Skip / Approve and next |
| draft.cal.legend | Draft · Approved · Published (other session) · Failed |
| draft.cal.hint | Drag to change the date (saved automatically). |

## Run status chips
planned **Plan** · queued **Waiting** · running **In progress** · concept_review **Review concept** · review **Ready** · failed **Failed** · approved **Approved** · drafted **In New Post** · cancelled **Cancelled**.

## Other pages
| Key | Text |
|---|---|
| home.greeting | Hi, {first name} |
| home.tasks | Needs action · {n} |
| home.tasks.sub | most urgent first |
| home.tasks.empty | You're all caught up for today. |
| home.today | Today's schedule |
| home.kpi.scheduled / published / comments / followers | Scheduled, next 7 days / Published, last 7 days / Unanswered comments / Followers (total) |
| home.onboarding.title | Connect your first account |
| home.onboarding.body | Connect an Instagram Business/Creator or Threads account to start posting. |
| compose.title | New Post |
| compose.to | Post to |
| compose.media.add | Add photo or video, or pick from Library |
| compose.caption.same / per | Same for all / Per platform |
| compose.when.now / schedule | Now / Schedule |
| compose.slots | Popular slots: 12:15 · 19:15 |
| compose.retention | Media is removed from the server after publishing. Keep your originals. |
| compose.save / schedule / publish | Save draft / Schedule / Publish now |
| compose.aidrafts | {n} AI drafts waiting · Open |
| cal.title | Content Calendar |
| cal.today | Today |
| cal.showdrafts | Show drafts |
| cal.legend | Published · Scheduled · Draft or plan (not approved) · Failed |
| cal.gap | empty {n} days |
| cal.clash | clash: {n} min apart |
| cal.event.edit / reschedule / duplicate / cancel | Edit / Reschedule / Duplicate / Cancel post |
| msg.title | Messages |
| msg.tabs | Needs reply · All · Done |
| msg.sync.warn | {n} accounts: Meta isn't sending DMs · Check permissions |
| msg.window | Reply window: {h} h {m} min left |
| msg.window.closed | The 24-hour reply window has closed. Meta only allows replies within 24 hours of the customer's last message. |
| msg.reply.placeholder | Write a reply |
| msg.send | Send |
| msg.done | Mark as done |
| msg.empty | No conversations yet. New messages arrive automatically; select Refresh to check now. |
| comments.title | Comments |
| comments.tabs | Needs reply · All · Hidden |
| comments.reply / dm / hide | Reply / Reply by DM / Hide |
| comments.spam | likely spam |
| comments.synced | Synced {relative} |
| comments.empty | All comments have been answered. |
| insights.title | Insights |
| insights.period | 7 days · 30 days · 90 days |
| insights.updated | Updated {relative} · Meta can lag up to 48 hours |
| insights.kpi | Followers · Reach · Views · Interactions |
| insights.top | Top posts this period |
| insights.compare.total | Total, {company} |
| accounts.title | Companies & Accounts |
| accounts.addcompany / connect | Add company / Connect account |
| accounts.cols | Account · Followers · Brand Kit · Connection |
| accounts.brandkit.complete / missing / partial | Complete / Not set up · Set up / {a} of {b} · {missing} |
| accounts.active.until | Active until {date} |
| accounts.menu | Brand Kit & Story · Integration details · Move to company… · Refresh name and photo · Reconnect · Disconnect account… |
| brandkit.tabs | Brand Kit · Story Bible · Story memory · Integration |
| brandkit.complete | {n}% complete |
| brandkit.identity / rules / assets | Identity and tone / Brand rules / Brand assets |
| brandkit.do / dont | Do / Don't |
| brandkit.assets.logo / visual / product / video | Logo / Visual references / Product photos / Video / Reels |
| brandkit.editfull | Edit full prompt (markdown) |
| brandkit.plan | Plan a session |
| brandkit.product.required | Product name is required |
| media.title | Media Library |
| media.upload | Upload |
| media.sources | All · Team uploads · Brand Kit · AI results |
| media.types | All · Photos · Videos |
| media.untagged | All accounts (untagged) |
| media.tag | Tag to account |
| media.drop | Drop photos or videos here · JPEG/PNG up to 8 MB · MP4/MOV up to 300 MB · feed ratio 4:5 to 1.91:1 |
| api.title | API & AI |
| api.keys / create / revoke | API keys / Create API key / Revoke |
| api.keyonce | A key is shown only once; LRMsmm stores only its hash. |
| api.copy | Copy |
| team.title | Team & Access |
| team.invite | Invite member |
| team.cols | Member · Role · Account access · Last active |
| team.you | You |
| team.password.moved | Change your password in Personal settings > Security. |
| audit.title | Audit Log |
| audit.tabs | Activity · Failed posts |
| audit.webhook | Webhook not active · syncing periodically |
| audit.export | Export CSV |
| settings.title | Personal settings |
| settings.tabs | Profile · Security · AI connections · Notifications |
| settings.ai.cols | Provider · Status · Used by agents · Saved |
| settings.ai.test / replace / remove / save | Test / Replace / Remove / Save |
| settings.ai.note | Keys are stored encrypted and never shown again. Costs follow the provider's rates. Models per agent are set in Content Generator > AI team. |

## Audit event sentences (J1)
| Code | Sentence |
|---|---|
| brand.save | {actor} updated the Brand Kit for {@account} |
| brand.asset.save | {actor} added or changed brand assets for {@account} |
| story.start | {actor} started a story session for {@account} |
| generator.bulk_delete | {actor} deleted {n} drafts in Drafts |
| (unknown) | {actor} · `{code}` |

## Sign in (L1)
| Key | Text |
|---|---|
| login.title | Welcome back |
| login.sub | Sign in to manage Instagram and Threads content for every brand. |
| login.email / password / show | Email / Password / Show |
| login.error | Wrong email or password. {n} attempts left. |
| login.cta / pending | Sign in / Signing in… |
| login.secure | Encrypted connection · Meta tokens stored with AES-256 |
| login.panel.title | One place for every social account |
| login.panel.1 | Content Generator: from brief to dozens of review-ready drafts, matched to each account's Brand Kit. |
| login.panel.2 | Calendar and scheduling: write once, publish to Instagram and Threads. |
| login.panel.3 | One inbox: comments and DMs for every account, with a 5-minute reminder. |
