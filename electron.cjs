const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let mainWindow;
let splashWindow;

const isDev = !app.isPackaged;

// ─── Caminhos ─────────────────────────────────────────────────────────────────
// Em dev: Agent_Bastos fica um nível acima do agent-bastos-app
// Em produção: docker-compose.yml é instalado em C:\ProgramData\AgentBastos
const BACKEND_DIR = isDev
  ? path.join(__dirname, "..", "Agent_Bastos")
  : path.join("C:\\ProgramData\\AgentBastos");

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
    .shield {
      font-size: 36px;
      margin-bottom: 14px;
      filter: drop-shadow(0 0 18px rgba(180,83,9,0.6));
    }
    .logo {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.3em;
      color: #E8A020;
      margin-bottom: 4px;
      text-shadow: 0 0 24px rgba(232,160,32,0.4);
    }
    .subtitle {
      font-size: 9px;
      color: #475569;
      letter-spacing: 0.2em;
      margin-bottom: 44px;
      text-transform: uppercase;
    }
    .bar-wrap {
      width: 320px;
      height: 2px;
      background: rgba(255,255,255,0.06);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 18px;
    }
    .bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #B45309, #E8A020);
      border-radius: 4px;
      transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
      box-shadow: 0 0 10px rgba(232,160,32,0.5);
    }
    .status {
      font-size: 10px;
      color: #64748B;
      letter-spacing: 0.12em;
      min-height: 14px;
      transition: opacity 0.3s;
    }
    .status.updating { opacity: 0.5; }
    .step-dots {
      display: flex;
      gap: 6px;
      margin-top: 22px;
    }
    .dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #1E293B;
      transition: background 0.4s, box-shadow 0.4s;
    }
    .dot.done  { background: #E8A020; box-shadow: 0 0 8px rgba(232,160,32,0.6); }
    .dot.active{ background: #B45309; box-shadow: 0 0 10px rgba(180,83,9,0.8);
                 animation: pulse 1s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }
    .version {
      position: absolute;
      bottom: 18px;
      font-size: 8.5px;
      color: #1E293B;
      letter-spacing: 0.1em;
    }
  </style>
</head>
<body>
  <div class="shield">🛡️</div>
  <div class="logo">AGENT BASTOS</div>
  <div class="subtitle">Sistema de Inteligência Penitenciária</div>
  <div class="bar-wrap"><div class="bar" id="bar"></div></div>
  <div class="status" id="status">AGUARDANDO...</div>
  <div class="step-dots">
    <div class="dot" id="d0"></div>
    <div class="dot" id="d1"></div>
    <div class="dot" id="d2"></div>
    <div class="dot" id="d3"></div>
  </div>
  <div class="version">v1.0.0 · SEAP-AM · Powered by Groq · ChromaDB · n8n</div>
  <script>
    // Recebe atualizações do processo principal via executeJavaScript
    window._setStatus = function(msg, progress, step) {
      const s = document.getElementById('status');
      s.classList.add('updating');
      setTimeout(() => {
        s.textContent = msg;
        s.classList.remove('updating');
      }, 150);

      if (progress !== undefined) {
        document.getElementById('bar').style.width = progress + '%';
      }

      if (step !== undefined) {
        for (let i = 0; i < 4; i++) {
          const d = document.getElementById('d' + i);
          if (i < step)       d.className = 'dot done';
          else if (i === step) d.className = 'dot active';
          else                d.className = 'dot';
        }
      }
    };
  </script>
</body>
</html>`;

  splashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`
  );
}

// Atualiza splash via executeJavaScript (funciona com data: URLs)
function setSplash(msg, progress, step) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
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
// Verifica se o Docker daemon está acessível antes de tentar subir o stack
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

    // --no-recreate evita rebuild desnecessário se containers já existem
    const proc = spawn("docker", ["compose", "up", "-d", "--no-recreate"], {
      cwd: BACKEND_DIR,
      shell: true,
    });

    let lastLine = "";
    const parseLine = (data) => {
      const line = data.toString().trim();
      if (!line) return;
      if (import.meta?.env?.DEV || isDev) console.log(`[Docker] ${line}`);

      // Extrai nome do container para feedback na splash
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
      if (code === 0) resolve();
      else reject(new Error(`docker compose up falhou (código ${code})`));
    });

    proc.on("error", (err) => reject(err));
  });
}

// ─── Health Check — aguarda API responder ────────────────────────────────────
// Tenta até `retries` vezes com `intervalMs` de espera entre cada tentativa.
// 90 tentativas × 2s = 3 min de janela (cobre indexação do ChromaDB na 1ª subida)
function waitForApi(retries = 90, intervalMs = 2000) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryOnce = () => {
      attempt++;
      setSplash(
        `AGUARDANDO API... (${attempt}/${retries})`,
        50 + Math.min(attempt / retries, 1) * 35,
        2
      );
      http
        .get("http://127.0.0.1:8000/health", (res) => {
          if (res.statusCode < 500) resolve();
          else if (attempt < retries) setTimeout(tryOnce, intervalMs);
          else reject(new Error("API retornou erro após todas as tentativas"));
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
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "src/assets/logo.png"),
    title: "Agent Bastos",
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5174");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    setSplash("PRONTO. ABRINDO...", 100, 3);
    setTimeout(() => {
      closeSplash();
      mainWindow.show();
      mainWindow.maximize();
    }, 600);
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();

  // Aguarda splash renderizar antes de começar
  await new Promise((r) => setTimeout(r, 400));

  try {
    // Fase 0 — Verifica Docker
    setSplash("VERIFICANDO DOCKER...", 10, 0);
    const dockerOk = await checkDockerRunning();

    if (!dockerOk) {
      // Docker não está rodando — mostra dialog e abre mesmo assim (modo degradado)
      await dialog.showMessageBox({
        type: "warning",
        title: "Agent Bastos — Docker não encontrado",
        message:
          "O Docker Desktop não está rodando.\n\nInicie o Docker Desktop e reabra o Agent Bastos para ativar todas as funcionalidades.",
        buttons: ["Continuar mesmo assim", "Fechar"],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 1) app.quit();
      });
    } else {
      // Fase 1 — Sobe containers
      await startDockerStack();

      // Fase 2 — Aguarda API
      setSplash("CONECTANDO À API...", 50, 2);
      await waitForApi();
    }
  } catch (err) {
    console.error("[Startup]", err.message);
    setSplash("ERRO NA INICIALIZAÇÃO — ABRINDO EM MODO OFFLINE", 90, 2);
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Fase 3 — Abre a UI
  setSplash("CARREGANDO INTERFACE...", 95, 3);
  if (isDev) {
    // Em dev, aguarda o Vite dev server
    await waitForVite().catch(() => {});
  }
  createWindow();
});

// Aguarda Vite em modo desenvolvimento
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
// Os containers têm restart:unless-stopped — ficam rodando para reabrir rápido.
// Só paramos em caso de quit explícito via close-window IPC.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle("minimize-window", () => mainWindow?.minimize());
ipcMain.handle("maximize-window", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle("close-window", () => {
  // Não derruba os containers — próxima abertura será instantânea
  app.quit();
});
ipcMain.handle("send-message", (_event, msg) => {
  console.log(`[IPC] ${msg}`);
  return { ok: true };
});
