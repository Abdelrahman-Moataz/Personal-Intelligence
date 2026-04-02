import { GoogleGenAI, Type } from "@google/genai";
import { Memory } from "../types";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set in the environment.");
}

const ai = new GoogleGenAI({ apiKey });

export async function chatWithAgent(message: string, history: { role: string; text: string }[]) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      ...history.map(h => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] })),
      { role: "user", parts: [{ text: message }] }
    ],
    config: {
      systemInstruction: "You are OmniAgent, a personal memory companion. Your goal is to help users and learn about them. Be friendly, helpful, and attentive to details like their preferences, favorite places, and orders. When you learn something new, acknowledge it naturally in conversation."
    }
  });

  return response.text;
}

export async function extractMemories(message: string, response: string): Promise<Partial<Memory>[]> {
  const extractionPrompt = `
    Analyze the following exchange and extract any personal information, preferences, favorite places, or order history mentioned by the user.
    
    User: "${message}"
    Agent: "${response}"
    
    Return a JSON array of objects with:
    - type: "preference", "place", "order", or "general"
    - content: A concise description of what was learned (e.g., "Likes spicy food", "Favorite coffee shop is Blue Bottle", "Ordered a pepperoni pizza")
    - category: A short category like "Food", "Travel", "Hobbies", etc.
    
    If nothing new was learned, return an empty array.
  `;

  const extractionResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: extractionPrompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["preference", "place", "order", "general"] },
            content: { type: Type.STRING },
            category: { type: Type.STRING }
          },
          required: ["type", "content"]
        }
      }
    }
  });

  try {
    return JSON.parse(extractionResponse.text || "[]");
  } catch (e) {
    console.error("Failed to parse memories:", e);
    return [];
  }
}

export async function generateOnboardingQuestions(selections: string[]) {
  const prompt = `
    The user has selected the following interests: ${selections.join(", ")}.
    Generate 3 short, engaging follow-up questions to get to know them better.
    Return a JSON array of 3 strings.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return ["What's your favorite way to spend a weekend?", "What's a movie you can watch over and over?", "What's your dream travel destination?"];
  }
}

export async function generatePredictions(selections: string[], answers: { question: string; answer: string }[]) {
  const prompt = `
    Based on the user's interests: ${selections.join(", ")}
    And their answers to these questions:
    ${answers.map(a => `Q: ${a.question} A: ${a.answer}`).join("\n")}
    
    Predict 5 other things they might like. 
    CRITICAL: At least 3 of these MUST be REAL, SPECIFIC places (e.g., a specific famous cafe, a real park, a known landmark) that they might enjoy visiting. 
    Use Google Search to find real, highly-rated places that match their vibe.
    Other predictions can include movies, music, hobbies, or specific coffee tastes.
    
    Return a JSON array of objects with:
    - name: The predicted interest (for places, use the actual name of the place)
    - type: "preference", "place", "order", or "general"
    - reason: A short, personalized explanation of why you predicted this based on their inputs and what you found online.
    - country: For places, provide the country. For others, use "Global".
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["preference", "place", "order", "general"] },
            reason: { type: Type.STRING },
            country: { type: Type.STRING }
          },
          required: ["name", "type", "reason", "country"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse predictions:", e);
    return [];
  }
}

export async function analyzeImage(base64Image: string, mimeType: string, prompt: string = "What's in this image? Tell me anything important I should remember about it.") {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      }
    ],
    config: {
      systemInstruction: "You are OmniAgent's visual memory system. Analyze the image and provide a concise summary of what's in it, focusing on things the user might want to remember (people, places, objects, context)."
    }
  });

  return response.text;
}

export async function searchRealPlaces(interests: string[], location?: string) {
  console.log("🔍 Searching real places for interests:", interests, "at location:", location);
  const prompt = `
    The user is interested in: ${interests.join(", ")}.
    ${location ? `The user's current GPS coordinates are: ${location}.` : ""}
    
    CRITICAL STEPS:
    1. If coordinates are provided, first use Google Search to identify the EXACT city, region, and country for these coordinates.
    2. Once the location is identified, find 5 REAL, SPECIFIC, and highly-rated places (cafes, restaurants, parks, museums, etc.) that are physically located WITHIN that identified city or immediate region.
    3. Ensure the places are relevant to the user's interests.
    4. If no location is provided, find world-class places globally.
    
    OUTPUT REQUIREMENTS:
    - Return ONLY a JSON array of objects.
    - Each object must have:
      - name: The actual name of the place.
      - type: "place"
      - reason: A personalized explanation (max 200 chars) explaining why this place in their current city matches their interests.
      - country: The country where this place is located.
    
    DO NOT recommend places outside of their identified country/region if coordinates are provided.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["place"] },
              reason: { type: Type.STRING },
              country: { type: Type.STRING }
            },
            required: ["name", "type", "reason", "country"]
          }
        }
      },
    });

    console.log("🤖 Gemini Response for places:", response.text);
    const results = JSON.parse(response.text || "[]");
    console.log("✅ Parsed results:", results.length);
    return results;
  } catch (e) {
    console.error("❌ Failed to search real places:", e);
    return [];
  }
}
