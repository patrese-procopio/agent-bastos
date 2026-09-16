// ═══════════════════════════════════════════════════════════════════════════════
// SetupInicial.jsx — wizard mostrado no primeiro boot antes do login
//
// Aparece quando o cliente Electron nao tem um `backendUrl` configurado
// (arquivo userData/bastos-config.json vazio). Pede a URL do servidor da
// agencia, testa conectividade com /health, grava e reinicia o app.
//
// Fica FORA do fluxo autenticado — nao usa AuthContext, api.js, nada de
// backend antes de configurar. Padrao visual enterprise dark.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react"
import logoImg from "./assets/logo.webp"
import { pingBackend, setBackendUrl, relaunchApp } from "./backendConfig"

const MONO = "'JetBrains Mono', 'Fira Code', 'Consolas', monospace"
const SANS = "'Inter', 'Segoe UI', system-ui, sans-serif"

export default function SetupInicial() {
  const [url, setUrl] = useState("http://")
  const [testando, setTestando] = useState(false)
  const [resultado, setResultado] = useState(null) // {ok, dados|erro}
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState("")

  async function testar() {
    setResultado(null)
    setErroSalvar("")
    const clean = url.trim().replace(/\/+$/, "")
    if (!/^https?:\/\//.test(clean)) {
      setResultado({ ok: false, erro: "URL precisa comecar com http:// ou https://" })
      return
    }
    setTestando(true)
    const r = await pingBackend(clean)
    setTestando(false)
    setResultado(r)
  }

  async function confirmar() {
    setSalvando(true)
    setErroSalvar("")
    const r = await setBackendUrl(url)
    if (!r.ok) {
      setErroSalvar(r.erro || "falha ao gravar")
      setSalvando(false)
      return
    }
    if (r.precisaReiniciar) {
      // Da 500ms pro usuario ver o "salvo com sucesso" antes de reiniciar
      setTimeout(() => relaunchApp(), 500)
    } else {
      window.location.reload()
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0B1120",
      color: "#F1F5F9",
      fontFamily: SANS,
      padding: 24,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 560,
        background: "#111827",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: 32,
        boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <img src={logoImg} alt="Agent Bastos" style={{ width: 44, height: 44, borderRadius: 8 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.5 }}>Agent Bastos</div>
            <div style={{ fontSize: 11.5, color: "#94A3B8", fontFamily: MONO, marginTop: 2 }}>
              CONFIGURACAO INICIAL
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            Conectar ao servidor da agencia
          </div>
          <div style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.55 }}>
            Informe o endereco do backend do Agent Bastos que roda no servidor
            central da sua agencia. Esta configuracao e feita uma unica vez por
            maquina — voce pode alterar depois em <b>Configuracoes → Aba Geral</b>.
          </div>
        </div>

        <label style={{ display: "block", marginBottom: 20 }}>
          <div style={{
            fontSize: 11.5,
            color: "#94A3B8",
            fontFamily: MONO,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            URL do backend
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setResultado(null) }}
            placeholder="https://bastos.suaagencia.gov.br  ou  http://192.168.10.50:8000"
            autoFocus
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: 14,
              fontFamily: MONO,
              background: "#0B1120",
              color: "#F1F5F9",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 6 }}>
            Nao inclua barra no final, nem caminho. Exemplos: <code>http://127.0.0.1:8000</code>{" "}
            (backend na propria maquina), <code>https://bastos.aipen.am.gov.br</code> (servidor
            central com HTTPS).
          </div>
        </label>

        {resultado && (
          <div style={{
            padding: "10px 14px",
            marginBottom: 16,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: MONO,
            background: resultado.ok
              ? "rgba(34,197,94,0.10)"
              : "rgba(239,68,68,0.10)",
            border: resultado.ok
              ? "1px solid rgba(34,197,94,0.35)"
              : "1px solid rgba(239,68,68,0.35)",
            color: resultado.ok ? "#4ADE80" : "#F87171",
          }}>
            {resultado.ok
              ? `✓ Backend respondeu (${resultado.dados?.status || "ok"})`
              : `✗ ${resultado.erro}`}
          </div>
        )}

        {erroSalvar && (
          <div style={{
            padding: "10px 14px",
            marginBottom: 16,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: MONO,
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#F87171",
          }}>
            ✗ {erroSalvar}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={testar}
            disabled={testando || salvando || url.trim().length < 10}
            style={{
              flex: 1,
              padding: "12px 18px",
              fontSize: 13,
              fontFamily: MONO,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              background: "transparent",
              color: "#94A3B8",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 8,
              cursor: (testando || salvando) ? "not-allowed" : "pointer",
              opacity: (testando || url.trim().length < 10) ? 0.5 : 1,
            }}
          >
            {testando ? "Testando..." : "Testar conexao"}
          </button>
          <button
            onClick={confirmar}
            disabled={salvando || !resultado?.ok}
            style={{
              flex: 1,
              padding: "12px 18px",
              fontSize: 13,
              fontFamily: MONO,
              fontWeight: 600,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              background: resultado?.ok ? "#E8A020" : "rgba(232,160,32,0.25)",
              color: resultado?.ok ? "#0B1120" : "#94A3B8",
              border: "none",
              borderRadius: 8,
              cursor: (salvando || !resultado?.ok) ? "not-allowed" : "pointer",
            }}
          >
            {salvando ? "Salvando..." : "Salvar e conectar"}
          </button>
        </div>

        <div style={{
          marginTop: 24,
          paddingTop: 20,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          fontSize: 11.5,
          color: "#64748B",
          fontFamily: MONO,
          lineHeight: 1.6,
        }}>
          O app precisa reiniciar depois de gravar a URL, para aplicar as regras
          de seguranca (CSP) da nova origem. Isso demora 2-3 segundos.
        </div>
      </div>
    </div>
  )
}
