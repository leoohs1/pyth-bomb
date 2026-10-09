// Botão "sair da sala" do topo (ao lado do som). Volta pra tela de criar/entrar numa sala.
// Pergunta antes de sair, pra ninguém sair sem querer no meio da partida.
export default function LeaveButton({ onLeave, inGame = false, short = false }) {
  if (!onLeave) return null
  function ask() {
    const msg = inGame
      ? 'Leave the match? You will be out of the game.'
      : 'Leave this room?'
    if (window.confirm(msg)) onLeave()
  }
  return (
    <button type="button" className="ga-chip ga-leave-chip" onClick={ask}
      aria-label="Leave room" title="Leave room">
      🚪{short ? '' : ' Leave'}
    </button>
  )
}
