/**
 * electron.cjs — Processo Principal do Agent Bastos
 * Viga Soluções e Tecnologia
 *
 * Responsabilidades:
 *   1. Single-instance lock — impede múltiplas janelas abertas simultaneamente
 *   2. Logging persistente — todos os eventos gravados em %APPDATA%\AgentBastos\logs\
 *   3. Splash screen — feedback visual durante startup do Docker + API
 *   4. Docker orchestration — sobe o stack e aguarda health check
 *   5. CSP via session — bloqueia scripts externos não autorizados
 *   6. Janela principal — frameless, contextIsolation, nodeIntegration=false
 */

const { app, BrowserWindow, ipcMain, dialog, session } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const url = require("url");
const { spawn } = require("child_process");
const log = require("electron-log");

// ─── Logging persistente ──────────────────────────────────────────────────────
// electron-log grava automaticamente em:
//   Windows: %APPDATA%\AgentBastos\logs\main.log
//   Rotação automática a cada 1MB (mantém últimos 5 arquivos)
//
// Por que electron-log e não console.log?
// Em produção não existe terminal. console.log vai para o void.
// electron-log persiste em disco E ainda espelha no console em dev.
log.initialize({ preload: true });
log.transports.file.level = "info";
log.transports.file.maxSize = 1024 * 1024; // 1 MB por arquivo
log.transports.console.level = "debug";

// Redireciona console.* para o log também (pega erros de libs de terceiros)
Object.assign(console, log.functions);

log.info("=== Agent Bastos iniciando ===", {
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electron: process.versions.electron,
  node: process.versions.node,
});

// ─── Tratamento de exceções não capturadas ────────────────────────────────────
// Sem isso, um erro em qualquer callback assíncrono derruba o processo silenciosamente.
// Com isso, o erro aparece no log e o usuário recebe um dialog em vez de tela preta.
process.on("uncaughtException", (err) => {
  log.error("uncaughtException", err);
  dialog.showErrorBox(
    "Erro inesperado — Agent Bastos",
    `Ocorreu um erro não tratado:\n\n${err.message}\n\nO log completo está em:\n${log.transports.file.getFile().path}`
  );
});

process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", reason);
});

// ─── Single-instance lock ─────────────────────────────────────────────────────
// app.requestSingleInstanceLock() retorna false se já existe uma instância rodando.
// Nesse caso encerramos imediatamente e focamos a janela existente.
//
// Por que isso importa para enterprise?
// Duplo-clique no atalho, sessões RDP sobrepostas, scripts de deploy que não
// verificam se o app está aberto — todos causariam dois stacks Docker tentando
// subir ao mesmo tempo, resultando em portas em conflito e dados corrompidos.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.warn("Segunda instância detectada — encerrando e focando a instância existente.");
  app.quit();
  process.exit(0);
}

let mainWindow;
let splashWindow;

const isDev = !app.isPackaged;

