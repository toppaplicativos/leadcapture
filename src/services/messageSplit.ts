/**
 * Split long replies into bubbles without cutting mid-word.
 * Prefers paragraph → sentence → soft length breaks.
 */

export function splitMessageIntoBubbles(
  text: string,
  maxChars: number,
  maxBubbles = 3,
): string[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const limit = Math.max(50, Math.floor(maxChars));
  const bubblesMax = Math.max(1, Math.min(5, Math.floor(maxBubbles)));

  if (raw.length <= limit) return [raw];

  // Author-provided separators from composer
  if (raw.includes("\n\n---\n\n")) {
    const parts = raw
      .split(/\n\n---\n\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return packParts(parts, limit, bubblesMax);
  }

  const paragraphs = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) {
    return packParts(paragraphs, limit, bubblesMax);
  }

  const sentences = splitSentences(raw);
  if (sentences.length > 1) {
    return packParts(sentences, limit, bubblesMax);
  }

  return hardWrapWords(raw, limit, bubblesMax);
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+(?:\s+|$)|[^.!?…]+$/g);
  if (!parts) return [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

function packParts(parts: string[], limit: number, maxBubbles: number): string[] {
  const bubbles: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) bubbles.push(current.trim());
    current = "";
  };

  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;

    if (piece.length > limit) {
      flush();
      const wrapped = hardWrapWords(piece, limit, maxBubbles - bubbles.length);
      for (const w of wrapped) {
        if (bubbles.length >= maxBubbles - 1) {
          // merge remainder into last allowed bubble (still hard-capped)
          const rest = wrapped.slice(wrapped.indexOf(w)).join(" ");
          bubbles.push(...hardWrapWords(rest, limit, 1));
          return bubbles.slice(0, maxBubbles);
        }
        bubbles.push(w);
      }
      continue;
    }

    const candidate = current ? `${current} ${piece}` : piece;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      flush();
      current = piece;
      if (bubbles.length >= maxBubbles - 1) {
        // last bubble: take remaining parts joined and wrap once
        const rest = [piece, ...parts.slice(parts.indexOf(part) + 1)].join(" ");
        bubbles.push(...hardWrapWords(rest, limit, 1));
        return bubbles.slice(0, maxBubbles);
      }
    }
  }
  flush();

  if (bubbles.length <= maxBubbles) return bubbles;

  // Overflow: merge tail into last bubble and re-wrap last only
  const head = bubbles.slice(0, maxBubbles - 1);
  const tail = bubbles.slice(maxBubbles - 1).join(" ");
  return [...head, ...hardWrapWords(tail, limit, 1)];
}

function hardWrapWords(text: string, limit: number, maxBubbles: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const bubbles: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > limit) {
      // rare: single token longer than limit — hard cut at limit
      if (current) {
        bubbles.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += limit) {
        bubbles.push(word.slice(i, i + limit));
        if (bubbles.length >= maxBubbles) {
          return finalizeOverflow(bubbles, maxBubbles, limit);
        }
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      if (current) bubbles.push(current);
      current = word;
      if (bubbles.length >= maxBubbles) {
        return finalizeOverflow([...bubbles, current], maxBubbles, limit);
      }
    }
  }
  if (current) bubbles.push(current);
  return finalizeOverflow(bubbles, maxBubbles, limit);
}

function finalizeOverflow(bubbles: string[], maxBubbles: number, limit: number): string[] {
  if (bubbles.length <= maxBubbles) {
    return bubbles.map((b) => (b.length > limit ? b.slice(0, limit) : b));
  }
  const head = bubbles.slice(0, maxBubbles - 1);
  const tail = bubbles.slice(maxBubbles - 1).join(" ");
  const last = tail.length > limit ? `${tail.slice(0, Math.max(0, limit - 1)).trimEnd()}…` : tail;
  return [...head, last];
}

/** Sleep helper for sequential multi-bubble sends */
export function bubbleDelayMs(index: number): number {
  return index === 0 ? 0 : 400 + Math.min(index * 150, 800);
}
