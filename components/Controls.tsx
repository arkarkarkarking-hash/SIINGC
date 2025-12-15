import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  unit?: string;
}

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step = 1, onChange, unit }) => (
  <div className="flex flex-col gap-1 w-full">
    <div className="flex justify-between text-xs text-slate-400">
      <span>{label}</span>
      <span>{value > 0 ? '+' : ''}{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
    />
  </div>
);

export const Knob: React.FC<SliderProps> = ({ label, value, min, max, onChange }) => {
  // Simplified Knob as a vertical slider for easier web implementation, 
  // or just a circular styled slider. Let's use a standard slider but styled densely.
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</div>
       <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-24 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
      />
      <div className="text-xs text-slate-500">{(value * 100).toFixed(0)}%</div>
    </div>
  );
};