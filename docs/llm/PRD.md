# Product requirements

What LRMsmm is for, who uses it and what it must do. Written from the
implementation that exists and the decisions its owner has actually made. It is
not a roadmap and it does not describe work nobody has asked for.

For the rules a change must not break, see [RULES.md](RULES.md). For how it is
built, see [ARCHITECTURE.md](ARCHITECTURE.md).

## The product

LRMsmm is an internal social-media publishing tool for Liando Reyfort
Management, serving `https://lrmsosmed.playgo.id`. One workspace holds several
companies, each with several Instagram and Threads accounts. It takes a brief
and produces scheduled, human-approved posts: captions, images and times.

It is not a general content generator. Every account carries its own brand
identity, product catalogue and story continuity, and the product's value is
that generated work looks and sounds like **that account** rather than like the
category.

## Who uses it

| Role | What they do |
|---|---|
| **Owner** | Administers the workspace: companies, accounts, team, connections, AI settings, audit. Approves and publishes. |
| **Representative** | Works the accounts they are assigned. Reviews drafts, edits captions and schedules, requests approval. Cannot administer the workspace. |

Access comes from direct account assignments plus company membership. Hiding a
menu is not authorization; the server rechecks on every read and write.

## What it must do

### 1. Hold each account's identity

An account's **Brand Kit** carries its essence, tone, do/don't rules, caption
language, emoji preference, and a catalogue of up to 250 assets: logo, visual
references, product photos and video. A **Story Bible** and named **story
memory sessions** carry narrative continuity, so a campaign can continue a story
rather than restart it.

This is the input the rest of the product depends on. An empty Brand Kit
produces generic work, and the interface says so rather than pretending
otherwise.

### 2. Produce content from a brief

Two modes:

- **Campaign** — a brief, a number of posts, a date range. The planner proposes
  distinct content ideas, then each one goes through the production stages.
- **Storyline** — continues a selected memory session for N episodes, through
  Storyteller, Manager and Scheduler, before the same production stages.

Each selected account gets **its own run** for each content item, so two brands
selected together never receive identical posts.

### 3. Make the work look like the account, not the category

This is where most of the product's effort sits, and most of its failures have
been. The requirements that came out of real review:

- The uploaded **visual references lead** the art direction. A reference is
  studied for its craft — palette, background, subject scale, type hierarchy,
  lighting, mark placement, negative space — never copied for its identity.
- **No two contents in a campaign look the same.** Each is assigned a
  compositional framing from a fixed set; one in six carries no product at all
  and is a typographic card.
- **Products rotate.** Twelve posts against twelve products use twelve
  different products.
- The **brand name is never drawn** as lettering. The server composites the one
  official logo after generation; anything the model draws is a duplicate.
- The composited logo is a **small signature** seated in the emptiest area of
  the frame, not a banner.
- **One output language per run**, chosen for the session or defaulted from the
  Brand Kit, and it outranks every other language statement in the prompt.
- Captions read as **short paragraphs** with a hook that survives Instagram's
  "more" fold — not one block of prose.

### 4. Keep the human in control

- AI produces **proposals**. A human approves before anything reaches the
  publishing calendar, and approval is a separate, explicit act.
- Concepts are reviewed before images are paid for.
- Every paid action states its cost context before it runs.
- Uploaded originals are never modified. Logos and exact-cutout products are
  composited from the original file, not redrawn.

### 5. Schedule and publish for real

- The **count and the date range are the user's decision**; posting times give
  way to fit them. Twelve posts in three days becomes four a day without the
  user doing arithmetic.
- Moving the first post of a selection moves the rest by the same amount,
  spacing intact.
- Publishing goes to real Instagram and Threads through Meta's APIs, per target,
  with each target succeeding or failing independently.
- A scheduled entry is not a published post, and the product never claims
  otherwise.

### 6. Be honest when it cannot do something

A recurring requirement, learned the hard way: the product must not present
success it has not achieved. Missing feed imagery stays visible as unavailable.
A failure names its actual reason rather than "something went wrong". Scheduler
suggestions state that they are heuristic, not measured from analytics.

## Explicitly out of scope

- **Using consumer AI subscriptions.** Generation runs on each user's own API
  keys. Anthropic prohibits third-party use of Claude subscription
  authentication; OpenAI's plan-usage route requires approval the workspace does
  not have. The product does not work around either.
- **Automatic publishing without approval.** No setting removes the human.
- **Measured visual-similarity scores.** The product does not claim a percentage
  match to a reference.
- **Analytics-derived optimal posting times.** Suggestions are heuristic and say
  so.
- Video generation. Agents do not create video; uploaded video can be scheduled.

## What "working" means

The product is working when, for a brief a human would recognise as their own:

1. Every post in a campaign is visibly different from the others.
2. The work reads as the account's own voice and design language.
3. The language is the one that was chosen.
4. Nothing shows a second logo or a brand name in drawn lettering.
5. A human can edit any caption or schedule, approve the set, and see real posts
   appear on the real accounts at the times they chose.

Points 1 to 4 are prompt and pipeline behaviour and are only provable by
reviewing a **new** campaign; a retried draft reuses its completed stages and
proves nothing. Point 5 is provable end to end and is covered by tests against
simulated Meta endpoints, which is not the same as a live publication.
