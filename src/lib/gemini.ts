import { GoogleGenAI, Modality, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

export interface InteractiveData {
  type: 'graph' | 'equation' | 'none';
  data?: {
    points?: { x: number; y: number }[];
    equation?: string;
    variables?: { name: string; value: number; min: number; max: number; step: number }[];
    expression?: string; // For interactive equation evaluation
  };
}

export interface MathStep {
  title: string;
  explanation: string;
  math?: string;
  interactiveData?: InteractiveData;
}

export interface MathSolution {
  id: string;
  problem: string;
  steps: MathStep[];
  finalAnswer: string;
  context?: {
    standard: string;
    bookName: string;
    practiceSet: string;
  };
}

export interface MultiProblemResponse {
  solutions: MathSolution[];
}

export const solveMathProblem = async (
  imageBase64: string, 
  mimeType: string, 
  context?: { standard?: string; bookName?: string; practiceSet?: string }
): Promise<MultiProblemResponse> => {
  const model = "gemini-3-flash-preview";
  
  const contextStr = context 
    ? `The student is in ${context.standard || 'a school'} standard. ${context.bookName ? `Book: ${context.bookName}.` : ''} ${context.practiceSet ? `Practice Set/Exercise: ${context.practiceSet}.` : ''}`
    : 'The student has not provided context. Please try to identify the standard (e.g., 10th), book name, and exercise from the image if possible.';

    const prompt = `
    Analyze the image and solve ALL math problems found in it with absolute precision.
    If there are multiple questions or examples (e.g., Question 1, Example 1, Example 2), solve each one separately and sequentially.
    ${contextStr}
    
    POWERFUL AI TUTORING SYSTEM GUIDELINES:
    1. **Algebraic Precision**: For expressions like $(5a + 6b)^2$, identify the identity used (e.g., $(x+y)^2 = x^2 + 2xy + y^2$). Show the breakdown of each term clearly (e.g., $(5a + 6b)^2 = (5a)^2 + 2(5a)(6b) + (6b)^2 = 25a^2 + 60ab + 36b^2$).
    2. **Pedagogical Depth (Concept -> Logic -> Action)**: For EVERY step, explain the "WHY" using this EXACT structure:
       - **Concept**: The underlying math principle (e.g., Perfect Square Trinomial).
       - **Logic**: The reasoning for this specific step (e.g., Since $25a^2$ is $(5a)^2$ and $36b^2$ is $(6b)^2$...).
       - **Action**: The actual calculation performed (e.g., We rewrite the middle term as $2(5a)(6b)$).
    3. **Step-by-Step Expansion**: Do not skip any logical steps. Provide a FULL, exhaustive solution. 
       - Number each step clearly (e.g., 1), 2), 3)...).
       - If a problem has multiple parts, solve each part comprehensively. 
       - No direct answers only.
    4. **LaTeX Formatting (CRITICAL)**: 
       - Use LaTeX for ALL math in the "math", "problem", and "finalAnswer" fields. 
       - Ensure powers are formatted as superscripts using the caret symbol (e.g., $x^2$, $a^2$, $(5a)^2$). 
       - ALWAYS wrap math in dollar signs (e.g., $...$) ONLY in "math", "problem", and "finalAnswer" fields.
       - **CRITICAL**: Do NOT use dollar signs ($) in the "explanation" field. In "explanation", use plain text or Unicode superscripts like ² or ³ (e.g., x² instead of $x^2$, y³ instead of $y^3$).
       - **NEVER** use "v2", "square", or "^2" in the explanation. Use the actual superscript character ² (U+00B2).
       - **DO NOT** translate mathematical notation into words or other symbols, even if the explanation is in a different language (e.g., keep x² as x², do not write "x square" or "x v2").
       - Example: $(5a + 6b)^2 = (5a)^2 + 2(5a)(6b) + (6b)^2 = 25a^2 + 60ab + 36b^2$.
    5. **Encouraging Tone**: Use highly encouraging, tutor-like language: "Excellent observation! Notice how this expression fits the pattern of a perfect square trinomial..."
    6. **Interactive Data**: 
       - Graph: For functions or plotting.
       - Equation: For algebraic equations where variables can be tweaked.
       - Expression: Provide a JavaScript-evaluable expression for interactive results.

    Return the response in JSON format with the following structure:
    {
      "solutions": [
        {
          "id": "unique_id_1",
          "problem": "The transcribed problem text in LaTeX (e.g., Example 1: Solve $x^2 + 5x + 6 = 0$)",
          "context": { "standard": "e.g. 10th", "bookName": "e.g. NCERT", "practiceSet": "e.g. Ex 1.1" },
          "steps": [
            {
              "title": "1) Step Title",
              "explanation": "Concise pedagogical explanation using Concept -> Logic -> Action.",
              "math": "The mathematical expression in LaTeX",
              "interactiveData": {
                "type": "graph",
                "data": { 
                  "expression": "m * x + c",
                  "variables": [
                    { "name": "m", "value": 1, "min": -5, "max": 5, "step": 0.1 },
                    { "name": "c", "value": 0, "min": -10, "max": 10, "step": 1 }
                  ]
                }
              }
            }
          ],
          "finalAnswer": "The final result in LaTeX"
        }
      ]
    }
    Ensure all mathematical symbols are correctly formatted in LaTeX.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { data: imageBase64, mimeType } }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          solutions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                problem: { type: Type.STRING },
                context: {
                  type: Type.OBJECT,
                  properties: {
                    standard: { type: Type.STRING },
                    bookName: { type: Type.STRING },
                    practiceSet: { type: Type.STRING }
                  }
                },
                steps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                      math: { type: Type.STRING },
                      interactiveData: {
                        type: Type.OBJECT,
                        properties: {
                          type: { type: Type.STRING, enum: ["graph", "equation", "none"] },
                          data: {
                            type: Type.OBJECT,
                            properties: {
                              points: {
                                type: Type.ARRAY,
                                items: {
                                  type: Type.OBJECT,
                                  properties: {
                                    x: { type: Type.NUMBER },
                                    y: { type: Type.NUMBER }
                                  }
                                }
                              },
                              equation: { type: Type.STRING },
                              variables: {
                                type: Type.ARRAY,
                                items: {
                                  type: Type.OBJECT,
                                  properties: {
                                    name: { type: Type.STRING },
                                    value: { type: Type.NUMBER },
                                    min: { type: Type.NUMBER },
                                    max: { type: Type.NUMBER },
                                    step: { type: Type.NUMBER }
                                  }
                                }
                              },
                              expression: { type: Type.STRING }
                            }
                          }
                        }
                      }
                    },
                    required: ["title", "explanation"]
                  }
                },
                finalAnswer: { type: Type.STRING }
              },
              required: ["id", "problem", "steps", "finalAnswer"]
            }
          }
        },
        required: ["solutions"]
      }
    }
  });

  return JSON.parse(response.text || "{\"solutions\":[]}") as MultiProblemResponse;
};

export const generateSpeech = async (text: string, voiceName: string = 'Kore', language: string = 'English'): Promise<string> => {
  const cleanText = text.replace(/\$/g, '').replace(/\\/g, '').trim();
  if (!cleanText) throw new Error("Empty text for speech generation");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Speak this math explanation clearly in ${language}: ${cleanText}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName as any },
        },
      },
    },
  });

  console.log("TTS Response:", JSON.stringify(response, null, 2));

  const parts = response.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find(p => p.inlineData);
  const base64Audio = audioPart?.inlineData?.data;
  
  if (!base64Audio) {
    const finishReason = response.candidates?.[0]?.finishReason;
    const safetyRatings = response.candidates?.[0]?.safetyRatings;
    console.error("TTS Failed. Reason:", finishReason, "Safety:", safetyRatings);
    throw new Error(`Failed to generate audio: ${finishReason || 'Unknown reason'}`);
  }
  
  // Convert raw PCM to WAV
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(44 + len);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 24000 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, len, true);

  for (let i = 0; i < len; i++) {
    view.setUint8(44 + i, binaryString.charCodeAt(i));
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};

export const createChatSession = () => {
  return ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: "You are a helpful math tutor. Explain concepts simply and encourage the student. Use LaTeX for math expressions.",
    },
  });
};

export const connectLive = (callbacks: any, language: string = 'English', systemInstruction?: string) => {
  return ai.live.connect({
    model: "gemini-3.1-flash-live-preview",
    callbacks,
    config: {
      systemInstruction: systemInstruction || `You are a friendly, encouraging math tutor. You can see the student's problem through their camera. Guide them step-by-step, explaining the 'why' and using analogies. Keep responses concise and pedagogical. Please respond in ${language}.`,
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
      },
    },
  });
};
