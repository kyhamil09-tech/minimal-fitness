import React from 'react';
import { AlertTriangle, ChevronRight, Lightbulb, Sparkles, TrendingUp } from 'lucide-react';
import { ColorPalette } from '../types/theme';
import { Insight } from '../lib/insights';

const TONE = { good: '#6EE7B7', neutral: '#8AB4F8', warn: '#FBBF24', bad: '#FB7185' } as const;
const CONF_TEXT = { early: 'Early sign', likely: 'Likely', strong: 'Strong' } as const;

const KindIcon: React.FC<{ kind: Insight['kind']; color: string }> = ({ kind, color }) =>
  kind === 'alert' ? <AlertTriangle className="w-4 h-4" style={{ color }} /> : kind === 'positive' ? <TrendingUp className="w-4 h-4" style={{ color }} /> : <Lightbulb className="w-4 h-4" style={{ color }} />;

export const InsightCard: React.FC<{ insight: Insight }> = ({ insight }) => {
  const color = TONE[insight.tone];
  return (
    <div className="rounded-2xl glass-inset p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}1f` }}>
          <KindIcon kind={insight.kind} color={color} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white leading-snug">{insight.title}</div>
          <p className="text-[12px] text-neutral-400 mt-1 leading-relaxed">{insight.detail}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
            <span className="px-2 py-0.5 rounded-full border border-white/10">{CONF_TEXT[insight.confidence]}</span>
            {insight.kind === 'pattern' && <span>based on {insight.n}+ days</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

interface PanelProps {
  theme: ColorPalette;
  insights: Insight[];
  data: { nights: number; workouts: number; checkIns: number; ready: boolean };
}

/** Everything the insights engine found, with an honest note on how it works. */
export const InsightsPanel: React.FC<PanelProps> = ({ theme, insights, data }) => (
  <div className="space-y-3">
    <section className="rounded-3xl border p-5" style={{ backgroundColor: theme.surface, borderColor: theme.surfaceBorder }}>
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4" style={{ color: theme.primary }} />
        <h3 className="gh-title" style={{ fontSize: '1.05rem' }}>What your data says</h3>
      </div>
      <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
        Patterns found in your own sleep, heart rate, training and fasting. Worked out on this phone; nothing is uploaded.
      </p>
      {insights.length === 0 && (
        <div className="mt-4 rounded-2xl glass-inset p-4 text-xs text-neutral-300 leading-relaxed">
          {data.ready
            ? 'Nothing stands out yet, which usually means your habits and results are steady. New patterns appear as more days build up.'
            : `Not enough history yet. This needs about 2 weeks of nights or 10 workouts, or 6 fasting check-ins. So far: ${data.nights} nights, ${data.workouts} workouts, ${data.checkIns} check-ins.`}
        </div>
      )}
      <div className="mt-4 space-y-3">
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </div>
    </section>
    <p className="text-xs text-neutral-400 px-2 leading-relaxed">
      How it works: your days are split into two groups (for example nights under 6.5 hours against longer ones) and a result is compared between them. A pattern shows only when each
      group has at least 4 days and the gap is unlikely to be chance. These are patterns in your numbers, not proof of cause, and not medical advice.
    </p>
  </div>
);

/** The best single insight, for Home. */
export const TopInsightCard: React.FC<{ theme: ColorPalette; insight: Insight; onOpen: () => void }> = ({ theme, insight, onOpen }) => {
  const color = TONE[insight.tone];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl border px-4 py-3.5"
      style={{ backgroundColor: theme.surface, borderColor: insight.kind === 'alert' ? `${color}66` : theme.surfaceBorder }}
    >
      <div className="flex items-center justify-between">
        <span className="stat-label flex items-center gap-1.5">
          <KindIcon kind={insight.kind} color={color} /> {insight.kind === 'alert' ? 'Heads up' : 'Insight'}
        </span>
        <span className="text-xs text-neutral-400 flex items-center gap-0.5">
          All insights <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="mt-2 text-[15px] font-bold text-white leading-snug">{insight.title}</div>
    </button>
  );
};
