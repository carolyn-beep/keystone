import OpenAI from "openai";

// Using Replit AI Integrations for OpenAI access.
// Does not require your own API key.
// Charges are billed to your Replit credits.
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "dummy",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function summarizeFact(fullText: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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
      max_completion_tokens: 150,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() || fullText.substring(0, 200);
  } catch (error) {
    console.error("AI Summarization failed:", error);
    return fullText.substring(0, 200) + "..."; // Fallback
  }
}
