import React, { useState } from 'react';
import { ChevronLeft, Globe } from 'lucide-react';
import { importRecipe } from '../../lib/recipeFetch';
import { useT } from '../../lib/i18n';
import type { WebRecipe } from '../../lib/recipeExtract';
import { FoodRecord, displayName } from '../../lib/foodDb';
import type { RecipeIngredient } from '../../lib/recipe';
import { Amount, ParsedLine, amountFor, ingredientLines, parseIngredientLine, parseServings, toIngredient } from '../../lib/recipeText';

interface Row {
  line: ParsedLine;
  options: FoodRecord[];
  /** Index into options, or -1 to leave the line out. */
  pick: number;
  grams: number;
  servings?: number;
  approx: boolean;
}

interface Props {
  findFoods: (query: string) => FoodRecord[];
  onBack: () => void;
  onImport: (items: RecipeIngredient[], servings?: number, name?: string) => void;
  /** Servings the recipe has so far, used when a site's nutrition is per serving and the page does not say how many it makes. */
  defaultServings?: number;
}

const make = (line: ParsedLine, options: FoodRecord[], pick: number): Row => {
  const rec = options[pick];
  const a: Amount = rec ? amountFor(rec, line) : { grams: 0, approx: false };
  return { line, options, pick, grams: a.grams, servings: a.servings, approx: a.approx };
};

/**
 * Paste the ingredient list of a recipe (copy it from any website or message) and the phone turns each line into a food and an amount.
 * Every line can be changed or left out before it is added. Nothing is fetched: it works on the text you pasted.
 */
