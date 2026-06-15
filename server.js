const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HEAD_ADMIN_EMAIL = process.env.HEAD_ADMIN_EMAIL || "admin@messengerbook.com";
const HEAD_ADMIN_PASSWORD = process.env.HEAD_ADMIN_PASSWORD || "admin123";

loadEnv(path.join(ROOT, ".env"));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "test_token";
const INTERNAL_SCHEDULER_ENABLED = process.env.INTERNAL_SCHEDULER_ENABLED !== "false";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const PUBLIC_ORIGIN = (process.env.BOOKING_BASE_URL || process.env.APP_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, "");
const DEFAULT_AB_MESSAGE = "Hi {{firstName}}, here is your booking link: {{bookingLink}}";
const DEFAULT_AB_BUTTON_LABEL = "Book now";
const DEFAULT_BOOKING_ABANDONED_MESSAGE = "Hi {{firstName}}, you can still finish booking your appointment here.";
const DEFAULT_EMBEDDED_PAGE_BUTTON_LABEL = "View page";
const DEFAULT_EMBEDDED_PAGE_BANNER_MESSAGE = "Ready to book? Choose a time with us.";
const DEFAULT_EMBEDDED_PAGE_BANNER_BUTTON_LABEL = "Book now";
const DEFAULT_FIRST24_FIBONACCI_MINUTES = [10, 20, 30];
const BOOKING_ABANDONED_SEND_LOCK_MINUTES = 15;
const BOOKING_FIELD_TYPES = ["text", "textarea", "email", "phone", "multiple_choice", "media_upload"];
const AB_BUTTON_MODES = ["both", "booking_only", "embedded_only"];
const bookingOpenTimers = new Map();
let automaticFollowUpScanRunning = false;
let scheduledTasksRunning = false;

const seedState = {
  currentUserId: null,
  authToken: "",
  activeTenantId: "",
  view: "dashboard",
  selectedSlot: "",
  toast: "",
  facebookPages: [],
  users: [],
  tenants: [],
};

const headAdmin = {
  id: "user_head",
  name: "Head Admin",
  email: HEAD_ADMIN_EMAIL,
  password: HEAD_ADMIN_PASSWORD,
  role: "head_admin",
  loginToken: "head-admin-token",
  assignedTenantIds: [],
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError(500, "Supabase env is missing. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.");
  }
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function supabaseRequest(pathname, options = {}) {
  requireSupabase();
  const service = options.service !== false;
  const key = service ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.msg || payload?.error_description || payload?.error || "Supabase request failed.";
    throw new ApiError(response.status, message);
  }
  return payload;
}

async function findAuthUserByEmail(email) {
  const payload = await supabaseRequest("/auth/v1/admin/users?page=1&per_page=1000");
  const users = Array.isArray(payload) ? payload : payload?.users || [];
  return users.find((user) => String(user.email || "").toLowerCase() === email.toLowerCase()) || null;
}

async function ensureAuthUser(user) {
  const email = String(user.email || "").trim().toLowerCase();
  const password = String(user.password || (user.role === "head_admin" ? HEAD_ADMIN_PASSWORD : "password123"));
  if (!email) throw new ApiError(400, "User email is required.");

  let authUser = await findAuthUserByEmail(email);
  if (!authUser) {
    try {
      authUser = await supabaseRequest("/auth/v1/admin/users", {
        method: "POST",
        body: {
          email,
          password,
          email_confirm: true,
          user_metadata: { name: user.name || email, role: user.role || "user" },
        },
      });
    } catch (error) {
      if (error.status !== 400 && error.status !== 422) throw error;
      authUser = await findAuthUserByEmail(email);
      if (!authUser) throw error;
    }
  }

  await supabaseRequest(`/auth/v1/admin/users/${authUser.id}`, {
    method: "PUT",
    body: {
      password,
      user_metadata: { name: user.name || email, role: user.role || "user" },
    },
  });

  return authUser;
}

function normalizeUser(user, authUserId = user.auth_user_id) {
  const email = String(user.email || "").trim().toLowerCase();
  return {
    id: user.id || `user_${Math.random().toString(36).slice(2, 10)}`,
    auth_user_id: authUserId,
    name: user.name || email,
    email,
    password: user.password || (user.role === "head_admin" ? HEAD_ADMIN_PASSWORD : "password123"),
    role: user.role === "head_admin" ? "head_admin" : "user",
    loginToken: user.loginToken || user.login_token || createToken(),
    assignedTenantIds: Array.isArray(user.assignedTenantIds) ? user.assignedTenantIds : user.assigned_tenant_ids || [],
  };
}

function createToken() {
  return `tok_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`;
}

async function fetchAppUsers() {
  const rows = await supabaseRequest("/rest/v1/app_users?select=*&order=created_at.asc");
  return (rows || []).map((row) => normalizeUser({
    id: row.id,
    auth_user_id: row.auth_user_id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role,
    login_token: row.login_token,
    assigned_tenant_ids: row.assigned_tenant_ids || [],
  }));
}

async function fetchTenants() {
  const rows = await supabaseRequest("/rest/v1/tenants?select=*&order=created_at.asc");
  return (rows || []).map((row) => normalizeTenantAbMessages(row.data)).filter(Boolean);
}

function normalizeTenantAbMessages(tenant) {
  if (!tenant) return tenant;
  tenant.messenger = {
    ...(tenant.messenger || {}),
    buttonLabel: tenant.messenger?.buttonLabel || DEFAULT_AB_BUTTON_LABEL,
    buttonMode: AB_BUTTON_MODES.includes(tenant.messenger?.buttonMode) ? tenant.messenger.buttonMode : "both",
    embeddedPageEnabled: Boolean(tenant.messenger?.embeddedPageEnabled),
    embeddedPageUrl: tenant.messenger?.embeddedPageUrl || "",
    embeddedPageButtonLabel: tenant.messenger?.embeddedPageButtonLabel || DEFAULT_EMBEDDED_PAGE_BUTTON_LABEL,
    embeddedPageBannerMessage: tenant.messenger?.embeddedPageBannerMessage || DEFAULT_EMBEDDED_PAGE_BANNER_MESSAGE,
    embeddedPageBannerButtonLabel: tenant.messenger?.embeddedPageBannerButtonLabel || DEFAULT_EMBEDDED_PAGE_BANNER_BUTTON_LABEL,
    embeddedPageBannerPosition: tenant.messenger?.embeddedPageBannerPosition === "bottom" ? "bottom" : "top",
  };
  const buttonLabel = tenant.messenger.buttonLabel;
  const existingFields = tenant.booking && Array.isArray(tenant.booking.fields) ? tenant.booking.fields : null;
  const legacyQuestions = normalizeBookingQuestions(tenant.booking?.questions || []);
  tenant.followUp = {
    ...(tenant.followUp || {}),
    bookingAbandonedEnabled: tenant.followUp?.bookingAbandonedEnabled !== false,
    bookingAbandonedDelayMinutes: Number(tenant.followUp?.bookingAbandonedDelayMinutes || 5),
    bookingAbandonedMessage: tenant.followUp?.bookingAbandonedMessage || DEFAULT_BOOKING_ABANDONED_MESSAGE,
    first24FibonacciEnabled: tenant.followUp?.first24FibonacciEnabled !== false,
    first24FibonacciMinutes: normalizeFirst24Intervals(tenant.followUp?.first24FibonacciMinutes),
  };
  tenant.booking = {
    ...(tenant.booking || {}),
    thankYouMessage: tenant.booking?.thankYouMessage || "Thank you for booking. We received your request and will confirm it soon.",
    deliveryFileUrl: tenant.booking?.deliveryFileUrl || "",
    deliveryFileType: tenant.booking?.deliveryFileType || "",
    fields: normalizeBookingFields(existingFields, legacyQuestions),
  };
  tenant.contacts = dedupeTenantContacts(tenant.contacts || []);
  tenant.messages = Array.isArray(tenant.messages) ? tenant.messages.map((message, index) => ({
    ...message,
    id: message.id || `m_${index + 1}_${Math.random().toString(36).slice(2, 8)}`,
    text: message.text || "",
    buttonLabel: message.buttonLabel || buttonLabel,
    buttonMode: AB_BUTTON_MODES.includes(message.buttonMode) ? message.buttonMode : "both",
    sent: Number(message.sent || 0),
    responses: Number(message.responses || 0),
  })) : [];
  return tenant;
}

function defaultBookingFields() {
  return [
    { id: "field_name", key: "name", label: "Name", type: "text", required: true, options: [] },
    { id: "field_email", key: "email", label: "Email", type: "email", required: true, options: [] },
    { id: "field_phone", key: "phone", label: "Phone", type: "phone", required: true, options: [] },
    { id: "field_note", key: "note", label: "Note", type: "textarea", required: false, options: [] },
  ];
}

function normalizeBookingQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map((question, index) => ({
    id: question.id || `q_${index + 1}_${Math.random().toString(36).slice(2, 8)}`,
    label: question.label || `Question ${index + 1}`,
    type: BOOKING_FIELD_TYPES.includes(question.type) ? question.type : "text",
    required: Boolean(question.required),
    options: Array.isArray(question.options)
      ? question.options.filter(Boolean)
      : String(question.options || "").split(",").map((option) => option.trim()).filter(Boolean),
  }));
}

function normalizeBookingFields(fields, legacyQuestions = []) {
  const source = Array.isArray(fields)
    ? fields
    : [
        ...defaultBookingFields(),
        ...legacyQuestions.map((question) => ({ ...question, key: `custom_${question.id}` })),
      ];
  return source.map((field, index) => ({
    id: field.id || `field_${index + 1}_${Math.random().toString(36).slice(2, 8)}`,
    key: field.key || `custom_${field.id || index + 1}`,
    label: field.label || `Field ${index + 1}`,
    type: BOOKING_FIELD_TYPES.includes(field.type) ? field.type : "text",
    required: Boolean(field.required),
    options: Array.isArray(field.options)
      ? field.options.filter(Boolean)
      : String(field.options || "").split(",").map((option) => option.trim()).filter(Boolean),
  }));
}

