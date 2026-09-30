import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined in the environment!");
}
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export interface ExtractedMaterial {
  item_name: string;
  original_term: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  vendor: string;
  date: string;
}

export async function extractMaterialData(input: string, imageBase64s?: string[], userLearning?: Record<string, any>, taskCategory?: string): Promise<ExtractedMaterial[]> {
  const model = "gemini-3-flash-preview";
  
  const learningContext = userLearning && Object.keys(userLearning).length > 0 
    ? `\n\nUSER PREFERENCES (Follow these rules strictly based on user's past corrections):
       ${Object.entries(userLearning).map(([term, pref]) => `- When you see "${term}", always use name: "${pref.item_name}" and unit: "${pref.unit}"`).join('\n')}`
    : "";

  const categoryContext = taskCategory 
    ? `\n\nWORK CATEGORY CONTEXT: The materials are for a "${taskCategory}" task. Please interpret generic terms accordingly. For example, if task is "Electrical", "tape" means "PVC Electrical Tape". If "Plumbing", it means "Teflon Tape". If "Painter", it means "Masking Tape". Make sure to include the specific type in the item_name based on this category.` 
    : "";

  const systemInstruction = `
    You are an expert Construction Material Auditor.
    Task: Extract purchase data from construction-related text or images (often handwritten notes).
    You may be provided with multiple images forming a single document or multiple related notes.
    
    Processing Rules:
    1. Language: Automatically translate Hindi/Hinglish terms to professional English (e.g., 'Eent' -> 'Bricks', 'Reti' -> 'Sand').
    2. Units: Use standard professional abbreviations (Bag, kg, Rft, sqft, piece, MT).
    3. Literal Extraction: The "original_term" field MUST be the exact word found in the source text.
    4. Data Cleaning: Strip currency symbols (₹, Rs) and ensure numbers are clean floats.
    5. Context: Use 2026-04-28 as the default date if not found.
    ${learningContext}
    ${categoryContext}
    
    IMPORTANT: Return a JSON array of objects conforming to the provided schema.
  `;

  const contents: any[] = [];
  if (input) contents.push({ text: `Manual context provided: ${input}` });
  
  if (imageBase64s && imageBase64s.length > 0) {
    imageBase64s.forEach((data) => {
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: data,
        },
      });
    });
    contents.push({ text: "Extract every material item and quantity from all these images. Combine findings into a single list. Be precise with handwritten numbers across all pages." });
  } else if (!input) {
    return [];
  } else {
    contents.push({ text: "Extract material items from the text provided." });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: contents },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item_name: { type: Type.STRING },
              original_term: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
              unit: { type: Type.STRING },
              unit_price: { type: Type.NUMBER },
              total_amount: { type: Type.NUMBER },
              vendor: { type: Type.STRING },
              date: { type: Type.STRING },
            },
            required: ["item_name", "original_term", "quantity", "unit"],
          },
        },
      },
    });

    const text = response.text || "[]";
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error("[Gemini] Parse Error:", parseError, "Raw output:", text);
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return [];
    }
  } catch (error: any) {
    console.error("[Gemini] Model error:", error);
    throw new Error(`Audit System Error: ${error.message || "Unknown error"}`);
  }
}
