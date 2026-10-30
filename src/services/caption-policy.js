// A caption is read on a phone, under a square image, with only the first line
// or two visible before "more". Nothing in the contract asked for that shape, so
// the agents returned one unbroken block of prose: correct in content, unread in
// practice. The rule lives in one place because four stages write or keep a
// caption, and a caption that gains its paragraphs at one stage and loses them
// at the next is no better than one that never had them.
export const CAPTION_SHAPE = `CAPTION SHAPE: write the caption as several short paragraphs separated by one blank line, never as a single block of prose. Use real newline characters in the JSON string. Open with a hook of one or two lines that stands on its own, because that is all a reader sees before "more". Then one to three short paragraphs, each on its own idea, each separated by a blank line. Close with whatever the post asks for, a question, an invitation or a call to action, on its own line. If hashtags belong to this account's style, put them on one final line after a blank line, never mixed into a sentence. Keep sentences short enough to read on a phone, and never let a paragraph run past about four lines. The blank lines are part of the caption: preserve them exactly when you carry a caption forward.`;
