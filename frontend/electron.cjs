const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let mainWindow;
let pythonProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#F8FAFC",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "src/assets/logo.png"),
    title: "Agent Bastos",
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL("http://localhost:5174");
    
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
  }
}

function startPythonBackend() {
  const pythonPath = path.join(
    __dirname,
    "../Agent_Bastos/.venv/Scripts/python.exe"
  );
  const scriptPath = path.join(__dirname, "../Agent_Bastos/api.py");

  pythonProcess = spawn(pythonPath, [scriptPath]);

  pythonProcess.stdout.on("data", (data) => {
    console.log(`[Python] ${data}`);
  });

  pythonProcess.stderr.on("data", (data) => {
    console.error(`[Python ERR] ${data}`);
  });
}

function waitForUrl(url, retries, intervalMs) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get(url, () => resolve())
        .on("error", () => {
          if (n > 0) setTimeout(() => attempt(n - 1), intervalMs);
          else reject(new Error(`Timeout aguardando ${url}`));
        });
    };
    attempt(retries);
  });
}

app.whenReady().then(async () => {
  startPythonBackend();

  try {
    // Aguarda Vite (frontend) e backend Python em paralelo
    await Promise.all([
      waitForUrl("http://localhost:5174", 30, 1000),
      waitForUrl("http://127.0.0.1:8000/health", 60, 1000),
    ]);
    createWindow();
  } catch (err) {
    // Se o backend não subir, abre mesmo assim (frontend lida com erros de fetch)
    console.error(`[Startup] ${err.message} — abrindo sem backend.`);
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

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
