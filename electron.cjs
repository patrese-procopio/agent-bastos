const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let mainWindow;
let splashWindow;
let pythonProcess;

const isDev = !app.isPackaged;

// ─── Splash Screen ────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 300,
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

  // HTML da splash inline — sem arquivo externo para simplificar
  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 480px; height: 300px;
          background: #0F172A;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: 'JetBrains Mono', 'Roboto Mono', 'Courier New', monospace;
          overflow: hidden;
          border: 1px solid #1E293B;
        }
        .logo {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.25em;
          color: #B45309;
          margin-bottom: 6px;
        }
        .subtitle {
          font-size: 10px;
          color: #475569;
          letter-spacing: 0.15em;
          margin-bottom: 40px;
        }
        .bar-wrap {
          width: 280px;
          height: 3px;
          background: #1E293B;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .bar {
          height: 100%;
          width: 0%;
          background: #B45309;
          border-radius: 4px;
          animation: load 8s ease-in-out forwards;
        }
        @keyframes load {
          0%   { width: 0%; }
          30%  { width: 35%; }
          60%  { width: 65%; }
          85%  { width: 85%; }
          100% { width: 92%; }
        }
        .status {
          font-size: 10px;
          color: #64748B;
          letter-spacing: 0.1em;
          animation: blink 1.5s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .version {
          position: absolute;
          bottom: 20px;
          font-size: 9px;
          color: #334155;
          letter-spacing: 0.1em;
        }
      </style>
    </head>
    <body>
      <div class="logo">AGENT BASTOS</div>
      <div class="subtitle">SISTEMA DE INTELIGÊNCIA CORPORATIVA</div>
      <div class="bar-wrap"><div class="bar"></div></div>
      <div class="status">INICIALIZANDO BACKEND...</div>
      <div class="version">v1.0.0 · Powered by Gemini · LLaMA · ChromaDB</div>
    </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ─── Main Window ──────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,                    // começa oculta — só mostra após splash
    backgroundColor: "#F8FAFC",
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

  // Quando a janela terminar de carregar, fecha a splash e exibe
  mainWindow.once("ready-to-show", () => {
    closeSplash();
    mainWindow.show();
  });
}

// ─── Backend Python ───────────────────────────────────────────────────────────
function startPythonBackend() {
  let pythonPath, scriptPath;

  if (isDev) {
    pythonPath = path.join(__dirname, "../Agent_Bastos/.venv/Scripts/python.exe");
    scriptPath = path.join(__dirname, "../Agent_Bastos/api.py");
  } else {
    pythonPath = path.join(process.resourcesPath, "backend", ".venv", "Scripts", "python.exe");
    scriptPath = path.join(process.resourcesPath, "backend", "api.py");
  }

  pythonProcess = spawn(pythonPath, [scriptPath], {
    cwd: isDev
      ? path.join(__dirname, "../Agent_Bastos")
      : path.join(process.resourcesPath, "backend"),
  });

  pythonProcess.stdout.on("data", (data) => console.log(`[Python] ${data}`));
  pythonProcess.stderr.on("data", (data) => console.error(`[Python ERR] ${data}`));
  pythonProcess.on("error", (err) => console.error(`[Python] Falha ao iniciar: ${err.message}`));
}

// ─── Health Check ─────────────────────────────────────────────────────────────
function waitForUrl(url, retries, intervalMs) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http
        .get(url, () => resolve())
        .on("error", () => {
          if (n > 0) setTimeout(() => attempt(n - 1), intervalMs);
          else reject(new Error(`Timeout aguardando ${url}`));
        });
    };
    attempt(retries);
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplash();           // mostra splash imediatamente
  startPythonBackend();     // inicia o FastAPI em paralelo

  try {
    await Promise.all([
      isDev
        ? waitForUrl("http://localhost:5174", 30, 1000)
        : Promise.resolve(),
      waitForUrl("http://127.0.0.1:8000/health", 60, 1000),
    ]);
  } catch (err) {
    console.error(`[Startup] ${err.message} — abrindo sem backend.`);
  }

  createWindow();           // cria a janela principal (ainda oculta)
                            // ela se mostra sozinha no evento ready-to-show
});

app.on("window-all-closed", () => {
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle("minimize-window", () => mainWindow.minimize());
ipcMain.handle("maximize-window", () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle("close-window", () => {
  if (pythonProcess) pythonProcess.kill();
  app.quit();
});
ipcMain.handle("send-message", (_event, msg) => {
  console.log(`[IPC] ${msg}`);
  return { ok: true };
});
