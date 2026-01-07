import OpenAI from "openai";

// Using Replit AI Integrations for OpenAI access.
// Does not require your own API key.
// Charges are billed to your Replit credits.
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "dummy",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function summarizeFact(fullText: string): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    return fullText.substring(0, 200) + "...";
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://replit.com',
      },
      body: JSON.stringify({
        model: 'qwen/qwen3-vl-32b-instruct',
        messages: [
          {
            role: "system",
            content: "You are a concise fact summarizer. Summarize the provided text into a maximum of 3 lines. Be direct and clear. Do not use fluff."
          },
          {
            role: "user",
            content: `Summarize this fact for a dashboard:\n\n${fullText}`
          }
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || fullText.substring(0, 200);
  } catch (error) {
    console.error("AI Summarization failed:", error);
    return fullText.substring(0, 200) + "..."; // Fallback
  }
}
