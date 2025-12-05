

import React from 'react';
import { FieldConfig, GenerationStrategy, FieldType } from '../types';
import { Trash2, Settings } from 'lucide-react';

interface SchemaRowProps {
  field: FieldConfig;
  onChange: (updatedField: FieldConfig) => void;
  onDelete: () => void;
}

const STRATEGY_LABELS: Record<GenerationStrategy, string> = {
  [GenerationStrategy.INCREMENT]: '自增序列 (Increment)',
  [GenerationStrategy.RANDOM_INT]: '随机整数 (Random Int)',
  [GenerationStrategy.RANDOM_FLOAT]: '随机浮点 (Random Float)',
  [GenerationStrategy.ENUM]: '枚举 (Enum)',
  [GenerationStrategy.UUID]: 'UUID',
  [GenerationStrategy.NAME]: '人名 (Name)',
  [GenerationStrategy.EMAIL]: '邮箱 (Email)',
  [GenerationStrategy.DATE]: '日期 (Date)',
  [GenerationStrategy.ADDRESS]: '地址 (Address)',
  [GenerationStrategy.PHONE]: '电话 (Phone)',
  [GenerationStrategy.SENTENCE]: '短句 (Sentence)',
  [GenerationStrategy.STATIC]: '固定值 (Static)',
  [GenerationStrategy.REGEX]: '正则 (Regex)',
  [GenerationStrategy.AI_CONTEXT]: '智能生成 (AI Context)',
};

