

import { AnalysisResult, FieldConfig, FieldType, GenerationStrategy } from '../types';

// --- Analysis Logic ---

const determineStrategy = (key: string, value: any): { strategy: GenerationStrategy, options?: any, description?: string } => {
  const k = key.toLowerCase();
  
  if (value === null) return { strategy: GenerationStrategy.STATIC, options: { staticValue: "null" } };

  if (typeof value === 'number') {
    if ((k === 'id' || k.endsWith('_id') || k.endsWith('Id')) && Number.isInteger(value)) {
        return { strategy: GenerationStrategy.INCREMENT, options: { start: value, step: 1 } };
    }
    if (Number.isInteger(value)) return { strategy: GenerationStrategy.RANDOM_INT, options: { min: 0, max: value * 2 || 100 } };
    return { strategy: GenerationStrategy.RANDOM_FLOAT, options: { min: 0, max: value * 2 || 100, precision: 2 } };
  }

  if (typeof value === 'boolean') {
    return { strategy: GenerationStrategy.ENUM, options: { values: ['true', 'false'] } };
  }

  if (typeof value === 'string') {
    // UUID check
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return { strategy: GenerationStrategy.UUID };
    }
    // Date check (ISO like or keywords)
    if (/^\d{4}-\d{2}-\d{2}/.test(value) || (Date.parse(value) && (k.includes('date') || k.includes('time') || k.includes('_at')))) {
      return { strategy: GenerationStrategy.DATE, options: { format: 'YYYY-MM-DD' } };
    }
    if (k.includes('email')) return { strategy: GenerationStrategy.EMAIL };
    if (k.includes('name') || k.includes('user') || k.includes('author')) return { strategy: GenerationStrategy.NAME };
    if (k.includes('phone') || k.includes('tel')) return { strategy: GenerationStrategy.PHONE };
    if (k.includes('address') || k.includes('city') || k.includes('street') || k.includes('country')) return { strategy: GenerationStrategy.ADDRESS };
    
    // Default fallback for strings in local mode
    return { strategy: GenerationStrategy.AI_CONTEXT, description: "Local: Random String" }; 
  }

  return { strategy: GenerationStrategy.STATIC, options: { staticValue: String(value) } };
};

export const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
  let result: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        if (value.length > 0) {
             if (typeof value[0] === 'object' && value[0] !== null) {
                 Object.assign(result, flattenObject(value[0], `${newKey}.0`));
             } else {
                 result[`${newKey}.0`] = value[0];
             }
        }
      } else {
        result[newKey] = value;
      }
    }
  }
  return result;
};

export const analyzeJsonStructureLocal = (jsonInput: string): AnalysisResult => {
  let parsed;
  try {
    parsed = JSON.parse(jsonInput);
  } catch (e) {
    throw new Error("JSON Parse Error");
  }

  // If array, take first item
  const sample = Array.isArray(parsed) ? (parsed.length > 0 ? parsed[0] : {}) : parsed;
  
  const flattened = flattenObject(sample);
  const fields: FieldConfig[] = Object.entries(flattened).map(([key, value]) => {
    let type = FieldType.STRING;
    if (typeof value === 'number') type = FieldType.NUMBER;
    else if (typeof value === 'boolean') type = FieldType.BOOLEAN;
    else if (Array.isArray(value)) type = FieldType.ARRAY;
    else if (value === null) type = FieldType.NULL;
    
    const { strategy, options, description } = determineStrategy(key, value);
    
    return {
      key,
      type,
      strategy,
      options,
      description: description || 'Detected locally',
      sampleValue: value // Store original value for restoration later
    };
  });

  return {
    fields,
    originalSampleCount: Array.isArray(parsed) ? parsed.length : 1
  };
};

// --- Generation Logic ---

