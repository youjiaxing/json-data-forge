
import React, { useState, useEffect } from 'react';
import { Bot, Wand2, Database, Download, Copy, RefreshCw, ChevronRight, AlertCircle, FileText, Save, FolderOpen, Trash2, Layers, RotateCcw, Code, X, Zap, Sparkles, Home, Scale, Hash, Lock } from 'lucide-react';
import { analyzeJsonStructure, generateDataGeneratorCode, executeGeneratedCode } from './services/geminiService';
import { analyzeJsonStructureLocal, generateLocalData } from './services/localService';
import { FieldConfig, AnalysisResult, Template, GenerationStrategy } from './types';
import { SchemaRow } from './components/SchemaRow';

enum Step {
  INPUT = 0,
  CONFIGURE = 1,
  RESULT = 2
}

const DEFAULT_JSON = `[
  {
    "id": 1001,
    "user_name": "Alice Chen",
    "role": "admin",
    "is_active": true,
    "login_count": 42,
    "rating": 4.5,
    "created_at": "2023-10-01"
  }
]`;

// Check if API Key is present in the build
const HAS_API_KEY = !!process.env.API_KEY;

// Helper to access nested objects using dot notation (e.g. "award.0.count")
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, part) => {
    // Handle array indices in path (e.g. "0")
    if (acc && Array.isArray(acc) && !isNaN(Number(part))) {
      return acc[Number(part)];
    }
    return acc && acc[part];
  }, obj);
};

// Check if a field change requires code regeneration (Structure) or just option lookup (Parameter)
const isStructuralChange = (f1: FieldConfig, f2: FieldConfig): boolean => {
  if (f1.key !== f2.key) return true;
  if (f1.type !== f2.type) return true;
  if (f1.strategy !== f2.strategy) return true;
  
  // If grouping config *presence* changes (added/removed), it's structural.
  const hasGroup1 = !!f1.options?.groupingConfig;
  const hasGroup2 = !!f2.options?.groupingConfig;
  if (hasGroup1 !== hasGroup2) return true;

  if ((!f1.options && f2.options) || (f1.options && !f2.options)) return false; 
  return false;
};

