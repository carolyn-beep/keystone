import { callModelWithFallback } from './client';

const SYSTEM_PROMPT = "You are a concise fact summarizer. Summarize the provided text into a maximum of 3 lines. Be direct and clear. Do not use any markdown (no bold, no italics, no bullet points), no formatting, and NO emojis. Provide only the plain text summary.";

export async function summarizeFact(fullText: string): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    return fullText.substring(0, 200) + "...";
  }

  try {
    const result = await callModelWithFallback({
      models: ['qwen/qwen-plus', 'google/gemini-2.0-flash-001'],
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Summarize this fact:\n\n${fullText}` }],
      maxTokens: 150,
      temperature: 0.3,
      timeout: 20_000,
      retries: 2,
      caller: 'factSummarizer',
    });

    const summary = result.content.trim();
    if (!summary) throw new Error('Empty response');
    return summary;
  } catch (error) {
    console.error("Summarization failed:", error);
    return fullText.substring(0, 200) + "...";
  }
}
