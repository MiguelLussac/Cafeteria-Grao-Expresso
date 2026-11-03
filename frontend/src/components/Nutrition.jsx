// Componentes de informação nutricional (docs/design/Grão Expresso (2).pdf).
// Informativo, nunca julgador: todo valor vem com o selo "Estimado por IA" por
// perto e nenhum estado bloqueia o pedido.
import { useId, useState } from 'react'
import { ChevronDown, Info, Sparkles } from 'lucide-react'
import {
  MACROS, formatAmount, formatInteger, formatServing, macroShares, nutritionState, orderNutrition,
  referenceDietPercent, REFERENCE_DIET_KCAL,
} from '../utils/nutrition'

const AI_EXPLANATION = 'Valores médios da porção, estimados por IA a partir de receitas típicas. Podem variar conforme o preparo.'

// variant: 'pill' (cards e resumo) | 'text' (linhas densas: tabela, admin)
export function AiBadge({ variant = 'pill', label = 'Estimado por IA', withInfo = false }) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  return (
    <span className={`ai-badge ai-badge-${variant}`}>
      <Sparkles size={12} aria-hidden="true" />
      {label}
      {withInfo && (
        <span className="ai-badge-info">
          <button type="button" aria-expanded={open} aria-describedby={open ? tipId : undefined}
            aria-label="O que significa estimado por IA?" onClick={() => setOpen((v) => !v)}
            onBlur={() => setOpen(false)}>
            <Info size={14} aria-hidden="true" />
          </button>
          {open && <span role="tooltip" id={tipId} className="ai-tooltip">{AI_EXPLANATION}</span>}
        </span>
      )}
    </span>
  )
}

// Chip de calorias do produto, com os estados "Calculando…" e "Indisponível".
export function KcalChip({ product, short = false }) {
  const state = nutritionState(product)
  if (state === 'pending') {
    return (
      <span className="kcal-chip kcal-chip-pending" role="status">
        <Sparkles size={12} aria-hidden="true" />
        {short ? 'Calculando informação…' : 'Calculando informação nutricional…'}
      </span>
    )
  }
  if (state === 'unavailable') {
    return (
      <span className="kcal-chip kcal-chip-unavailable">
        {short ? 'Nutrição indisponível' : 'Informação nutricional indisponível'}
      </span>
    )
  }
  return <KcalPill kcal={product.nutrition.calories_kcal} detail={formatServing(product.nutrition)} />
}

// Pílula "130 kcal · 240 ml" / "260 kcal 2 × 130 kcal".
export function KcalPill({ kcal, detail, separator = '·' }) {
  return (
    <span className="kcal-chip">
      <strong>{formatInteger(kcal)} kcal</strong>
      {detail && <span>{separator === '·' ? `· ${detail}` : detail}</span>}
    </span>
  )
}

export function MacroBar({ totals }) {
  const shares = macroShares(totals)
  return (
    <div className="macro-bar" aria-hidden="true">
      {MACROS.map((m, i) => shares[i] > 0 && (
        <span key={m.key} className={m.className} style={{ flexGrow: shares[i] }} />
      ))}
    </div>
  )
}

// variant: 'full' (resumo do pedido) | 'compact' (P/C/G em uma linha)
export function MacroLegend({ totals, variant = 'full' }) {
  if (variant === 'compact') {
    return (
      <span className="macro-compact">
        {MACROS.map((m) => (
          <span key={m.key} aria-label={`${m.label.toLowerCase()} ${formatInteger(totals[m.key])} gramas`}>
            <i className={`macro-dot ${m.className}`} aria-hidden="true" />
            <span aria-hidden="true">{m.short} {formatInteger(totals[m.key])} g</span>
          </span>
        ))}
      </span>
    )
  }
  const shares = macroShares(totals)
  return (
    <ul className="macro-legend">
      {MACROS.map((m, i) => (
        <li key={m.key} className={m.className}>
          <i className={`macro-dot ${m.className}`} aria-hidden="true" />
          <span className="macro-legend-label">{m.label}</span>
          <strong>{formatInteger(totals[m.key])} g</strong>
          <small>{shares[i]}% <span className="macro-legend-suffix">das kcal</span></small>
        </li>
      ))}
    </ul>
  )
}

// "Tabela nutricional" expansível do card do cardápio.
export function NutritionDisclosure({ nutrition }) {
  return (
    <details className="nutrition-disclosure">
      <summary>
        <span className="nutrition-disclosure-title">
          <ChevronDown size={16} aria-hidden="true" />
          Tabela nutricional
        </span>
        <MacroLegend totals={nutrition} variant="compact" />
      </summary>
      <p className="nutrition-serving">Porção média: {formatServing(nutrition)}</p>
      <dl className="nutrition-table">
        <div>
          <dt>Energia</dt>
          <dd>{formatInteger(nutrition.calories_kcal)} kcal</dd>
        </div>
        {MACROS.map((m) => (
          <div key={m.key}>
            <dt><i className={`macro-dot ${m.className}`} aria-hidden="true" />{m.label}</dt>
            <dd>{formatAmount(nutrition[m.key])} g</dd>
          </div>
        ))}
      </dl>
      <p className="ai-note">
        {nutrition.source === 'manual'
          ? 'Valores médios informados pela equipe. Podem variar conforme o preparo.'
          : <><Sparkles size={12} aria-hidden="true" />Valores médios estimados por IA. Podem variar conforme o preparo.</>}
      </p>
    </details>
  )
}