const App: React.FC = () => {
  const [step, setStep] = useState<Step>(Step.INPUT);
  const [inputJson, setInputJson] = useState<string>(DEFAULT_JSON);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Mode Switch: Default to Local if no API Key is found
  const [isLocalMode, setIsLocalMode] = useState(!HAS_API_KEY);
  
  // State for Configuration
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [generateCount, setGenerateCount] = useState<number>(50);
  const [customInstructions, setCustomInstructions] = useState<string>("");
  
  // State for Result
  const [generatedData, setGeneratedData] = useState<any[]>([]);
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [showCodeModal, setShowCodeModal] = useState(false);

  // State for Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  // State for Reset Confirmation
  const [showResetModal, setShowResetModal] = useState(false);

  // State for Grouping Helper
  const [showGroupingHelper, setShowGroupingHelper] = useState(false);
  const [groupField, setGroupField] = useState("");
  const [groupValues, setGroupValues] = useState("");
  const [groupStrategy, setGroupStrategy] = useState<'fixed' | 'even'>('fixed');
  const [countPerGroup, setCountPerGroup] = useState(10);
  const [resetFields, setResetFields] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('smart_forge_templates');
    if (saved) {
      try {
        setTemplates(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load templates", e);
      }
    }
  }, []);

  const saveTemplates = (newTemplates: Template[]) => {
    setTemplates(newTemplates);
    localStorage.setItem('smart_forge_templates', JSON.stringify(newTemplates));
  };

  const handleAnalyze = async () => {
    setError(null);
    setIsAnalyzing(true);
    setGeneratedCode(""); // Clear code on new analysis
    try {
      // Basic Validation
      let parsed;
      try {
        parsed = JSON.parse(inputJson);
      } catch (e) {
        throw new Error("JSON 格式错误，请检查输入 (Invalid JSON format)");
      }
      
      let result: AnalysisResult;
      
      if (isLocalMode) {
        // Local analysis
        result = analyzeJsonStructureLocal(JSON.stringify(parsed));
      } else {
        // AI analysis
        result = await analyzeJsonStructure(JSON.stringify(parsed));
      }

      setFields(result.fields);
      setStep(Step.CONFIGURE);
    } catch (err: any) {
      setError(err.message || "分析失败 (Failed to analyze JSON).");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFieldChange = (index: number, updatedField: FieldConfig) => {
    const oldField = fields[index];
    const newFields = [...fields];
    newFields[index] = updatedField;
    setFields(newFields);

    // Smart Cache Invalidation (Only for AI Mode where code is generated)
    if (!isLocalMode && isStructuralChange(oldField, updatedField)) {
      setGeneratedCode(""); 
    }
  };

  const handleGenerate = async (forceRefresh = false) => {
    setError(null);
    setIsGenerating(true);
    setGeneratedData([]);
    
    try {
      if (isLocalMode) {
        // Local Generation
        // Simulate a small delay for better UX
        await new Promise(r => setTimeout(r, 500));
        
        const data = generateLocalData(generateCount, fields);
        setGeneratedData(data);
        setGeneratedCode(`// Local Mode Logic
// ----------------
// Data is generated using the built-in deterministic engine.
// No custom JavaScript code was generated by AI.
// The engine supports:
// - Increment, Random Int/Float, Enum
// - UUID, Date, Name, Email, Phone
// - Grouping & Reset logic
        `);
      } else {
        // AI Generation
        let code = generatedCode;

        if (!code || forceRefresh) {
           code = await generateDataGeneratorCode(fields, inputJson, customInstructions);
           setGeneratedCode(code);
        } else {
          console.log("Using cached logic code with dynamic parameters...");
        }

        const data = executeGeneratedCode(code, generateCount, fields);
        setGeneratedData(data);
      }
      
      setStep(Step.RESULT);
    } catch (err: any) {
      setError(err.message || "生成失败 (Failed to generate data).");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(generatedData, null, 2));
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(generatedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generated_data_${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveTemplate = () => {
    if (!newTemplateName.trim()) return;
    const newTemplate: Template = {
      id: crypto.randomUUID(),
      name: newTemplateName,
      createdAt: Date.now(),
      config: {
        inputJson,
        fields,
        customInstructions,
        generateCount,
        generatedCode: isLocalMode ? "" : generatedCode // Don't save local placeholder code
      }
    };
    saveTemplates([...templates, newTemplate]);
    setNewTemplateName("");
    setShowTemplateModal(false);
  };

  const handleLoadTemplate = (t: Template) => {
    setInputJson(t.config.inputJson);
    setFields(t.config.fields);
    setCustomInstructions(t.config.customInstructions);
    setGenerateCount(t.config.generateCount);
    if (t.config.generatedCode) {
      setGeneratedCode(t.config.generatedCode);
      if (HAS_API_KEY) {
        setIsLocalMode(false);
      }
    } else {
      setGeneratedCode("");
    }
    setStep(Step.CONFIGURE); 
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveTemplates(templates.filter(t => t.id !== id));
  };

  const handleGroupFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedKey = e.target.value;
    setGroupField(selectedKey);

    if (!selectedKey) {
      setGroupValues("");
      return;
    }

    const fieldConfig = fields.find(f => f.key === selectedKey);
    if (fieldConfig?.strategy === GenerationStrategy.ENUM && fieldConfig.options?.values && fieldConfig.options.values.length > 0) {
      setGroupValues(fieldConfig.options.values.join(', '));
      return;
    }

    try {
      const parsed = JSON.parse(inputJson);
      const dataArray = Array.isArray(parsed) ? parsed : [parsed];
      const uniqueValues = new Set<string>();
      
      dataArray.forEach(item => {
        const val = getNestedValue(item, selectedKey);
        if (val !== undefined && val !== null) {
          uniqueValues.add(String(val));
        }
      });

      if (uniqueValues.size > 0) {
        setGroupValues(Array.from(uniqueValues).join(', '));
      } else {
        setGroupValues(""); 
      }
    } catch (err) {
      console.warn("Could not auto-extract values from sample", err);
    }
  };

  const applyGroupingRule = () => {
    if (!groupField) return;
    const fieldIndex = fields.findIndex(f => f.key === groupField);
    if (fieldIndex === -1) return;
    const valuesList = groupValues.split(/[,，\n]/).map(v => v.trim()).filter(v => v);
    
    const updatedField = { ...fields[fieldIndex] };
    updatedField.options = {
      ...updatedField.options,
      values: valuesList,
      groupingConfig: {
        strategy: groupStrategy,
        countPerGroup: groupStrategy === 'fixed' ? countPerGroup : undefined,
        resetFields: resetFields
      }
    };
    if (groupStrategy === 'fixed') {
       const suggestion = valuesList.length * countPerGroup;
       setGenerateCount(suggestion);
    }
    handleFieldChange(fieldIndex, updatedField);
    setShowGroupingHelper(false);
  };

  const toggleResetField = (fieldKey: string) => {
    setResetFields(prev => 
      prev.includes(fieldKey) ? prev.filter(k => k !== fieldKey) : [...prev, fieldKey]
    );
  };

  const handleReset = () => {
    setShowResetModal(true);
  };

  const confirmReset = () => {
     setStep(Step.INPUT);
     setGeneratedCode("");
     setGeneratedData([]);
     setFields([]);
     setInputJson(DEFAULT_JSON);
     setCustomInstructions("");
     setShowResetModal(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStep(Step.INPUT)}>
            <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-indigo-200 shadow-lg">
              <Database size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">智能数据生成器 <span className="text-slate-400 font-normal text-sm ml-2 hidden sm:inline-block">DataForge AI</span></h1>
          </div>

          <div className="flex items-center gap-6">
            {/* Mode Switch */}
            <div className="flex items-center gap-3 bg-slate-100 p-1 rounded-lg border border-slate-200">
               <button 
                 onClick={() => HAS_API_KEY && setIsLocalMode(false)}
                 disabled={!HAS_API_KEY}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    !isLocalMode 
                    ? 'bg-white text-indigo-700 shadow-sm' 
                    : HAS_API_KEY 
                        ? 'text-slate-500 hover:text-slate-700' 
                        : 'text-slate-300 cursor-not-allowed'
                 }`}
                 title={!HAS_API_KEY ? "未检测到 API Key，仅本地模式可用" : "切换到 AI 模式"}
               >
                 {HAS_API_KEY ? <Bot size={14} /> : <Lock size={14} />} 
                 AI 智能模式
               </button>
               <button 
                 onClick={() => setIsLocalMode(true)}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${isLocalMode ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 <Zap size={14} /> 本地极速模式
               </button>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-500 hidden md:flex">
              <span className={`px-3 py-1.5 rounded-full transition-colors ${step === Step.INPUT ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-100'}`}>1. 输入</span>
              <ChevronRight size={14} className="text-slate-300" />
              <span className={`px-3 py-1.5 rounded-full transition-colors ${step === Step.CONFIGURE ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-100'}`}>2. 配置</span>
              <ChevronRight size={14} className="text-slate-300" />
              <span className={`px-3 py-1.5 rounded-full transition-colors ${step === Step.RESULT ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-100'}`}>3. 结果</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        
        {/* Missing API Key Banner for Local Mode Users */}
        {!HAS_API_KEY && (
           <div className="mb-4 bg-orange-50 border border-orange-200 text-orange-800 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
             <AlertCircle size={16} />
             <span>检测到未配置 API Key，系统已自动运行在<b>本地模式</b>。数据将通过本地算法生成，不依赖 AI。</span>
           </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r shadow-sm flex items-start gap-3 animate-fade-in">
             <AlertCircle className="text-red-500 mt-0.5" size={20} />
             <div>
               <h3 className="text-red-800 font-medium">发生错误</h3>
               <p className="text-red-700 text-sm mt-1">{error}</p>
             </div>
          </div>
        )}

        {/* STEP 1: INPUT */}
        {step === Step.INPUT && (
          <div className="grid lg:grid-cols-3 gap-6 animate-fade-in">
             <div className="lg:col-span-2">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        输入 JSON 样本
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        {isLocalMode ? '本地模式：使用规则快速推断结构。' : 'AI 模式：深度分析语义和模式。'}
                      </p>
                    </div>
                    {isLocalMode && (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded flex items-center gap-1">
                        <Zap size={12}/> Local Mode
                      </span>
                    )}
                  </div>
                  <textarea
                    className="flex-1 w-full p-6 font-mono text-sm bg-slate-900 text-slate-50 resize-none focus:outline-none min-h-[400px]"
                    value={inputJson}
                    onChange={(e) => {
                      setInputJson(e.target.value);
                      if (!isLocalMode) setGeneratedCode(""); 
                    }}
                    spellCheck={false}
                    placeholder='[{"id": 1, "name": "example"}]'
                  />
                  <div className="p-6 bg-slate-50 flex justify-end border-t border-slate-100">
                    <button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm hover:shadow-md ${
                        isLocalMode 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                    >
                      {isAnalyzing ? (
                        <>
                          <RefreshCw className="animate-spin" size={18} /> 分析结构中...
                        </>
                      ) : (
                        <>
                          {isLocalMode ? <Zap size={18} /> : <Bot size={18} />} 
                          {isLocalMode ? '快速分析 (Local)' : '智能分析 (AI)'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
             </div>

             {/* Template Sidebar */}
             <div className="lg:col-span-1">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full flex flex-col">
                   <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                     <FolderOpen size={18} className="text-indigo-600"/>
                     已存模板 (Templates)
                   </h3>
                   {templates.length === 0 ? (
                     <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-lg flex-1">
                        暂无模板
                     </div>
                   ) : (
                     <div className="space-y-3 overflow-y-auto max-h-[500px] custom-scrollbar flex-1 pr-1">
                        {templates.map(t => (
                          <div key={t.id} 
                               onClick={() => handleLoadTemplate(t)}
                               className="group p-3 rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 cursor-pointer transition-all relative">
                             <div className="font-medium text-slate-700 group-hover:text-indigo-700">{t.name}</div>
                             <div className="text-xs text-slate-400 mt-1">
                               {new Date(t.createdAt).toLocaleDateString()} · {t.config.generateCount} items
                               {t.config.generatedCode && <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px]">Ready</span>}
                             </div>
                             <button 
                               onClick={(e) => handleDeleteTemplate(t.id, e)}
                               className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                             >
                               <Trash2 size={14} />
                             </button>
                          </div>
                        ))}
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {/* STEP 2: CONFIGURE */}
        {step === Step.CONFIGURE && (
          <div className="grid lg:grid-cols-3 gap-6 animate-fade-in">
             {/* Left Column: List of Fields */}
             <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-end mb-2">
                   <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                     字段策略配置
                     {isLocalMode && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">本地模式</span>}
                   </h2>
                   <button onClick={() => setStep(Step.INPUT)} className="text-sm text-slate-500 hover:text-indigo-600">
                     ← 返回修改样本
                   </button>
                </div>
                
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={index} className="relative">
                      {field.options?.groupingConfig && (
                        <div className="absolute -top-3 left-4 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-t-md border-t border-x border-indigo-200 flex items-center gap-1 z-10">
                          <Layers size={10} /> 
                          分组主键: {field.options.groupingConfig.strategy === 'even' ? '平均分布' : `每组 ${field.options.groupingConfig.countPerGroup} 个`}
                          {field.options.groupingConfig.resetFields?.length ? ` · 重置: [${field.options.groupingConfig.resetFields.join(', ')}]` : ''}
                        </div>
                      )}
                      <SchemaRow
                        field={field}
                        onChange={(updated) => handleFieldChange(index, updated)}
                        onDelete={() => {
                          const newFields = fields.filter((_, i) => i !== index);
                          setFields(newFields);
                          if (!isLocalMode) setGeneratedCode(""); 
                        }}
                      />
                    </div>
                  ))}
                  {fields.length === 0 && (
                     <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300 text-gray-400">
                       未检测到有效字段
                     </div>
                  )}
                </div>
             </div>

             {/* Right Column: Generation Controls */}
             <div className="lg:col-span-1">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-24">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    {isLocalMode ? <Zap size={18} className="text-emerald-600"/> : <Wand2 size={18} className="text-indigo-600"/>}
                    生成设置 {isLocalMode && "(Local)"}
                  </h3>
                  
                  {/* Quantity Slider */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      生成总量 (Total Quantity)
                    </label>
                    <div className="flex items-center">
                       <input 
                         type="range" 
                         min="1" 
                         max="2000" 
                         step="10"
                         value={generateCount} 
                         onChange={(e) => {
                           setGenerateCount(Number(e.target.value))
                         }}
                         className={`flex-1 mr-4 h-2 rounded-lg appearance-none cursor-pointer ${isLocalMode ? 'bg-emerald-100 accent-emerald-600' : 'bg-indigo-100 accent-indigo-600'}`}
                       />
                       <input 
                          type="number"
                          min="1"
                          max="2000"
                          value={generateCount}
                          onChange={(e) => setGenerateCount(Number(e.target.value))}
                          className="w-20 p-2 border border-gray-300 rounded text-center text-sm font-semibold"
                       />
                    </div>
                  </div>

                  <hr className="border-slate-100 my-6" />

                  {/* Grouping Strategy Helper */}
                   <div className="mb-6">
                     <button 
                       onClick={() => setShowGroupingHelper(!showGroupingHelper)}
                       className="w-full flex items-center justify-between text-sm font-medium text-slate-700 mb-2 hover:text-indigo-600 transition-colors"
                     >
                       <span className="flex items-center gap-2"><Layers size={16} /> 高级分布策略 (Grouping)</span>
                       <ChevronRight size={14} className={`transform transition-transform ${showGroupingHelper ? 'rotate-90' : ''}`} />
                     </button>
                     
                     {showGroupingHelper && (
                       <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3 text-sm animate-fade-in">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">分组依据字段 (Group By)</label>
                            <select 
                              className="w-full p-2 border border-slate-300 rounded bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                              value={groupField}
                              onChange={handleGroupFieldChange}
                            >
                              <option value="">-- 选择字段 --</option>
                              {fields.map(f => <option key={f.key} value={f.key}>{f.key}</option>)}
                            </select>
                          </div>
                          
                          <div className="relative">
                            <label className="block text-xs font-semibold text-slate-500 mb-1 flex justify-between">
                              分组值 (Values, 逗号分隔)
                              {groupValues && (
                                <span className="text-[10px] text-green-600 font-normal">已自动填充</span>
                              )}
                            </label>
                            <div className="relative">
                              <input 
                                type="text" 
                                className="w-full p-2 pr-8 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. 92, 93, 94"
                                value={groupValues}
                                onChange={(e) => setGroupValues(e.target.value)}
                              />
                              {groupValues && (
                                <button 
                                  onClick={() => setGroupValues('')}
                                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                                  title="清空"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                             <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">策略 (Strategy)</label>
                                <div className="flex gap-1 p-1 bg-slate-200 rounded">
                                  <button 
                                    onClick={() => setGroupStrategy('fixed')}
                                    className={`flex-1 py-1 rounded text-xs transition-colors ${groupStrategy === 'fixed' ? 'bg-white shadow text-indigo-700 font-medium' : 'text-slate-600 hover:text-slate-800'}`}
                                  >
                                    <Hash size={12} className="inline mr-1"/>固定
                                  </button>
                                  <button 
                                    onClick={() => setGroupStrategy('even')}
                                    className={`flex-1 py-1 rounded text-xs transition-colors ${groupStrategy === 'even' ? 'bg-white shadow text-indigo-700 font-medium' : 'text-slate-600 hover:text-slate-800'}`}
                                  >
                                    <Scale size={12} className="inline mr-1"/>平均
                                  </button>
                                </div>
                             </div>
                             <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">每组数量 (Count)</label>
                                {groupStrategy === 'fixed' ? (
                                  <input 
                                    type="number" 
                                    className="w-full p-1.5 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={countPerGroup}
                                    onChange={(e) => setCountPerGroup(Number(e.target.value))}
                                  />
                                ) : (
                                  <div className="w-full p-1.5 bg-slate-100 border border-slate-200 rounded text-slate-400 text-xs italic text-center pt-2">
                                    自动计算
                                  </div>
                                )}
                             </div>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                               <RotateCcw size={12} />
                               重置字段 (Reset these fields)
                            </label>
                            <div className="max-h-24 overflow-y-auto border border-slate-300 rounded bg-white p-2 space-y-1 custom-scrollbar">
                               {fields.map(f => (
                                 <label key={f.key} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1">
                                   <input 
                                     type="checkbox" 
                                     checked={resetFields.includes(f.key)}
                                     onChange={() => toggleResetField(f.key)}
                                     className="rounded text-indigo-600 focus:ring-indigo-500"
                                   />
                                   <span className="text-xs text-slate-700 truncate">{f.key}</span>
                                 </label>
                               ))}
                            </div>
                          </div>
                          <button 
                            onClick={applyGroupingRule}
                            disabled={!groupField || !groupValues}
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 rounded text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            应用策略配置 (Apply Configuration)
                          </button>
                       </div>
                     )}
                   </div>

                  {/* Custom Rules Input (AI Only) */}
                  <div className={`mb-6 transition-opacity ${isLocalMode ? 'opacity-50 pointer-events-none' : ''}`}>
                     <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                       <FileText size={16} />
                       自定义规则 (Custom Rules)
                       {isLocalMode && <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">仅 AI 模式</span>}
                     </label>
                     <textarea 
                        className="w-full h-40 p-3 text-xs border border-slate-300 rounded-md focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                        placeholder="在此输入额外的生成逻辑 (仅在 AI 模式下生效)..."
                        value={customInstructions}
                        onChange={(e) => {
                          setCustomInstructions(e.target.value);
                          if (!isLocalMode) setGeneratedCode("");
                        }}
                        disabled={isLocalMode}
                     />
                  </div>

                  <div className="flex gap-2">
                     <button
                        onClick={() => handleGenerate(false)}
                        disabled={isGenerating || fields.length === 0}
                        className={`flex-1 px-4 py-3 rounded-lg font-bold flex justify-center items-center gap-2 transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:shadow-none ${
                          isLocalMode 
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                            : generatedCode 
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                                : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}
                      >
                        {isGenerating ? (
                          <>
                            <RefreshCw className="animate-spin" size={18} /> 
                            {isLocalMode ? "生成中..." : (generatedCode ? "执行中..." : "编写中...")}
                          </>
                        ) : isLocalMode ? (
                           <>
                             <Zap size={18} /> 极速生成 (Local)
                           </>
                        ) : generatedCode ? (
                          <>
                            <Zap size={18} /> ⚡ 快速生成 (Cached)
                          </>
                        ) : (
                          <>
                            <Wand2 size={18} /> 智能生成 (AI)
                          </>
                        )}
                      </button>
                      
                      {!isLocalMode && generatedCode && !isGenerating && (
                        <button
                          onClick={() => handleGenerate(true)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded-lg border border-slate-200 shadow-sm"
                          title="强制重新生成逻辑 (Force Regenerate Logic)"
                        >
                          <RefreshCw size={18} />
                        </button>
                      )}
                  </div>
                  

                  <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
                    {isLocalMode ? (
                      <>
                        <Zap size={12} className="text-emerald-500"/>
                        <span className="text-emerald-600 font-medium">不消耗 AI Token，离线可用</span>
                      </>
                    ) : generatedCode ? (
                      <>
                        <Sparkles size={12} className="text-emerald-500"/>
                        <span className="text-emerald-600 font-medium">逻辑已缓存 (动态参数)</span>
                        <span className="text-slate-300">|</span>
                        <span>调整数量/策略无需消耗Token</span>
                      </>
                    ) : (
                      <span>采用代码生成模式，逻辑更严谨</span>
                    )}
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* STEP 3: RESULT */}
        {step === Step.RESULT && (
          <div className="animate-fade-in flex flex-col h-[calc(100vh-140px)]">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4">
                <button onClick={() => setStep(Step.CONFIGURE)} className="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                   ← 修改配置
                </button>
                <button onClick={handleReset} className="text-sm text-slate-500 hover:text-red-600 flex items-center gap-1 ml-2">
                   <Home size={16} /> 回到首页
                </button>
                <div className="h-4 w-px bg-slate-300 mx-1"></div>
                <h2 className="text-xl font-bold text-slate-800">生成结果 ({generatedData.length} 条)</h2>
                {generatedCode && (
                  <button 
                    onClick={() => setShowCodeModal(true)}
                    className="ml-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full flex items-center gap-1 transition-colors border border-slate-200"
                  >
                    <Code size={12} /> {isLocalMode ? "查看本地逻辑" : "查看生成代码"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowTemplateModal(true)} className="bg-white hover:bg-orange-50 text-orange-600 border border-orange-200 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <Save size={16} /> 保存模板
                </button>
                <div className="w-px h-8 bg-slate-300 mx-2"></div>
                <button onClick={handleCopy} className="bg-white hover:bg-gray-50 text-slate-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <Copy size={16} /> 复制 JSON
                </button>
                <button onClick={handleDownload} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                  <Download size={16} /> 下载文件
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden relative group">
              <pre className="custom-scrollbar w-full h-full p-6 text-sm font-mono text-green-400 overflow-auto">
                {JSON.stringify(generatedData, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Save Template Modal */}
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800">保存生成配置</h3>
                </div>
                <div className="p-6">
                  <label className="block text-sm font-medium text-slate-700 mb-2">模板名称</label>
                  <input 
                    type="text"
                    autoFocus
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="例如: 游戏奖励配置 V1"
                    value={newTemplateName}
                    onChange={e => setNewTemplateName(e.target.value)}
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    这将保存当前的 JSON 样本、字段配置、自定义规则以及本次生成的逻辑代码。
                  </p>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-3">
                   <button 
                     onClick={() => setShowTemplateModal(false)}
                     className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
                   >
                     取消
                   </button>
                   <button 
                     onClick={handleSaveTemplate}
                     disabled={!newTemplateName.trim()}
                     className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                   >
                     确认保存
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* Reset Confirmation Modal */}
        {showResetModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <AlertCircle className="text-red-500" size={20} />
                    确认重置
                  </h3>
                </div>
                <div className="p-6">
                  <p className="text-sm text-slate-600">
                    确定要回到首页吗？当前的所有配置和生成结果都将丢失。
                  </p>
                </div>
                <div className="p-4 bg-slate-50 flex justify-end gap-3">
                   <button 
                     onClick={() => setShowResetModal(false)}
                     className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors"
                   >
                     取消
                   </button>
                   <button 
                     onClick={confirmReset}
                     className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
                   >
                     确认重置
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* View Code Modal */}
        {showCodeModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Code size={20} className="text-indigo-600"/>
                    {isLocalMode ? "本地生成说明 (Local Mode Info)" : "AI 生成逻辑代码 (Generated JS)"}
                  </h3>
                  <button onClick={() => setShowCodeModal(false)} className="text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>
                <div className="flex-1 bg-slate-900 overflow-auto p-4 custom-scrollbar">
                   <pre className="text-xs sm:text-sm font-mono text-blue-300 leading-relaxed whitespace-pre-wrap">
                     {generatedCode}
                   </pre>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                   <button 
                     onClick={() => setShowCodeModal(false)}
                     className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                   >
                     关闭 (Close)
                   </button>
                </div>
             </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
