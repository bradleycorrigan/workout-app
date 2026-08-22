export function buildQuery(filters) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("start_date", filters.startDate);
  if (filters.endDate) params.set("end_date", filters.endDate);
  return params.toString();
}

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export async function loadInsights(filters) {
  const q = buildQuery(filters);
  const payload = await fetchJson(`/api/insights/bundle?${q}`);
  if (!payload._errors) payload._errors = {};
  return payload;
}

export async function loadHistory(limit = 20) {
  return fetchJson(`/api/history?limit=${limit}`);
}

export async function postForm(url, formEl) {
  const params = new URLSearchParams(new FormData(formEl));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const payload = await res.json();
      if (payload && payload.detail) message = String(payload.detail);
    } catch {
      // no-op
    }
    throw new Error(message);
  }
}

export async function postEncoded(url, payload = {}) {
  const body = new URLSearchParams(payload).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const parsed = await res.json();
      if (parsed && parsed.detail) message = String(parsed.detail);
    } catch {
      // no-op
    }
    throw new Error(message);
  }
}
