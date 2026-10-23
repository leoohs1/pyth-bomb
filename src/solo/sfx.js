import { play } from '../sound.js'
import { doorOpen } from './engine/game.js'

// Sons do Solo. Só ESCUTA o jogo (state.events + mudanças de estado) e toca o som certo: não muda nenhuma regra.
// Chamar uma vez por quadro, ANTES de FX.consumeEvents (que limpa os avisos).
// Os sons ficam em src/sound.js (SOLO_SOUNDS) e, quando existirem, em public/sounds/solo/<nome>.mp3.

const STATUS_SOUND = { dead: 'solo_dead', gameover: 'solo_gameover', cleared: 'solo_clear', won: 'solo_win' }
const DELAY = { solo_gameover: 0.75 } // a risada entra depois do dano (igual ao Classic: senão um abafa o outro)
const MIN_GAP = { solo_boom: 0.09, solo_hit: 0.08, solo_enemy_die: 0.08, solo_pickup: 0.08 } // segundos entre repetições

export function createSoloSfx() {
  let game = null // jogo que estou acompanhando (se trocar, recomeço sem tocar nada)
  let status = null
  let door = false
  let chest = null
  const lastAt = new Map()
  const timers = new Set()

  const say = (name, now) => {
    const gap = MIN_GAP[name] ?? 0
    if (gap && now - (lastAt.get(name) ?? -9) < gap) return
    lastAt.set(name, now)
    const delay = DELAY[name]
    if (!delay) return play(name)
    const id = setTimeout(() => { timers.delete(id); play(name) }, delay * 1000)
    timers.add(id)
  }

  const frame = function (g) {
    const now = performance.now() / 1000
    if (g !== game) { // fase nova / corrida nova / tentar de novo: só guarda o ponto de partida
      game = g; status = g.status; door = !!doorOpen(g); chest = g.chest?.state ?? null
      return
    }
    for (const ev of g.events) {
      if (ev.type === 'bombPlaced') say('solo_bomb', now)
      else if (ev.type === 'explode') say('solo_boom', now)
      else if (ev.type === 'powerup') say('solo_pickup', now)
      else if (ev.type === 'playerHit') say('solo_hurt', now)
      else if (ev.type === 'shieldBreak') say('solo_shield', now)
      else if (ev.type === 'kick') say('solo_kick', now)
      else if (ev.type === 'bossEnrage') say('solo_roar', now)
      else if (ev.type === 'bombhead') say('solo_bomb', now)
      else if (ev.type === 'bossIntro') say('solo_roar', now)
      else if (ev.type === 'bossDive') say('solo_boom', now)
      else if (ev.type === 'frenzy') say('solo_roar', now)
      else if (ev.type === 'jetBurst') say('solo_boom', now)
      else if (ev.type === 'bossCrash') say('solo_boom', now)
      else if (ev.type === 'collectors') say('solo_door', now)
      else if (ev.type === 'itemDrop') say('solo_door', now)
      else if (ev.type === 'enemyHit') say(ev.killed ? 'solo_enemy_die' : 'solo_hit', now)
    }
    // porta abriu (todos os inimigos derrotados)
    const d = !!doorOpen(g)
    if (d && !door && g.status === 'playing') say('solo_door', now)
    door = d
    // baú: clicou (fechado -> abrindo) e depois o resultado (abrindo -> aberto). Um baú que volta já aberto
    // depois de morrer (result.reopened) não toca nada.
    const c = g.chest?.state ?? null
    if (c === 'opening' && chest === 'closed') say('solo_chest_open', now)
    else if (c === 'opened' && chest !== 'opened' && g.chest.result && !g.chest.result.reopened) say(g.chest.result.win ? 'solo_chest_win' : 'solo_chest_empty', now)
    chest = c
    // morreu / fim de jogo / fase concluída / venceu
    if (g.status !== status) {
      const snd = STATUS_SOUND[g.status]
      if (snd) say(snd, now)
      status = g.status
    }
  }
  frame.stop = () => { timers.forEach(clearTimeout); timers.clear() } // ao sair do Solo, cancela sons que ainda iam tocar
  return frame
}