function ItemsTable({ rows, totals }) {
  return (
    <div className="nutrition-items">
      <table>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="num">Qtd</th>
            <th scope="col" className="num">kcal</th>
            {MACROS.map((m) => (
              <th key={m.key} scope="col" className="num"><abbr title={m.label}>{m.short}</abbr> (g)</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              <td className="num">{row.quantity}</td>
              <td className="num"><strong>{formatInteger(row.calories_kcal)}</strong></td>
              {MACROS.map((m) => <td key={m.key} className="num">{formatInteger(row[m.key])}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td />
            <td className="num">{formatInteger(totals.calories_kcal)}</td>
            {MACROS.map((m) => <td key={m.key} className="num">{formatInteger(totals[m.key])}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function joinNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
}

// Resumo nutricional do pedido. items: [{ name, quantity, nutrition }].
// collapsible: no mobile o cabeçalho abre e fecha o bloco (aberto por padrão).
export function NutritionSummary({ items, collapsible = false }) {
  const summary = orderNutrition(items)
  const [open, setOpen] = useState(true)
  const [showItems, setShowItems] = useState(false)
  const bodyId = useId()

  if (summary.status === 'empty') {
    return (
      <section className="nutrition-summary nutrition-summary-empty" aria-label="Resumo nutricional">
        <Info size={18} aria-hidden="true" />
        <div>
          <strong>Informação nutricional indisponível</strong>
          <p>Não conseguimos estimar os itens deste pedido. O pagamento segue normalmente.</p>
        </div>
      </section>
    )
  }

  const { totals, missing } = summary
  const partial = summary.status === 'partial'
  const percent = referenceDietPercent(totals.calories_kcal)

  return (
    <section className="card nutrition-summary" aria-labelledby={`${bodyId}-title`}>
      <header className="nutrition-summary-head">
        <h2 id={`${bodyId}-title`}>Resumo nutricional</h2>
        <AiBadge />
        {collapsible && (
          <button type="button" className="nutrition-summary-toggle" aria-expanded={open} aria-controls={bodyId}
            aria-label={open ? 'Recolher resumo nutricional' : 'Abrir resumo nutricional'} onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={20} aria-hidden="true" />
          </button>
        )}
      </header>

      <div id={bodyId} hidden={collapsible && !open}>
        {partial && (
          <span className="partial-chip">Parcial · {summary.counted} de {summary.count} itens</span>
        )}
        <p className="nutrition-summary-kcal">
          {formatInteger(totals.calories_kcal)} kcal
          {partial && <small>parcial</small>}
        </p>
        <p className="nutrition-summary-ref">
          {partial && `Sem ${joinNames(missing)} · `}
          ≈ {percent}% de {partial ? '' : 'uma dieta de referência de '}
          {formatInteger(REFERENCE_DIET_KCAL)} kcal
          {!partial && <span className="nutrition-summary-ref-extra"> · necessidades variam de pessoa para pessoa</span>}
        </p>

        <MacroBar totals={totals} />
        <MacroLegend totals={totals} />

        {partial && (
          <p className="nutrition-missing">
            <Info size={14} aria-hidden="true" />
            <span><strong>{joinNames(missing)}:</strong> informação indisponível — não entra no total.</span>
          </p>
        )}

        <button type="button" className="btn btn-outline btn-block nutrition-items-toggle"
          aria-expanded={showItems} onClick={() => setShowItems((v) => !v)}>
          {showItems ? 'Ocultar itens' : 'Ver por item'}
        </button>
        {showItems && <ItemsTable rows={summary.rows} totals={totals} />}

        <p className="ai-note">
          <Sparkles size={12} aria-hidden="true" />
          Valores médios estimados por IA a partir de receitas típicas. Podem variar conforme o preparo.
        </p>
      </div>
    </section>
  )
}

// Linha compacta da confirmação: "Seu pedido: 930 kcal · P 25 g C 100 g G 47 g".
export function NutritionLine({ items }) {
  const summary = orderNutrition(items)
  if (summary.status === 'empty') return null
  return (
    <div className="nutrition-line">
      <p>
        Seu pedido: <strong>{formatInteger(summary.totals.calories_kcal)} kcal</strong>
        {summary.status === 'partial' && ' (parcial)'}
      </p>
      <MacroLegend totals={summary.totals} variant="compact" />
      <AiBadge variant="text" label="Estimado por IA · valores médios" />
    </div>
  )
}