function normalizeFirst24Intervals(value) {
  const minutes = Array.isArray(value) ? value.map(Number).filter((minute) => minute > 0) : [];
  if (!minutes.length) return [...DEFAULT_FIRST24_FIBONACCI_MINUTES];
  if (minutes.join(",") === "5,8,13") return [...DEFAULT_FIRST24_FIBONACCI_MINUTES];
  return minutes;
}

async function ensureHeadAdmin() {
  const authUser = await ensureAuthUser(headAdmin);
  await upsertUsers([{ ...headAdmin, auth_user_id: authUser.id }]);
}

async function upsertUsers(users) {
  if (!users.length) return;
  const rows = users.map((user) => {
    const normalized = normalizeUser(user, user.auth_user_id);
    return {
      id: normalized.id,
      auth_user_id: normalized.auth_user_id,
      name: normalized.name,
      email: normalized.email,
      password: normalized.password,
      role: normalized.role,
      login_token: normalized.loginToken,
      assigned_tenant_ids: normalized.assignedTenantIds,
      updated_at: new Date().toISOString(),
    };
  });
  await supabaseRequest("/rest/v1/app_users?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: rows,
  });
}

async function upsertTenants(tenants) {
  if (!tenants.length) return;
  const rows = tenants.map((tenant) => ({
    id: tenant.id,
    data: tenant,
    updated_at: new Date().toISOString(),
  }));
  await supabaseRequest("/rest/v1/tenants?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: rows,
  });
}

function tenantLog(tenant, text) {
  tenant.logs = Array.isArray(tenant.logs) ? tenant.logs : [];
  tenant.logs.unshift({ id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), text });
  tenant.logs = tenant.logs.slice(0, 20);
}