export const SchemaRow: React.FC<SchemaRowProps> = ({ field, onChange, onDelete }) => {
  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStrategy = e.target.value as GenerationStrategy;
    let newOptions = { ...field.options };

    // Auto-fill static value from sample if available and currently empty
    // This prevents the field from being ignored or undefined when switching to 'Static'
    if (newStrategy === GenerationStrategy.STATIC && 
        (newOptions.staticValue === undefined || newOptions.staticValue === '') && 
        field.sampleValue !== undefined) {
      newOptions.staticValue = field.sampleValue;
    }

    onChange({ ...field, strategy: newStrategy, options: newOptions });
  };

  const handleOptionChange = (key: string, value: any) => {
    onChange({
      ...field,
      options: { ...field.options, [key]: value }
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4 flex-wrap md:flex-nowrap">
        {/* Field Name & Type */}
        <div className="w-full md:w-1/4">
          <label className="block text-xs font-semibold text-gray-500 mb-1">字段名 (Field)</label>
          <div className="font-mono text-sm font-bold text-gray-800 bg-gray-50 p-2 rounded border border-gray-200 truncate" title={field.key}>
            {field.key}
          </div>
          <div className="mt-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              field.type === FieldType.NUMBER ? 'bg-blue-100 text-blue-700' :
              field.type === FieldType.BOOLEAN ? 'bg-purple-100 text-purple-700' :
              'bg-green-100 text-green-700'
            }`}>
              {field.type}
            </span>
          </div>
        </div>

        {/* Strategy Selector */}
        <div className="w-full md:w-1/4">
          <label className="block text-xs font-semibold text-gray-500 mb-1">生成策略 (Strategy)</label>
          <select 
            value={field.strategy} 
            onChange={handleStrategyChange}
            className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
          >
            {Object.entries(STRATEGY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {field.description && (
             <p className="text-[10px] text-gray-400 mt-1 line-clamp-2" title={field.description}>{field.description}</p>
          )}
        </div>

        {/* Dynamic Options */}
        <div className="w-full md:w-2/5 grid grid-cols-2 gap-2">
          {field.strategy === GenerationStrategy.ENUM && (
             <div className="col-span-2">
               <label className="block text-xs font-semibold text-gray-500 mb-1">枚举值 (逗号分隔)</label>
               <input 
                  type="text" 
                  className="w-full text-sm border-gray-300 rounded-md p-2 border"
                  value={field.options?.values?.join(', ') || ''}
                  onChange={(e) => handleOptionChange('values', e.target.value.split(',').map(s => s.trim()))}
               />
             </div>
          )}

          {(field.strategy === GenerationStrategy.RANDOM_INT || field.strategy === GenerationStrategy.RANDOM_FLOAT) && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">最小值 (Min)</label>
                <input 
                  type="number" 
                  className="w-full text-sm border-gray-300 rounded-md p-2 border"
                  value={field.options?.min ?? ''}
                  onChange={(e) => handleOptionChange('min', parseFloat(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">最大值 (Max)</label>
                <input 
                  type="number" 
                  className="w-full text-sm border-gray-300 rounded-md p-2 border"
                  value={field.options?.max ?? ''}
                  onChange={(e) => handleOptionChange('max', parseFloat(e.target.value))}
                />
              </div>
            </>
          )}

          {field.strategy === GenerationStrategy.RANDOM_FLOAT && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">精度 (Precision)</label>
              <input 
                type="number" 
                min="0"
                max="10"
                className="w-full text-sm border-gray-300 rounded-md p-2 border"
                value={field.options?.precision ?? 2}
                onChange={(e) => handleOptionChange('precision', parseInt(e.target.value))}
              />
            </div>
          )}
           
           {field.strategy === GenerationStrategy.INCREMENT && (
             <>
               <div>
                 <label className="block text-xs font-semibold text-gray-500 mb-1">初始值 (Start)</label>
                 <input 
                   type="number" 
                   className="w-full text-sm border-gray-300 rounded-md p-2 border"
                   value={field.options?.start ?? 1}
                   onChange={(e) => handleOptionChange('start', parseFloat(e.target.value))}
                 />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-500 mb-1">步长 (Step)</label>
                 <input 
                   type="number" 
                   className="w-full text-sm border-gray-300 rounded-md p-2 border"
                   value={field.options?.step ?? 1}
                   onChange={(e) => handleOptionChange('step', parseFloat(e.target.value))}
                 />
               </div>
             </>
           )}

           {field.strategy === GenerationStrategy.STATIC && (
             <div className="col-span-2">
               <label className="block text-xs font-semibold text-gray-500 mb-1">固定值 (Value)</label>
               {field.type === FieldType.BOOLEAN ? (
                 <select
                    className="w-full text-sm border-gray-300 rounded-md p-2 border"
                    value={String(field.options?.staticValue ?? 'true')}
                    onChange={(e) => handleOptionChange('staticValue', e.target.value === 'true')}
                 >
                   <option value="true">True</option>
                   <option value="false">False</option>
                 </select>
               ) : field.type === FieldType.NUMBER ? (
                 <input 
                   type="number" 
                   className="w-full text-sm border-gray-300 rounded-md p-2 border"
                   value={field.options?.staticValue ?? ''}
                   onChange={(e) => handleOptionChange('staticValue', e.target.value)}
                   placeholder="Enter a number..."
                 />
               ) : (
                 <input 
                   type="text" 
                   className="w-full text-sm border-gray-300 rounded-md p-2 border"
                   value={field.options?.staticValue ?? ''}
                   onChange={(e) => handleOptionChange('staticValue', e.target.value)}
                   placeholder="Enter text..."
                 />
               )}
             </div>
           )}

          {field.strategy === GenerationStrategy.REGEX && (
             <div className="col-span-2">
               <label className="block text-xs font-semibold text-gray-500 mb-1">正则表达式 (Pattern)</label>
               <input 
                  type="text" 
                  className="w-full text-sm border-gray-300 rounded-md p-2 border font-mono"
                  placeholder="e.g. ^[A-Z]{3}-\d{3}$"
                  value={field.options?.pattern || ''}
                  onChange={(e) => handleOptionChange('pattern', e.target.value)}
               />
             </div>
          )}

          {field.strategy === GenerationStrategy.DATE && (
             <div className="col-span-2">
               <label className="block text-xs font-semibold text-gray-500 mb-1">日期格式 (Format)</label>
               <input 
                  type="text" 
                  className="w-full text-sm border-gray-300 rounded-md p-2 border font-mono"
                  placeholder="YYYY-MM-DD"
                  value={field.options?.format || ''}
                  onChange={(e) => handleOptionChange('format', e.target.value)}
               />
             </div>
          )}
        </div>

        {/* Actions */}
        <div className="w-full md:w-auto flex justify-end md:items-center mt-2 md:mt-6">
           <button 
             onClick={onDelete}
             className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded transition-colors"
             title="删除字段"
           >
             <Trash2 size={18} />
           </button>
        </div>
      </div>
    </div>
  );
};