// Thin clients for refund-api (8080) and policy-service (8090). Every function throws Error(message) on failure.

const config = window.REVERIE_CONFIG || {};
const trim = (url) => String(url || "").replace(/\/+$/, "");

export const REFUND_API = trim(config.refundApi || "http://localhost:8080");
export const POLICY_SERVICE = trim(config.policyService || "http://localhost:8090");
export const GUEST_API = trim(config.guestApi || "http://localhost:9090/api");

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

async function request(base, path, { method = "GET", body, form, params, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {};
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`${base}${path}${query(params)}`, { method, headers, body: payload, signal: controller.signal });
  } catch (error) {
    const service = base === POLICY_SERVICE ? "policy service" : base === GUEST_API ? "guest service" : "refund API";
    throw new Error(error.name === "AbortError"
      ? `The ${service} did not answer in time.`
      : `Cannot reach the ${service} at ${base}. Is it running?`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && data.message ? data.message
      : typeof data === "string" && data.trim() && data.length < 300 ? data.trim()
      : `${response.status} ${response.statusText || "error"}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

const refund = (path, options) => request(REFUND_API, path, options);
const policy = (path, options) => request(POLICY_SERVICE, path, options);
const enc = encodeURIComponent;

export const refundApi = {
  baseUrl: REFUND_API,
  health: () => refund("/health"),
  regions: () => refund("/regions"),
  hotels: ({ region, countryCode } = {}) => refund("/hotels", { params: { region, countryCode } }),
  reservation: (reservationId) => refund(`/reservations/${enc(reservationId)}`),
  listCases: ({ region, countryCode, hotelId, status } = {}) =>
    refund("/refund-requests", { params: { region, countryCode, hotelId, status } }),
  getCase: (id) => refund(`/refund-requests/${enc(id)}`),
  // The agent can take a minute; allow it three.
  createCase: ({ reservationId, complaint, channel, createdBy }) =>
    refund("/refund-requests", { method: "POST", body: { reservationId, complaint, channel, createdBy }, timeoutMs: 200000 }),
  reassess: (id) => refund(`/refund-requests/${enc(id)}/reassess`, { method: "POST", timeoutMs: 200000 }),
  decide: (id, { approved, decidedBy, role, note, sharePolicyIds = [], guestMessage }) =>
    refund(`/refund-requests/${enc(id)}/decision`, {
      method: "POST", body: { approved, decidedBy, role, note: note || undefined, sharePolicyIds, guestMessage }
    }),
  guestResolution: (token) => refund(`/guest/resolutions/${enc(token)}`),
  guestDocumentUrl: (token, documentId) => `${REFUND_API}/guest/resolutions/${enc(token)}/documents/${enc(documentId)}`
};
refundApi.getRegions = refundApi.regions;
refundApi.getHotels = refundApi.hotels;
refundApi.getReservation = refundApi.reservation;
refundApi.listRefundRequests = refundApi.listCases;
refundApi.getRefundRequest = refundApi.getCase;
refundApi.createRefundRequest = refundApi.createCase;
refundApi.decision = refundApi.decide;

export const policyApi = {
  baseUrl: POLICY_SERVICE,
  health: () => policy("/health"),
  list: ({ region, countryCode, hotelId, language, policyType } = {}) =>
    policy("/policies", { params: { region, countryCode, hotelId, language, policyType } }),
  applicable: ({ region, countryCode, hotelId, checkIn, checkOut } = {}) =>
    policy("/policies/applicable", { params: { region, countryCode, hotelId, checkIn, checkOut } }),
  get: (id) => policy(`/policies/${enc(id)}`),
  chunks: (id) => policy(`/policies/${enc(id)}/chunks`),
  ingestAll: (force = false) => policy("/policies/ingest", { method: "POST", params: { force: String(Boolean(force)) }, timeoutMs: 600000 }),
  ingest: (id) => policy(`/policies/${enc(id)}/ingest`, { method: "POST", timeoutMs: 300000 }),
  // formData: parts "file" (PDF) and "metadata" (JSON string).
  upload: (formData) => policy("/policies", { method: "POST", form: formData, timeoutMs: 300000 }),
  documentUrl: (id) => `${POLICY_SERVICE}/policies/${enc(id)}/document`,
  // Resolves a service-relative URL such as PolicyEntry.documentUrl.
  absoluteUrl: (path) => (/^https?:/i.test(path || "") ? path : `${POLICY_SERVICE}${path || ""}`)
};
policyApi.listPolicies = policyApi.list;
policyApi.getPolicies = policyApi.list;
policyApi.applicablePolicies = policyApi.applicable;
policyApi.getApplicable = policyApi.applicable;
policyApi.getPolicy = policyApi.get;
policyApi.getChunks = policyApi.chunks;
policyApi.previewChunks = policyApi.chunks;
policyApi.ingestOne = policyApi.ingest;
policyApi.reindex = policyApi.ingest;
policyApi.uploadPolicy = policyApi.upload;
policyApi.createPolicy = policyApi.upload;

// Best-effort: the guest service is not part of the portal's required config.
export const guestApi = {
  loyalty: (guestId) => request(GUEST_API, `/guests/${enc(guestId)}/loyalty`, { timeoutMs: 5000 })
};
