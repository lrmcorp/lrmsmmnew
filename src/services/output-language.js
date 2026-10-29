// One authoritative output language per run.
//
// The language was stated in three places that could disagree: the per-session
// choice the workspace prepends to every agent's instructions, the account's
// Brand Kit sentence compiled into brand_notes, and a "write caption in the
// brief's language" line in the JSON contract. The Brand Kit notes and the
// contract line both sit later in the system prompt than the session choice, so
// a session set to English still produced Indonesian whenever the account's
// Brand Kit said Indonesian. The fix is to resolve the language once, strip the
// competing sentences out of the embedded notes, and state the answer last.
export const LANGUAGES=['id','en','mixed'];
export const LANGUAGE_NAMES={id:'Bahasa Indonesia',en:'English',mixed:'a natural mix of Bahasa Indonesia and English'};

export function normalizeLanguage(value){
 const text=String(value??'').trim().toLowerCase();
 return LANGUAGES.includes(text)?text:'';
}
// Brand Kit notes carry the account default as a trailing marker line.
export function languageFromNotes(notes){
 return normalizeLanguage(/Caption language:\s*(id|en|mixed)/i.exec(String(notes||''))?.[1]||'');
}
// The session choice wins over the account default, which wins over Indonesian.
export function resolveOutputLanguage({requested='',notes=''}={}){
 return normalizeLanguage(requested)||languageFromNotes(notes)||'id';
}
// Remove every language instruction from text that will be embedded in a
// prompt, so the resolved clause is the only one the model can follow.
export function stripLanguageDirectives(notes){
 return String(notes||'')
  .replace(/^.*\b(?:Write|Tulis)\b[^\n]*\b(?:captions?|caption dan|on-image text|teks)\b[^\n]*\b(?:Bahasa Indonesia|Indonesian|English|Inggris)\b[^\n]*$/gim,'')
  .replace(/^.*\bFinal Reviewer must flag captions in the wrong language\b[^\n]*$/gim,'')
  .replace(/^\s*Caption language:.*$/gim,'')
  .replace(/\n{3,}/g,'\n\n').trim();
}
// Stated last and as its own block, because the earlier, weaker mention is the
// one that loses when a prompt contradicts itself.
export function outputLanguageClause(language){
 const name=LANGUAGE_NAMES[normalizeLanguage(language)||'id'];
 return `OUTPUT LANGUAGE: write the caption, the title and every word of on-image text in ${name}. This was chosen for this session and it overrides any other language statement in this prompt, in the brand rules, in the account profile and in the brief, including the language the brief itself happens to be written in. Translate your own wording into ${name} before returning it; never mirror the brief's language instead.`;
}
