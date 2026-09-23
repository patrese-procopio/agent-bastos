// useAutoRefresh — hook reutilizavel pra manter telas "vivas"
// ─────────────────────────────────────────────────────────────────────────────
// Roda `fetcher()` a cada `intervalMs` (default 3 min). Se falha, retenta com
// BACKOFF EXPONENCIAL comecando em 30s e limitado a `intervalMs` — assim a UI
// tenta reconectar rapido quando a rede volta, mas nao inunda de requests.
//
// Retorna `{ ultimaAtualizacao, tentando, falhou, atualizarAgora }`:
//   - ultimaAtualizacao: Date do ultimo sucesso (null antes do primeiro)
//   - tentando         : true enquanto o fetcher esta em execucao
//   - falhou           : true se a ultima tentativa falhou (pra badge amarelo)
//   - atualizarAgora   : chama o fetcher fora do ciclo (botao "Atualizar")

import { useEffect, useRef, useState, useCallback } from "react"

export default function useAutoRefresh(fetcher, { intervalMs = 3 * 60 * 1000 } = {}) {
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null)
  const [tentando, setTentando] = useState(false)
  const [falhou, setFalhou]     = useState(false)

  // Guarda a referencia mais recente do fetcher pra o loop nao capturar closure velha
  const fetcherRef = useRef(fetcher)
  useEffect(() => { fetcherRef.current = fetcher }, [fetcher])

  const timeoutRef = useRef(null)
  const retryMsRef = useRef(30_000)  // backoff atual: comeca em 30s

  const rodar = useCallback(async () => {
    setTentando(true)
    try {
      await fetcherRef.current()
      setUltimaAtualizacao(new Date())
      setFalhou(false)
      retryMsRef.current = 30_000        // reset do backoff apos sucesso
      // Proximo ciclo normal
      timeoutRef.current = setTimeout(rodar, intervalMs)
    } catch {
      setFalhou(true)
      // Retenta em backoff, limitado ao intervalo normal
      const proximo = Math.min(retryMsRef.current, intervalMs)
      timeoutRef.current = setTimeout(rodar, proximo)
      retryMsRef.current = Math.min(retryMsRef.current * 2, intervalMs)
    } finally {
      setTentando(false)
    }
  }, [intervalMs])

  const atualizarAgora = useCallback(() => {
    clearTimeout(timeoutRef.current)
    retryMsRef.current = 30_000
    rodar()
  }, [rodar])

  useEffect(() => {
    rodar()
    return () => clearTimeout(timeoutRef.current)
  }, [rodar])

  return { ultimaAtualizacao, tentando, falhou, atualizarAgora }
}


// Formata "atualizado ha X" pra o badge (pt-BR)
export function formatarHaTempo(dt) {
  if (!dt) return "nunca"
  const s = Math.floor((Date.now() - dt.getTime()) / 1000)
  if (s < 10)  return "agora"
  if (s < 60)  return `há ${s}s`
  const m = Math.floor(s / 60)
  if (m < 60)  return `há ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24)  return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