export const RecipePaste: React.FC<Props> = ({ findFoods, onBack, onImport, defaultServings = 4 }) => {
  const t = useT();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [site, setSite] = useState<WebRecipe | null>(null);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [servings, setServings] = useState<number | undefined>();

  const read = (source: string = text, known?: number) => {
    const parsed = ingredientLines(source).map(parseIngredientLine);
    setServings(known ?? parseServings(source));
    setRows(
      parsed.map((p) => {
        // Foods that are weighed come before per-serving ones, and names that begin with the words typed before names that only contain them.
        const want = p.name.toLowerCase();
        const rank = (o: FoodRecord) => (o.perServing ? 2 : 0) + (displayName(o).toLowerCase().startsWith(want) ? 0 : 1);
        const options = p.name ? [...findFoods(p.name)].sort((a, b) => rank(a) - rank(b)).slice(0, 6) : [];
        // Lines with no amount ("salt, to taste") start left out; so do lines with no match.
        return make(p, options, options.length > 0 && !p.noAmount ? 0 : -1);
      })
    );
  };

  const fetchIt = async () => {
    setBusy(true);
    setErr('');
    const r = await importRecipe(url);
    setBusy(false);
    if (!r.ok) {
      setErr(r.errorKey ? t(r.errorKey) : (r.error ?? ''));
      return;
    }
    setSite(r.recipe);
    const body = r.recipe.lines.join('\n');
    setText(body);
    read(body, r.recipe.servings);
  };

  /** The site's own per-serving numbers, for the whole recipe, as one ingredient. */
  const useSiteNumbers = () => {
    const n = site?.nutrition;
    if (!n) return;
    const s = servings ?? defaultServings;
    onImport(
      [{ name: site?.name || 'Recipe', amount: `${s}`, kcal: n.kcal * s, p: n.p * s, c: n.c * s, f: n.f * s, fiber: n.fiber ? n.fiber * s : undefined, sugar: n.sugar ? n.sugar * s : undefined, sodium: n.sodium ? n.sodium * s : undefined }],
      s,
      site?.name
    );
  };

  const setPick = (i: number, pick: number) => setRows((rs) => rs && rs.map((r, j) => (j === i ? make(r.line, r.options, pick) : r)));
  const setGrams = (i: number, grams: number) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, grams, approx: false, servings: undefined } : r)));

  const chosen = rows?.filter((r) => r.pick >= 0) ?? [];
  const add = () => {
    const items = chosen.map((r) => toIngredient(r.options[r.pick], r.line, { grams: r.grams, approx: r.approx, servings: r.servings }));
    onImport(items, servings, site?.name);
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col slide-in" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-3 px-4 pt-1 pb-2">
        <button aria-label={t('common.back')} onClick={rows ? () => setRows(null) : onBack} className="round-btn !w-10 !h-10">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--ink)' }}>
          {rows ? t('rcp.title.check') : t('rcp.title.import')}
        </h2>
      </div>
      {!rows ? (
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.5rem))] space-y-3">
          <div className="rounded-2xl border p-3 space-y-2" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)' }}>
            <label htmlFor="recipe-url" className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--ink)' }}>
              <Globe className="w-4 h-4" style={{ color: 'var(--accent)' }} /> {t('rcp.fromWeb')}
            </label>
            <input
              id="recipe-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoCapitalize="off"
              autoComplete="off"
              placeholder={t('rcp.urlPlaceholder')}
              className="w-full rounded-xl border px-3 py-3 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
            />
            <button onClick={fetchIt} disabled={busy || !url.trim()} className="w-full py-3 rounded-xl text-sm font-extrabold disabled:opacity-40" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
              {busy ? t('rcp.getting') : t('rcp.get')}
            </button>
            {err && (
              <p role="alert" className="text-xs" style={{ color: 'var(--g-red, #ff6b6b)' }}>
                {err}
              </p>
            )}
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
              {t('rcp.privacy')}
            </p>
          </div>
          <p className="text-xs leading-relaxed pt-1" style={{ color: 'var(--ink-dim)' }}>
            {t('rcp.orPaste')}
          </p>
          <textarea
            aria-label={t('rcp.title.check')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'2 cups all-purpose flour\n1 tsp salt\n3 large eggs\n200 g butter, melted'}
            className="w-full h-64 rounded-2xl border p-3 text-sm outline-none resize-none"
            style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
          />
          <button onClick={() => read()} disabled={ingredientLines(text).length === 0} className="w-full py-3.5 rounded-2xl text-sm font-extrabold disabled:opacity-40" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
            {t('rcp.read')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-28 space-y-2.5">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
              {site?.name ? `${site.name}: ` : ''}
              {t('rcp.matched', { n: chosen.length, total: rows.length })}
              {servings ? ` ${t('rcp.makes', { n: servings })}` : ''}
            </p>
            {site?.nutrition && (
              <button onClick={useSiteNumbers} className="w-full rounded-2xl border px-3 py-3 text-left text-xs font-bold" style={{ borderColor: 'var(--hairline-strong)', color: 'var(--ink)' }}>
                {t('rcp.useSite', { kcal: Math.round(site.nutrition.kcal) })}
                <span className="block font-normal" style={{ color: 'var(--ink-dim)' }}>
                  {t('rcp.useSiteNote')}
                </span>
              </button>
            )}
            {rows.map((r, i) => (
              <div key={i} className="rounded-2xl border p-3 space-y-2" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--hairline)', opacity: r.pick < 0 ? 0.8 : 1 }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                  {r.line.raw}
                </div>
                <select
                  aria-label={r.line.raw}
                  value={r.pick}
                  onChange={(e) => setPick(i, parseInt(e.target.value, 10))}
                  className="w-full rounded-xl border px-2 py-2 text-xs"
                  style={{ backgroundColor: 'var(--bg)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
                >
                  <option value={-1}>{r.options.length ? t('rcp.leaveOut') : t('rcp.noMatch')}</option>
                  {r.options.map((o, j) => (
                    <option key={o.id + j} value={j}>
                      {displayName(o)}
                    </option>
                  ))}
                </select>
                {r.pick >= 0 && r.servings === undefined && (
                  <label className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--ink-dim)' }}>
                    <span>{r.approx ? t('rcp.gramsGuess') : t('rcp.grams')}</span>
                    <input
                      aria-label={`${t('rcp.grams')}: ${r.line.raw}`}
                      inputMode="decimal"
                      value={String(Math.round(r.grams * 10) / 10)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setGrams(i, Math.max(0, parseFloat(e.target.value.replace(',', '.')) || 0))}
                      className="w-24 rounded-xl border px-2 py-1.5 text-right text-sm"
                      style={{ backgroundColor: 'var(--bg)', borderColor: r.approx ? 'var(--g-yellow)' : 'var(--hairline)', color: 'var(--ink)' }}
                    />
                  </label>
                )}
                {r.pick >= 0 && r.servings !== undefined && (
                  <div className="text-xs" style={{ color: 'var(--ink-dim)' }}>
                    {t('rcp.counted', { n: r.servings })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ background: 'linear-gradient(to top, var(--bg) 55%, transparent)' }}>
            <button onClick={add} disabled={chosen.length === 0} className="w-full py-3.5 rounded-2xl text-sm font-extrabold disabled:opacity-40" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>
              {t('rcp.add', { n: chosen.length })}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
