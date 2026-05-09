import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateIELTSCards(topic: string = "academic vocabulary") {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate 5 IELTS ${topic} flashcards. Each card should have a word/phrase on the front and a definition/example sentence on the back. Format as JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING },
          },
          required: ["front", "back"],
        },
      },
    },
  });

  return JSON.parse(response.text || "[]");
}

export async function generateDailyTest() {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "Generate a daily IELTS practice question (Reading or Listening style multiple choice). Provide question, 4 options, correctAnswer, and a short explanation.",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["reading", "listening"] },
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ["type", "question", "options", "correctAnswer", "explanation"],
      },
    },
  });

  return JSON.parse(response.text || "{}");
}