// Quando o usuário tenta abrir uma segunda instância, esta função é chamada
// na instância ORIGINAL — traz a janela para frente em vez de ignorar.
app.on("second-instance", (_event, _argv, _workingDir) => {
  log.info("second-instance: trazendo janela existente para foco");
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── Caminhos ─────────────────────────────────────────────────────────────────
// Em dev: Agent_Bastos fica um nível acima do agent-bastos-app.
// Em produção: lê AGENT_BASTOS_DIR do ambiente (configurável por máquina).
//   Se não definida, usa o caminho padrão da SEAP-AM.
//   Para outras instalações: defina AGENT_BASTOS_DIR no sistema antes de rodar.
const BACKEND_DIR = isDev
  ? path.join(__dirname, "..", "Agent_Bastos")
  : (process.env.AGENT_BASTOS_DIR || "C:\\Users\\Administrador\\Agent_Bastos");

log.info("BACKEND_DIR:", BACKEND_DIR, "| isDev:", isDev);

// ─── Config persistente do backend (userData/bastos-config.json) ─────────────
// Guarda a URL do backend que este cliente aponta. O usuario define na tela
// Configuracoes -> Aba Geral; a UI chama IPC "backend-config-set" que grava
// aqui, e o CSP + health check leem daqui no proximo boot.
//
// Fallback: variavel de ambiente AGENT_BASTOS_BACKEND_URL (util em MDM/GPO)
// ou http://127.0.0.1:8000 (deploy single-host).
const CONFIG_PATH = path.join(app.getPath("userData"), "bastos-config.json");

function readBackendConfig() {
  // `source` distingue explicit (usuario salvou / MDM definiu) de fallback
  // — sem essa distincao o SetupInicial nao consegue saber se precisa aparecer.
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      if (raw && typeof raw.backendUrl === "string" && raw.backendUrl.trim()) {
        return { backendUrl: raw.backendUrl.trim().replace(/\/+$/, ""), source: "file" };
      }
    }
  } catch (e) {
    log.warn("readBackendConfig falhou:", e.message);
  }
  const envUrl = (process.env.AGENT_BASTOS_BACKEND_URL || "").trim();
  if (envUrl) return { backendUrl: envUrl.replace(/\/+$/, ""), source: "env" };
  return { backendUrl: "http://127.0.0.1:8000", source: "default" };
}

function writeBackendConfig(newUrl) {
  const clean = (newUrl || "").trim().replace(/\/+$/, "");
  if (!clean || !/^https?:\/\//.test(clean)) {
    throw new Error("URL invalida — precisa comecar com http:// ou https://");
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ backendUrl: clean }, null, 2), "utf8");
  log.info("Backend config gravado:", clean);
  return clean;
}

// Deriva origem (protocol + host + porta) de uma URL, pra whitelist do CSP.
function toOrigin(u) {
  try {
    const p = new URL(u);
    return `${p.protocol}//${p.host}`;
  } catch {
    return null;
  }
}

const CURRENT_BACKEND = readBackendConfig();
log.info("Backend URL configurado:", CURRENT_BACKEND.backendUrl);

// ─── Content Security Policy ──────────────────────────────────────────────────
// Aplicado via session antes de qualquer janela ser criada.
// Bloqueia scripts inline, eval(), e carregamento de recursos externos.
// A origem do backend configurado + servicos locais (n8n, evolution) sao
// permitidos. Em prod centralizado, o backend pode ser https://bastos.ag.gov.br
// ou http://192.168.10.50:8000 — ambos entram no connect-src.
//
// Por que CSP no Electron e nao so no backend?
// O renderer process e um Chromium. Se algum conteudo injetado (XSS via dado
// vindo da API) conseguir executar script, o CSP bloqueia a exfiltracao.
// E a ultima linha de defesa dentro do proprio app.
app.on("ready", () => {
  const backendOrigin = toOrigin(CURRENT_BACKEND.backendUrl) || "http://127.0.0.1:8000";
  // Origens locais fixas de servicos que rodam junto quando o deploy e single-host.
  // Em deploy centralizado o operador acessa n8n/evolution pelo IP do servidor
  // (fora do Electron), entao essas origens locais nao atrapalham.
  const localSvc = "http://127.0.0.1:5678 http://127.0.0.1:8080 http://localhost:5678 http://localhost:8080";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",   // unsafe-inline necessario para Vite HMR em dev
            "style-src 'self' 'unsafe-inline'",
            `connect-src 'self' ${backendOrigin} ${localSvc} ws://localhost:5174`,
            `img-src 'self' data: blob: https: ${backendOrigin} http://127.0.0.1:5678 http://127.0.0.1:8080`,
            "font-src 'self' data:",
            "object-src 'none'",
            "base-uri 'self'",
          ].join("; "),
        ],
      },
    });
  });
});