function calculateBestContactTime(contact) {
  const inboundMinutes = (contact.engagement || [])
    .filter((event) => event?.at && event.type === "reply")
    .map((event) => {
      const date = new Date(event.at);
      return date.getHours() * 60 + date.getMinutes();
    })
    .filter((minutes) => Number.isFinite(minutes));
  if (!inboundMinutes.length) {
    const fallback = Number.isInteger(contact.bestContactMinutes)
      ? contact.bestContactMinutes
      : Number.isInteger(contact.bestContactHour)
        ? contact.bestContactHour * 60 + Number(contact.bestContactMinute || 0)
        : 10 * 60;
    return { hour: Math.floor(fallback / 60), minute: fallback % 60, minutes: fallback };
  }

  const bandwidthMinutes = 45;
  let bestMinutes = 10 * 60;
  let bestScore = -Infinity;
  for (let candidate = 0; candidate < 24 * 60; candidate += 5) {
    const score = inboundMinutes.reduce((total, minutes) => {
      const rawDistance = Math.abs(candidate - minutes);
      const circularDistance = Math.min(rawDistance, 24 * 60 - rawDistance);
      return total + Math.exp(-(circularDistance ** 2) / (2 * bandwidthMinutes ** 2));
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestMinutes = candidate;
    }
  }
  return { hour: Math.floor(bestMinutes / 60), minute: bestMinutes % 60, minutes: bestMinutes };
}

function addContactEngagement(contact, event) {
  contact.engagement = Array.isArray(contact.engagement) ? contact.engagement : [];
  const key = `${event.id || ""}:${event.at}:${event.type || ""}`;
  const exists = contact.engagement.some((item) => `${item.id || ""}:${item.at}:${item.type || ""}` === key);
  if (!exists) contact.engagement.push(event);
  contact.engagement.sort((a, b) => new Date(a.at) - new Date(b.at));
  const best = calculateBestContactTime(contact);
  contact.bestContactHour = best.hour;
  contact.bestContactMinute = best.minute;
  contact.bestContactMinutes = best.minutes;
  contact.inboundMessageCount = countInboundMessages(contact);
  return !exists;
}

function countInboundMessages(contact) {
  return (contact.engagement || []).filter((event) => event.type === "reply").length;
}

function normalizeContactTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const seen = new Set();
  return source
    .map((tag) => String(tag || "").trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function contactIdentityKeys(contact = {}) {
  const name = String(contact.name || "").trim().toLowerCase();
  const email = String(contact.email || "").trim().toLowerCase();
  const phone = String(contact.phone || "").replace(/\D+/g, "");
  return [
    contact.psid ? `psid:${contact.psid}` : "",
    contact.conversationId ? `conversation:${contact.conversationId}` : "",
    email ? `email:${email}` : "",
    phone ? `phone:${phone}` : "",
    name ? `name:${name}` : "",
    contact.id ? `id:${contact.id}` : "",
  ].filter(Boolean);
}

function mergeContactEngagement(existing = [], incoming = []) {
  const byKey = new Map();
  [...existing, ...incoming].forEach((event) => {
    if (!event?.at) return;
    byKey.set(`${event.id || ""}:${event.at}:${event.type || ""}`, { ...event });
  });
  return [...byKey.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
}

function earlierDate(a, b) {
  const first = new Date(a || 0);
  const second = new Date(b || 0);
  if (!Number.isFinite(first.getTime())) return b || a || "";
  if (!Number.isFinite(second.getTime())) return a || b || "";
  return first <= second ? a : b;
}

function laterDate(a, b) {
  const first = new Date(a || 0);
  const second = new Date(b || 0);
  if (!Number.isFinite(first.getTime())) return b || a || "";
  if (!Number.isFinite(second.getTime())) return a || b || "";
  return first >= second ? a : b;
}

function mergeContactRecord(existing, incoming) {
  existing.name = existing.name || incoming.name || "";
  existing.email = existing.email || incoming.email || "";
  existing.phone = existing.phone || incoming.phone || "";
  existing.psid = existing.psid || incoming.psid || "";
  existing.conversationId = existing.conversationId || incoming.conversationId || "";
  existing.source = existing.source || incoming.source || "Messenger";
  existing.status = existing.booked ? existing.status : existing.status || incoming.status || "new";
  existing.createdAt = earlierDate(existing.createdAt, incoming.createdAt);
  existing.lastMessageAt = laterDate(existing.lastMessageAt, incoming.lastMessageAt);
  existing.lastInboundMessageAt = laterDate(existing.lastInboundMessageAt, incoming.lastInboundMessageAt);
  existing.lastUserMessageAt = laterDate(existing.lastUserMessageAt, incoming.lastUserMessageAt);
  existing.lastMessageText = existing.lastMessageText || incoming.lastMessageText || "";
  existing.lastMessageDirection = existing.lastMessageDirection || incoming.lastMessageDirection || "";
  existing.profilePic = existing.profilePic || incoming.profilePic || "";
  existing.booked = Boolean(existing.booked || incoming.booked);
  existing.bookedDone = Boolean(existing.bookedDone || incoming.bookedDone);
  existing.bookingId = existing.bookingId || incoming.bookingId || "";
  existing.bookingSlot = existing.bookingSlot || incoming.bookingSlot || "";
  existing.bookingSummary = existing.bookingSummary || incoming.bookingSummary || "";
  existing.bookingAnswers = existing.bookingAnswers || incoming.bookingAnswers || [];
  existing.notes = existing.notes || incoming.notes || "";
  existing.tags = normalizeContactTags([...(existing.tags || []), ...(incoming.tags || [])]);
  existing.followUpsSent = Math.max(Number(existing.followUpsSent || 0), Number(incoming.followUpsSent || 0));
  existing.first24FollowUpsSent = Math.max(Number(existing.first24FollowUpsSent || 0), Number(incoming.first24FollowUpsSent || 0));
  existing.engagement = mergeContactEngagement(existing.engagement || [], incoming.engagement || []);
  const best = calculateBestContactTime(existing);
  existing.bestContactHour = best.hour;
  existing.bestContactMinute = best.minute;
  existing.bestContactMinutes = best.minutes;
  existing.inboundMessageCount = countInboundMessages(existing);
  return existing;
}

function dedupeTenantContacts(contacts = []) {
  const indexes = new Map();
  const deduped = [];
  contacts.forEach((contact) => {
    const keys = contactIdentityKeys(contact);
    const existingIndex = keys.map((key) => indexes.get(key)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      deduped.push(contact);
      keys.forEach((key) => indexes.set(key, deduped.length - 1));
      return;
    }
    const existing = deduped[existingIndex];
    mergeContactRecord(existing, contact);
    contactIdentityKeys(existing).forEach((key) => indexes.set(key, existingIndex));
  });
  return deduped;
}

function isGenericMessengerName(name = "") {
  return /^Messenger Contact \d+$/i.test(String(name || "").trim()) || String(name || "").trim() === "Messenger Contact";
}

function profileDisplayName(profile = {}) {
  const explicit = String(profile.name || "").trim();
  if (explicit) return explicit;
  return [profile.first_name, profile.last_name].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

function profilePayloadFromParticipant(participant = {}) {
  const name = String(participant.name || "").trim();
  if (!name) return null;
  return {
    id: participant.id || "",
    name,
    first_name: name.split(/\s+/)[0] || "",
    last_name: name.split(/\s+/).slice(1).join(" "),
    profile_pic: participant.profile_pic || participant.picture?.data?.url || "",
  };
}

function profileFromConversationPayload(payload, tenant, psid) {
  const conversations = payload?.data || [];
  for (const conversation of conversations) {
    const participant = pickContactParticipant(conversation, tenant);
    if (participant && (!psid || String(participant.id || "") === String(psid))) {
      const profile = profilePayloadFromParticipant(participant);
      if (profile) return profile;
    }
  }
  return null;
}

async function fetchMessengerProfile(tenant, psid) {
  if (!tenant?.pageAccessToken || !psid) return null;
  try {
    const profile = await graphRequest(`/${psid}`, {
      fields: "first_name,last_name,name,profile_pic",
    }, tenant.pageAccessToken);
    if (profileDisplayName(profile)) return profile;
  } catch (error) {
    tenantLog(tenant, `Direct Messenger profile lookup failed for ${psid}: ${error.message}`);
  }
  const fields = "id,updated_time,snippet,participants,senders,messages.limit(5){from,message,created_time}";
  const attempts = [
    { path: `/${tenant.pageId}/conversations`, params: { user_id: psid, platform: "messenger", fields } },
    { path: "/me/conversations", params: { user_id: psid, platform: "messenger", fields } },
  ];
  for (const attempt of attempts) {
    try {
      const payload = await graphRequest(attempt.path, attempt.params, tenant.pageAccessToken);
      const profile = profileFromConversationPayload(payload, tenant, psid);
      if (profile) return profile;
    } catch (error) {
      tenantLog(tenant, `Conversation name lookup failed for ${psid}: ${error.message}`);
    }
  }
  return null;
}

function eventMessageText(event) {
  const text = String(event.message?.text || event.postback?.title || event.postback?.payload || "").trim();
  if (text) return text;
  const attachments = event.message?.attachments || [];
  if (attachments.length) return `[${attachments.map((attachment) => attachment.type || "attachment").join(", ")}]`;
  return "";
}

function updateLastInboundMessage(contact, at, text) {
  const incomingTime = new Date(at).getTime();
  const currentTime = new Date(contact.lastInboundMessageAt || contact.lastMessageAt || 0).getTime();
  if (!currentTime || incomingTime >= currentTime) {
    contact.lastInboundMessageAt = at;
    contact.lastMessageAt = at;
    contact.lastMessageText = text || contact.lastMessageText || "";
    contact.lastMessageDirection = "inbound";
  }
}

function requestOrigin(request) {
  const proto = String(request.headers["x-forwarded-proto"] || "").split(",")[0] || (request.socket.encrypted ? "https" : "http");
  return `${proto}://${request.headers.host}`;
}

function bookingUrlForTenant(tenant, origin, contact = null) {
  const slug = tenant.booking?.slug || "booking";
  const params = new URLSearchParams({
    source: "messenger_welcome",
    tenant: tenant.id,
  });
  if (contact?.psid) params.set("contact", contact.psid);
  return `${origin}/index.html?${params.toString()}#booking/${encodeURIComponent(slug)}`;
}

function safeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function embeddedSiteUrlForTenant(tenant, origin, contact = null) {
  const slug = tenant.booking?.slug || tenant.id || "site";
  const params = new URLSearchParams({
    source: "embedded_page",
    tenant: tenant.id,
  });
  if (contact?.psid) params.set("contact", contact.psid);
  return `${origin}/index.html?${params.toString()}#site/${encodeURIComponent(slug)}`;
}

function messengerWebButtons(tenant, origin, contact, bookingTitle = DEFAULT_AB_BUTTON_LABEL, buttonMode = "both") {
  const mode = AB_BUTTON_MODES.includes(buttonMode) ? buttonMode : "both";
  const buttons = [];
  if (mode !== "booking_only" && tenant.messenger?.embeddedPageEnabled && safeExternalUrl(tenant.messenger.embeddedPageUrl)) {
    buttons.push({
      type: "web_url",
      url: embeddedSiteUrlForTenant(tenant, origin, contact),
      title: String(tenant.messenger.embeddedPageButtonLabel || DEFAULT_EMBEDDED_PAGE_BUTTON_LABEL).slice(0, 20),
    });
  }
  if (mode !== "embedded_only") {
    buttons.push({
      type: "web_url",
      url: bookingUrlForTenant(tenant, origin, contact),
      title: String(bookingTitle || tenant.messenger?.buttonLabel || DEFAULT_AB_BUTTON_LABEL).slice(0, 20),
    });
  }
  if (!buttons.length) {
    buttons.push({
      type: "web_url",
      url: bookingUrlForTenant(tenant, origin, contact),
      title: String(bookingTitle || tenant.messenger?.buttonLabel || DEFAULT_AB_BUTTON_LABEL).slice(0, 20),
    });
  }
  return buttons.slice(0, 3);
}

function minutesSince(value) {
  if (!value) return Infinity;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return (Date.now() - time) / 60000;
}

function abandonedFollowUpDelayMinutes(tenant) {
  return Math.max(1, Number(tenant.followUp?.bookingAbandonedDelayMinutes || 5));
}

function abandonedFollowUpDueAt(openedAt, tenant) {
  const openedTime = new Date(openedAt || 0).getTime();
  if (!Number.isFinite(openedTime)) return null;
  return new Date(openedTime + abandonedFollowUpDelayMinutes(tenant) * 60000);
}

function isAbandonedFollowUpSending(contact) {
  return contact?.bookingAbandonedFollowUpStatus === "sending" &&
    minutesSince(contact.bookingAbandonedFollowUpStartedAt) < BOOKING_ABANDONED_SEND_LOCK_MINUTES;
}

function hasPendingAbandonedFollowUp(contact) {
  return contact?.bookingAbandonedFollowUpStatus === "scheduled" &&
    !contact.bookingAbandonedFollowUpSent &&
    Boolean(contact.bookingAbandonedFollowUpDueAt);
}

function markAbandonedFollowUpScheduled(contact, tenant, source, at = new Date().toISOString()) {
  const dueAt = abandonedFollowUpDueAt(at, tenant);
  contact.lastBookingOpenedAt = at;
  contact.lastBookingOpenedSource = source || "booking_page";
  contact.bookingAbandonedFollowUpStatus = "scheduled";
  contact.bookingAbandonedFollowUpScheduledAt = at;
  contact.bookingAbandonedFollowUpDueAt = dueAt ? dueAt.toISOString() : "";
  contact.bookingAbandonedFollowUpStartedAt = "";
  contact.bookingAbandonedFollowUpError = "";
  return dueAt;
}

function markAbandonedFollowUpSending(contact) {
  const at = new Date().toISOString();
  contact.bookingAbandonedFollowUpStatus = "sending";
  contact.bookingAbandonedFollowUpStartedAt = at;
  contact.bookingAbandonedFollowUpClaimId = `booking_abandoned_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  contact.bookingAbandonedFollowUpError = "";
  return contact.bookingAbandonedFollowUpClaimId;
}

function shouldSuppressBookingButton(contact, tenant) {
  const minutes = Number(tenant.messenger?.suppressAfterUserMessageMinutes ?? 60);
  if (minutes <= 0) return false;
  return minutesSince(contact.lastUserMessageAt) < minutes;
}

function messengerAttachmentType(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "video") return "video";
  if (normalized === "audio") return "audio";
  if (normalized === "raw" || normalized === "file") return "file";
  return "image";
}

function interpolateMessage(text, contact, tenant, origin) {
  const url = bookingUrlForTenant(tenant, origin, contact);
  const embeddedUrl = embeddedSiteUrlForTenant(tenant, origin, contact);
  const rawName = String(contact.name || "").trim();
  const displayName = rawName && !isGenericMessengerName(rawName) ? rawName : "there";
  return String(text || "")
    .replaceAll("{{firstName}}", displayName.split(" ")[0] || "there")
    .replaceAll("{{name}}", displayName)
    .replaceAll("{{bookingLink}}", url)
    .replaceAll("{{messengerBookingLink}}", url)
    .replaceAll("{{embeddedPageLink}}", embeddedUrl);
}

function cleanButtonCardText(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\{\{(?:bookingLink|messengerBookingLink|embeddedPageLink)\}\}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function messageScore(message) {
  return Number(message.sent || 0) ? Number(message.responses || 0) / Number(message.sent || 0) : 0;
}

function chooseAbMessage(tenant) {
  const messages = Array.isArray(tenant.messages) ? tenant.messages.filter((message) => String(message.text || "").trim()) : [];
  if (!messages.length) return null;
  return [...messages].sort((a, b) =>
    Number(a.sent || 0) - Number(b.sent || 0) ||
    messageScore(b) - messageScore(a) ||
    String(a.id || "").localeCompare(String(b.id || ""))
  )[0];
}

function abMessageText(message, tenant) {
  if (!message?.text || message.text === DEFAULT_AB_MESSAGE) return tenant.messenger?.welcomeMessage || DEFAULT_AB_MESSAGE;
  return message.text;
}

function abButtonLabel(message, tenant) {
  return String(message?.buttonLabel || tenant.messenger?.buttonLabel || DEFAULT_AB_BUTTON_LABEL).slice(0, 20);
}

function markFirst24SlotConsumed(contact) {
  contact.first24FollowUpsSent = Math.max(1, Number(contact.first24FollowUpsSent || 0));
}

async function sendAbFollowUpIfAvailable(tenant, contact, origin) {
  if (tenant.messenger?.autoAbFollowUpEnabled === false) return { sent: false, reason: "disabled" };
  if (contact?.booked) return { sent: false, reason: "contact already booked" };
  if (!contact?.psid) return { sent: false, reason: "missing contact PSID" };
  if (!tenant.pageAccessToken) return { sent: false, reason: "missing Page access token" };
  const message = chooseAbMessage(tenant);
  if (!message) return { sent: false, reason: "no A/B messages configured" };
  const url = bookingUrlForTenant(tenant, origin, contact);
  const text = interpolateMessage(abMessageText(message, tenant), contact, tenant, origin).slice(0, 640);
  const title = abButtonLabel(message, tenant);
  const buttons = messengerWebButtons(tenant, origin, contact, title, message.buttonMode || "both");
  await graphPost("/me/messages", {
    messaging_type: "RESPONSE",
    recipient: { id: contact.psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text,
          buttons,
        },
      },
    },
  }, tenant.pageAccessToken);
  const sendId = `ab_${message.id}_${Date.now()}`;
  message.sent = Number(message.sent || 0) + 1;
  contact.lastAbMessageSentAt = new Date().toISOString();
  contact.lastAbMessageId = message.id;
  contact.lastAbSendId = sendId;
  addContactEngagement(contact, { id: sendId, at: contact.lastAbMessageSentAt, type: "message", source: "auto_ab_button_card" });
  return { sent: true, messageId: message.id };
}

function recordAbResponseIfNeeded(tenant, contact, event) {
  if (!contact?.lastAbMessageId || !contact.lastAbSendId) return null;
  if (contact.lastAbResponseCountedFor === contact.lastAbSendId) return null;
  const messageAt = event.timestamp ? new Date(Number(event.timestamp)).getTime() : Date.now();
  const sentAt = new Date(contact.lastAbMessageSentAt || 0).getTime();
  if (sentAt && messageAt <= sentAt) return null;
  const message = (tenant.messages || []).find((item) => item.id === contact.lastAbMessageId);
  if (!message) return null;
  message.responses = Number(message.responses || 0) + 1;
  contact.lastAbResponseCountedFor = contact.lastAbSendId;
  return message.id;
}

async function sendBookingButtonIfAllowed(tenant, contact, origin) {
  if (!tenant.messenger?.welcomeEnabled) return { sent: false, reason: "disabled" };
  if (contact?.booked) return { sent: false, reason: "contact already booked" };
  if (!contact?.psid) return { sent: false, reason: "missing contact PSID" };
  if (!tenant.pageAccessToken) return { sent: false, reason: "missing Page access token" };
  if (shouldSuppressBookingButton(contact, tenant)) {
    return { sent: false, reason: `suppressed after team message for ${tenant.messenger.suppressAfterUserMessageMinutes ?? 60} minutes` };
  }

  const url = bookingUrlForTenant(tenant, origin, contact);
  const text = String(tenant.messenger.welcomeMessage || tenant.messenger.cta || "You can book a time here.")
    .replaceAll("{{firstName}}", String(contact.name || "there").split(" ")[0] || "there")
    .replaceAll("{{name}}", contact.name || "there")
    .replaceAll("{{bookingLink}}", url)
    .replaceAll("{{messengerBookingLink}}", url)
    .replaceAll("{{embeddedPageLink}}", embeddedSiteUrlForTenant(tenant, origin, contact));
  const title = String(tenant.messenger.buttonLabel || "Book now").slice(0, 20);
  const buttons = messengerWebButtons(tenant, origin, contact, title, tenant.messenger?.buttonMode || "both");
  const mediaUrl = String(tenant.messenger.welcomeMediaUrl || "").trim();
  const mediaType = String(tenant.messenger.welcomeMediaType || "image").toLowerCase();
  const messengerMediaType = messengerAttachmentType(mediaType);

  if (mediaUrl) {
    await graphPost("/me/messages", {
      messaging_type: "RESPONSE",
      recipient: { id: contact.psid },
      message: {
        attachment: {
          type: messengerMediaType,
          payload: {
            url: mediaUrl,
            is_reusable: true,
          },
        },
      },
    }, tenant.pageAccessToken);
  }

  await graphPost("/me/messages", {
    messaging_type: "RESPONSE",
    recipient: { id: contact.psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: text.slice(0, 640),
          buttons,
        },
      },
    },
  }, tenant.pageAccessToken);

  const at = new Date().toISOString();
  contact.lastBookingButtonSentAt = at;
  addContactEngagement(contact, { id: `booking_button_${Date.now()}`, at, type: "message", source: mediaUrl ? "auto_booking_button_with_media" : "auto_booking_button" });
  return { sent: true, url, mediaSent: Boolean(mediaUrl) };
}

async function sendBookingDeliveryToMessenger(tenant, input = {}) {
  if (!tenant?.pageAccessToken) return { sent: false, reason: "missing Page access token" };
  const contactPsid = String(input.contactPsid || "").trim();
  const contactId = String(input.contactId || "").trim();
  const contactName = String(input.contactName || "").trim().toLowerCase();
  const contact = (tenant.contacts || []).find((item) =>
    (contactPsid && item.psid === contactPsid) ||
    (contactId && item.id === contactId) ||
    (contactName && String(item.name || "").toLowerCase() === contactName)
  );
  if (!contact?.psid) return { sent: false, reason: "missing Messenger contact" };

  const text = String(tenant.booking?.thankYouMessage || "").trim();
  const fileUrl = String(tenant.booking?.deliveryFileUrl || "").trim();
  const fileType = messengerAttachmentType(tenant.booking?.deliveryFileType || "file");
  if (!text && !fileUrl) return { sent: false, reason: "no thank-you message or file configured" };

  if (text) {
    await graphPost("/me/messages", {
      messaging_type: "RESPONSE",
      recipient: { id: contact.psid },
      message: { text: text.slice(0, 2000) },
    }, tenant.pageAccessToken);
  }
  if (fileUrl) {
    await graphPost("/me/messages", {
      messaging_type: "RESPONSE",
      recipient: { id: contact.psid },
      message: {
        attachment: {
          type: fileType,
          payload: {
            url: fileUrl,
            is_reusable: true,
          },
        },
      },
    }, tenant.pageAccessToken);
  }

  const at = new Date().toISOString();
  contact.lastBookingDeliverySentAt = at;
  addContactEngagement(contact, { id: `booking_delivery_${input.bookingId || Date.now()}`, at, type: "message", source: fileUrl ? "booking_delivery_file" : "booking_delivery_message" });
  tenantLog(tenant, `Sent booking delivery${fileUrl ? " file" : ""} to ${contact.name}.`);
  return { sent: true, fileSent: Boolean(fileUrl), contactId: contact.id };
}

function findTenantContact(tenant, input = {}) {
  const contactPsid = String(input.contactPsid || "").trim();
  const contactId = String(input.contactId || "").trim();
  const contactName = String(input.contactName || "").trim().toLowerCase();
  return (tenant.contacts || []).find((item) =>
    (contactPsid && item.psid === contactPsid) ||
    (contactId && item.id === contactId) ||
    (contactName && String(item.name || "").toLowerCase() === contactName)
  ) || null;
}

async function sendMessengerButtonCard(tenant, contact, origin, text, buttonLabel, source) {
  if (!tenant?.pageAccessToken) return { sent: false, reason: "missing Page access token" };
  if (!contact?.psid) return { sent: false, reason: "missing contact PSID" };
  if (contact.booked) return { sent: false, reason: "contact already booked" };
  const url = bookingUrlForTenant(tenant, origin, contact);
  const buttons = messengerWebButtons(tenant, origin, contact, buttonLabel, tenant.messenger?.buttonMode || "both");
  await graphPost("/me/messages", {
    messaging_type: "RESPONSE",
    recipient: { id: contact.psid },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: cleanButtonCardText(interpolateMessage(text, contact, tenant, origin)).slice(0, 640),
          buttons,
        },
      },
    },
  }, tenant.pageAccessToken);
  const at = new Date().toISOString();
  contact.lastMessageAt = at;
  addContactEngagement(contact, { id: `${source || "auto_button"}_${Date.now()}`, at, type: "message", source: source || "auto_button" });
  return { sent: true, url };
}

async function sendAbandonedBookingFollowUp(tenant, contact, origin) {
  if (tenant.followUp?.bookingAbandonedEnabled === false) return { sent: false, reason: "disabled" };
  if (contact?.booked) return { sent: false, reason: "contact already booked" };
  if (contact?.bookingAbandonedFollowUpSent) {
    return { sent: false, reason: "already sent once" };
  }
  const text = cleanButtonCardText(tenant.followUp?.bookingAbandonedMessage || DEFAULT_BOOKING_ABANDONED_MESSAGE) || DEFAULT_BOOKING_ABANDONED_MESSAGE;
  const result = await sendMessengerButtonCard(tenant, contact, origin, text, tenant.messenger?.buttonLabel || "Book now", "booking_abandoned_follow_up");
  if (result.sent) {
    contact.lastBookingAbandonedSentAt = new Date().toISOString();
    contact.bookingAbandonedFollowUpSent = true;
    contact.bookingAbandonedFollowUpStatus = "sent";
    contact.bookingAbandonedFollowUpError = "";
    tenantLog(tenant, `Sent booking-page follow-up to ${contact.name}.`);
  }
  return result;
}

async function scheduleBookingOpenFollowUp(input = {}) {
  const tenants = await fetchTenants();
  const tenant = tenants.find((item) => item.id === input.tenantId || String(item.pageId || "") === String(input.pageId || ""));
  if (!tenant) throw new ApiError(404, "Connected page tenant not found.");
  const contact = findTenantContact(tenant, input);
  if (!contact) throw new ApiError(404, "Messenger contact not found.");
  if (contact.booked || contact.bookingAbandonedFollowUpSent) {
    return { scheduled: false, reason: contact.booked ? "contact already booked" : "already sent once", contactId: contact.id };
  }
  if (isAbandonedFollowUpSending(contact)) {
    return { scheduled: false, reason: "follow-up is already sending", contactId: contact.id };
  }
  if (hasPendingAbandonedFollowUp(contact)) {
    const openedAt = new Date(contact.lastBookingOpenedAt || 0);
    const continuedAt = new Date(contact.lastBookingContinuedAt || 0);
    const continuedAfterOpen = Number.isFinite(continuedAt.getTime()) && continuedAt >= openedAt;
    if (!continuedAfterOpen) {
      return {
        scheduled: false,
        reason: "follow-up already scheduled",
        dueAt: contact.bookingAbandonedFollowUpDueAt,
        contactId: contact.id,
      };
    }
  }
  const at = new Date().toISOString();
  const dueAt = markAbandonedFollowUpScheduled(contact, tenant, input.source, at);
  tenantLog(tenant, `${contact.name} opened the booking page.`);
  await upsertTenants(tenants);

  const timerKey = `${tenant.id}:${contact.psid || contact.id}`;
  if (bookingOpenTimers.has(timerKey)) clearTimeout(bookingOpenTimers.get(timerKey));
  const origin = input.origin;
  const timeout = setTimeout(async () => {
    bookingOpenTimers.delete(timerKey);
    try {
      const freshTenants = await fetchTenants();
      const freshTenant = freshTenants.find((item) => item.id === tenant.id);
      const freshContact = freshTenant ? findTenantContact(freshTenant, input) : null;
      if (!freshTenant || !freshContact || freshContact.booked || freshContact.bookingAbandonedFollowUpSent || isAbandonedFollowUpSending(freshContact)) return;
      const openedAt = new Date(freshContact.lastBookingOpenedAt || 0);
      const continuedAt = new Date(freshContact.lastBookingContinuedAt || 0);
      if (Number.isFinite(continuedAt.getTime()) && continuedAt >= openedAt) {
        freshContact.bookingAbandonedFollowUpStatus = "canceled";
        freshContact.bookingAbandonedFollowUpCanceledAt = new Date().toISOString();
        await upsertTenants(freshTenants);
        return;
      }
      markAbandonedFollowUpSending(freshContact);
      await upsertTenants(freshTenants);
      const result = await sendAbandonedBookingFollowUp(freshTenant, freshContact, origin);
      if (!result.sent) {
        freshContact.bookingAbandonedFollowUpStatus = "failed";
        freshContact.bookingAbandonedFollowUpError = result.reason || "not sent";
      }
      await upsertTenants(freshTenants);
    } catch (error) {
      console.warn("Booking abandoned follow-up failed:", error.message);
    }
  }, Math.max(1000, (dueAt ? dueAt.getTime() - Date.now() : abandonedFollowUpDelayMinutes(tenant) * 60000)));
  bookingOpenTimers.set(timerKey, timeout);
  return { scheduled: true, delayMinutes: abandonedFollowUpDelayMinutes(tenant), dueAt: contact.bookingAbandonedFollowUpDueAt, contactId: contact.id };
}

async function cancelBookingOpenFollowUp(input = {}) {
  const tenants = await fetchTenants();
  const tenant = tenants.find((item) => item.id === input.tenantId || String(item.pageId || "") === String(input.pageId || ""));
  if (!tenant) throw new ApiError(404, "Connected page tenant not found.");
  const contact = findTenantContact(tenant, input);
  if (!contact) throw new ApiError(404, "Messenger contact not found.");
  const timerKey = `${tenant.id}:${contact.psid || contact.id}`;
  if (bookingOpenTimers.has(timerKey)) {
    clearTimeout(bookingOpenTimers.get(timerKey));
    bookingOpenTimers.delete(timerKey);
  }
  contact.lastBookingContinuedAt = new Date().toISOString();
  if (!contact.bookingAbandonedFollowUpSent) {
    contact.bookingAbandonedFollowUpStatus = "canceled";
    contact.bookingAbandonedFollowUpCanceledAt = contact.lastBookingContinuedAt;
  }
  tenantLog(tenant, `${contact.name} continued on the booking page.`);
  await upsertTenants(tenants);
  return { canceled: true, contactId: contact.id };
}

function nextFirst24FollowUpAt(contact, tenant) {
  if (tenant.followUp?.first24FibonacciEnabled === false || contact.booked) return null;
  const createdAt = new Date(contact.createdAt || contact.lastInboundMessageAt || contact.lastMessageAt || 0);
  if (!Number.isFinite(createdAt.getTime())) return null;
  if (Date.now() - createdAt.getTime() >= 24 * 60 * 60 * 1000) return null;
  const sent = Number(contact.first24FollowUpsSent || 0);
  const intervals = Array.isArray(tenant.followUp?.first24FibonacciMinutes) && tenant.followUp.first24FibonacciMinutes.length
    ? tenant.followUp.first24FibonacciMinutes
    : DEFAULT_FIRST24_FIBONACCI_MINUTES;
  if (sent >= intervals.length) return null;
  const elapsed = intervals.slice(0, sent + 1).reduce((total, minute) => total + Number(minute || 0), 0);
  return new Date(createdAt.getTime() + elapsed * 60000);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function respectQuietHours(date, followUp = {}) {
  if (followUp.quietHoursEnabled === false) return date;
  const quietStart = Number(String(followUp.quietHoursStart || "20:00").split(":")[0]);
  const quietEnd = Number(String(followUp.quietHoursEnd || "08:00").split(":")[0]);
  const hour = date.getHours();
  const inQuiet = quietStart > quietEnd ? hour >= quietStart || hour < quietEnd : hour >= quietStart && hour < quietEnd;
  if (inQuiet) date.setHours(Number.isFinite(quietEnd) ? quietEnd : 8, 0, 0, 0);
  return date;
}

function nextScheduledContactFollowUp(contact, tenant) {
  if (!contact || contact.booked) return null;
  const followUp = tenant.followUp || {};
  const last = new Date(contact.lastMessageAt || contact.lastInboundMessageAt || contact.createdAt || 0);
  if (!Number.isFinite(last.getTime())) return null;
  const pattern = Array.isArray(followUp.pattern) && followUp.pattern.length ? followUp.pattern : [1, 3, 3];
  const sent = Number(contact.followUpsSent || 0);
  let targetDay = 0;
  for (let index = 0; index <= sent; index += 1) {
    targetDay += index < pattern.length ? Number(pattern[index] || 1) : Number(followUp.afterWindowEveryDays || 7);
  }
  const target = addDays(last, targetDay);
  const best = calculateBestContactTime(contact);
  target.setHours(best.hour, best.minute, 0, 0);
  respectQuietHours(target, followUp);
  const sinceLastDays = Math.max(0, Math.floor((Date.now() - last.getTime()) / 86400000));
  const mode = sinceLastDays >= Number(followUp.humanWindowDays || 7) ? "utility" : "human";
  return { at: target, mode };
}

async function sendScheduledContactFollowUp(tenant, contact, origin, plan) {
  if (!contact?.psid) return { sent: false, reason: "missing contact PSID" };
  if (shouldSuppressBookingButton(contact, tenant)) {
    return { sent: false, reason: `suppressed after team message for ${tenant.messenger?.suppressAfterUserMessageMinutes ?? 60} minutes` };
  }
  if (plan.mode === "utility") {
    const template = (tenant.templates || []).find((item) => item.name === tenant.messenger?.postWindowTemplate) || (tenant.templates || [])[0];
    if (template?.text) {
      return sendMessengerButtonCard(tenant, contact, origin, template.text, tenant.messenger?.buttonLabel || "Book now", "scheduled_utility_follow_up");
    }
  }
  let result = await sendAbFollowUpIfAvailable(tenant, contact, origin);
  if (!result.sent) result = await sendBookingButtonIfAllowed(tenant, contact, origin);
  return result;
}

async function scanScheduledContactFollowUps(origin = PUBLIC_ORIGIN) {
  const tenants = await fetchTenants();
  let sent = 0;
  let skipped = 0;
  let changed = false;
  for (const tenant of tenants) {
    for (const contact of tenant.contacts || []) {
      const plan = nextScheduledContactFollowUp(contact, tenant);
      if (!plan || plan.at > new Date()) {
        skipped += 1;
        continue;
      }
      try {
        const result = await sendScheduledContactFollowUp(tenant, contact, origin, plan);
        if (result.sent) {
          contact.followUpsSent = Number(contact.followUpsSent || 0) + 1;
          contact.lastMessageAt = new Date().toISOString();
          tenantLog(tenant, `Sent ${plan.mode === "utility" ? "utility" : "human-window"} follow-up ${contact.followUpsSent} to ${contact.name}.`);
          sent += 1;
          changed = true;
        } else {
          skipped += 1;
        }
      } catch (error) {
        tenantLog(tenant, `Scheduled follow-up failed for ${contact.name}: ${error.message}`);
        changed = true;
      }
    }
  }
  if (changed) await upsertTenants(tenants);
  return { sent, skipped };
}

async function scanAutomaticFollowUps(origin = PUBLIC_ORIGIN) {
  if (automaticFollowUpScanRunning) return;
  automaticFollowUpScanRunning = true;
  try {
    const tenants = await fetchTenants();
    let changed = false;
    for (const tenant of tenants) {
      for (const contact of tenant.contacts || []) {
        const dueAt = nextFirst24FollowUpAt(contact, tenant);
        if (!dueAt || dueAt > new Date()) continue;
        if (!contact.psid || shouldSuppressBookingButton(contact, tenant)) continue;
        try {
          let result = await sendAbFollowUpIfAvailable(tenant, contact, origin);
          if (!result.sent) result = await sendBookingButtonIfAllowed(tenant, contact, origin);
          if (result.sent) {
            contact.first24FollowUpsSent = Number(contact.first24FollowUpsSent || 0) + 1;
            tenantLog(tenant, `Sent first-24-hour Fibonacci follow-up ${contact.first24FollowUpsSent} to ${contact.name}.`);
            changed = true;
          }
        } catch (error) {
          tenantLog(tenant, `First-24-hour follow-up failed for ${contact.name}: ${error.message}`);
          changed = true;
        }
      }
    }
    if (changed) await upsertTenants(tenants);
  } catch (error) {
    console.warn("Automatic follow-up scan failed:", error.message);
  } finally {
    automaticFollowUpScanRunning = false;
  }
}

async function refreshGenericContactNames() {
  try {
    const tenants = await fetchTenants();
    let changed = false;
    for (const tenant of tenants) {
      for (const contact of tenant.contacts || []) {
        if (!contact.psid || !isGenericMessengerName(contact.name)) continue;
        const profile = await fetchMessengerProfile(tenant, contact.psid);
        const realName = profileDisplayName(profile);
        if (!realName || isGenericMessengerName(realName)) continue;
        contact.name = realName;
        if (profile?.profile_pic) contact.profilePic = contact.profilePic || profile.profile_pic;
        tenantLog(tenant, `Updated Messenger contact name for ${contact.psid} to ${realName}.`);
        changed = true;
      }
    }
    if (changed) await upsertTenants(tenants);
    return { changed };
  } catch (error) {
    console.warn("Generic contact name refresh failed:", error.message);
    return { changed: false, error: error.message };
  }
}

async function scanAbandonedBookingFollowUps(origin = PUBLIC_ORIGIN) {
  const tenants = await fetchTenants();
  let sent = 0;
  let skipped = 0;
  let changed = false;
  for (const tenant of tenants) {
    if (tenant.followUp?.bookingAbandonedEnabled === false) {
      skipped += (tenant.contacts || []).length;
      continue;
    }
    for (const contact of tenant.contacts || []) {
      if (!contact.psid || contact.booked || contact.bookingAbandonedFollowUpSent || isAbandonedFollowUpSending(contact) || contact.bookingAbandonedFollowUpStatus === "failed") {
        skipped += 1;
        continue;
      }
      const openedAt = new Date(contact.lastBookingOpenedAt || 0);
      if (!Number.isFinite(openedAt.getTime())) {
        skipped += 1;
        continue;
      }
      const continuedAt = new Date(contact.lastBookingContinuedAt || 0);
      if (Number.isFinite(continuedAt.getTime()) && continuedAt >= openedAt) {
        if (contact.bookingAbandonedFollowUpStatus === "scheduled") {
          contact.bookingAbandonedFollowUpStatus = "canceled";
          contact.bookingAbandonedFollowUpCanceledAt = new Date().toISOString();
          changed = true;
        }
        skipped += 1;
        continue;
      }
      const dueAt = new Date(contact.bookingAbandonedFollowUpDueAt || abandonedFollowUpDueAt(openedAt, tenant) || 0);
      if (!contact.bookingAbandonedFollowUpDueAt && Number.isFinite(dueAt.getTime())) {
        contact.bookingAbandonedFollowUpDueAt = dueAt.toISOString();
        contact.bookingAbandonedFollowUpStatus = contact.bookingAbandonedFollowUpStatus || "scheduled";
        changed = true;
      }
      if (!Number.isFinite(dueAt.getTime()) || dueAt > new Date()) {
        skipped += 1;
        continue;
      }
      try {
        markAbandonedFollowUpSending(contact);
        changed = true;
        await upsertTenants(tenants);
        const result = await sendAbandonedBookingFollowUp(tenant, contact, origin);
        if (result.sent) {
          sent += 1;
          changed = true;
        } else {
          contact.bookingAbandonedFollowUpStatus = "failed";
          contact.bookingAbandonedFollowUpError = result.reason || "not sent";
          skipped += 1;
          changed = true;
        }
      } catch (error) {
        contact.bookingAbandonedFollowUpStatus = "failed";
        contact.bookingAbandonedFollowUpError = error.message;
        tenantLog(tenant, `Booking-page follow-up failed for ${contact.name}: ${error.message}`);
        changed = true;
      }
    }
  }
  if (changed) await upsertTenants(tenants);
  return { sent, skipped };
}

async function runScheduledTasks(origin = PUBLIC_ORIGIN) {
  if (scheduledTasksRunning) return { skipped: true, reason: "scheduled tasks already running" };
  scheduledTasksRunning = true;
  try {
    const startedAt = new Date().toISOString();
    await scanAutomaticFollowUps(origin);
    const scheduled = await scanScheduledContactFollowUps(origin);
    const abandoned = await scanAbandonedBookingFollowUps(origin);
    const names = await refreshGenericContactNames();
    return {
      skipped: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      scheduled,
      abandoned,
      contactNamesChanged: Boolean(names.changed),
    };
  } finally {
    scheduledTasksRunning = false;
  }
}

function mergeWebhookContact(tenant, event, profile = null) {
  const senderId = String(event.sender?.id || "");
  const pageId = String(event.recipient?.id || "");
  if (!senderId || !pageId) return { added: false, contact: null };
  tenant.contacts = Array.isArray(tenant.contacts) ? tenant.contacts : [];
  const messageAt = event.timestamp ? new Date(Number(event.timestamp)).toISOString() : new Date().toISOString();
  const existing = tenant.contacts.find((contact) => contact.psid === senderId || contact.id === `fb_${senderId}`);
  const messageText = eventMessageText(event);
  const realName = profileDisplayName(profile);
  const engagementEvent = {
    id: event.message?.mid || event.postback?.mid || `webhook_${senderId}_${event.timestamp || Date.now()}`,
    at: messageAt,
    type: "reply",
    text: messageText,
  };
  if (existing) {
    existing.psid = existing.psid || senderId;
    if (realName && (!existing.name || isGenericMessengerName(existing.name))) existing.name = realName;
    if (profile?.profile_pic) existing.profilePic = existing.profilePic || profile.profile_pic;
    existing.status = existing.booked ? existing.status : "new";
    const engagementAdded = addContactEngagement(existing, engagementEvent);
    updateLastInboundMessage(existing, messageAt, messageText);
    return { added: false, contact: existing, engagementAdded };
  }
  const contact = {
    id: `fb_${senderId}`,
    psid: senderId,
    name: realName || `Messenger Contact ${senderId.slice(-6)}`,
    profilePic: profile?.profile_pic || "",
    source: "Messenger webhook",
    status: "new",
    createdAt: messageAt,
    lastMessageAt: messageAt,
    lastInboundMessageAt: messageAt,
    lastMessageText: messageText,
    lastMessageDirection: "inbound",
    engagement: [],
    booked: false,
    followUpsSent: 0,
  };
  const engagementAdded = addContactEngagement(contact, engagementEvent);
  tenant.contacts.unshift(contact);
  return { added: true, contact, engagementAdded };
}

function mergeImportedContactsIntoTenant(tenant, contacts) {
  tenant.contacts = Array.isArray(tenant.contacts) ? tenant.contacts : [];
  let added = 0;
  let updated = 0;
  contacts.forEach((incoming) => {
    const existing = tenant.contacts.find((contact) =>
      (incoming.psid && contact.psid === incoming.psid) ||
      (incoming.conversationId && contact.conversationId === incoming.conversationId) ||
      (incoming.id && contact.id === incoming.id)
    );
    if (!existing) {
      const best = calculateBestContactTime(incoming);
      incoming.bestContactHour = best.hour;
      incoming.bestContactMinute = best.minute;
      incoming.bestContactMinutes = best.minutes;
      incoming.inboundMessageCount = countInboundMessages(incoming);
      tenant.contacts.unshift(incoming);
      added += 1;
      return;
    }
    if (incoming.name && (!existing.name || isGenericMessengerName(existing.name))) existing.name = incoming.name;
    existing.psid = existing.psid || incoming.psid || "";
    existing.conversationId = existing.conversationId || incoming.conversationId || "";
    existing.source = incoming.source || existing.source;
    existing.status = existing.booked ? existing.status : incoming.status || existing.status;
    const incomingLastTime = new Date(incoming.lastMessageAt || 0).getTime();
    const existingLastTime = new Date(existing.lastMessageAt || 0).getTime();
    if (incomingLastTime >= existingLastTime) {
      existing.lastMessageAt = incoming.lastMessageAt;
      existing.lastInboundMessageAt = incoming.lastInboundMessageAt || existing.lastInboundMessageAt || "";
      existing.lastMessageText = incoming.lastMessageText || existing.lastMessageText || "";
      existing.lastMessageDirection = incoming.lastMessageDirection || existing.lastMessageDirection || "";
    }
    existing.engagement = Array.isArray(existing.engagement) ? existing.engagement : [];
    const keys = new Set(existing.engagement.map((event) => `${event.id || ""}:${event.at}:${event.type || ""}`));
    (incoming.engagement || []).forEach((event) => {
      const key = `${event.id || ""}:${event.at}:${event.type || ""}`;
      if (!keys.has(key)) existing.engagement.push(event);
    });
    existing.engagement.sort((a, b) => new Date(a.at) - new Date(b.at));
    const best = calculateBestContactTime(existing);
    existing.bestContactHour = best.hour;
    existing.bestContactMinute = best.minute;
    existing.bestContactMinutes = best.minutes;
    existing.inboundMessageCount = countInboundMessages(existing);
    updated += 1;
  });
  tenant.contacts = dedupeTenantContacts(tenant.contacts);
  return { added, updated };
}

async function captureWebhookContacts(body, origin) {
  const events = [];
  (body.entry || []).forEach((entry) => {
    (entry.messaging || []).forEach((event) => events.push(event));
  });
  if (!events.length) return { matched: 0, added: 0, updated: 0 };

  const tenants = await fetchTenants();
  let matched = 0;
  let added = 0;
  let updated = 0;
  for (const event of events) {
    const pageId = String(event.recipient?.id || "");
    const tenant = tenants.find((item) => String(item.pageId || "") === pageId);
    if (!tenant) continue;
    matched += 1;
    const profile = await fetchMessengerProfile(tenant, String(event.sender?.id || ""));
    const { added: wasAdded, contact, engagementAdded } = mergeWebhookContact(tenant, event, profile);
    if (wasAdded) added += 1;
    else updated += 1;
    tenantLog(tenant, `${wasAdded ? "Captured" : "Updated"} Messenger contact ${contact?.name || event.sender?.id || "unknown"} from webhook.`);
    event.__tenant = tenant;
    event.__contact = contact;
    event.__engagementAdded = engagementAdded;
  }
  for (const event of events) {
    if (!event.__tenant || !event.__contact) continue;
    if (!event.__engagementAdded) {
      tenantLog(event.__tenant, `Did not send booking button to ${event.__contact.name}: duplicate webhook event.`);
      continue;
    }
    const responseMessageId = recordAbResponseIfNeeded(event.__tenant, event.__contact, event);
    if (responseMessageId) {
      tenantLog(event.__tenant, `Counted A/B response for ${responseMessageId} from ${event.__contact.name}.`);
    }
    let abSent = false;
    try {
      const abResult = await sendAbFollowUpIfAvailable(event.__tenant, event.__contact, origin);
      abSent = Boolean(abResult.sent);
      tenantLog(event.__tenant, abResult.sent
        ? `Sent A/B button card ${abResult.messageId} to ${event.__contact.name}.`
        : `Did not send A/B follow-up to ${event.__contact.name}: ${abResult.reason}.`);
      if (abResult.sent) markFirst24SlotConsumed(event.__contact);
    } catch (error) {
      tenantLog(event.__tenant, `A/B follow-up send failed for ${event.__contact.name}: ${error.message}`);
    }
    if (abSent) {
      tenantLog(event.__tenant, `Did not send booking button to ${event.__contact.name}: A/B button card already sent for this message.`);
      continue;
    }
    try {
      const result = await sendBookingButtonIfAllowed(event.__tenant, event.__contact, origin);
      tenantLog(event.__tenant, result.sent
        ? `Sent booking button${result.mediaSent ? " with media" : ""} to ${event.__contact.name}.`
        : `Did not send booking button to ${event.__contact.name}: ${result.reason}.`);
      if (result.sent) markFirst24SlotConsumed(event.__contact);
    } catch (error) {
      tenantLog(event.__tenant, `Booking button send failed for ${event.__contact.name}: ${error.message}`);
    }
  }
  if (matched) await upsertTenants(tenants);
  return { matched, added, updated };
}

async function deleteMissing(table, keepIds) {
  const rows = await supabaseRequest(`/rest/v1/${table}?select=id`);
  const keep = new Set(keepIds);
  const missing = (rows || []).filter((row) => !keep.has(row.id));
  for (const row of missing) {
    await supabaseRequest(`/rest/v1/${table}?id=eq.${encodeURIComponent(row.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}

async function stateFromSupabase() {
  await ensureHeadAdmin();
  const users = await fetchAppUsers();
  const tenants = await fetchTenants();
  if (!users.some((user) => user.role === "head_admin")) users.unshift({ ...headAdmin });
  return {
    ...seedState,
    users,
    tenants,
    activeTenantId: tenants[0]?.id || "",
  };
}

async function syncStateToSupabase(inputState) {
  const users = Array.isArray(inputState.users) ? inputState.users.map((user) => ({ ...user })) : [];
  const tenants = Array.isArray(inputState.tenants) ? inputState.tenants.map((tenant) => normalizeTenantAbMessages({ ...tenant })) : [];
  const headIndex = users.findIndex((user) => user.role === "head_admin" || user.id === headAdmin.id || String(user.email || "").toLowerCase() === HEAD_ADMIN_EMAIL);
  if (headIndex === -1) users.unshift({ ...headAdmin });
  else users[headIndex] = { ...users[headIndex], ...headAdmin };

  const usersWithAuth = [];
  for (const user of users) {
    const normalized = normalizeUser(user);
    const authUser = await ensureAuthUser(normalized);
    usersWithAuth.push({ ...normalized, auth_user_id: authUser.id });
  }

  await upsertUsers(usersWithAuth);
  await upsertTenants(tenants);
  await deleteMissing("app_users", usersWithAuth.map((user) => user.id));
  await deleteMissing("tenants", tenants.map((tenant) => tenant.id));
}

async function login(email, password) {
  await ensureHeadAdmin();
  const session = await supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    service: false,
    body: { email, password },
  });
  const authUserId = session?.user?.id;
  if (!authUserId) throw new ApiError(401, "Invalid email or password.");
  const users = await fetchAppUsers();
  const user = users.find((item) => item.auth_user_id === authUserId || item.email === String(email).toLowerCase());
  if (!user) throw new ApiError(403, "This login exists in Supabase Auth but has no app account assignment.");
  const appState = await stateFromSupabase();
  return {
    currentUserId: user.id,
    authToken: session.access_token || user.loginToken || "",
    state: {
      ...appState,
      currentUserId: user.id,
      authToken: session.access_token || "",
    },
  };
}

function graphUrl(pathname, params = {}) {
  const version = process.env.META_GRAPH_VERSION || "v20.0";
  const url = new URL(`https://graph.facebook.com/${version}/${pathname.replace(/^\/+/, "")}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return url;
}

async function graphRequest(pathname, params = {}, accessToken) {
  if (!accessToken) throw new ApiError(400, "Connected Facebook page is missing a Page access token. Reconnect the page with Messenger permissions.");
  const response = await fetch(graphUrl(pathname, { ...params, access_token: accessToken }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Meta Graph request failed.";
    throw new ApiError(response.status, message);
  }
  return payload;
}

async function graphPost(pathname, body = {}, accessToken) {
  if (!accessToken) throw new ApiError(400, "Page access token is required.");
  const response = await fetch(graphUrl(pathname, { access_token: accessToken }), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Meta Graph request failed.";
    throw new ApiError(response.status, message);
  }
  return payload;
}

async function graphPostForm(pathname, body = {}, accessToken) {
  if (!accessToken) throw new ApiError(400, "Page access token is required.");
  const response = await fetch(graphUrl(pathname, { access_token: accessToken }), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Meta Graph post failed.";
    throw new ApiError(response.status, message);
  }
  return payload;
}

async function subscribePageWebhook(tenant) {
  if (!tenant?.pageId) throw new ApiError(400, "Connect a Facebook page before subscribing webhooks.");
  if (!tenant?.pageAccessToken) throw new ApiError(400, "Connected Facebook page is missing a Page access token.");
  const subscribedFields = "messages,messaging_postbacks";
  const result = await graphPostForm(`/${tenant.pageId}/subscribed_apps`, {
    subscribed_fields: subscribedFields,
  }, tenant.pageAccessToken);
  tenant.webhookSubscribedAt = new Date().toISOString();
  tenant.webhookSubscribedFields = subscribedFields.split(",");
  tenantLog(tenant, `Subscribed page webhook fields: ${subscribedFields}.`);
  return result;
}

function requireCloudinary() {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new ApiError(500, "Cloudinary env is missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
  }
}

function cloudinarySignature(params) {
  const crypto = require("crypto");
  const source = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${source}${CLOUDINARY_API_SECRET}`).digest("hex");
}

async function uploadToCloudinary(input = {}) {
  requireCloudinary();
  const file = String(input.file || "");
  if (!file.startsWith("data:")) throw new ApiError(400, "Upload file must be a data URL.");
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = input.folder === "booking" ? "followup-os/booking" : "followup-os/messenger";
  const signature = cloudinarySignature({ folder, timestamp });
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", CLOUDINARY_API_KEY);
  form.set("timestamp", String(timestamp));
  form.set("folder", folder);
  form.set("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || "Cloudinary upload failed.";
    throw new ApiError(response.status, message);
  }
  return {
    secureUrl: payload.secure_url,
    resourceType: payload.resource_type || "image",
    publicId: payload.public_id,
    format: payload.format || "",
    bytes: payload.bytes || 0,
  };
}

function requireMetaAppSecret() {
  if (!META_APP_ID || !META_APP_SECRET) {
    throw new ApiError(500, "Meta app env is missing. Set META_APP_ID and META_APP_SECRET.");
  }
}

async function exchangeLongLivedUserToken(shortLivedToken) {
  requireMetaAppSecret();
  if (!shortLivedToken) throw new ApiError(400, "Facebook user access token is required.");
  const response = await fetch(graphUrl("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Could not exchange Facebook token.";
    throw new ApiError(response.status, message);
  }
  if (!payload.access_token) throw new ApiError(502, "Meta did not return a long-lived user token.");
  return payload;
}

async function fetchLongLivedFacebookPages(shortLivedUserToken) {
  const longLived = await exchangeLongLivedUserToken(shortLivedUserToken);
  const payload = await graphRequest("/me/accounts", {
    fields: "id,name,access_token,tasks,picture{url}",
  }, longLived.access_token);
  return {
    userTokenExpiresIn: longLived.expires_in || null,
    pages: (payload.data || []).map((page) => ({
      id: page.id,
      name: page.name,
      accessToken: page.access_token || "",
      tokenType: "long_lived_page",
      tasks: page.tasks || [],
      pictureUrl: page.picture?.data?.url || "",
    })),
  };
}

function pickContactParticipant(conversation, tenant) {
  const pageId = String(tenant.pageId || "");
  const pageName = String(tenant.pageName || tenant.name || "").toLowerCase();
  const pools = [
    ...(conversation.participants?.data || []),
    ...(conversation.senders?.data || []),
    ...((conversation.messages?.data || []).map((message) => message.from).filter(Boolean)),
  ];
  return pools.find((person) => {
    const id = String(person.id || "");
    const name = String(person.name || "").toLowerCase();
    return id && id !== pageId && name !== pageName;
  }) || pools.find((person) => String(person.name || "").toLowerCase() !== pageName) || null;
}

function importedContactFromConversation(conversation, tenant, folderLabel) {
  const participant = pickContactParticipant(conversation, tenant);
  const messages = conversation.messages?.data || [];
  const engagement = messages
    .map((message) => ({
      id: message.id,
      at: message.created_time || conversation.updated_time || new Date().toISOString(),
      type: String(message.from?.id || "") === String(participant?.id || "") ? "reply" : "message",
      text: String(message.message || "").trim(),
    }))
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const lastMessageAt = engagement[engagement.length - 1]?.at || conversation.updated_time || new Date().toISOString();
  const lastEvent = engagement[engagement.length - 1] || null;
  const name = participant?.name || conversation.snippet || "Messenger Contact";
  return {
    id: participant?.id ? `fb_${participant.id}` : `conversation_${conversation.id}`,
    psid: participant?.id || "",
    conversationId: conversation.id,
    name,
    source: folderLabel ? `Messenger history (${folderLabel})` : "Messenger history",
    status: conversation.unread_count ? "hot" : "historical",
    createdAt: engagement[0]?.at || lastMessageAt,
    lastMessageAt,
    lastInboundMessageAt: lastEvent?.type === "reply" ? lastEvent.at : "",
    lastMessageText: lastEvent?.text || conversation.snippet || "",
    lastMessageDirection: lastEvent?.type === "reply" ? "inbound" : "outbound",
    engagement: engagement.length ? engagement : [{ at: lastMessageAt, type: "reply" }],
    booked: false,
    followUpsSent: 0,
  };
}

async function fetchConversationMessages(conversationId, accessToken) {
  const payload = await fetchConversationPage(graphUrl(`/${conversationId}/messages`, {
    fields: "id,from,to,message,created_time",
    limit: 10,
    access_token: accessToken,
  }), accessToken);
  return payload.data || [];
}

async function fetchConversationPage(url, accessToken) {
  const response = await fetch(url.href || url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Meta Graph request failed.";
    throw new ApiError(response.status, message);
  }
  return payload;
}

async function importMetaContacts(tenant, options = {}) {
  if (!tenant?.pageId) throw new ApiError(400, "Connect a Facebook page before importing contacts.");
  if (!tenant?.pageAccessToken) throw new ApiError(400, "Connected Facebook page is missing a Page access token. Reconnect the page with Messenger permissions.");

  const limit = Math.max(1, Math.min(Number(options.limit || 50), 100));
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || 5), 20));
  const fields = "id,updated_time,snippet,message_count,unread_count,participants,senders";
  const sources = [
    { path: `/${tenant.pageId}/conversations`, params: { platform: "messenger" }, label: "inbox" },
    { path: `/${tenant.pageId}/conversations/inbox`, params: {}, label: "inbox" },
    { path: `/${tenant.pageId}/conversations/page_done`, params: {}, label: "done" },
    { path: `/${tenant.pageId}/conversations`, params: { folder: "page_done", platform: "messenger" }, label: "done" },
  ];
  const contacts = [];
  const errors = [];
  const diagnostics = [];
  const seenConversations = new Set();

  for (const source of sources) {
    let pageCount = 0;
    let sourceCount = 0;
    let nextUrl = graphUrl(source.path, {
      fields,
      limit,
      ...source.params,
      access_token: tenant.pageAccessToken,
    });

    while (nextUrl && pageCount < maxPages) {
      try {
        const payload = await fetchConversationPage(nextUrl, tenant.pageAccessToken);
        for (const conversation of payload.data || []) {
          if (!conversation?.id || seenConversations.has(conversation.id)) continue;
          seenConversations.add(conversation.id);
          sourceCount += 1;
          try {
            conversation.messages = { data: await fetchConversationMessages(conversation.id, tenant.pageAccessToken) };
          } catch (error) {
            errors.push(`${source.label} messages ${conversation.id}: ${error.message}`);
          }
          contacts.push(importedContactFromConversation(conversation, tenant, source.label));
        }
        nextUrl = payload.paging?.next || "";
        pageCount += 1;
      } catch (error) {
        errors.push(`${source.label}: ${error.message}`);
        break;
      }
    }
    diagnostics.push({ source: source.path, label: source.label, conversations: sourceCount });
  }

  if (!contacts.length && errors.length) {
    throw new ApiError(502, `Could not import Messenger contacts. ${errors.join(" ")}`);
  }
  return { contacts, errors, diagnostics };
}

async function readJson(request, maxBytes = 25 * 1024 * 1024) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length > maxBytes) throw new ApiError(413, "Request body is too large.");
  return JSON.parse(raw);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function sendStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const target = path.normalize(path.join(ROOT, pathname));
  if (!target.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(target, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(target) });
    response.end(data);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function handleApi(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY) });
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/state") {
    sendJson(response, 200, { state: await stateFromSupabase() });
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/api/meta/debug") {
    const tenants = await fetchTenants();
    sendJson(response, 200, {
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        pageId: tenant.pageId || "",
        pageConnected: Boolean(tenant.pageConnected),
        contacts: Array.isArray(tenant.contacts) ? tenant.contacts.length : 0,
      })),
    });
    return;
  }
  if ((request.method === "GET" || request.method === "POST") && requestUrl.pathname === "/api/cron/scheduled-tasks") {
    const result = await runScheduledTasks(PUBLIC_ORIGIN || requestOrigin(request));
    sendJson(response, 200, { ok: true, ...result });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/state") {
    const body = await readJson(request);
    await syncStateToSupabase(body.state || {});
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/auth/login") {
    const body = await readJson(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) throw new ApiError(400, "Email and password are required.");
    sendJson(response, 200, await login(email, password));
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/meta/pages") {
    const body = await readJson(request);
    const result = await fetchLongLivedFacebookPages(String(body.userAccessToken || ""));
    sendJson(response, 200, { ok: true, ...result });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/meta/import-contacts") {
    const body = await readJson(request);
    const tenant = body.tenant;
    if (!tenant?.id) throw new ApiError(400, "Tenant payload is required for contact import.");
    const result = await importMetaContacts(tenant, body.options || {});
    const tenants = await fetchTenants();
    const storedTenant = tenants.find((item) => item.id === tenant.id || String(item.pageId || "") === String(tenant.pageId || ""));
    const persisted = storedTenant ? mergeImportedContactsIntoTenant(storedTenant, result.contacts || []) : { added: 0, updated: 0 };
    if (storedTenant) {
      tenantLog(storedTenant, `Imported ${persisted.added} old Messenger contacts and updated ${persisted.updated}.`);
      await upsertTenants(tenants);
    }
    sendJson(response, 200, { ok: true, ...result, persisted });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/meta/refresh-contact-names") {
    const result = await refreshGenericContactNames();
    sendJson(response, 200, { ok: true, ...result });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/meta/subscribe-page") {
    const body = await readJson(request);
    const tenants = await fetchTenants();
    const incomingTenant = body.tenant || body;
    const storedTenant = tenants.find((item) => item.id === incomingTenant.tenantId || item.id === incomingTenant.id || String(item.pageId || "") === String(incomingTenant.pageId || ""));
    const tenant = storedTenant || incomingTenant;
    if (!tenant?.pageId || !tenant?.pageAccessToken) throw new ApiError(400, "Connected page tenant with Page token is required.");
    const result = await subscribePageWebhook(tenant);
    if (storedTenant) await upsertTenants(tenants);
    sendJson(response, 200, { ok: true, result, subscribedFields: tenant.webhookSubscribedFields });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/meta/send-booking-delivery") {
    const body = await readJson(request);
    const tenants = await fetchTenants();
    const tenant = tenants.find((item) => item.id === body.tenantId || String(item.pageId || "") === String(body.pageId || ""));
    if (!tenant) throw new ApiError(404, "Connected page tenant not found.");
    const result = await sendBookingDeliveryToMessenger(tenant, body);
    if (result.sent) await upsertTenants(tenants);
    sendJson(response, 200, { ok: true, ...result });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/meta/booking-opened") {
    const body = await readJson(request);
    const result = await scheduleBookingOpenFollowUp({ ...body, origin: requestOrigin(request) });
    sendJson(response, 200, { ok: true, ...result });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/meta/booking-continued") {
    const body = await readJson(request);
    const result = await cancelBookingOpenFollowUp(body);
    sendJson(response, 200, { ok: true, ...result });
    return;
  }
  if (request.method === "POST" && requestUrl.pathname === "/api/cloudinary/upload") {
    const body = await readJson(request, 35 * 1024 * 1024);
    const upload = await uploadToCloudinary(body);
    sendJson(response, 200, { ok: true, upload });
    return;
  }
  sendJson(response, 404, { error: "API route not found." });
}

