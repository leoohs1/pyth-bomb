import { useEffect, useMemo, useState } from 'react'
import { CHARACTER_NAMES, avatarIndex } from '../characters'
import LeaveButton from '../LeaveButton'
import SoundToggle from '../SoundToggle'
import ChatBox from '../ChatBox'
import { Card, CardBack, Chips, fmt } from './cards'
import { handName } from './handEval'

// A mesa do Pyth Poker durante o torneio: feltro roxo com borda dourada, até 9 cadeiras em volta (eu sempre
// embaixo, no meio), as cartas da mesa e o pote no centro, e a barra de jogadas embaixo quando é a minha vez.
// Só mostra o que o servidor manda (supabase/poker/K01_poker.sql): nenhuma regra é decidida aqui.

const BETTING = ['preflop', 'flop', 'turn', 'river']
const TALL_QUERY = '(orientation: portrait) and (max-width: 900px)'

function useTall() {
  const [tall, setTall] = useState(() => !!window.matchMedia?.(TALL_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(TALL_QUERY)
    if (!mq) return
    const h = () => setTall(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])
  return tall
}

const clockText = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// rosto do personagem num círculo (a arte é o corpo inteiro sentado: mostra só a cabeça)
function Face({ player, players, className = '' }) {
  const src = CHARACTER_NAMES[avatarIndex(player, players)].file
  return <span className={`pk-face ${className}`} style={{ backgroundImage: `url(${src})` }} aria-hidden="true" />
}

function Seat({ p, players, pos, room, isMe, turnLeft, turnTotal, result, showCards }) {
  const isTurn = room.poker_turn === p.id
  const res = result?.players?.find((x) => x.player_id === p.id)
  const won = res?.won ?? 0
  const net = res ? won - res.committed : 0
  const shown = res?.cards ?? null
  const inHand = p.poker_in_hand && !p.poker_folded
  const winner = !!result && won > 0 && net > 0
  const pct = isTurn && turnTotal ? Math.max(0, Math.min(1, turnLeft / turnTotal)) : 0
  let bubble = null
  if (result) {
    if (winner) bubble = { text: `+${fmt(won)}`, kind: 'win' }
    else if (res?.hand) bubble = { text: res.hand, kind: 'hand' }
  } else if (p.poker_action) {
    bubble = { text: p.poker_action, kind: p.poker_action === 'Fold' ? 'fold' : p.poker_action === 'All-in' ? 'allin' : 'act' }
  }
  return (
    <div className={`pk-seat${isTurn ? ' is-turn' : ''}${isMe ? ' is-me' : ''}${p.poker_out ? ' is-out' : ''}${p.poker_folded && !p.poker_out ? ' is-folded' : ''}${winner ? ' is-winner' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
      <div className="pk-avatar" style={{ '--pk-pct': pct }}>
        {isTurn && <span className={`pk-ring${turnLeft <= 5000 ? ' is-urgent' : ''}`} aria-hidden="true" />}
        <Face player={p} players={players} />
        {bubble && <span className={`pk-bubble is-${bubble.kind}`}>{bubble.text}</span>}
        {p.poker_away && !p.poker_out && <span className="pk-tag">Away</span>}
      </div>
      {/* cartas: as minhas ficam grandes embaixo; dos outros, viradas (ou abertas no showdown) */}
      {/* quem caiu nesta mão ainda mostra as cartas do showdown */}
      {!isMe && (shown || !p.poker_out) && (shown ? (
        <div className="pk-hole is-shown">
          {shown.map((c) => <Card key={c} c={c} size="sm" />)}
        </div>
      ) : inHand && showCards ? (
        <div className="pk-hole"><CardBack size="sm" /><CardBack size="sm" /></div>
      ) : null)}
      <div className="pk-plate">
        <span className="pk-nick">{p.nickname}</span>
        <span className="pk-stack">{p.poker_out ? (p.place ? `Out · #${p.place}` : 'Out') : p.poker_allin && !result ? 'ALL-IN' : fmt(p.poker_stack)}</span>
      </div>
    </div>
  )
}

// barra de jogadas (só aparece na minha vez)
function ActionBar({ room, me, players, onAct, busy, msLeft, total }) {
  const toCall = Math.max(0, room.poker_current_bet - me.poker_bet)
  const maxTo = me.poker_bet + me.poker_stack
  const minTo = room.poker_current_bet + Math.max(room.poker_min_raise, 1)
  const others = players.filter((p) => p.id !== me.id && p.poker_in_hand && !p.poker_folded && !p.poker_allin)
  const reopened = !me.poker_acted || me.poker_acted_level < room.poker_full_bet
  const canRaise = reopened && others.length > 0 && maxTo > room.poker_current_bet
  const pot = players.reduce((a, p) => a + (p.poker_committed ?? 0), 0)
  const lo = Math.min(minTo, maxTo)
  const [to, setTo] = useState(lo)
  // cada vez nova começa no mínimo
  const turnKey = `${room.poker_hand_no}-${room.poker_street}-${room.poker_current_bet}`
  useEffect(() => { setTo(lo) }, [turnKey, lo])
  const clamp = (v) => Math.max(lo, Math.min(maxTo, Math.round(v)))
  const potTo = (frac) => clamp(me.poker_bet + toCall + (pot + toCall) * frac)
  const callAll = toCall >= me.poker_stack
  const isBet = room.poker_current_bet === 0
  const secs = Math.max(0, Math.ceil(msLeft / 1000))

  return (
    <div className="pk-bar" role="group" aria-label="Your move">
      <div className="pk-bar-time" aria-hidden="true">
        <span className={msLeft <= 5000 ? 'is-urgent' : ''} style={{ width: `${Math.max(0, Math.min(100, (msLeft / (total || 1)) * 100))}%` }} />
      </div>
      <p className="pk-bar-title">Your move <b className={secs <= 5 ? 'is-urgent' : ''}>{secs}s</b></p>
      {canRaise && maxTo > lo && (
        <div className="pk-raise">
          <div className="pk-presets">
            <button type="button" onClick={() => setTo(lo)} disabled={busy}>Min</button>
            <button type="button" onClick={() => setTo(potTo(0.5))} disabled={busy}>½ Pot</button>
            <button type="button" onClick={() => setTo(potTo(1))} disabled={busy}>Pot</button>
            <button type="button" onClick={() => setTo(maxTo)} disabled={busy}>Max</button>
          </div>
          <input type="range" min={lo} max={maxTo} step={Math.max(1, room.poker_sb ?? 1)} value={to}
            onChange={(e) => setTo(clamp(Number(e.target.value)))} aria-label="Raise amount" disabled={busy} />
        </div>
      )}
      <div className="pk-btns">
        <button type="button" className="pk-btn is-fold" onClick={() => onAct('fold')} disabled={busy}>Fold</button>
        {toCall === 0 ? (
          <button type="button" className="pk-btn is-check" onClick={() => onAct('check')} disabled={busy}>Check</button>
        ) : (
          <button type="button" className="pk-btn is-call" onClick={() => onAct(callAll ? 'allin' : 'call')} disabled={busy}>
            {callAll ? `All-in ${fmt(me.poker_stack)}` : `Call ${fmt(toCall)}`}
          </button>
        )}
        {canRaise && (to >= maxTo ? (
          <button type="button" className="pk-btn is-raise is-allin" onClick={() => onAct('allin')} disabled={busy}>All-in {fmt(maxTo)}</button>
        ) : (
          <button type="button" className="pk-btn is-raise" onClick={() => onAct('raise', to)} disabled={busy}>
            {isBet ? 'Bet' : 'Raise to'} {fmt(to)}
          </button>
        ))}
      </div>
    </div>
  )
}

// o que aconteceu no fim da mão, no centro da mesa
function ResultText({ result, players }) {
  const name = (id) => players.find((p) => p.id === id)?.nickname ?? '?'
  const pots = (result.pots ?? []).filter((p) => !p.returned && p.winners?.length)
  const handOf = (id) => result.players?.find((x) => x.player_id === id)?.hand
  return (
    <div className="pk-result" role="status">
      {pots.map((pot, i) => {
        const ws = pot.winners
        const hand = result.showdown ? handOf(ws[0]) : null
        return (
          <p key={i}>
            {pots.length > 1 && <span className="pk-potname">{i === 0 ? 'Main pot' : `Side pot ${i}`} · </span>}
            <b>{ws.map(name).join(' & ')}</b> {ws.length > 1 ? 'split' : 'wins'} {fmt(pot.amount)}
            {hand ? <span className="pk-handname"> · {hand}</span> : null}
          </p>
        )
      })}
    </div>
  )
}

export default function PokerTable({ room, players, myPlayerId, myCards, serverNow, onAct, onBack, onLeave, chat, busy, error }) {
  const tall = useTall()
  const seated = useMemo(() => players.filter((p) => p.poker_seat != null).sort((a, b) => a.poker_seat - b.poker_seat), [players])
  const me = players.find((p) => p.id === myPlayerId) ?? null
  const n = seated.length || 1
  const myIdx = Math.max(0, seated.findIndex((p) => p.id === myPlayerId))
  const street = room.poker_street
  const betting = BETTING.includes(street)
  const result = street === 'result' ? room.poker_result : null
  const board = result?.board ?? room.poker_board ?? []
  const bb = room.poker_bb ?? 50

  // posição de cada cadeira numa elipse; eu embaixo e os próximos (sentido horário) à minha esquerda
  const rx = tall ? 40 : 44, ry = tall ? 41 : 39
  const posOf = (p, k = 1) => {
    const idx = (seated.indexOf(p) - myIdx + n) % n
    const a = ((90 + (idx * 360) / n) * Math.PI) / 180
    return { x: 50 + rx * k * Math.cos(a), y: 50 + ry * k * Math.sin(a), a }
  }

  const turnEnds = room.poker_turn_ends_at ? Date.parse(room.poker_turn_ends_at) : null
  const turnTotal = (room.poker_cfg?.act_seconds ?? 20) * 1000
  const turnLeft = turnEnds ? Math.max(0, turnEnds - serverNow) : 0
  const myTurn = betting && !!me && room.poker_turn === me.id
  const pot = players.reduce((a, p) => a + (p.poker_committed ?? 0), 0)
  const levelLeft = room.poker_level_ends_at ? Date.parse(room.poker_level_ends_at) - serverNow : null
  const readyLeft = room.poker_next_at ? Date.parse(room.poker_next_at) - serverNow : 0
  const dealerP = seated.find((p) => p.poker_seat === room.poker_dealer)

  // minhas cartas só valem se forem desta mão
  const mine = myCards && myCards.hand_no === room.poker_hand_no && me?.poker_in_hand ? myCards.cards : null
  const myHand = mine && board.length >= 3 ? handName(mine, board) : mine && (mine[0] >> 2) === (mine[1] >> 2) ? 'Pocket pair' : null
  const myRes = result?.players?.find((x) => x.player_id === me?.id)

  return (
    <main className={`pk-root${tall ? ' is-tall' : ''}`}>
      <div className="pk-hud">
        <div className="pk-hud-left">
          <span className="ga-chip">Hand #{room.poker_hand_no || 1}</span>
          <span className="ga-chip">Blinds {fmt(room.poker_sb)}/{fmt(room.poker_bb)}</span>
          {levelLeft != null && levelLeft > 0 && <span className="ga-chip pk-level">Up in {clockText(levelLeft)}</span>}
        </div>
        <div className="pk-hud-right">
          <LeaveButton onLeave={onLeave} inGame={!me?.poker_out} short={tall} />
          <SoundToggle />
        </div>
      </div>

      <div className="pk-tablewrap">
        <div className="pk-table">
          <div className="pk-felt" aria-hidden="true"><span className="pk-felt-mark">PYTH POKER</span></div>

          <div className="pk-center">
            {street === 'ready' ? (
              <div className="pk-ready">
                <p>Get ready</p>
                <b key={Math.ceil(readyLeft / 1000)}>{Math.max(1, Math.ceil(readyLeft / 1000))}</b>
              </div>
            ) : (
              <>
                {pot > 0 && !result && <p className="pk-pot">Pot <b>{fmt(pot)}</b></p>}
                <div className="pk-board" aria-label="Table cards">
                  {Array.from({ length: 5 }, (_, i) => (board[i] != null
                    ? <Card key={`${room.poker_hand_no}-${i}`} c={board[i]} size="md" className="is-dealt" />
                    : <span key={i} className="pk-slot" aria-hidden="true" />))}
                </div>
                {result && <ResultText result={result} players={players} />}
              </>
            )}
          </div>

          {seated.map((p) => {
            const pos = posOf(p)
            const bpos = posOf(p, 0.6)
            return (
              <div key={p.id} className="pk-seatgroup">
                <Seat p={p} players={players} pos={pos} room={room} isMe={p.id === myPlayerId}
                  turnLeft={turnLeft} turnTotal={turnTotal} result={result} showCards={betting || !!result} />
                {betting && p.poker_bet > 0 && (
                  <span className="pk-betpos" style={{ left: `${bpos.x}%`, top: `${bpos.y}%` }}>
                    <Chips amount={p.poker_bet} bb={bb} />
                  </span>
                )}
              </div>
            )
          })}

          {dealerP && street !== 'ready' && (() => {
            const d = posOf(dealerP, 0.74)
            const off = 7
            return <span className="pk-dealer" style={{ left: `${d.x + off * Math.cos(d.a + Math.PI / 2) * 0.6}%`, top: `${d.y + off * Math.sin(d.a + Math.PI / 2) * 0.6}%` }} title="Dealer">D</span>
          })()}
        </div>
      </div>

      {/* parte de baixo com altura FIXA (cartas + jogadas): assim a mesa não cresce nem encolhe quando a
          barra de jogadas aparece ou some */}
      <div className="pk-foot">
        <div className="pk-mine">
          {mine ? (
            <div className={`pk-mycards${me?.poker_folded ? ' is-folded' : ''}`}>
              {mine.map((c) => <Card key={c} c={c} size="lg" />)}
            </div>
          ) : (
            <div className="pk-mycards is-empty" aria-hidden="true"><span className="pk-card pk-lg" /><span className="pk-card pk-lg" /></div>
          )}
          <p className="pk-myhand">
            {mine && !me?.poker_folded && (myHand || myRes?.hand)
              ? <>You have: <b>{myHand ?? myRes?.hand}</b></>
              : me?.poker_folded && betting && !me.poker_out ? 'You folded' : ' '}
          </p>
        </div>

        <div className="pk-act">
          {me && myTurn && !me.poker_away && (
            <ActionBar room={room} me={me} players={players} onAct={onAct} busy={busy} msLeft={turnLeft} total={turnTotal} />
          )}
          {me && !myTurn && !me.poker_out && !me.poker_away && betting && room.poker_turn && (
            <p className="pk-waiting">Waiting for <b>{players.find((p) => p.id === room.poker_turn)?.nickname ?? '…'}</b></p>
          )}
          {me?.poker_away && !me.poker_out && (
            <div className="pk-away" role="alert">
              <p>You are <b>away</b>: the game checks or folds for you.</p>
              <button type="button" className="pk-btn is-call" onClick={onBack}>I&apos;m back</button>
            </div>
          )}
          {me?.poker_out && (
            <p className="pk-waiting is-out">You are out{me.place ? ` · #${me.place}` : ''}. Watching the rest of the game.</p>
          )}
        </div>
      </div>
      {error && <p className="pk-error" role="alert">{error}</p>}

      {chat && <ChatBox chat={chat} myPlayerId={myPlayerId} phase="playing" variant="compact" />}
    </main>
  )
}
