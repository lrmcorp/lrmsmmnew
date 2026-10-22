// Platform rules — used for validation before anything is sent to Meta.
import { err } from '../util.js';

export const RULES = {
  instagram: {
    text_max: 2200, hashtags_max: 30, mentions_max: 20, media_min: 1, media_max: 10,
    image_ratio: [0.8, 1.91], reels_seconds: [3, 900], story_video_seconds: [3, 60],
    daily_quota: 100, options: ['format', 'share_to_feed', 'cover_media_id', 'thumb_offset_ms'],
    formats: 'Foto JPEG/PNG ≤ 8 MB (PNG dikonversi ke JPEG), video MP4/MOV ≤ 300 MB. 1 video = Reels, ≥2 media = carousel.',
  },
  threads: {
    text_max: 500, links_max: 5, media_max: 20, video_seconds_max: 300, thread_parts_max: 10,
    daily_quota: 250, options: ['thread', 'poll', 'link_attachment', 'text_attachment', 'topic_tag', 'reply_control'],
    reply_controls: ['everyone', 'accounts_you_follow', 'mentioned_only', 'followers_only', 'parent_post_author_only'],
    formats: 'Teks saja boleh. Foto JPEG/PNG ≤ 8 MB, video ≤ 5 menit. Carousel hingga 20 media.',
  },
};

const len = (s) => [...(s || '')].length;
const countLinks = (s) => new Set((s || '').match(/https?:\/\/\S+/gi) || []).size;

/**
 * Validate one target's effective content against platform rules.
 * @param {string} platform
 * @param {{content:string, media:object[], options:object, accountId:string}} t
 */