async function handleWebhook(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === "GET") {
    const mode = requestUrl.searchParams.get("hub.mode");
    const token = requestUrl.searchParams.get("hub.verify_token");
    const challenge = requestUrl.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === META_VERIFY_TOKEN && challenge) {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end(challenge);
      return;
    }
    sendJson(response, 403, { error: "Webhook verify token mismatch." });
    return;
  }
  if (request.method === "POST") {
    const body = await readJson(request);
    const result = await captureWebhookContacts(body, requestOrigin(request));
    console.log("Meta webhook received:", JSON.stringify({ result, body }));
    sendJson(response, 200, { ok: true, ...result });
    return;
  }
  sendJson(response, 405, { error: "Webhook method not allowed." });
}

async function appHandler(request, response) {
  try {
    if (request.url.startsWith("/webhook") || request.url.startsWith("/api/webhook")) {
      await handleWebhook(request, response);
      return;
    }
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }
    sendStatic(request, response);
  } catch (error) {
    const status = error.status || 500;
    const message = error.message || "Server error.";
    const needsSchema = message.includes("relation") || message.includes("schema cache") || message.includes("public.app_users") || message.includes("public.tenants");
    sendJson(response, status, {
      error: needsSchema ? `${message}. Run supabase/schema.sql in the Supabase SQL editor.` : message,
    });
  }
}

if (require.main === module) {
  const server = http.createServer(appHandler);
  server.listen(PORT, () => {
    console.log(`FollowUp OS server running on http://127.0.0.1:${PORT}`);
    if (INTERNAL_SCHEDULER_ENABLED) {
      runScheduledTasks().catch((error) => console.warn("Initial scheduled tasks failed:", error.message));
      setInterval(() => runScheduledTasks(), 60000);
    }
  });
}

module.exports = appHandler;
