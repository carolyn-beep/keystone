/**
 * AlphaX chat opener message.
 *
 * Inserted client-side as a synthetic assistant message (no model call) the
 * first time an AlphaX user lands on an empty chat conversation, gated by the
 * 7-day localStorage cooldown in `lib/chat-greeting-session.ts`. The thread
 * runtime keeps the message in state, so when the student types a reply the
 * full history (including this synthetic turn) is sent to the model.
 */

function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function buildAlphaXOpenerText(firstName: string | null | undefined): string {
  const trimmed = firstName?.trim();
  const greeting = trimmed && trimmed.length > 0
    ? `Hey ${titleCase(trimmed)}!`
    : 'Hey there!';

  return [
    `${greeting} I'm AlphaX Buddy.`,
    '',
    "Welcome to the starting line. This is the beginning of your journey to becoming a real expert in the field your project lives in. Not reading around a topic. The bar is holding your own against people who've spent years in it.",
    '',
    "You get there through the research and learning stream: a focused, ongoing dive into your domain. Every session goes deeper. Every source builds on the last. Over time, this becomes the backbone of the brainlift you'll write, your knowledge artifact, in your voice, backing every claim you make about your project. The stream is where mastery happens. The brainlift is where you shape it into something curated and defensible.",
    '',
    "Expect to go past the surface. Obvious answers and first-page sources won't cut it. If it won't hold up in a real conversation, it won't hold up here.",
    '',
    'What I do in the stream: find sources worth your time, surface what matters, and capture everything so nothing gets lost. The thinking and writing stay yours.',
    '',
    "How this works: you can ramble. Half-formed ideas, tangents, \"I don't know but I keep thinking about…\" all useful. You don't need anything figured out. Just start. The deeper you go, the more it comes together.",
    '',
    "So: what's an area you want to explore? A problem, an industry, something you keep coming back to?",
  ].join('\n');
}
