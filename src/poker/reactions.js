// Reações com emoji no Pyth Poker. Vão pelo mesmo caminho do chat (send_message, supabase/014_chat.sql), como uma
// mensagem com um código curto "[emo:fire]": o servidor já confere quem mandou e segura quem manda rápido demais.
// A tela tira esses códigos do chat e mostra o emoji grande em cima do personagem de quem mandou.
export const EMOJIS = [
  { id: 'lol', e: '😂' },
  { id: 'fire', e: '🔥' },
  { id: 'wow', e: '😱' },
  { id: 'clap', e: '👏' },
  { id: 'cool', e: '😎' },
  { id: 'think', e: '🤔' },
  { id: 'money', e: '💸' },
  { id: 'pray', e: '🙏' },
  { id: 'oracle', e: '🔮' },
  { id: 'moon', e: '🚀' },
]
const BY_ID = Object.fromEntries(EMOJIS.map((x) => [x.id, x.e]))

export const emoCode = (id) => `[emo:${id}]`
// devolve o emoji se a mensagem for uma reação, senão null
export function emoOf(body) {
  const m = /^\[emo:([a-z]+)\]$/.exec(String(body ?? '').trim())
  return m ? BY_ID[m[1]] ?? null : null
}

export const REACTION_MS = 2600 // quanto tempo o emoji fica na mesa