// ─── Splash Screen ────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const splashHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 520px; height: 320px;
      background: linear-gradient(160deg, #0B1120 0%, #0F172A 100%);
      border-radius: 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', 'Roboto Mono', 'Courier New', monospace;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.07);
      box-shadow: 0 32px 80px rgba(0,0,0,0.8);
    }
    .shield { font-size: 36px; margin-bottom: 14px; filter: drop-shadow(0 0 18px rgba(180,83,9,0.6)); }
    .logo { font-size: 15px; font-weight: 800; letter-spacing: 0.3em; color: #E8A020; margin-bottom: 4px; text-shadow: 0 0 24px rgba(232,160,32,0.4); }
    .subtitle { font-size: 9px; color: #475569; letter-spacing: 0.2em; margin-bottom: 44px; text-transform: uppercase; }
    .bar-wrap { width: 320px; height: 2px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; margin-bottom: 18px; }
    .bar { height: 100%; width: 0%; background: linear-gradient(90deg, #B45309, #E8A020); border-radius: 4px; transition: width 0.6s cubic-bezier(0.4,0,0.2,1); box-shadow: 0 0 10px rgba(232,160,32,0.5); }
    .status { font-size: 10px; color: #64748B; letter-spacing: 0.12em; min-height: 14px; transition: opacity 0.3s; }
    .status.updating { opacity: 0.5; }
    .step-dots { display: flex; gap: 6px; margin-top: 22px; }
    .dot { width: 5px; height: 5px; border-radius: 50%; background: #1E293B; transition: background 0.4s, box-shadow 0.4s; }
    .dot.done  { background: #E8A020; box-shadow: 0 0 8px rgba(232,160,32,0.6); }
    .dot.active{ background: #B45309; box-shadow: 0 0 10px rgba(180,83,9,0.8); animation: pulse 1s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }
    .version { position: absolute; bottom: 18px; font-size: 8.5px; color: #1E293B; letter-spacing: 0.1em; }
  </style>
</head>
<body>
  <div class="shield">🛡️</div>
  <div class="logo">AGENT BASTOS</div>
  <div class="subtitle">Sistema de Inteligência Operacional</div>
  <div class="bar-wrap"><div class="bar" id="bar"></div></div>
  <div class="status" id="status">AGUARDANDO...</div>
  <div class="step-dots">
    <div class="dot" id="d0"></div>
    <div class="dot" id="d1"></div>
    <div class="dot" id="d2"></div>
    <div class="dot" id="d3"></div>
  </div>
  <div class="version">v1.0.0 · Viga Soluções e Tecnologia · SEAP-AM</div>
  <script>
    window._setStatus = function(msg, progress, step) {
      const s = document.getElementById('status');
      s.classList.add('updating');
      setTimeout(() => { s.textContent = msg; s.classList.remove('updating'); }, 150);
      if (progress !== undefined) document.getElementById('bar').style.width = progress + '%';
      if (step !== undefined) {
        for (let i = 0; i < 4; i++) {
          const d = document.getElementById('d' + i);
          if (i < step)        d.className = 'dot done';
          else if (i === step) d.className = 'dot active';
          else                 d.className = 'dot';
        }
      }
    };
  </script>
</body>
</html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
}

function setSplash(msg, progress, step) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  log.debug(`[splash] ${msg} | ${progress ?? "-"}% | step=${step ?? "-"}`);
  splashWindow.webContents
    .executeJavaScript(
      `window._setStatus(${JSON.stringify(msg)}, ${progress ?? "undefined"}, ${step ?? "undefined"})`
    )
    .catch(() => {});
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ─── Docker Compose ───────────────────────────────────────────────────────────
function checkDockerRunning() {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["info"], { shell: true });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

function startDockerStack() {
  return new Promise((resolve, reject) => {
    setSplash("INICIANDO CONTAINERS...", 30, 1);
    log.info("docker compose up iniciando em:", BACKEND_DIR);

    const proc = spawn("docker", ["compose", "up", "-d", "--no-recreate"], {
      cwd: BACKEND_DIR,
      shell: true,
    });

    let lastLine = "";
    const parseLine = (data) => {
      const line = data.toString().trim();
      if (!line) return;
      log.info(`[docker] ${line}`);
      const match = line.match(/Container ([^\s]+)/i);
      if (match) {
        const name = match[1].replace("agent-bastos-", "").toUpperCase();
        if (name !== lastLine) {
          lastLine = name;
          setSplash(`CONTAINER: ${name}`, undefined, 1);
        }
      }
    };

    proc.stdout.on("data", parseLine);
    proc.stderr.on("data", parseLine);
    proc.on("close", (code) => {
      if (code === 0) {
        log.info("docker compose up concluído com sucesso");
        resolve();
      } else {
        const err = new Error(`docker compose up falhou (código ${code})`);
        log.error(err.message);
        reject(err);
      }
    });
    proc.on("error", (err) => { log.error("docker spawn error:", err); reject(err); });
  });
}

// ─── Health Check ─────────────────────────────────────────────────────────────
// 90 tentativas × 2s = 3 minutos de janela (cobre indexação ChromaDB na 1ª subida)
// Usa http OU https conforme a URL configurada.
function healthClient(healthUrl) {
  return healthUrl.startsWith("https:") ? https : http;
}
function waitForApi(retries = 90, intervalMs = 2000) {
  const healthUrl = `${CURRENT_BACKEND.backendUrl}/health`;
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryOnce = () => {
      attempt++;
      setSplash(
        `AGUARDANDO API... (${attempt}/${retries})`,
        50 + Math.min(attempt / retries, 1) * 35,
        2
      );
      healthClient(healthUrl)
        .get(healthUrl, (res) => {
          log.debug(`[health] status=${res.statusCode} attempt=${attempt}`);
          if (res.statusCode < 500) {
            log.info("API respondendo — health check OK");
            resolve();
          } else if (attempt < retries) {
            setTimeout(tryOnce, intervalMs);
          } else {
            reject(new Error("API retornou erro após todas as tentativas"));
          }
        })
        .on("error", () => {
          if (attempt < retries) setTimeout(tryOnce, intervalMs);
          else reject(new Error("API não respondeu após 3 minutos"));
        });
    };
    tryOnce();
  });
}

// ─── Main Window ──────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: "#0F172A",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,   // isola o mundo Node do renderer (obrigatório)
      nodeIntegration: false,   // renderer NÃO tem acesso direto ao Node.js
      sandbox: false,           // necessário para o preload.cjs funcionar como CJS
      webSecurity: true,        // mantém Same-Origin Policy ativa
    },
    icon: path.join(__dirname, "build", "icon.ico"),
    title: "Agent Bastos",
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5174");
    // DevTools só em dev — nunca em produção
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    setSplash("PRONTO. ABRINDO...", 100, 3);
    setTimeout(() => {
      closeSplash();
      mainWindow.show();
      mainWindow.maximize();
      log.info("Janela principal exibida");
    }, 600);
  });

  mainWindow.on("closed", () => {
    log.info("Janela principal fechada");
    mainWindow = null;
  });
}

// ─── Quick API check (sem bloquear no Docker) ────────────────────────────────
// Tenta bater no /health com timeout curto na URL configurada.
// Se a API já está no ar (backend local ou servidor central), pula o Docker.
function checkApiQuick(timeoutMs = 2500) {
  const healthUrl = `${CURRENT_BACKEND.backendUrl}/health`;
  return new Promise((resolve) => {
    const req = healthClient(healthUrl).get(healthUrl, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();
  await new Promise((r) => setTimeout(r, 400));

  try {
    // 1. Verifica primeiro se a API já está no ar (backend Python via npm run backend)
    setSplash("VERIFICANDO SERVICOS...", 10, 0);
    const apiJaRodando = await checkApiQuick();

    if (apiJaRodando) {
      // Backend Python já está rodando — pula Docker completamente
      log.info("API respondendo — backend já ativo, pulando Docker");
      setSplash("BACKEND CONECTADO", 85, 2);
      await new Promise((r) => setTimeout(r, 600));

    } else {
      // API não respondeu — tenta via Docker
      setSplash("VERIFICANDO DOCKER...", 20, 1);
      const dockerOk = await checkDockerRunning();
      log.info("Docker status:", dockerOk ? "OK" : "NAO ENCONTRADO");

      if (dockerOk) {
        try {
          await startDockerStack();
        } catch (dockerErr) {
          log.warn("docker compose up falhou:", dockerErr.message);
        }
        setSplash("CONECTANDO A API...", 50, 2);
        await waitForApi();
      } else {
        // Sem Docker e sem API — avisa e abre em modo offline
        log.warn("Docker e API indisponiveis — modo offline");
        setSplash("SEM BACKEND — MODO OFFLINE", 85, 2);
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  } catch (err) {
    log.error("Erro no startup:", err.message);
    setSplash("ERRO NA INICIALIZACAO — MODO OFFLINE", 90, 2);
    await new Promise((r) => setTimeout(r, 1500));
  }

  setSplash("CARREGANDO INTERFACE...", 95, 3);
  if (isDev) {
    await waitForVite().catch(() => log.warn("Vite nao respondeu — carregando assim mesmo"));
  }
  createWindow();
});

function waitForVite(retries = 30, intervalMs = 1000) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      http
        .get("http://localhost:5174", () => resolve())
        .on("error", () => {
          if (n > 0) setTimeout(() => tryOnce(n - 1), intervalMs);
          else reject();
        });
    };
    tryOnce(retries);
  });
}

// ─── Shutdown ─────────────────────────────────────────────────────────────────
app.on("window-all-closed", () => {
  log.info("Todas as janelas fechadas");
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  log.info("=== Agent Bastos encerrando ===");
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
// Todos os canais IPC são declarados explicitamente aqui.
// O renderer NÃO pode invocar Node.js diretamente — tudo passa pelo preload.cjs.
ipcMain.handle("minimize-window", () => {
  log.debug("IPC: minimize-window");
  mainWindow?.minimize();
});

ipcMain.handle("maximize-window", () => {
  log.debug("IPC: maximize-window");
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});

ipcMain.handle("close-window", () => {
  log.info("IPC: close-window — encerrando app (containers continuam rodando)");
  // Não derruba o Docker — próxima abertura será instantânea (already running)
  app.quit();
});

ipcMain.handle("send-message", (_event, msg) => {
  log.info(`[IPC] send-message: ${msg}`);
  return { ok: true };
});

ipcMain.handle("get-log-path", () => {
  // Permite que o frontend exiba o caminho do log para o usuário em Configurações
  return log.transports.file.getFile().path;
});

ipcMain.handle("selecionar-pasta", async (_event, titulo) => {
  // Diálogo nativo do SO para escolher pasta (Operações Drone: cartão SD).
  // Roda no processo MAIN — o renderer nunca toca o filesystem diretamente.
  log.debug("IPC: selecionar-pasta");
  const resultado = await dialog.showOpenDialog(mainWindow, {
    title: titulo || "Selecionar pasta",
    properties: ["openDirectory"],
  });
  if (resultado.canceled || resultado.filePaths.length === 0) return null;
  return resultado.filePaths[0];
});

// ─── Backend config (URL do servidor central) ────────────────────────────────
// Le e grava o arquivo `userData/bastos-config.json`. O renderer usa isso
// pra saber pra onde apontar e pra oferecer setup no primeiro boot.
// A troca de URL exige RESTART do app pra o CSP ser re-aplicado — o renderer
// mostra dialogo pedindo pra reabrir. Sem restart, o CSP antigo bloquearia
// as chamadas pra nova origem.
ipcMain.handle("backend-config-get", () => {
  return readBackendConfig();
});

ipcMain.handle("backend-config-set", (_event, novaUrl) => {
  log.info("IPC: backend-config-set", novaUrl);
  try {
    const gravada = writeBackendConfig(novaUrl);
    return { ok: true, backendUrl: gravada, precisaReiniciar: true };
  } catch (e) {
    log.error("backend-config-set falhou:", e.message);
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle("app-relaunch", () => {
  log.info("IPC: app-relaunch — reiniciando para aplicar nova config");
  app.relaunch();
  app.exit(0);
});