const generators: Record<string, (state: any, key: string, opts: any) => any> = {
  [GenerationStrategy.INCREMENT]: (state, key, opts) => {
      if (state[key] === undefined) state[key] = Number(opts.start || 1);
      const val = state[key];
      state[key] += Number(opts.step || 1);
      return val;
  },
  [GenerationStrategy.RANDOM_INT]: (_, __, opts) => {
      const min = Number(opts.min ?? 0);
      const max = Number(opts.max ?? 100);
      return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  [GenerationStrategy.RANDOM_FLOAT]: (_, __, opts) => {
      const min = Number(opts.min ?? 0);
      const max = Number(opts.max ?? 100);
      const prec = Number(opts.precision ?? 2);
      return parseFloat((Math.random() * (max - min) + min).toFixed(prec));
  },
  [GenerationStrategy.ENUM]: (_, __, opts) => {
      const vals = opts.values || [];
      if (!vals.length) return opts.values?.[0] || "enum";
      return vals[Math.floor(Math.random() * vals.length)];
  },
  [GenerationStrategy.UUID]: () => crypto.randomUUID(),
  [GenerationStrategy.NAME]: () => {
      const firsts = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "David", "Elizabeth"];
      const lasts = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis"];
      return `${firsts[Math.floor(Math.random() * firsts.length)]} ${lasts[Math.floor(Math.random() * lasts.length)]}`;
  },
  [GenerationStrategy.EMAIL]: () => {
      const domains = ["gmail.com", "yahoo.com", "outlook.com", "example.org"];
      const names = ["user", "test", "dev", "admin", "guest"];
      return `${names[Math.floor(Math.random() * names.length)]}.${Math.floor(Math.random() * 999)}@${domains[Math.floor(Math.random() * domains.length)]}`;
  },
  [GenerationStrategy.PHONE]: () => `+1-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
  [GenerationStrategy.DATE]: (_, __, opts) => {
      const end = new Date();
      const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000); // Last year
      const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
      if (opts.format === 'YYYY-MM-DD') return d.toISOString().split('T')[0];
      return d.toISOString();
  },
  [GenerationStrategy.ADDRESS]: () => {
      const streets = ["Main St", "Oak Ave", "Pine Rd", "Maple Ln", "Cedar Blvd"];
      const cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"];
      return `${Math.floor(Math.random() * 9999)} ${streets[Math.floor(Math.random() * streets.length)]}, ${cities[Math.floor(Math.random() * cities.length)]}`;
  },
  [GenerationStrategy.STATIC]: (_, __, opts) => opts.staticValue,
  [GenerationStrategy.AI_CONTEXT]: () => "Lorem ipsum (Local generated string)",
  [GenerationStrategy.REGEX]: (_, __, opts) => `regex_sim(${opts.pattern || '?'})`,
  [GenerationStrategy.SENTENCE]: () => "The quick brown fox jumps over the lazy dog.",
};

export const generateLocalData = (count: number, fields: FieldConfig[]): any[] => {
    const result = [];
    const state: Record<string, any> = {};

    // Initialize state for increments
    fields.forEach(f => {
        if (f.strategy === GenerationStrategy.INCREMENT) {
            state[f.key] = f.options?.start ?? 1;
        }
    });

    for (let i = 0; i < count; i++) {
        const flatRow: Record<string, any> = {};
        
        // --- Grouping and Generation ---
        fields.forEach(field => {
            const opts = field.options || {};
            let val;

            if (opts.groupingConfig) {
                 const values = opts.values || [];
                 const len = values.length || 1;
                 let size = 1;
                 
                 if (opts.groupingConfig.strategy === 'even') {
                     size = Math.max(1, Math.floor(count / len));
                 } else {
                     size = opts.groupingConfig.countPerGroup || 1;
                 }
                 
                 const idx = Math.floor(i / size) % len;
                 val = values[idx];

                 // Check reset
                 if (i > 0 && i % size === 0) {
                     (opts.groupingConfig.resetFields || []).forEach((resetKey: string) => {
                        const targetField = fields.find(f => f.key === resetKey);
                        if (targetField && targetField.strategy === GenerationStrategy.INCREMENT) {
                            state[resetKey] = targetField.options?.start ?? 1; // Correctly reset to start
                        }
                     });
                 }
            } else {
                 const gen = generators[field.strategy] || generators[GenerationStrategy.STATIC];
                 val = gen(state, field.key, opts);
            }

            // --- TYPE ENFORCEMENT ---
            // Ensure static values adhere to the field type (converting string inputs to number/boolean)
            if (field.strategy === GenerationStrategy.STATIC && val !== undefined && val !== null) {
                if (field.type === FieldType.NUMBER) {
                    const num = Number(val);
                    if (!isNaN(num)) val = num;
                } else if (field.type === FieldType.BOOLEAN) {
                    // Handle "true"/"false" strings or other truthy/falsy values explicitly
                    if (val === 'true') val = true;
                    else if (val === 'false') val = false;
                    else val = Boolean(val);
                }
            }

            flatRow[field.key] = val;
        });

        // --- Unflatten (Dot notation to Object) ---
        const row = {};
        Object.keys(flatRow).forEach(key => {
            const value = flatRow[key];
            const parts = key.split('.');
            let current: any = row;
            
            for (let k = 0; k < parts.length - 1; k++) {
                const part = parts[k];
                const nextPart = parts[k+1];
                const isNextArray = !isNaN(Number(nextPart));
                
                if (current[part] === undefined) {
                    current[part] = isNextArray ? [] : {};
                }
                current = current[part];
            }
            
            const lastKey = parts[parts.length - 1];
            if (Array.isArray(current) && !isNaN(Number(lastKey))) {
                 current[Number(lastKey)] = value;
            } else {
                 current[lastKey] = value;
            }
        });
        
        result.push(row);
    }
    return result;
}