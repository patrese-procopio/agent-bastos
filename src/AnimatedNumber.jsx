/**
 * AnimatedNumber — contador animado com easeOutExpo
 *
 * Uso:
 *   import AnimatedNumber from "./AnimatedNumber"
 *   <AnimatedNumber value={247} />
 *   <AnimatedNumber value={totalAlertas} duration={1200} suffix=" alertas" />
 *
 * Props:
 *   value    {number}  Valor alvo
 *   duration {number}  Duração em ms (padrão: 900)
 *   prefix   {string}  Texto antes do número
 *   suffix   {string}  Texto depois do número
 *   decimals {number}  Casas decimais (padrão: 0)
 */
import { useState, useEffect, useRef } from "react"

export default function AnimatedNumber({
  value,
  duration = 900,
  prefix   = "",
  suffix   = "",
  decimals = 0,
}) {
  const [display, setDisplay] = useState(0)
  const rafRef   = useRef(null)
  const fromRef  = useRef(0)

  useEffect(() => {
    const target = Number(value) || 0
    const from   = fromRef.current
    if (from === target) return

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const start = performance.now()

    const tick = (now) => {
      const elapsed  = now - start
      const progress = Math.min(elapsed / duration, 1)
      // easeOutExpo — começa rápido, desacelera suavemente no final
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      const current = from + (target - from) * ease
      fromRef.current = current
      setDisplay(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
        setDisplay(target)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  const formatted = display.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return <>{prefix}{formatted}{suffix}</>
}
