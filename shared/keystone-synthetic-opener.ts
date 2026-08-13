export const KEYSTONE_SYNTHETIC_OPENER_BODY = [
  "Welcome to the starting line. This is the beginning of your journey to becoming a real expert in the field your project lives in. Not reading around a topic. The bar is holding your own against people who've spent years in it.",
  '',
  "You get there through the research and learning stream: a focused, ongoing dive into your domain. Every session goes deeper. Every source builds on the last. Over time, this becomes the backbone of the brainlift you'll write, your knowledge artifact, in your voice, backing every claim you make about your project. The stream is where mastery happens. The brainlift is where you shape it into something curated and defensible.",
  '',
  "Expect to go past the surface. Obvious answers and first-page sources won't cut it. If it won't hold up in a real conversation, it won't hold up here.",
  '',
  'What I do in the stream: find sources worth your time, surface what matters, and capture everything so nothing gets lost. The thinking and writing stay yours.',
  '',
  'How this works: you can ramble. Half-formed ideas, tangents, "I don\'t know but I keep thinking about\u2026" all useful. You don\'t need anything figured out. Just start. The deeper you go, the more it comes together.',
  '',
  "So: what's an area you want to explore? A problem, an industry, something you keep coming back to?",
].join('\n');

function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function buildKeystoneSyntheticOpenerText(firstName: string | null | undefined): string {
  const trimmed = firstName?.trim();
  const greeting = trimmed && trimmed.length > 0
    ? `Hey ${titleCase(trimmed)}!`
    : 'Hey there!';

  return [
    `${greeting} I'm Keystone Buddy.`,
    '',
    KEYSTONE_SYNTHETIC_OPENER_BODY,
  ].join('\n');
}

export function isSyntheticKeystoneAssistantOpener(message: {
  role?: unknown;
  parts?: ReadonlyArray<unknown>;
} | undefined): boolean {
  if (message?.role !== 'assistant' || !Array.isArray(message.parts) || message.parts.length !== 1) {
    return false;
  }

  const part = message.parts[0];
  if (!part || typeof part !== 'object') {
    return false;
  }

  const textPart = part as { type?: unknown; text?: unknown };
  if (textPart.type !== 'text' || typeof textPart.text !== 'string') {
    return false;
  }

  const match = /^Hey (?:there|[^\n!]+)! I'm Keystone Buddy\.\n\n([\s\S]+)$/.exec(textPart.text);
  return match?.[1] === KEYSTONE_SYNTHETIC_OPENER_BODY;
}
