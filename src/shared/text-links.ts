export type TextPart = { text: string; href?: string };

// Only web addresses: `javascript:` and other schemes never match, so they stay as text.
const webAddress = /https?:\/\/[^\s<>"']+/gi;
const trailingPunctuation = /[.,;:!?)\]]+$/;

/**
 * Splits free text into plain parts and links to its web addresses. Punctuation that ends the
 * sentence stays outside the link, and whatever the URL parser refuses stays as text.
 */
export function textLinkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let position = 0;
  for (const match of text.matchAll(webAddress)) {
    const address = match[0].replace(trailingPunctuation, '');
    if (!URL.canParse(address)) continue;
    if (match.index > position) parts.push({ text: text.slice(position, match.index) });
    parts.push({ text: address, href: new URL(address).href });
    position = match.index + address.length;
  }
  if (position < text.length) parts.push({ text: text.slice(position) });
  return parts;
}