export function validateTarget(platform, { content, media, options, accountId }) {
  const d = { platform, account_id: accountId };
  const R = RULES[platform];
  for (const k of Object.keys(options || {})) {
    if (!R.options.includes(k)) throw err(400, 'invalid_options', `Option "${k}" is not recognized for ${platform}`, { ...d, option: k });
  }

  if (platform === 'instagram') {
    const fmt = options.format || 'feed';
    if (!['feed', 'story'].includes(fmt)) throw err(400, 'invalid_options', "format must be feed or story.", d);
    if (media.length < 1) throw err(400, 'media_required', "Instagram requires at least one photo or video.", d);
    if (fmt === 'story') {
      if (media.length !== 1) throw err(400, 'too_many_media', "A Story must contain exactly one media item.", d);
      if (content) throw err(400, 'validation_failed', "Stories cannot have captions. Leave content empty for this account.", d);
      const m = media[0];
      if (m.kind === 'video' && m.duration_ms != null) {
        const s = m.duration_ms / 1000;
        if (s < 3 || s > 60) throw err(400, 'media_invalid_format', "Story videos must be 3–60 seconds long.", d);
      }
      if (m.kind === 'video' && m.size > 100 * 1024 * 1024) throw err(400, 'video_too_large', "Story videos must not exceed 100 MB.", d);
      return;
    }
    if (media.length > R.media_max) throw err(400, 'too_many_media', "Instagram allows up to 10 media items per carousel.", d);
    if (len(content) > R.text_max) throw err(400, 'caption_too_long', `Instagram allows up to ${R.text_max} characters`, d);
    if ((content.match(/#[\p{L}\p{N}_]+/gu) || []).length > R.hashtags_max) throw err(400, 'validation_failed', "Instagram allows up to 30 hashtags.", d);
    if ((content.match(/@[\w.]+/g) || []).length > R.mentions_max) throw err(400, 'validation_failed', "Instagram allows up to 20 mentions.", d);
    for (const m of media) {
      if (m.kind === 'image' && m.width && m.height) {
        const r = m.width / m.height;
        if (r < R.image_ratio[0] - 0.01 || r > R.image_ratio[1] + 0.01) {
          throw err(400, 'aspect_ratio_invalid', `Rasio foto ${m.width}×${m.height} di luar batas Instagram (4:5 sampai 1.91:1)`, { ...d, media_id: m.id });
        }
      }
      if (m.kind === 'video' && media.length === 1 && m.duration_ms != null) {
        const s = m.duration_ms / 1000;
        if (s < 3 || s > 900) throw err(400, 'media_invalid_format', "Reels must be between 3 seconds and 15 minutes long.", { ...d, media_id: m.id });
      }
    }
    if (options.share_to_feed != null && typeof options.share_to_feed !== 'boolean') throw err(400, 'invalid_options', "share_to_feed must be a boolean.", d);
    return;
  }

  // ---- threads ----
  const textOnly = media.length === 0;
  if (len(content) > R.text_max) throw err(400, 'caption_too_long', `Threads allows up to ${R.text_max} characters`, d);
  if (countLinks(content) > R.links_max) throw err(400, 'too_many_links', "Threads allows up to 5 unique links per post.", d);
  if (media.length > R.media_max) throw err(400, 'too_many_media', "Threads allows up to 20 media items per carousel.", d);
  for (const m of media) {
    if (m.kind === 'video' && m.duration_ms != null && m.duration_ms > R.video_seconds_max * 1000) throw err(400, 'media_invalid_format', "Threads videos must not exceed 5 minutes.", { ...d, media_id: m.id });
  }
  const needsTextOnly = ['poll', 'link_attachment', 'text_attachment'].filter((k) => options[k] != null);
  if (needsTextOnly.length && !textOnly) throw err(400, 'option_requires_text_only', `${needsTextOnly.join(', ')} hanya untuk post tanpa media`, d);
  if (needsTextOnly.length > 1) throw err(400, 'invalid_options', "Choose one of poll, link_attachment or text_attachment.", d);
  if (options.poll) {
    const o = options.poll.options;
    if (!Array.isArray(o) || o.length < 2 || o.length > 4 || o.some((x) => typeof x !== 'string' || len(x) < 1 || len(x) > 25)) {
      throw err(400, 'invalid_options', "poll.options must contain 2–4 choices of 1–25 characters each.", d);
    }
  }
  if (options.link_attachment != null && !/^https?:\/\//i.test(options.link_attachment)) throw err(400, 'invalid_options', "link_attachment must be an http(s) URL.", d);
  if (options.text_attachment != null) {
    if (typeof options.text_attachment?.text !== 'string' || len(options.text_attachment.text) > 10000) throw err(400, 'invalid_options', "text_attachment.text is required and must not exceed 10,000 characters.", d);
  }
  if (options.topic_tag != null && (typeof options.topic_tag !== 'string' || len(options.topic_tag) < 1 || len(options.topic_tag) > 50 || /[.&]/.test(options.topic_tag))) {
    throw err(400, 'invalid_options', 'topic_tag 1–50 karakter, tanpa "." dan "&"', d);
  }
  if (options.reply_control != null && !R.reply_controls.includes(options.reply_control)) {
    throw err(400, 'invalid_options', `reply_control must be one of: ${R.reply_controls.join(', ')}`, d);
  }
  if (textOnly && !content && !options.poll && !options.link_attachment && !options.text_attachment) {
    throw err(400, 'validation_failed', "Threads posts without media must contain text.", d);
  }
  if (options.thread != null) {
    if (!Array.isArray(options.thread) || options.thread.length < 1 || options.thread.length > R.thread_parts_max) {
      throw err(400, 'invalid_options', "thread must contain 1–10 continuation parts.", d);
    }
    options.thread.forEach((p, i) => {
      const text = typeof p === 'string' ? p : p?.text || '';
      const mids = typeof p === 'string' ? [] : p?.media_ids || [];
      if (len(text) > R.text_max) throw err(400, 'caption_too_long', `Thread part ${i + 2} lebih dari 500 karakter`, { ...d, thread_part: i + 2 });
      if (mids.length > 1) throw err(400, 'too_many_media', `Thread part ${i + 2} allows up to one media item`, { ...d, thread_part: i + 2 });
      if (!text && !mids.length) throw err(400, 'validation_failed', `Thread part ${i + 2} kosong`, { ...d, thread_part: i + 2 });
    });
  }
}
