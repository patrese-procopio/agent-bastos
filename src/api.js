const BASE = "/api-proxy"

function getToken() {
  return localStorage.getItem("ab_access_token")
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
  const refresh = localStorage.getItem("ab_refresh_token")
  if (!refresh) return false
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    })
    if (!res.ok) return false
    const data = await res.json()
    localStorage.setItem("ab_access_token", data.access_token)
    if (data.refresh_token) localStorage.setItem("ab_refresh_token", data.refresh_token)
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
      localStorage.removeItem("ab_access_token")
      localStorage.removeItem("ab_refresh_token")
      localStorage.removeItem("ab_user")
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
}

export default api