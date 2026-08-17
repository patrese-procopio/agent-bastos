import { getAccessToken, getRefreshToken, setTokens, clearSession } from "./authStore"

// Em dev: Vite proxeia /api-proxy → http://localhost:8000/api
// Em produção (Electron packaged): sem proxy, vai direto para a API local
const BASE = import.meta.env.DEV ? "/api-proxy" : "http://127.0.0.1:8000/api"

function getToken() {
  return getAccessToken()
}

function headers(extra = {}) {
  const token = getToken()
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function tryRefresh() {
  const refresh = getRefreshToken()
  if (!refresh) return false
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) return false
    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    return true
  } catch { return false }
}

async function request(method, path, body = null) {
  const opts = { method, headers: headers() }

  if (body && !(body instanceof FormData)) {
    opts.body = JSON.stringify(body)
  }
  if (body instanceof FormData) {
    const token = getToken()
    opts.headers = token ? { Authorization: `Bearer ${token}` } : {}
    opts.body = body
  }

  let res = await fetch(`${BASE}${path}`, opts)

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      // Retry com novo token
      const retryOpts = { method, headers: headers() }
      if (body && !(body instanceof FormData)) retryOpts.body = JSON.stringify(body)
      if (body instanceof FormData) {
        retryOpts.headers = { Authorization: `Bearer ${getToken()}` }
        retryOpts.body = body
      }
      res = await fetch(`${BASE}${path}`, retryOpts)
    }
    if (res.status === 401) {
      clearSession()
      // Notifica o React root para deslogar sem reload de página
      window.dispatchEvent(new CustomEvent("ab:logout"))
      return res
    }
  }

  return res
}

const api = {
  get:    (path)           => request("GET",    path),
  post:   (path, body)     => request("POST",   path, body),
  patch:  (path, body)     => request("PATCH",  path, body),
  put:    (path, body)     => request("PUT",    path, body),
  delete: (path)           => request("DELETE", path),
  upload:    (path, formData) => request("POST",   path, formData),
  uploadPut: (path, formData) => request("PUT",    path, formData),

  login: async (username, password) => {
    const form = new URLSearchParams()
    form.append("username", username)
    form.append("password", password)
    return fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    })
  },

  // Tenta renovar a sessão a partir do refresh_token salvo (sessionStorage).
  // Usado no boot do App — o access_token vive só em memória, então some a
  // cada reload de página; isso reidrata a sessão sem pedir login de novo.
  restoreSession: () => tryRefresh(),
}

export default api
