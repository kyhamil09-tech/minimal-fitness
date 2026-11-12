import React from 'react';
import { X, Check, EyeOff, RotateCcw } from 'lucide-react';
import { MetricKey } from '../types/health';
import { METRIC_CONFIGS } from '../data/catalog';
import { ColorPalette } from '../types/theme';

interface TabEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  enabledMetrics: Set<MetricKey>;
  onToggleMetric: (key: MetricKey) => void;
  onResetDefaults: () => void;
  theme: ColorPalette;
}

export const TabEditorModal: React.FC<TabEditorModalProps> = ({
  isOpen,
  onClose,
  enabledMetrics,
  onToggleMetric,
  onResetDefaults,
  theme,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customize dashboard"
        className="relative w-full max-w-lg border rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto no-scrollbar"
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.surfaceBorder,
        }}
      >
        {/* Mobile Drag Indicator */}
        <div className="w-12 h-1 bg-neutral-800 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1A1E26]">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">Customize Dashboard</h3>
            <p className="text-xs text-[#9AA3B2]">
              Silence or hide metrics you do not want to see.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metric Toggles List */}
        <div className="mt-4 divide-y divide-[#1A1E26]">
          {METRIC_CONFIGS.map((metric) => {
            const isChecked = enabledMetrics.has(metric.id);

            return (
              <div
                key={metric.id}
                onClick={() => onToggleMetric(metric.id)}
                className="py-3.5 flex items-start justify-between gap-4 cursor-pointer group hover:bg-black/40 px-2 rounded-xl transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-semibold transition-colors"
                      style={{ color: isChecked ? '#FFFFFF' : '#CBD5E1' }}
                    >
                      {metric.label}
                    </span>
                    <span className="text-xs text-[#9AA3B2] uppercase tracking-wider font-mono">
                      {metric.category}
                    </span>
                  </div>
                  <p className="text-xs text-[#9AA3B2] leading-relaxed">
                    {metric.description}
                  </p>
                </div>

                {/* Sleek Material 3 Bubble Checkbox */}
                <button
                  type="button"
                  aria-label={`Toggle ${metric.label}`}
                  className="mt-1 w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all"
                  style={{
                    backgroundColor: isChecked ? theme.primary : 'transparent',
                    borderColor: isChecked ? theme.primary : '#333B4A',
                    boxShadow: isChecked ? `0 0 10px ${theme.primaryGlow}` : undefined,
                  }}
                >
                  {isChecked ? (
                    <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Summary note */}
        <div className="mt-4 p-3 rounded-xl bg-black/60 border border-[#1A1E26] text-xs text-[#9AA3B2] flex items-center justify-between">
          <span>{enabledMetrics.size} of {METRIC_CONFIGS.length} widgets active</span>
          <button
            onClick={onResetDefaults}
            className="flex items-center gap-1 text-xs hover:underline"
            style={{ color: theme.primary }}
          >
            <RotateCcw className="w-3 h-3" />
            Reset Defaults
          </button>
        </div>

        {/* Bottom Apply CTA */}
        <div className="mt-5">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl text-black font-bold text-sm tracking-wide transition-opacity hover:opacity-90 shadow-lg"
            style={{
              backgroundColor: theme.primary,
              boxShadow: `0 0 20px ${theme.primaryGlow}`,
            }}
          >
            Apply to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

