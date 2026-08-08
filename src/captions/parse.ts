import type { CaptionPhrase, CaptionWord, Transcript } from './types';

/**
 * Transcript parsers. `parseTranscript` auto-detects the input:
 *  - Whisper-style JSON (`verbose_json` with word timestamps),
 *  - SRT subtitles (word timings interpolated within each cue),
 *  - plain text (spread evenly over the video duration).
 */
export const parseTranscript = (input: string, videoDuration: number): Transcript => {
  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseWhisperJson(trimmed);
  }
  if (/^\d+\s*\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/m.test(trimmed)) {
    return parseSrt(trimmed);
  }
  return spreadPlainText(trimmed, videoDuration);
};

/** Whisper `verbose_json`: { segments: [{ start, end, text, words: [{ word, start, end }] }] } */
export const parseWhisperJson = (json: string): Transcript => {
  const data = JSON.parse(json);
  const segments = Array.isArray(data) ? data : data.segments;
  if (!Array.isArray(segments)) throw new Error('No segments found in JSON transcript');
  return segments.map((segment): CaptionPhrase => {
    const words: CaptionWord[] = Array.isArray(segment.words)
      ? segment.words.map((w: { word: string; start: number; end: number }) => ({
          text: String(w.word).trim(),
          start: w.start,
          end: w.end,
        }))
      : distributeWords(String(segment.text).trim().split(/\s+/), segment.start, segment.end);
    return {
      start: segment.start,
      end: segment.end,
      words,
      ...(segment.speaker === undefined ? {} : { speaker: Number(segment.speaker) }),
    };
  });
};

/** SRT cues; each cue becomes a phrase, word timings interpolated by length. */
export const parseSrt = (srt: string): Transcript => {
  const phrases: CaptionPhrase[] = [];
  const blocks = srt.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const match = block.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*\n([\s\S]+)/
    );
    if (!match) continue;
    const [, h1, m1, s1, ms1, h2, m2, s2, ms2, text] = match;
    const start = +h1! * 3600 + +m1! * 60 + +s1! + +ms1! / 1000;
    const end = +h2! * 3600 + +m2! * 60 + +s2! + +ms2! / 1000;
    const words = text!.trim().replace(/\n/g, ' ').split(/\s+/);
    phrases.push({ start, end, words: distributeWords(words, start, end) });
  }
  if (phrases.length === 0) throw new Error('No cues found in SRT');
  return phrases;
};

/** No timing at all: chunk the text into short phrases spread over the video. */
export const spreadPlainText = (text: string, duration: number): Transcript => {
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || words[0] === '') throw new Error('Empty transcript');
  const phrases: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    // Break on punctuation or every 5 words, whichever comes first.
    if (/[.!?,;:]$/.test(word) || current.length >= 5) {
      phrases.push(current);
      current = [];
    }
  }
  if (current.length > 0) phrases.push(current);

  const usable = duration * 0.94;
  const totalWords = words.length;
  let cursor = duration * 0.03;
  return phrases.map((phraseWords) => {
    const span = (usable * phraseWords.length) / totalWords;
    const phrase: CaptionPhrase = {
      start: cursor,
      end: cursor + span * 0.92, // small gap between phrases
      words: distributeWords(phraseWords, cursor, cursor + span * 0.92),
    };
    cursor += span;
    return phrase;
  });
};

/** Splits a time range across words, proportionally to their length. */
const distributeWords = (words: string[], start: number, end: number): CaptionWord[] => {
  const weights = words.map((w) => w.length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = start;
  return words.map((text, i) => {
    const span = ((end - start) * weights[i]!) / total;
    const word = { text, start: cursor, end: cursor + span };
    cursor += span;
    return word;
  });
};
