

import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalysisResult, FieldConfig, FieldType, GenerationStrategy } from '../types';
import { flattenObject } from './localService';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing in environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

// Response Schema for Analysis
const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    originalSampleCount: { type: Type.INTEGER },
    fields: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          type: { type: Type.STRING, enum: Object.values(FieldType) },
          strategy: { type: Type.STRING, enum: Object.values(GenerationStrategy) },
          description: { type: Type.STRING },
          options: {
            type: Type.OBJECT,
            properties: {
              min: { type: Type.NUMBER },
              max: { type: Type.NUMBER },
              step: { type: Type.NUMBER },
              start: { type: Type.NUMBER }, // Initial value
              values: { type: Type.ARRAY, items: { type: Type.STRING } },
              format: { type: Type.STRING },
              pattern: { type: Type.STRING },
              staticValue: { type: Type.STRING },
              precision: { type: Type.INTEGER }
            }
          }
        },
        required: ['key', 'type', 'strategy']
      }
    }
  }
};

export const analyzeJsonStructure = async (jsonInput: string): Promise<AnalysisResult> => {
  const ai = getClient();
  
  const prompt = `
    Analyze the following JSON data sample. 
    Your goal is to infer the schema and the likely data generation strategy for each field.
    
    Rules:
    1. Identify the type (string, number, boolean, etc.).
    2. Infer the best 'strategy' from the allowed list: 
       - 'increment' (for IDs like 1, 2, 3) -> Detect 'start' (initial value) and 'step'.
       - 'enum' (if values repeat from a small set)
       - 'random_int' / 'random_float' (for ranges)
       - 'name', 'email', 'phone', 'address', 'date' (semantic detection)
       - 'uuid' (if it looks like a UUID)
       - 'regex' (if it follows a specific string pattern)
       - 'ai_context' (fallback for complex strings)
    3. **Important**: For nested objects or arrays, FLATTEN the keys using dot notation. 
       - e.g., if JSON is { "user": { "id": 1 } }, return key "user.id".
       - e.g., if JSON is { "items": [{ "count": 1 }] }, return key "items.0.count".
    4. Fill in 'options' where applicable:
       - min/max for random numbers.
       - values for enums.
       - start/step for increment.
       - format for date.
       - pattern for regex.
    
    JSON Sample:
    ${jsonInput.slice(0, 10000)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are an expert data engineer. Analyze JSON to build a flat schema with dot-notation keys."
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    
    const result = JSON.parse(text) as AnalysisResult;

    // Post-processing: Attach original sample values to fields
    // This allows us to restore the original value when switching to 'Static' strategy
    try {
      const parsedInput = JSON.parse(jsonInput);
      const sample = Array.isArray(parsedInput) ? (parsedInput.length > 0 ? parsedInput[0] : {}) : parsedInput;
      const flattened = flattenObject(sample);
      
      result.fields.forEach(f => {
        if (flattened[f.key] !== undefined) {
          f.sampleValue = flattened[f.key];
        }
      });
    } catch (e) {
      console.warn("Failed to attach sample values to schema", e);
    }

    return result;
  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
  }
};

/**
 * Generates JavaScript code that can produce the requested data.
 * We move from "AI generating text" to "AI generating Logic" for strictness.
 */
export const generateDataGeneratorCode = async (
  fields: FieldConfig[],
  originalSample: string,
  customInstructions?: string
): Promise<string> => {
  const ai = getClient();
  
  const schemaDesc = JSON.stringify(fields, null, 2);

  const prompt = `
    You are a Senior JavaScript Developer. 
    Your task is to write a ROBUST JavaScript function named \`generateData(count, fields)\` that returns an array of generated JSON objects.
    
    1. **Function Signature**: \`generateData(count, fields)\`
       - \`count\` (integer): Number of items to generate.
       - \`fields\` (Array): The configuration array passed from the UI.
    
    2. **Output**: Return an Array of length \`count\`.
    
    3. **Dynamic Parameter Lookup (CRITICAL)**:
       - You MUST NOT hardcode option values (like min, max, step, start, enum values, regex patterns, or grouping counts) inside the loop.
       - You MUST retrieve them from the \`fields\` argument at runtime using \`fields.find(f => f.key === '...')?.options\`.
       - For arrays (like enum values), use \`options.values.length\` to calculate indices (e.g., modulo) so logic works even if the user adds/removes options later.

    4. **Implementation Logic**:
       - **State Management**: Create a \`state\` object at the top of the function to track variables like counters for increment fields. Initialize them using \`options.start\` values found in fields.
         \`const state = {}; fields.forEach(f => { if(f.strategy === 'increment') state[f.key] = f.options.start || 1; });\`
       
       - **Loop**: Iterate \`i\` from 0 to \`count - 1\`.
       
       - **Grouping Logic (Priority)**:
         - Check if any field has \`options.groupingConfig\`.
         - If found, determine the "Group Block Size" dynamically:
           - If \`groupingConfig.strategy === 'even'\`: size = \`Math.max(1, Math.floor(count / (options.values ? options.values.length : 1)))\`.
           - If \`groupingConfig.strategy === 'fixed'\`: size = \`groupingConfig.countPerGroup || 1\`.
         - Calculate the value index: \`const idx = Math.floor(i / size) % (options.values ? options.values.length : 1)\`.
         - **Resets**: Check if a new group started (e.g., \`i > 0 && i % size === 0\`). 
           - Read \`groupingConfig.resetFields\` (array of strings).
           - For each field key in that list, RESET its value in the \`state\` object to its original start value (from \`fields.find(...).options.start\`).

       - **Field Generation**:
         - For 'increment': Return \`state[key]\` then increment it (\`state[key] += step\`).
         - **For 'static' (CRITICAL):** 
           - Retrieve \`options.staticValue\`.
           - **STRICTLY enforces the field type**:
             - If \`field.type === 'number'\`, use \`Number(options.staticValue)\`.
             - If \`field.type === 'boolean'\`, use \`String(options.staticValue) === 'true'\` (or similar logic).
             - Do not return a string "123" if the type is number.
         - For other strategies, implement standard logic using \`options\`.

       - **Structure**: Reconstruct nested objects from flat dot-notation keys.
    
    5. **Custom Instructions**:
       - ${customInstructions || "Follow schema strategies strictly."}
       
    Original Sample:
    ${originalSample.slice(0, 2000)}

    Schema Configuration:
    ${schemaDesc}

    **Requirements**:
    - Return ONLY the JavaScript code. 
    - Do NOT wrap in markdown code blocks.
    - Define \`function generateData(count, fields) { ... }\`.
    - Ensure robust error handling (e.g. check if options exist before accessing).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "text/plain", 
      }
    });

    let code = response.text || "";
    
    // Cleanup markdown if present
    code = code.replace(/^```javascript\s*/, '').replace(/^```js\s*/, '').replace(/```$/, '');
    
    return code;
  } catch (error) {
    console.error("Code Generation Error:", error);
    throw error;
  }
};

/**
 * Executes the generated code in the browser context.
 * WARNING: Uses new Function(). Only use with code generated by the AI for this specific session.
 */
export const executeGeneratedCode = (code: string, count: number, fields: FieldConfig[]): any[] => {
  try {
    // We wrap the code to ensure we can call the function it defines
    // The code is expected to contain "function generateData(count, fields) { ... }"
    const wrappedCode = `
      ${code}
      return generateData(count, fields);
    `;
    
    // Create a function that takes 'count' and 'fields' as arguments
    const func = new Function('count', 'fields', wrappedCode);
    
    // Execute
    const result = func(count, fields);
    
    if (!Array.isArray(result)) {
        throw new Error("Generated code did not return an Array.");
    }
    
    return result;
  } catch (e: any) {
    console.error("Execution Error:", e);
    throw new Error(`Failed to execute generation logic: ${e.message}`);
  }
}