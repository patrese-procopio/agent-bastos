// patch_card_lider.js — aumenta destaque do nome civil no CardLiderAla
const fs   = require("fs")
const path = require("path")

const JSX = path.join(__dirname, "..", "agent-bastos-app", "src", "LiderancasUnidade.jsx")
let src = fs.readFileSync(JSX, "utf-8")

// Substitui o bloco de nome (pequeno) pelo novo com mesmo peso do vulgo
const ANTES = `        {lider.nome && (
          <div style={{fontSize:11,color:"#475569",marginBottom:4}}>{lider.nome}</div>
        )}`

const DEPOIS = `        {lider.nome && (
          <div style={{
            fontSize:14, fontWeight:800, color:"#1E293B",
            fontFamily:MONO, letterSpacing:"0.01em", marginBottom:4,
          }}>{lider.nome}</div>
        )}`

if (!src.includes(ANTES)) {
  console.log("Bloco não encontrado — verifique o JSX.")
  process.exit(1)
}

src = src.replace(ANTES, DEPOIS)
fs.writeFileSync(JSX, src, "utf-8")
console.log("✓ Nome agora com o mesmo destaque do vulgo.")
