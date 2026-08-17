/**
 * preload.cjs — Ponte segura entre renderer (React) e processo principal (Node)
 *
 * Por que contextBridge e não nodeIntegration: true?
 * nodeIntegration: true expõe TODA a API do Node.js ao renderer. Se qualquer
 * dado externo (vindo da API, de um documento, de um link) conseguir injetar
 * um script, ele teria acesso ao sistema de arquivos, rede, processos — tudo.
 * Com contextBridge, o renderer só enxerga o que foi explicitamente exposto aqui.
 *
 * Regra: adicionar canais IPC SOMENTE se o renderer precisar de fato.
 * Quanto menor a superfície, menor o risco.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Controles da janela (frameless)
  minimize:    () => ipcRenderer.invoke("minimize-window"),
  maximize:    () => ipcRenderer.invoke("maximize-window"),
  close:       () => ipcRenderer.invoke("close-window"),

  // Utilitários
  sendMessage: (msg) => ipcRenderer.invoke("send-message", msg),

  // Caminho do log — exibido na tela de Configurações para facilitar suporte
  getLogPath:  () => ipcRenderer.invoke("get-log-path"),

  // Diálogo nativo "Selecionar pasta" (Operações Drone: importação do cartão SD)
  selecionarPasta: (titulo) => ipcRenderer.invoke("selecionar-pasta", titulo),
});
