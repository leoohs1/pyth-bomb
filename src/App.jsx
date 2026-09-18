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
  const [erro, setErro] = useState(null)
  const [carregando, setCarregando] = useState(false)

  async function criarSala() {
    setCarregando(true)
    setErro(null)

    const { data, error } = await supabase
      .from('rooms')
      .insert({ code: gerarCodigo() })
      .select()
      .single()

    if (error) {
      setErro(error.message)
    } else {
      setSala(data)
    }
    setCarregando(false)
  }

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', color: '#EDEAF8' }}>
      <h1>PYTH BOMB</h1>

      <button onClick={criarSala} disabled={carregando}>
        {carregando ? 'criando...' : 'CRIAR SALA'}
      </button>

      {sala && (
        <p>
          Sala criada! Código: <strong>{sala.code}</strong>
        </p>
      )}

      {erro && <p style={{ color: 'salmon' }}>Erro: {erro}</p>}
    </div>
  )
}