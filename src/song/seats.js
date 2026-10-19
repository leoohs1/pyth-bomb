// Ajuste dos assentos no palco de karaokê (public/song/arena-bg.webp): o desenho é o mesmo da arena,
// mas os bancos de veludo são mais altos que os blocos de mármore — sem isso o personagem fica
// "flutuando" na frente da almofada. Em % da arena (ver nudgeSeat no GameArenaV2):
//   dy    = sobe o corpo até a borda de cima da almofada
//   dEdge = devolve a plaquinha pra faixa neon de baixo do banco
// Medido na própria imagem (borda de cima da almofada e neon, no meio de cada banco).
// Pra conferir: /song-preview, botão "19 (lotado)".
export const SONG_SEATS = {
  L_BACK: { dy: -3.5, dEdge: 2.3 },
  L_BACK2: { dy: -2.9, dEdge: 1.75 },
  L_BACK3: { dy: -2.45, dEdge: 2.1 },
  R_BACK3: { dy: -2.6, dEdge: 2.25 },
  R_BACK2: { dy: -2.85, dEdge: 1.85 },
  R_BACK: { dy: -3.65, dEdge: 2.4 },

  L_MID: { dy: -3.05, dEdge: 2 },
  L_MID2: { dy: -2.75, dEdge: 1.75 },
  L_MID3: { dy: -2.45, dEdge: 1.55 },
  R_MID3: { dy: -2.5, dEdge: 1.65 },
  R_MID2: { dy: -2.75, dEdge: 1.75 },
  R_MID: { dy: -3.05, dEdge: 2 },

  L_FRONT: { dy: -2.35, dEdge: 2 },
  L_FRONT2: { dy: -1.65, dEdge: 2.15 },
  L_FRONT3: { dy: -2.05, dEdge: 2.15 },
  R_FRONT3: { dy: -2.05, dEdge: 2 },
  R_FRONT2: { dy: -1.7, dEdge: 2.3 },
  R_FRONT: { dy: -2.4, dEdge: 2.2 },
}
