import { useState } from 'react'
import { supabase } from './supabaseClient'

function gerarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let codigo = 'PYTH'
  for (let i = 0; i < 2; i++) {
    codigo += letras[Math.floor(Math.random() * letras.length)]
  }
  return codigo
}

export default function App() {
  const [sala, setSala] = useState(null)
  const [eu, setEu] = useState(null)
  const [codigoDigitado, setCodigoDigitado] = useState('')
  const [apelido, setApelido] = useState('')
  const [erro, setErro] = useState(null)

  async function criarSala() {
    setErro(null)

    if (!apelido.trim()) return setErro('Escolhe um apelido primeiro')

    const { data: novaSala, error } = await supabase
      .from('rooms')
      .insert({ code: gerarCodigo() })
      .select()
      .single()

    if (error) return setErro(error.message)

    const { data: jogador, error: erroJogador } = await supabase
      .from('players')
      .insert({ room_id: novaSala.id, nickname: apelido.trim() })
      .select()
      .single()

    if (erroJogador) return setErro(erroJogador.message)

    setSala(novaSala)
    setEu(jogador)
  }

  async function entrarNaSala() {
    setErro(null)

    if (!apelido.trim()) return setErro('Escolhe um apelido primeiro')

    const { data: salaEncontrada, error: erroSala } = await supabase
      .from('rooms')
      .select()
      .eq('code', codigoDigitado.trim().toUpperCase())
      .single()

    if (erroSala) return setErro('Sala nao encontrada')

    const { data: jogador, error: erroJogador } = await supabase
      .from('players')
      .insert({ room_id: salaEncontrada.id, nickname: apelido.trim() })
      .select()
      .single()

    if (erroJogador) return setErro(erroJogador.message)

    setSala(salaEncontrada)
    setEu(jogador)
  }

  const campo = { padding: 10, marginRight: 8, fontSize: 16 }

  if (sala) {
    return (
      <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#EDEAF8' }}>
        <h1>PYTH BOMB</h1>
        <p>Sala: <strong style={{ fontSize: 28 }}>{sala.code}</strong></p>
        <p>Voce entrou como: <strong>{eu?.nickname}</strong></p>
      </div>
    )
  }

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#EDEAF8' }}>
      <h1>PYTH BOMB</h1>

      <p>
        <input
          placeholder="seu apelido"
          value={apelido}
          onChange={(e) => setApelido(e.target.value)}
          style={campo}
        />
      </p>

      <p>
        <button onClick={criarSala} style={campo}>CRIAR SALA</button>
      </p>

      <p>
        <input
          placeholder="codigo da sala"
          value={codigoDigitado}
          onChange={(e) => setCodigoDigitado(e.target.value)}
          style={campo}
        />
        <button onClick={entrarNaSala} style={campo}>ENTRAR</button>
      </p>

      {erro && <p style={{ color: 'salmon' }}>{erro}</p>}
    </div>
  )
}