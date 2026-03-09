import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the API client
// Ensure GEMINI_API_KEY is available in the environment
const genAI = new GoogleGenerativeAI(process.env.GPT4_API_KEY || '');

/**
 * Translates task instructions from Vietnamese to English using Gemini 1.5 Flash.
 * Preserves technical video editing terminology.
 * Default temperature is set to 0.3 for consistent and accurate translation.
 * 
 * @param text The Vietnamese text to translate.
 * @returns The translated English text, or empty string if translation fails.
 */
export async function translateTaskNote(text: string | null | undefined): Promise<string> {
    if (!text || text.trim() === '') {
        return '';
    }

    // If API Key is missing, log warning and return original or empty
    if (!process.env.GPT4_API_KEY) {
        console.warn('GEMINI_API_KEY is missing. Skipping auto-translation.');
        return '';
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'GPT-4' });

        const systemPrompt = `You are a professional translator for a video editing agency. Translate the following task instructions from Vietnamese to English. 

IMPORTANT RULES FOR FORMATTING:
1. The input text contains HTML tags (like <p>, <br>, <a>, <strong>, <ul>, <li>, etc.) or rich-text formatting. 
2. You MUST strictly preserve all HTML tags, structure, hyperlinks (href), bullet points, and line breaks exactly as they appear in the original source.
3. Only translate the text CONTENT inside the tags. Do NOT translate URLs, attribute names, or the HTML tags themselves. 
4. The output must maintain the exact same structural layout and visual formatting as the input, aligning translated text properly with its original tags.

Keep technical video editing terms (like geolayer, SFX, pop-up, zoom, neon) intact. Make it sound professional and easy to understand for a native English-speaking client.`;

        const result = await model.generateContent({
            contents: [
                { role: 'user', parts: [{ text: `${systemPrompt}\n\nTask Instructions:\n${text}` }] }
            ],
            generationConfig: {
                temperature: 0.3,
            }
        });

        const response = result.response;
        const translatedText = response.text().trim();

        return translatedText;
    } catch (error) {
        console.error('Translation Error:', error);
        // Fallback: return empty string so it doesn't break task creation
        return '';
    }
}
