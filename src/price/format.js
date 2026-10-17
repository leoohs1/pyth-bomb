// Números do Guess the Price: ler o chute que a pessoa digitou e mostrar preços e datas.

// Lê o chute: "97,500" / "97.500" / "97500.5" / "97.5k" / "$ 1,0845" / "R$ 5,42"...
// O separador decimal é ambíguo (1.000 é mil no Brasil e "um" nos EUA): testa os dois jeitos e
// fica com o que chega mais perto do preço de referência da rodada. Devolve null se não der.
export function parseGuess(text, ref) {
  let s = String(text ?? '').trim().toLowerCase().replace(/r\$|us\$|usd|brl|[$\s_]/g, '')
  let mult = 1
  if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1) }
  else if (s.endsWith('m')) { mult = 1e6; s = s.slice(0, -1) }
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null
  const num = (str) => {
    if (!/^\d*\.?\d*$/.test(str) || str === '.' || str === '') return null
    const n = Number(str) * mult
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const us = num(s.replace(/,/g, ''))                      // vírgula = milhar, ponto = decimal
  const br = num(s.replace(/\./g, '').replace(/,/g, '.'))  // ponto = milhar, vírgula = decimal
  const options = [us, br].filter((n) => n != null)
  if (!options.length) return null
  if (options.length === 1 || !ref) return options[0]
  return options.reduce((a, b) => (Math.abs(Math.log(b / ref)) < Math.abs(Math.log(a / ref)) ? b : a))
}

const symbolOf = (quote) => (quote === 'BRL' ? 'R$ ' : '$')

// preço com o símbolo da moeda: $97,201.55 / R$ 5.4231
export function fmtPrice(n, decimals = 2, quote = 'USD') {
  if (n == null || !Number.isFinite(Number(n))) return '–'
  return symbolOf(quote) + Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// data e hora da rodada, em UTC: "Oct 10, 2026 · 15:30 UTC"
export function fmtWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} · ${time} UTC`
}

// quanto errou, em %: "0.42% off" (bem pequeno vira "<0.01% off")
export function fmtErr(pct) {
  if (pct == null) return ''
  const v = Number(pct)
  if (v < 0.01) return '<0.01% off'
  return `${v < 10 ? v.toFixed(2) : v.toFixed(1)}% off`
}

export const KIND_LABEL = { crypto: 'Crypto', stock: 'Stock', metal: 'Metal', fx: 'Currency' }
