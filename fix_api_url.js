// Atualiza URL base das lideranças para o novo router isolado
// Execute: node fix_api_url.js
const fs = require("fs")
const path = require("path")

const JSX = path.join(__dirname, "..", "agent-bastos-app", "src", "LiderancasUnidade.jsx")

let src = fs.readFileSync(JSX, "utf-8")
const original = src

// Troca a constante API_LID para apontar ao novo prefixo
// Adiciona constante separada para não afetar outros usos de API
if (!src.includes("API_LID")) {
  src = src.replace(
    `const API  = "http://127.0.0.1:8000"`,
    `const API  = "http://127.0.0.1:8000"\nconst API_LID = \`\${API}/api/liderancas\``
  )
  // Substitui todas as chamadas de lideranças
  src = src.replace(/`\$\{API\}\/liderancas-estrutura`/g, "`${API_LID}/estrutura`")
  src = src.replace(/`\$\{API\}\/liderancas\/\$\{/g, "`${API_LID}/${")
  src = src.replace(/`\$\{API\}\/liderancas`/g, "`${API_LID}`")
  src = src.replace(/`\$\{API\}\/liderancas-foto\/\$\{/g, "`${API_LID}/foto/${")
  src = src.replace(/fetch\(`\$\{API\}\/liderancas-estrutura`\)/g, "fetch(`${API_LID}/estrutura`)")
}

if (src === original) {
  console.log("Nenhuma alteração necessária.")
} else {
  fs.writeFileSync(JSX, src, "utf-8")
  console.log("✓ URLs do JSX atualizadas para /api/liderancas")
}
