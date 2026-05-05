"""
Adiciona botão de gravação discreta ao App.jsx do Agent Bastos.
Fluxo: Gravar → Salvar áudio em /gravacoes → Notificar usuário
"""

import re

APP_PATH = r"C:\Users\Administrador\agent-bastos-app\src\App.jsx"

with open(APP_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# ─── 1. HOOK DE GRAVAÇÃO ────────────────────────────────────────────────────
# Injeta os imports e estados logo após o último import existente

HOOK_CODE = """
// ── Gravação de Áudio ─────────────────────────────────────────────────────
const [gravando, setGravando] = React.useState(false)
const [tempoGravacao, setTempoGravacao] = React.useState(0)
const [statusGravacao, setStatusGravacao] = React.useState(null) // 'salvo' | 'erro' | null
const mediaRecorderRef = React.useRef(null)
const chunksRef = React.useRef([])
const timerRef = React.useRef(null)

const iniciarGravacao = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream)
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `gravacao_${timestamp}.webm`

      // Salva via Electron IPC ou download direto
      if (window.electronAPI?.salvarAudio) {
        const reader = new FileReader()
        reader.onload = () => {
          window.electronAPI.salvarAudio(reader.result, filename)
            .then(() => {
              setStatusGravacao('salvo')
              setTimeout(() => setStatusGravacao(null), 4000)
            })
            .catch(() => setStatusGravacao('erro'))
        }
        reader.readAsArrayBuffer(blob)
      } else {
        // Fallback: download direto no browser
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
        setStatusGravacao('salvo')
        setTimeout(() => setStatusGravacao(null), 4000)
      }

      stream.getTracks().forEach(t => t.stop())
      setTempoGravacao(0)
    }

    mediaRecorder.start(1000)
    setGravando(true)
    setStatusGravacao(null)
    timerRef.current = setInterval(() => setTempoGravacao(t => t + 1), 1000)

  } catch (err) {
    console.error('Erro ao acessar microfone:', err)
    setStatusGravacao('erro')
    setTimeout(() => setStatusGravacao(null), 3000)
  }
}

const pararGravacao = () => {
  if (mediaRecorderRef.current && gravando) {
    mediaRecorderRef.current.stop()
    setGravando(false)
    clearInterval(timerRef.current)
  }
}

const formatarTempo = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}
// ─────────────────────────────────────────────────────────────────────────────
"""

# ─── 2. BOTÃO DE GRAVAÇÃO ────────────────────────────────────────────────────
BOTAO_JSX = """
        {/* ── Botão Gravação Discreta ── */}
        <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

          {/* Toast de status */}
          {statusGravacao === 'salvo' && (
            <div style={{ background: '#022c22', border: '1px solid #16a34a', borderRadius: 8, padding: '6px 14px', fontSize: 11, color: '#4ade80', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <span>●</span> Áudio salvo com sucesso
            </div>
          )}
          {statusGravacao === 'erro' && (
            <div style={{ background: '#450a0a', border: '1px solid #dc2626', borderRadius: 8, padding: '6px 14px', fontSize: 11, color: '#f87171', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
              ✕ Erro ao acessar microfone
            </div>
          )}

          {/* Timer ao gravar */}
          {gravando && (
            <div style={{ background: '#0F172A', border: '1px solid #dc2626', borderRadius: 8, padding: '5px 12px', fontSize: 11, color: '#f87171', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#dc2626', display: 'inline-block', animation: 'pulse 1s infinite' }}/>
              REC {formatarTempo(tempoGravacao)}
            </div>
          )}

          {/* Botão principal */}
          <button
            onClick={gravando ? pararGravacao : iniciarGravacao}
            title={gravando ? 'Parar gravação' : 'Iniciar gravação de entrevista'}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: gravando ? '2px solid #dc2626' : '2px solid #CBD5E1',
              background: gravando ? '#0F172A' : '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: gravando ? '0 0 0 4px rgba(220,38,38,0.15), 0 4px 12px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
            }}
          >
            {gravando ? (
              /* Ícone STOP */
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#dc2626">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
            ) : (
              /* Ícone MICROFONE */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            )}
          </button>
        </div>
"""

# ─── 3. CSS PARA ANIMAÇÃO DO PULSE ──────────────────────────────────────────
CSS_PULSE = """
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
"""

# ─── Injeção no App.jsx ──────────────────────────────────────────────────────

# Injeta o hook logo antes do primeiro 'return ('
if "// ── Gravação de Áudio" not in content:
    content = re.sub(
        r'(return\s*\()',
        HOOK_CODE + r'\1',
        content,
        count=1
    )
    print("✅ Hook de gravação injetado")
else:
    print("⚠️  Hook já existe, pulando")

# Injeta o botão antes do último </div> + fechamento do return
if "Botão Gravação Discreta" not in content:
    # Busca o fechamento do return principal — padrão comum: "  )\n}"
    content = re.sub(
        r'(\s*</div>\s*\)\s*\}\s*$)',
        BOTAO_JSX + r'\1',
        content,
        count=1,
        flags=re.DOTALL
    )
    print("✅ Botão de gravação injetado")
else:
    print("⚠️  Botão já existe, pulando")

# Injeta CSS de animação após a abertura do primeiro return (
if "@keyframes pulse" not in content:
    content = re.sub(
        r'(return\s*\(\s*\n\s*<div)',
        r'\1',
        content,
        count=1
    )
    # Injeta antes do primeiro <div principal
    content = content.replace(
        "return (\n",
        "return (\n" + CSS_PULSE,
        1
    )
    print("✅ CSS pulse injetado")

with open(APP_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("\n🎙️  Botão de gravação adicionado ao App.jsx!")
print("   Acesse o app e veja o ícone de microfone no canto inferior direito.")
