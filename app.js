const BUILD_ID = "admin-login-clean-1";
const STORAGE_KEY = "followup_os_state_v4";
const LEGACY_STORAGE_KEYS = ["followup_os_state_v3", "followup_os_state_v2", "followup_os_state_v1"];
const META_APP_ID = "2656336981385560";
const API_BASE = "";
const DEFAULT_AB_MESSAGE = "Hi {{firstName}}, here is your booking link: {{bookingLink}}";
const DEFAULT_AB_BUTTON_LABEL = "Book now";
const DEFAULT_EMBEDDED_PAGE_BUTTON_LABEL = "View page";
const DEFAULT_EMBEDDED_PAGE_BANNER_MESSAGE = "Ready to book? Choose a time with us.";
const DEFAULT_EMBEDDED_PAGE_BANNER_BUTTON_LABEL = "Book now";
const DEFAULT_FIRST24_FIBONACCI_MINUTES = [10, 20, 30];
const BOOKING_FIELD_TYPES = ["text", "textarea", "email", "phone", "multiple_choice", "media_upload"];
const BOOKING_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const AB_BUTTON_MODES = ["both", "booking_only", "embedded_only"];

const defaultHero = "assets/booking-hero.png";
const now = new Date();

const seedState = {
  currentUserId: null,
  authToken: "",
  activeTenantId: "",
  view: "dashboard",
  selectedSlot: "",
  selectedBookingDay: "",
  bookingCalendarMonth: "",
  bookingConfirmation: null,
  showAllBookingTimes: false,
  bookingOpenTracked: {},
  bookingContinueTracked: {},
  bookingInteractionStarted: false,
  toast: "",
  facebookPages: [],
  users: [
    {
      id: "user_head",
      name: "Head Admin",
      email: "admin@messengerbook.com",
      password: "admin123",
      role: "head_admin",
      loginToken: "head-admin-token",
      assignedTenantIds: [],
    },
  ],
  tenants: [],
};

function createBlankTenant(id = `tenant_${uid().slice(0, 8)}`) {
  return {
    id,
    name: "Unconnected Business",
    pageName: "Unconnected Facebook Page",
    pageId: "",
    pageAccessToken: "",
    pageConnected: false,
    messenger: {
      cta: "Book your appointment here",
      welcomeMessage: "Hi {{firstName}}, you can book a time here.",
      welcomeEnabled: true,
      buttonLabel: "Choose a time",
      welcomeMediaUrl: "",
      welcomeMediaType: "",
      autoAbFollowUpEnabled: true,
      suppressAfterUserMessageMinutes: 60,
      embeddedPageEnabled: false,
      embeddedPageUrl: "",
      embeddedPageButtonLabel: DEFAULT_EMBEDDED_PAGE_BUTTON_LABEL,
      embeddedPageBannerMessage: DEFAULT_EMBEDDED_PAGE_BANNER_MESSAGE,
      embeddedPageBannerButtonLabel: DEFAULT_EMBEDDED_PAGE_BANNER_BUTTON_LABEL,
      postWindowTemplate: "",
      lastBookingSummary: "",
    },
    booking: {
      slug: "booking",
      headline: "Book an appointment",
      subheadline: "Choose a time that works for you.",
      offer: "Appointments available",
      photoUrl: defaultHero,
      accent: "#007f78",
      thankYouMessage: "Thank you for booking. We received your request and will confirm it soon.",
      deliveryFileUrl: "",
      deliveryFileType: "",
      fields: defaultBookingFields(),
      questions: [
        { id: "q_goal", label: "What do you need help with?", type: "textarea", required: false, options: [] },
      ],
    },
    availability: [
      { day: "Monday", enabled: true, start: "09:00", end: "17:00" },
      { day: "Tuesday", enabled: true, start: "09:00", end: "17:00" },
      { day: "Wednesday", enabled: true, start: "10:00", end: "18:00" },
      { day: "Thursday", enabled: true, start: "09:00", end: "17:00" },
      { day: "Friday", enabled: true, start: "09:00", end: "15:00" },
      { day: "Saturday", enabled: false, start: "10:00", end: "14:00" },
      { day: "Sunday", enabled: false, start: "10:00", end: "14:00" },
    ],
    meetingLength: 30,
    maxOverlap: 2,
    followUp: {
      humanWindowDays: 7,
      pattern: [1, 3, 3],
      afterWindowEveryDays: 7,
      quietHoursEnabled: true,
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
      bookedRegularFollowUpsEnabled: false,
      bookingRemindersEnabled: true,
      bookingReminderDayOfTime: "09:00",
      bookingReminderDayOfMessage: "Hi {{firstName}}, your appointment is today at {{meetingTime}}.",
      bookingReminderBeforeMinutes: 60,
      bookingReminderBeforeMessage: "Hi {{firstName}}, your appointment starts in {{minutesBefore}} minutes.",
      bookingReminderFinalMinutes: 15,
      bookingReminderFinalMessage: "Hi {{firstName}}, this is a quick reminder that your appointment starts soon.",
      bookingAbandonedEnabled: true,
      bookingAbandonedDelayMinutes: 5,
      bookingAbandonedMessage: "Hi {{firstName}}, you can still finish booking your appointment here.",
      first24FibonacciEnabled: true,
      first24FibonacciMinutes: DEFAULT_FIRST24_FIBONACCI_MINUTES,
    },
    messages: [],
    templates: [],
    contacts: [],
    bookings: [],
    logs: [],
  };
}

function makeContact(id, name, source, offsetDays, hours, status) {
  const created = addDays(now, offsetDays);
  const events = hours.map((hour, index) => ({
    at: setHour(addDays(created, index), hour),
    type: index % 2 === 0 ? "reply" : "message",
  }));
  return {
    id,
    name,
    source,
    status,
    createdAt: created.toISOString(),
    lastMessageAt: events[events.length - 1].at.toISOString(),
    engagement: events.map((event) => ({ ...event, at: event.at.toISOString() })),
    booked: false,
    followUpsSent: Math.max(0, Math.min(3, Math.abs(offsetDays) % 4)),
  };
}

let state = loadState();
let remoteSaveTimer = null;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
  let loaded = structuredClone(seedState);
  if (saved) {
    try {
      loaded = mergeDefaults(JSON.parse(saved));
    } catch {
      loaded = structuredClone(seedState);
    }
  }
  const repaired = repairState(loaded);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repaired));
  return repaired;
}

function mergeDefaults(saved) {
  const base = structuredClone(seedState);
  const merged = {
    ...base,
    ...saved,
    users: saved.users?.length ? saved.users : base.users,
    tenants: Array.isArray(saved.tenants) ? saved.tenants : base.tenants,
  };
  return merged;
}

function repairState(input) {
  const repaired = {
    ...structuredClone(seedState),
    ...input,
    users: Array.isArray(input.users) ? input.users : [],
    tenants: Array.isArray(input.tenants) ? input.tenants : [],
    facebookPages: Array.isArray(input.facebookPages) ? input.facebookPages : [],
  };

  repaired.users = repaired.users.map((user, index) => ({
    id: user.id || `user_${index + 1}`,
    name: user.name || (user.role === "head_admin" ? "Head Admin" : `User ${index + 1}`),
    email: user.email || (user.role === "head_admin" ? "admin@messengerbook.com" : `user${index + 1}@example.com`),
    password: user.password || (user.role === "head_admin" ? "admin123" : "password123"),
    role: user.role === "head_admin" ? "head_admin" : "user",
    loginToken: user.loginToken || createToken(),
    assignedTenantIds: Array.isArray(user.assignedTenantIds) ? user.assignedTenantIds : [],
  }));

  upsertHeadAdmin(repaired);

  repaired.tenants = repaired.tenants
    .filter((tenant) => tenant && !isEmptyPlaceholderTenant(tenant))
    .map(normalizeTenant);

  const tenantIds = new Set(repaired.tenants.map((tenant) => tenant.id));
  repaired.users.forEach((user) => {
    user.assignedTenantIds = user.assignedTenantIds.filter((tenantId) => tenantIds.has(tenantId));
  });

  if (!repaired.users.some((user) => user.id === repaired.currentUserId)) {
    repaired.currentUserId = null;
    repaired.authToken = "";
  }

  if (!repaired.tenants.some((tenant) => tenant.id === repaired.activeTenantId)) {
    repaired.activeTenantId = repaired.tenants[0]?.id || "";
  }

  return repaired;
}

function upsertHeadAdmin(targetState = state) {
  const canonical = structuredClone(seedState.users[0]);
  const existingIndex = targetState.users.findIndex((user) => user.id === canonical.id || user.role === "head_admin" || String(user.email || "").toLowerCase() === canonical.email);
  if (existingIndex === -1) {
    targetState.users.unshift(canonical);
    return targetState.users[0];
  }
  const existing = targetState.users[existingIndex];
  targetState.users[existingIndex] = {
    ...existing,
    id: canonical.id,
    name: existing.name || canonical.name,
    email: canonical.email,
    password: canonical.password,
    role: "head_admin",
    loginToken: canonical.loginToken,
    assignedTenantIds: Array.isArray(existing.assignedTenantIds) ? existing.assignedTenantIds : [],
  };
  return targetState.users[existingIndex];
}

function normalizeTenant(tenant) {
  const defaults = createBlankTenant(tenant.id || `tenant_${uid().slice(0, 8)}`);
  const normalized = {
    ...defaults,
    ...tenant,
    messenger: { ...defaults.messenger, ...(tenant.messenger || {}) },
    booking: { ...defaults.booking, ...(tenant.booking || {}) },
    followUp: { ...defaults.followUp, ...(tenant.followUp || {}) },
    availability: Array.isArray(tenant.availability) && tenant.availability.length ? tenant.availability : defaults.availability,
    messages: Array.isArray(tenant.messages) ? tenant.messages : [],
    templates: Array.isArray(tenant.templates) ? tenant.templates : [],
    contacts: Array.isArray(tenant.contacts) ? tenant.contacts : [],
    bookings: Array.isArray(tenant.bookings) ? tenant.bookings : [],
    logs: Array.isArray(tenant.logs) ? tenant.logs : [],
  };
  normalized.name = normalized.name || normalized.pageName || "Connected Page";
  normalized.pageName = normalized.pageName || normalized.name;
  normalized.booking.slug = normalizeSlug(normalized.booking.slug || normalized.name);
  normalized.booking.questions = normalizeBookingQuestions(normalized.booking.questions);
  normalized.booking.fields = normalizeBookingFields(
    Array.isArray(tenant.booking?.fields) ? tenant.booking.fields : null,
    normalized.booking.questions
  );
  normalized.followUp.first24FibonacciMinutes = normalizeFirst24Intervals(normalized.followUp.first24FibonacciMinutes);
  normalized.pageConnected = Boolean(normalized.pageConnected || normalized.pageAccessToken || normalized.pageId);
  normalized.contacts = dedupeTenantContacts(normalized);
  normalized.messages = normalized.messages.map((message, index) => ({
    id: message.id || `m_${index + 1}_${uid().slice(0, 6)}`,
    text: message.text || "",
    buttonLabel: message.buttonLabel || normalized.messenger.buttonLabel || DEFAULT_AB_BUTTON_LABEL,
    buttonMode: AB_BUTTON_MODES.includes(message.buttonMode) ? message.buttonMode : "both",
    sent: Number(message.sent || 0),
    responses: Number(message.responses || 0),
  }));
  return normalized;
}

function normalizeBookingQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map((question, index) => ({
    id: question.id || `q_${index + 1}_${uid().slice(0, 6)}`,
    label: question.label || `Question ${index + 1}`,
    type: BOOKING_FIELD_TYPES.includes(question.type) ? question.type : "text",
    required: Boolean(question.required),
    options: Array.isArray(question.options)
      ? question.options.filter(Boolean)
      : String(question.options || "").split(",").map((option) => option.trim()).filter(Boolean),
  }));
}

function defaultBookingFields() {
  return [
    { id: "field_name", key: "name", label: "Name", type: "text", required: true, options: [] },
    { id: "field_email", key: "email", label: "Email", type: "email", required: true, options: [] },
    { id: "field_phone", key: "phone", label: "Phone", type: "phone", required: true, options: [] },
    { id: "field_note", key: "note", label: "Note", type: "textarea", required: false, options: [] },
  ];
}

function normalizeBookingFields(fields, legacyQuestions = []) {
  const source = Array.isArray(fields)
    ? fields
    : [
        ...defaultBookingFields(),
        ...normalizeBookingQuestions(legacyQuestions).map((question) => ({
          ...question,
          key: `custom_${question.id}`,
        })),
      ];
  return source.map((field, index) => ({
    id: field.id || `field_${index + 1}_${uid().slice(0, 6)}`,
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
  const minutes = Array.isArray(value) ? value.map(Number).filter((minute) => minute > 0).slice(0, 3) : [];
  if (!minutes.length) return [...DEFAULT_FIRST24_FIBONACCI_MINUTES];
  if (minutes.join(",") === "5,8,13") return [...DEFAULT_FIRST24_FIBONACCI_MINUTES];
  return minutes;
}

function isEmptyPlaceholderTenant(tenant) {
  const noRealPage = !tenant.pageId && !tenant.pageAccessToken && !tenant.pageConnected;
  const placeholderName = ["New Business", "Unconnected Business"].includes(tenant.name) || tenant.pageName === "Unconnected Facebook Page";
  const noData = !tenant.contacts?.length && !tenant.bookings?.length && !tenant.logs?.length;
  return noRealPage && placeholderName && noData;
}

function saveState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!options.localOnly) scheduleRemoteSave();
}

function apiEnabled() {
  return location.protocol !== "file:";
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed: ${response.status}`);
  }
  return payload;
}

function scheduleRemoteSave() {
  if (!apiEnabled()) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(pushRemoteState, 250);
}

async function pushRemoteState() {
  if (!apiEnabled()) return;
  try {
    await apiRequest("/api/state", {
      method: "POST",
      body: JSON.stringify({ state }),
    });
  } catch (error) {
    console.warn("Remote state save failed:", error.message);
  }
}

async function hydrateRemoteState() {
  if (!apiEnabled()) return;
  try {
    const currentUserId = state.currentUserId;
    const authToken = state.authToken;
    const payload = await apiRequest("/api/state");
    if (!payload.state) return;
    state = repairState({
      ...payload.state,
      currentUserId: payload.state.users?.some((user) => user.id === currentUserId) ? currentUserId : null,
      authToken: payload.state.users?.some((user) => user.id === currentUserId) ? authToken : "",
    });
    saveState({ localOnly: true });
    render();
  } catch (error) {
    console.warn("Remote state load failed:", error.message);
  }
}

function startRemoteRefresh() {
  if (!apiEnabled()) return;
  setInterval(() => {
    if (!currentUser() || routeFromHash().mode !== "admin") return;
    if (isEditingField()) return;
    if (!["dashboard", "contacts"].includes(state.view)) return;
    hydrateRemoteState();
  }, 10000);
}

function isEditingField() {
  const element = document.activeElement;
  if (!element) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

function activeTenant() {
  const allowed = visibleTenants();
  return allowed.find((tenant) => tenant.id === state.activeTenantId) || allowed[0] || state.tenants[0] || null;
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function isHeadAdmin() {
  return currentUser()?.role === "head_admin";
}

function visibleTenants() {
  const user = currentUser();
  if (!user || user.role === "head_admin") return state.tenants;
  return state.tenants.filter((tenant) => (user.assignedTenantIds || []).includes(tenant.id));
}

function ensureAccessibleTenant() {
  const allowed = visibleTenants();
  if (!allowed.length) return;
  if (!allowed.some((tenant) => tenant.id === state.activeTenantId)) {
    state.activeTenantId = allowed[0].id;
  }
}

function applyTokenLoginFromUrl() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  if (!token) return false;
  const user = state.users.find((item) => item.loginToken === token);
  if (!user) {
    state.toast = "Invalid or expired login token.";
    history.replaceState({}, "", baseAppUrl() + location.hash);
    return false;
  }
  state.currentUserId = user.id;
  state.authToken = token;
  ensureAccessibleTenant();
  saveState();
  history.replaceState({}, "", baseAppUrl() + location.hash);
  return true;
}

function bookingUrl(tenant = activeTenant(), source = "", extraParams = {}) {
  if (!tenant) return baseAppUrl();
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (source) params.set("tenant", tenant.id);
  Object.entries(extraParams).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString() ? `?${params.toString()}` : "";
  return `${baseAppUrl()}${query}#booking/${tenant.booking.slug}`;
}

function baseAppUrl() {
  return location.href.split("#")[0].split("?")[0];
}

function messengerBookingUrl(tenant = activeTenant(), contact = null) {
  return bookingUrl(tenant, "messenger_welcome", contact?.psid ? { contact: contact.psid } : {});
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

function embeddedPageEnabled(tenant = activeTenant()) {
  return Boolean(tenant?.messenger?.embeddedPageEnabled && safeExternalUrl(tenant.messenger.embeddedPageUrl));
}

function embeddedSiteUrl(tenant = activeTenant(), contact = null) {
  if (!tenant) return baseAppUrl();
  const params = new URLSearchParams({
    source: "embedded_page",
    tenant: tenant.id,
  });
  if (contact?.psid) params.set("contact", contact.psid);
  const query = params.toString() ? `?${params.toString()}` : "";
  return `${baseAppUrl()}${query}#site/${encodeURIComponent(tenant.booking.slug || tenant.id)}`;
}

function bookingUrlFromCurrentContact(tenant = activeTenant(), source = "embedded_page_banner") {
  const contact = bookingContactParam();
  return bookingUrl(tenant, source, contact ? { contact } : {});
}

function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function createToken() {
  return `tok_${uid().replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}${Math.random().toString(36).slice(2, 10)}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function setHour(date, hour) {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  const date = new Date(value);
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function bestContactTime(contact) {
  const inboundMinutes = (contact.engagement || [])
    .filter((event) => event?.at && event.type === "reply")
    .map((event) => {
      const date = new Date(event.at);
      return date.getHours() * 60 + date.getMinutes();
    })
    .filter((minutes) => Number.isFinite(minutes));
  let bestMinutes;
  if (!inboundMinutes.length && Number.isInteger(contact.bestContactMinutes)) {
    bestMinutes = contact.bestContactMinutes;
  } else if (!inboundMinutes.length && Number.isInteger(contact.bestContactHour)) {
    bestMinutes = contact.bestContactHour * 60 + Number(contact.bestContactMinute || 0);
  } else if (!inboundMinutes.length) {
    bestMinutes = 10 * 60;
  } else {
    const bandwidthMinutes = 45;
    let bestScore = -Infinity;
    bestMinutes = 10 * 60;
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
  }
  return { hour: Math.floor(bestMinutes / 60), minute: bestMinutes % 60, minutes: bestMinutes };
}

function bestContactHour(contact) {
  return bestContactTime(contact).hour;
}

function formatBestContactTime(contact) {
  const best = bestContactTime(contact);
  return `${pad(best.hour)}:${pad(best.minute)}`;
}

function minutesFromTime(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function slotMinutes(slot) {
  return minutesFromTime(bookingSlotTime(slot));
}

function timeDistanceMinutes(a, b) {
  const raw = Math.abs(a - b);
  return Math.min(raw, 24 * 60 - raw);
}

function bookingContactFromUrl(tenant) {
  const contactParam = bookingContactParam();
  if (!contactParam || !tenant) return null;
  const decoded = decodeURIComponent(contactParam);
  return tenant.contacts.find((contact) => contact.psid === decoded || contact.id === decoded) || null;
}

function recommendedSlotsForContact(slots, contact, limit = 6) {
  if (!contact || !slots.length) return [];
  const best = bestContactTime(contact).minutes;
  return [...slots]
    .sort((a, b) =>
      timeDistanceMinutes(slotMinutes(a), best) - timeDistanceMinutes(slotMinutes(b), best) ||
      parseBookingSlot(a) - parseBookingSlot(b)
    )
    .slice(0, limit);
}

function averageInboundMessages(tenant) {
  const counts = (tenant.contacts || []).map(inboundMessageCount).filter((count) => count > 0);
  if (!counts.length) return 0;
  return counts.reduce((total, count) => total + count, 0) / counts.length;
}

function contactPipelineStage(contact, tenant) {
  if (contact.bookedDone || contact.bookingDone || contact.bookingStatus === "done") return "booked_done";
  if (contact.booked) return "booked";
  const count = inboundMessageCount(contact);
  const average = averageInboundMessages(tenant);
  if (count >= Math.max(3, Math.ceil(average + 1))) return "high_intent";
  const created = new Date(contact.createdAt || contact.lastMessageAt || 0).getTime();
  if (created && now - created <= 24 * 60 * 60 * 1000) return "new";
  return "nurture";
}

function pipelineLabel(stage) {
  return {
    all: "All",
    booked: "Booked",
    booked_done: "Booked done",
    high_intent: "High intent",
    new: "New contact",
    nurture: "Nurture",
  }[stage] || "Nurture";
}

function contactBooking(tenant, contact) {
  if (!tenant || !contact) return null;
  return (tenant.bookings || []).find((booking) =>
    booking.id === contact.bookingId ||
    String(booking.contactEmail || "").toLowerCase() === String(contact.email || "").toLowerCase() ||
    String(booking.contactPhone || "") === String(contact.phone || "") ||
    String(booking.contactName || "").toLowerCase() === String(contact.name || "").toLowerCase()
  ) || null;
}

function contactBookingSummary(tenant, contact) {
  return contact.bookingSummary || contactBooking(tenant, contact)?.summary || "";
}

function pipelineStatusClass(stage) {
  if (stage === "booked_done") return "dark";
  if (stage === "booked") return "good";
  if (stage === "high_intent") return "hot";
  if (stage === "new") return "info";
  return "";
}

function parseBookingSlot(slot) {
  const day = bookingDayKey(slot);
  const time = bookingSlotTime(slot);
  if (!day || !time) return null;
  const date = parseSlotDate(day, time);
  return Number.isFinite(date.getTime()) ? date : null;
}

function bookedReminderSchedule(contact, tenant = activeTenant()) {
  const meetingAt = parseBookingSlot(contact.bookingSlot);
  if (!meetingAt || tenant?.followUp?.bookingRemindersEnabled === false) return [];
  const followUp = tenant.followUp || {};
  const day = bookingDayKey(contact.bookingSlot);
  const [dayHour, dayMinute] = String(followUp.bookingReminderDayOfTime || "09:00").split(":").map(Number);
  const dayOfAt = parseSlotDate(day, `${pad(Number.isFinite(dayHour) ? dayHour : 9)}:${pad(Number.isFinite(dayMinute) ? dayMinute : 0)}`);
  const beforeMinutes = Math.max(1, Number(followUp.bookingReminderBeforeMinutes || 60));
  const finalMinutes = Math.max(1, Number(followUp.bookingReminderFinalMinutes || 15));
  return [
    {
      key: "dayOf",
      label: "Day-of reminder",
      at: dayOfAt < meetingAt ? dayOfAt : addMinutes(meetingAt, -beforeMinutes),
      message: followUp.bookingReminderDayOfMessage,
      minutesBefore: Math.max(0, Math.round((meetingAt - dayOfAt) / 60000)),
    },
    {
      key: "before",
      label: `${beforeMinutes} min reminder`,
      at: addMinutes(meetingAt, -beforeMinutes),
      message: followUp.bookingReminderBeforeMessage,
      minutesBefore: beforeMinutes,
    },
    {
      key: "final",
      label: `${finalMinutes} min reminder`,
      at: addMinutes(meetingAt, -finalMinutes),
      message: followUp.bookingReminderFinalMessage,
      minutesBefore: finalMinutes,
    },
  ].filter((item) => Number.isFinite(item.at.getTime())).sort((a, b) => a.at - b.at);
}

function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function nextBookedReminder(contact, tenant = activeTenant()) {
  const sent = contact.bookingRemindersSent || {};
  const next = bookedReminderSchedule(contact, tenant).find((reminder) => !sent[reminder.key]);
  if (!next) return null;
  return {
    label: formatDateTime(next.at),
    mode: next.label,
    nextAt: next.at,
    type: "booking_reminder",
    reminder: next,
  };
}

function inboundMessageCount(contact) {
  if (Number.isInteger(contact.inboundMessageCount)) return contact.inboundMessageCount;
  return (contact.engagement || []).filter((event) => event.type === "reply").length;
}

function nextFollowUp(contact, tenant = activeTenant()) {
  if (!contact || !tenant) return { label: "No queue", mode: "None", nextAt: null };
  if (contact.booked) {
    const reminder = nextBookedReminder(contact, tenant);
    if (reminder) return reminder;
    if (tenant.followUp?.bookedRegularFollowUpsEnabled !== true) return { label: "Booked", mode: "Complete", nextAt: null };
  }
  const followUp = tenant.followUp;
  const createdAt = new Date(contact.createdAt || contact.lastInboundMessageAt || contact.lastMessageAt || now);
  const ageMinutes = Math.max(0, Math.floor((now - createdAt) / 60000));
  const fibonacci = Array.isArray(followUp.first24FibonacciMinutes) && followUp.first24FibonacciMinutes.length
    ? followUp.first24FibonacciMinutes
    : DEFAULT_FIRST24_FIBONACCI_MINUTES;
  const first24Sent = Number(contact.first24FollowUpsSent || 0);
  if (followUp.first24FibonacciEnabled !== false && !contact.booked && ageMinutes < 24 * 60 && first24Sent < 3) {
    const elapsed = fibonacci.slice(0, first24Sent + 1).reduce((total, minutes) => total + Number(minutes || 0), 0);
    const target = addMinutes(createdAt, elapsed || 5);
    const best = bestContactTime(contact);
    if (first24Sent > 0 && target < now) target.setHours(best.hour, best.minute, 0, 0);
    respectQuietHours(target, followUp);
    return {
      label: formatDateTime(target),
      mode: `Fibonacci ${fibonacci[first24Sent] || fibonacci[fibonacci.length - 1]} min`,
      nextAt: target,
      type: "first24_fibonacci",
    };
  }
  const last = new Date(contact.lastMessageAt || contact.createdAt);
  const sinceLastDays = Math.max(0, Math.floor((now - last) / 86400000));
  const pattern = followUp.pattern.length ? followUp.pattern : [1, 3, 3];
  const firstUtilityDay = followUp.humanWindowDays;
  let targetDay = 0;
  for (let i = 0; i <= contact.followUpsSent; i += 1) {
    if (i < pattern.length) targetDay += Number(pattern[i] || 1);
    else targetDay += Number(followUp.afterWindowEveryDays || 7);
  }
  const mode = sinceLastDays >= firstUtilityDay ? "Utility template" : "Human agent";
  const target = addDays(last, targetDay);
  const best = bestContactTime(contact);
  target.setHours(best.hour, best.minute, 0, 0);
  respectQuietHours(target, followUp);
  return { label: formatDateTime(target), mode, nextAt: target };
}

function respectQuietHours(date, followUp) {
  if (followUp.quietHoursEnabled === false) return;
  const quietStart = Number((followUp.quietHoursStart || "20:00").split(":")[0]);
  const quietEnd = Number((followUp.quietHoursEnd || "08:00").split(":")[0]);
  const hour = date.getHours();
  const inQuiet = quietStart > quietEnd ? hour >= quietStart || hour < quietEnd : hour >= quietStart && hour < quietEnd;
  if (inQuiet) date.setHours(quietEnd, 0, 0, 0);
}

function topContact(tenant = activeTenant()) {
  if (!tenant) return null;
  return [...tenant.contacts]
    .filter((contact) => nextFollowUp(contact, tenant).nextAt)
    .sort((a, b) => {
      const aNext = nextFollowUp(a, tenant).nextAt || addDays(now, 999);
      const bNext = nextFollowUp(b, tenant).nextAt || addDays(now, 999);
      return aNext - bNext;
    })[0];
}

function messageScore(message) {
  return message.sent ? Math.round((message.responses / message.sent) * 100) : 0;
}

function bestMessages(tenant = activeTenant()) {
  if (!tenant) return [];
  return [...tenant.messages].sort((a, b) => messageScore(b) - messageScore(a));
}

function getFirstName(name) {
  return name.split(" ")[0] || name;
}

function interpolate(text, contact, tenant = activeTenant()) {
  const meetingAt = parseBookingSlot(contact.bookingSlot);
  return text
    .replaceAll("{{firstName}}", getFirstName(contact.name))
    .replaceAll("{{name}}", contact.name)
    .replaceAll("{{bookingLink}}", bookingUrl(tenant))
    .replaceAll("{{messengerBookingLink}}", messengerBookingUrl(tenant))
    .replaceAll("{{embeddedPageLink}}", embeddedSiteUrl(tenant))
    .replaceAll("{{meetingTime}}", meetingAt ? meetingAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "")
    .replaceAll("{{meetingDate}}", meetingAt ? meetingAt.toLocaleDateString([], { month: "long", day: "numeric" }) : "");
}

function interpolateReminder(text, contact, tenant, reminder) {
  return interpolate(text || "", contact, tenant)
    .replaceAll("{{minutesBefore}}", String(reminder?.minutesBefore ?? ""));
}

function generateSlots(tenant = activeTenant()) {
  if (!tenant) return [];
  const slots = [];
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let offset = 1; offset <= 90; offset += 1) {
    const date = addDays(now, offset);
    const rule = tenant.availability.find((item) => item.day === days[date.getDay()]);
    if (!rule?.enabled) continue;
    const [startH, startM] = rule.start.split(":").map(Number);
    const [endH, endM] = rule.end.split(":").map(Number);
    const cursor = new Date(date);
    cursor.setHours(startH, startM, 0, 0);
    const end = new Date(date);
    end.setHours(endH, endM, 0, 0);
    while (cursor < end) {
      const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())} ${pad(cursor.getHours())}:${pad(cursor.getMinutes())}`;
      const overlap = tenant.bookings.filter((booking) => booking.slot === key).length;
      if (overlap < tenant.maxOverlap) slots.push(key);
      cursor.setMinutes(cursor.getMinutes() + tenant.meetingLength);
    }
  }
  return slots;
}

function bookingDayKey(slot) {
  return String(slot || "").split(" ")[0] || "";
}

function bookingSlotTime(slot) {
  const [, time = ""] = String(slot || "").split(" ");
  return time;
}

function groupSlotsByDay(slots) {
  return slots.reduce((groups, slot) => {
    const day = bookingDayKey(slot);
    if (!day) return groups;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(slot);
    return groups;
  }, new Map());
}

function dayKeyFromParts(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function calendarMonthKey(year, month) {
  return `${year}-${pad(month + 1)}`;
}

function parseCalendarMonthKey(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  return { year: year || now.getFullYear(), month: Math.max(0, (month || 1) - 1) };
}

function resolveBookingCalendarMonth(selectedDay, slotsByDay) {
  if (state.bookingCalendarMonth) return state.bookingCalendarMonth;
  if (selectedDay) return selectedDay.slice(0, 7);
  const firstDay = [...slotsByDay.keys()][0];
  if (firstDay) return firstDay.slice(0, 7);
  return calendarMonthKey(now.getFullYear(), now.getMonth());
}

function buildMonthCalendarCells(year, month, slotsByDay, selectedDay) {
  const startPad = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells = [];
  for (let index = 0; index < startPad; index += 1) cells.push({ type: "empty" });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = dayKeyFromParts(year, month, day);
    const slotCount = slotsByDay.get(key)?.length || 0;
    const isPast = date < today;
    let type = "disabled";
    if (!isPast && slotCount) type = selectedDay === key ? "selected" : "available";
    cells.push({ type, day, key, slotCount });
  }
  while (cells.length % 7 !== 0) cells.push({ type: "empty" });
  return cells;
}

function renderMonthCalendar(slotsByDay, selectedDay) {
  const monthKey = resolveBookingCalendarMonth(selectedDay, slotsByDay);
  const { year, month } = parseCalendarMonthKey(monthKey);
  const monthLabel = new Date(year, month, 1).toLocaleDateString([], { month: "long", year: "numeric" });
  const cells = buildMonthCalendarCells(year, month, slotsByDay, selectedDay);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `
    <div class="month-calendar">
      <div class="calendar-nav">
        <button type="button" class="btn ghost calendar-nav-btn" data-calendar-prev aria-label="Previous month">Prev</button>
        <strong>${escapeHtml(monthLabel)}</strong>
        <button type="button" class="btn ghost calendar-nav-btn" data-calendar-next aria-label="Next month">Next</button>
      </div>
      <div class="calendar-weekdays">
        ${weekdays.map((label) => `<span>${label}</span>`).join("")}
      </div>
      <div class="calendar-grid">
        ${cells.map((cell) => {
          if (cell.type === "empty") return `<span class="calendar-cell empty"></span>`;
          if (cell.type === "available" || cell.type === "selected") {
            return `
              <button type="button" class="calendar-cell ${cell.type}" data-booking-day="${escapeAttr(cell.key)}" aria-label="${escapeAttr(`${cell.key}, ${cell.slotCount} available times`)}">
                <span>${cell.day}</span>
              </button>
            `;
          }
          return `<span class="calendar-cell disabled" aria-disabled="true"><span>${cell.day}</span></span>`;
        }).join("")}
      </div>
    </div>
  `;
}

function parseSlotDate(day, time = "00:00") {
  return new Date(`${day}T${time}:00`);
}

function formatCalendarMonth(day) {
  return parseSlotDate(day).toLocaleDateString([], { month: "long", year: "numeric" });
}

function formatCalendarDay(day) {
  const date = parseSlotDate(day);
  return {
    weekday: date.toLocaleDateString([], { weekday: "short" }),
    day: date.toLocaleDateString([], { day: "numeric" }),
    month: date.toLocaleDateString([], { month: "short" }),
  };
}

function formatSlotTime(slot) {
  const date = parseSlotDate(bookingDayKey(slot), bookingSlotTime(slot));
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function questionInputType(question) {
  if (question.type === "email") return "email";
  if (question.type === "phone") return "tel";
  return "text";
}

function bookingFieldName(field) {
  return `field_${field.id}`;
}

function renderBookingFieldControl(field) {
  const name = bookingFieldName(field);
  const required = field.required ? "required data-step-required" : "";
  if (field.type === "media_upload") {
    return `<input name="${escapeAttr(name)}" type="file" accept="image/*,video/*" ${required} data-booking-upload-field="${escapeAttr(field.id)}">`;
  }
  if (field.type === "textarea") {
    return `<textarea name="${escapeAttr(name)}" ${required} placeholder="Type your answer"></textarea>`;
  }
  if (field.type === "multiple_choice") {
    const options = field.options?.length ? field.options : ["Option 1", "Option 2"];
    return `
      <select name="${escapeAttr(name)}" ${required}>
        <option value="">Select one</option>
        ${options.map((option) => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }
  return `<input name="${escapeAttr(name)}" type="${questionInputType(field)}" ${required} placeholder="Type your answer">`;
}

function renderQuestionControl(question) {
  return renderBookingFieldControl(question);
}

function renderMessengerMediaPreview(tenant) {
  const url = tenant.messenger?.welcomeMediaUrl || "";
  if (!url) return "";
  const type = String(tenant.messenger?.welcomeMediaType || "").toLowerCase();
  if (type === "video") return `<video src="${escapeAttr(url)}" controls style="width:100%;max-height:180px;border-radius:8px;margin:8px 0"></video>`;
  if (type === "audio") return `<audio src="${escapeAttr(url)}" controls style="width:100%;margin:8px 0"></audio>`;
  if (type === "raw" || type === "file") return `<a class="btn small" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">Open media</a>`;
  return `<img src="${escapeAttr(url)}" alt="" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin:8px 0">`;
}

function mediaKind(url = "", type = "") {
  const normalizedType = String(type || "").toLowerCase();
  const normalizedUrl = String(url || "").toLowerCase().split("?")[0];
  if (normalizedType.includes("video") || /\.(mp4|mov|webm|m4v)$/.test(normalizedUrl)) return "video";
  if (normalizedType.includes("audio") || /\.(mp3|wav|m4a|ogg)$/.test(normalizedUrl)) return "audio";
  if (normalizedType.includes("pdf") || /\.pdf$/.test(normalizedUrl)) return "pdf";
  if (normalizedType.includes("image") || /\.(png|jpe?g|gif|webp|avif)$/.test(normalizedUrl)) return "image";
  return "file";
}

function renderRewardPreview(url, type = "") {
  if (!url) return `<div class="empty reward-preview">No reward file attached.</div>`;
  const kind = mediaKind(url, type);
  if (kind === "video") return `<video class="reward-preview" src="${escapeAttr(url)}" controls></video>`;
  if (kind === "audio") return `<div class="reward-preview file-preview"><audio src="${escapeAttr(url)}" controls></audio></div>`;
  if (kind === "pdf") return `<iframe class="reward-preview" src="${escapeAttr(url)}" title="Reward PDF preview"></iframe>`;
  if (kind === "image") return `<img class="reward-preview" src="${escapeAttr(url)}" alt="Reward preview">`;
  return `<div class="reward-preview file-preview"><strong>Reward file</strong><a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">Open file</a></div>`;
}

function bookingQuestions(tenant) {
  return normalizeBookingQuestions(tenant.booking?.questions || []);
}

function bookingFields(tenant) {
  return normalizeBookingFields(Array.isArray(tenant.booking?.fields) ? tenant.booking.fields : null, bookingQuestions(tenant));
}

function collectBookingAnswers(data, tenant) {
  return bookingFields(tenant).map((field) => ({
    ...bookingAnswerFromFormData(data, field),
  }));
}

function bookingAnswerFromFormData(data, field) {
  const value = data.get(bookingFieldName(field));
  if (field.type === "media_upload") {
    const file = value instanceof File && value.name ? value : null;
    return {
      id: field.id,
      key: field.key,
      label: field.label,
      type: field.type,
      answer: file ? file.name : "",
      fileName: file?.name || "",
      mimeType: file?.type || "",
      bytes: file?.size || 0,
    };
  }
  return {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    answer: String(value || "").trim(),
  };
}

async function collectBookingAnswersWithUploads(data, tenant) {
  const answers = collectBookingAnswers(data, tenant);
  for (const answer of answers) {
    if (answer.type !== "media_upload") continue;
    const file = data.get(bookingFieldName(answer));
    if (!(file instanceof File) || !file.name) continue;
    const upload = await uploadBookingMediaFile(file);
    answer.answer = upload.secureUrl || "";
    answer.fileName = file.name;
    answer.mimeType = file.type || "";
    answer.resourceType = upload.resourceType || "";
    answer.publicId = upload.publicId || "";
    answer.bytes = upload.bytes || file.size || 0;
  }
  return answers;
}

async function uploadBookingMediaFile(file) {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error("Upload an image or video file.");
  }
  if (file.size > BOOKING_UPLOAD_MAX_BYTES) {
    throw new Error("Choose a photo or video under 25 MB.");
  }
  showToast("Uploading booking media...");
  const dataUrl = await fileToDataUrl(file);
  const payload = await apiRequest("/api/cloudinary/upload", {
    method: "POST",
    body: JSON.stringify({ file: dataUrl, fileName: file.name, mimeType: file.type, folder: "booking" }),
  });
  return payload.upload || {};
}

function renderBookingAnswerValue(answer) {
  if (answer.type === "media_upload" && /^https?:\/\//i.test(String(answer.answer || ""))) {
    const label = answer.fileName || answer.answer;
    return `<a href="${escapeAttr(answer.answer)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  }
  return `<strong>${escapeHtml(answer.answer)}</strong>`;
}

function renderBookingLiveSummary(tenant, slot = state.selectedSlot, answers = []) {
  const date = slot ? parseBookingSlot(slot) : null;
  const visibleAnswers = answers.filter((answer) => String(answer.answer || "").trim());
  return `
    <div class="booking-summary live-booking-summary" id="bookingLiveSummary">
      <div class="booking-summary-head">
        <strong>Booking summary</strong>
        <span class="status-pill ${slot ? "good" : ""}">${slot ? "Time selected" : "No time yet"}</span>
      </div>
      <div class="summary-row"><span>Date</span><strong>${date ? escapeHtml(date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })) : "Choose a day"}</strong></div>
      <div class="summary-row"><span>Time</span><strong>${date ? escapeHtml(date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })) : "Choose a time"}</strong></div>
      <div class="summary-row"><span>Meeting</span><strong>${escapeHtml(String(tenant.meetingLength))} minutes</strong></div>
      <div class="summary-answer-list">
        <span class="mini-label">Answers</span>
        ${visibleAnswers.length ? visibleAnswers.map((answer) => `
          <div class="summary-row"><span>${escapeHtml(answer.label)}</span>${renderBookingAnswerValue(answer)}</div>
        `).join("") : `<span class="muted">Answers will appear here as you fill the form.</span>`}
      </div>
    </div>
  `;
}

function bookingAnswerByKey(answers, key) {
  return answers.find((answer) => answer.key === key)?.answer || "";
}

function bookingSourceLabel() {
  const source = new URLSearchParams(location.search).get("source") || "public_link";
  if (source === "messenger_welcome") return "Messenger welcome button";
  return source.replaceAll("_", " ");
}

function bookingFieldTypeLabel(type) {
  return {
    text: "text",
    textarea: "long text",
    email: "email",
    phone: "phone",
    multiple_choice: "multiple choice",
    media_upload: "VSL photo/video upload",
  }[type] || type.replaceAll("_", " ");
}

function abButtonModeLabel(mode) {
  return {
    both: "Booking + embedded site",
    booking_only: "Booking button only",
    embedded_only: "Embedded site button only",
  }[mode] || "Booking + embedded site";
}

function bookingContactParam() {
  return new URLSearchParams(location.search).get("contact") || "";
}

function findBookingContact(tenant, data, answers = []) {
  const contactParam = bookingContactParam();
  if (contactParam) {
    const decoded = decodeURIComponent(contactParam);
    const exact = tenant.contacts.find((contact) => contact.psid === decoded || contact.id === decoded);
    if (exact) return exact;
  }
  const name = String(data.get("name") || bookingAnswerByKey(answers, "name") || "").trim().toLowerCase();
  return tenant.contacts.find((item) => String(item.name || "").toLowerCase() === name) || null;
}

function summarizeBookingRequest(booking, tenant) {
  const answerLines = (booking.answers || [])
    .filter((answer) => answer.answer && !["name", "email", "phone", "note"].includes(answer.key))
    .map((answer) => `${answer.label}: ${answer.type === "media_upload" && answer.fileName ? `${answer.fileName} - ${answer.answer}` : answer.answer}`);
  return [
    `New booking request for ${tenant.name}`,
    `Name: ${booking.contactName}`,
    `Email: ${booking.contactEmail || "Not provided"}`,
    `Phone: ${booking.contactPhone || "Not provided"}`,
    `Time: ${booking.slot}`,
    `Source: ${booking.source}`,
    booking.note ? `Note: ${booking.note}` : "",
    ...answerLines,
  ].filter(Boolean).join("\n");
}

function routeFromHash() {
  const hash = location.hash.replace("#", "");
  if (hash.startsWith("booking/")) return { mode: "booking", slug: hash.split("/")[1] };
  if (hash.startsWith("site/")) return { mode: "site", slug: hash.split("/")[1] };
  return { mode: "admin" };
}

function setView(view) {
  state.view = view;
  saveState();
  render();
}

function showToast(message) {
  state.toast = message;
  saveState();
  render();
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = "";
      saveState();
      render();
    }
  }, 2800);
}

function updateTenant(path, value) {
  const tenant = activeTenant();
  if (!tenant) return;
  const keys = path.split(".");
  let target = tenant;
  while (keys.length > 1) {
    const key = keys.shift();
    target[key] = target[key] || {};
    target = target[key];
  }
  target[keys[0]] = value;
  if (path === "messenger.welcomeMessage") {
    (tenant.messages || []).forEach((message) => {
      if (!message.text || message.text === DEFAULT_AB_MESSAGE) message.text = value;
    });
  }
  saveState();
  render();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected file."));
    reader.readAsDataURL(file);
  });
}

async function uploadCloudinaryMedia(field) {
  const file = field.files?.[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    showToast("Choose a file under 20 MB.");
    field.value = "";
    return;
  }
  showToast("Uploading media...");
  try {
    const dataUrl = await fileToDataUrl(file);
    const payload = await apiRequest("/api/cloudinary/upload", {
      method: "POST",
      body: JSON.stringify({ file: dataUrl, fileName: file.name, mimeType: file.type }),
    });
    updateTenant(field.dataset.cloudinaryUpload, payload.upload.secureUrl || "");
    if (field.dataset.cloudinaryTypePath) updateTenant(field.dataset.cloudinaryTypePath, payload.upload.resourceType || "");
    showToast("Media uploaded.");
  } catch (error) {
    showToast(error.message || "Media upload failed.");
  } finally {
    field.value = "";
  }
}

function clearMedia(paths) {
  const [urlPath, typePath] = String(paths || "").split(":");
  if (urlPath) updateTenant(urlPath, "");
  if (typePath) updateTenant(typePath, "");
  showToast("Media removed.");
}

function initFacebookSdk() {
  if (!globalThis.FB) return false;
  if (globalThis.__followupFbReady) return true;
  globalThis.FB.init({
    appId: META_APP_ID,
    cookie: true,
    xfbml: false,
    version: "v20.0",
  });
  globalThis.__followupFbReady = true;
  return true;
}

function waitForFacebookSdk(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (initFacebookSdk()) {
      resolve(true);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (initFacebookSdk()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 150);
  });
}

function connectFacebook(event) {
  event?.preventDefault();
  if (!isHeadAdmin()) {
    showToast("Only the head admin can connect Facebook pages.");
    return;
  }
  const popup = openFacebookOAuthPopup();
  if (!popup) {
    showToast("Facebook popup was blocked. Allow popups for this ngrok domain, then click again.");
    return;
  }
  showToast("Complete Facebook login in the popup.");
  waitForFacebookOAuth(popup)
    .then((accessToken) => loadFacebookPagesFromToken(accessToken))
    .catch((error) => showToast(error.message || "Facebook login did not finish."));
}

function facebookRedirectUri() {
  return `${location.origin}/facebook-oauth-callback.html`;
}

function openFacebookOAuthPopup() {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: facebookRedirectUri(),
    response_type: "token",
    display: "popup",
    scope: "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging",
  });
  const left = Math.max(0, Math.round(screenX + (outerWidth - 640) / 2));
  const top = Math.max(0, Math.round(screenY + (outerHeight - 720) / 2));
  return window.open(`https://www.facebook.com/v20.0/dialog/oauth?${params}`, "followupFacebookLogin", `popup=yes,width=640,height=720,left=${left},top=${top}`);
}

function waitForFacebookOAuth(popup) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Facebook login timed out. Check whether the popup is blocked or waiting for approval."));
    }, 120000);
    const closedTimer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Facebook login popup was closed before access was granted."));
      }
    }, 500);
    function cleanup() {
      clearTimeout(timeout);
      clearInterval(closedTimer);
      window.removeEventListener("message", receive);
    }
    function receive(event) {
      if (event.origin !== location.origin || event.data?.type !== "facebook-oauth-callback") return;
      cleanup();
      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }
      if (!event.data.accessToken) {
        reject(new Error("Facebook did not return an access token."));
        return;
      }
      resolve(event.data.accessToken);
    }
    window.addEventListener("message", receive);
  });
}

async function loadFacebookPagesFromToken(accessToken) {
  showToast("Exchanging Facebook token...");
  const payload = await apiRequest("/api/meta/pages", {
    method: "POST",
    body: JSON.stringify({ userAccessToken: accessToken }),
  });
  state.facebookPages = (payload.pages || []).map((page) => ({
    id: page.id,
    name: page.name,
    accessToken: page.accessToken || "",
    tokenType: page.tokenType || "long_lived_page",
    tasks: page.tasks || [],
    pictureUrl: page.pictureUrl || "",
  }));
  saveState();
  render();
  showToast(state.facebookPages.length ? "Facebook pages loaded with long-lived Page tokens." : "No Facebook pages returned. Use a Facebook account that manages a page and has access to this Meta app.");
}

async function addFacebookPage(pageId) {
  if (!isHeadAdmin()) return;
  const page = state.facebookPages.find((item) => item.id === pageId);
  if (!page) return;
  const existing = state.tenants.find((tenant) => tenant.pageId === page.id);
  let connectedTenant;
  if (existing) {
    existing.pageName = page.name;
    existing.pageAccessToken = page.accessToken;
    existing.pageAccessTokenType = page.tokenType || "long_lived_page";
    existing.pageConnected = true;
    existing.pageId = page.id;
    existing.name = existing.name || page.name;
    existing.booking = { ...createBlankTenant(existing.id).booking, ...(existing.booking || {}) };
    existing.booking.slug = normalizeSlug(existing.booking.slug || page.name);
    state.activeTenantId = existing.id;
    connectedTenant = existing;
  } else {
    const id = `tenant_${uid().slice(0, 8)}`;
    const clone = createBlankTenant(id);
    clone.id = id;
    clone.name = page.name;
    clone.pageName = page.name;
    clone.pageId = page.id;
    clone.pageAccessToken = page.accessToken;
    clone.pageAccessTokenType = page.tokenType || "long_lived_page";
    clone.pageConnected = true;
    clone.booking.slug = normalizeSlug(page.name);
    clone.booking.headline = `Book with ${page.name}`;
    clone.contacts = [];
    clone.bookings = [];
    clone.logs = [];
    clone.messages = [];
    clone.templates = [];
    state.tenants.push(clone);
    state.activeTenantId = id;
    connectedTenant = clone;
  }
  addLog(`Connected Facebook page ${page.name}.`);
  saveState();
  render();
  showToast("Facebook page added and connected.");
  await subscribePageWebhookForTenant(connectedTenant);
}

async function subscribePageWebhookForTenant(tenant) {
  if (!tenant?.pageId || !tenant.pageAccessToken) return;
  try {
    await pushRemoteState();
    const payload = await apiRequest("/api/meta/subscribe-page", {
      method: "POST",
      body: JSON.stringify({ tenant }),
    });
    tenant.webhookSubscribedAt = new Date().toISOString();
    tenant.webhookSubscribedFields = payload.subscribedFields || ["messages", "messaging_postbacks"];
    addLog(`Subscribed page webhook fields: ${tenant.webhookSubscribedFields.join(", ")}.`);
    saveState();
    showToast("Page connected and webhook subscribed.");
  } catch (error) {
    addLog(`Page webhook subscription failed: ${error.message}`);
    saveState();
    showToast(`Page connected, but webhook subscription failed: ${error.message}`);
  }
}

function addLog(text) {
  const tenant = activeTenant();
  if (!tenant) return;
  tenant.logs.unshift({ id: uid(), at: now.toISOString(), text });
  tenant.logs = tenant.logs.slice(0, 20);
}

function connectPage() {
  connectFacebook();
}

function disconnectPage() {
  if (!isHeadAdmin()) {
    showToast("Only the head admin can disconnect Facebook pages.");
    return;
  }
  const tenant = activeTenant();
  tenant.pageConnected = false;
  addLog(`Disconnected ${tenant.pageName}.`);
  saveState();
  showToast("Page disconnected.");
}

function contactMatchKey(contact) {
  if (contact.psid) return `psid:${contact.psid}`;
  if (contact.conversationId) return `conversation:${contact.conversationId}`;
  if (contact.id) return `id:${contact.id}`;
  return `name:${String(contact.name || "").trim().toLowerCase()}`;
}

function contactIdentityKeys(contact) {
  const name = String(contact.name || "").trim().toLowerCase();
  const email = String(contact.email || "").trim().toLowerCase();
  const phone = String(contact.phone || "").replace(/\D+/g, "");
  return [
    contact.psid ? `psid:${contact.psid}` : "",
    contact.conversationId ? `conversation:${contact.conversationId}` : "",
    email ? `email:${email}` : "",
    phone ? `phone:${phone}` : "",
    name ? `name:${name}` : "",
    name && (email || phone) ? `profile:${name}:${email}:${phone}` : "",
    contact.id ? `id:${contact.id}` : "",
  ].filter(Boolean);
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
  existing.followUpsSent = Math.max(Number(existing.followUpsSent || 0), Number(incoming.followUpsSent || 0));
  existing.first24FollowUpsSent = Math.max(Number(existing.first24FollowUpsSent || 0), Number(incoming.first24FollowUpsSent || 0));
  existing.engagement = mergeEngagement(existing.engagement || [], incoming.engagement || []);
  return existing;
}

function dedupeTenantContacts(tenant) {
  const contacts = Array.isArray(tenant?.contacts) ? tenant.contacts : [];
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

function mergeEngagement(existing = [], incoming = []) {
  const byKey = new Map();
  [...existing, ...incoming].forEach((event) => {
    if (!event?.at) return;
    const key = `${event.id || ""}:${event.at}:${event.type || ""}`;
    byKey.set(key, { ...event });
  });
  return [...byKey.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
}

function mergeImportedContacts(tenant, importedContacts = []) {
  const indexes = new Map();
  tenant.contacts.forEach((contact, index) => {
    [contactMatchKey(contact), contact.psid ? `psid:${contact.psid}` : "", contact.conversationId ? `conversation:${contact.conversationId}` : "", `name:${String(contact.name || "").trim().toLowerCase()}`]
      .filter(Boolean)
      .forEach((key) => indexes.set(key, index));
  });

  let added = 0;
  let updated = 0;
  importedContacts.forEach((incoming) => {
    const keys = [
      contactMatchKey(incoming),
      incoming.psid ? `psid:${incoming.psid}` : "",
      incoming.conversationId ? `conversation:${incoming.conversationId}` : "",
      `name:${String(incoming.name || "").trim().toLowerCase()}`,
    ].filter(Boolean);
    const existingIndex = keys.map((key) => indexes.get(key)).find((index) => index !== undefined);

    if (existingIndex === undefined) {
      tenant.contacts.unshift({
        ...incoming,
        status: incoming.status || "historical",
        booked: Boolean(incoming.booked),
        followUpsSent: Number(incoming.followUpsSent || 0),
        engagement: Array.isArray(incoming.engagement) ? incoming.engagement : [],
      });
      const newIndex = 0;
      indexes.forEach((value, key) => indexes.set(key, value + 1));
      keys.forEach((key) => indexes.set(key, newIndex));
      added += 1;
      return;
    }

    const existing = tenant.contacts[existingIndex];
    const incomingLast = new Date(incoming.lastMessageAt || incoming.createdAt || 0);
    const existingLast = new Date(existing.lastMessageAt || existing.createdAt || 0);
    existing.name = existing.name || incoming.name;
    existing.psid = existing.psid || incoming.psid || "";
    existing.conversationId = existing.conversationId || incoming.conversationId || "";
    existing.source = existing.source?.includes("Messenger") ? existing.source : incoming.source || existing.source;
    existing.status = existing.booked ? existing.status : incoming.status || existing.status;
    existing.createdAt = new Date(incoming.createdAt || existing.createdAt) < new Date(existing.createdAt || incoming.createdAt) ? incoming.createdAt : existing.createdAt;
    if (incomingLast >= existingLast) {
      existing.lastMessageAt = incoming.lastMessageAt;
      existing.lastInboundMessageAt = incoming.lastInboundMessageAt || existing.lastInboundMessageAt || "";
      existing.lastMessageText = incoming.lastMessageText || existing.lastMessageText || "";
      existing.lastMessageDirection = incoming.lastMessageDirection || existing.lastMessageDirection || "";
    }
    existing.engagement = mergeEngagement(existing.engagement, incoming.engagement);
    updated += 1;
  });

  tenant.contacts = dedupeTenantContacts(tenant);
  return { added, updated };
}

async function syncOldContacts() {
  if (!isHeadAdmin()) {
    showToast("Only the head admin can import old contacts.");
    return;
  }
  const tenant = activeTenant();
  if (!tenant?.pageConnected || !tenant.pageId) {
    showToast("Connect a Facebook page before importing contacts.");
    return;
  }
  if (!tenant.pageAccessToken) {
    showToast("Reconnect the page so Meta returns a Page access token.");
    return;
  }
  if (!apiEnabled()) {
    showToast("Run the local Node server before importing old contacts.");
    return;
  }

  showToast("Importing old Messenger contacts...");
  try {
    const payload = await apiRequest("/api/meta/import-contacts", {
      method: "POST",
      body: JSON.stringify({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          pageName: tenant.pageName,
          pageId: tenant.pageId,
          pageAccessToken: tenant.pageAccessToken,
        },
      }),
    });
    const { added, updated } = mergeImportedContacts(tenant, payload.contacts || []);
    const errorNote = payload.errors?.length ? ` Some folders could not be read: ${payload.errors.join(" ")}` : "";
    const diagnostics = (payload.diagnostics || []).map((item) => `${item.label || "source"} ${item.conversations}`).join(", ");
    const diagnosticNote = diagnostics ? ` Meta returned: ${diagnostics}.` : "";
    addLog(`Imported ${added} old Messenger contacts and updated ${updated}.${diagnosticNote}${errorNote}`);
    saveState();
    render();
    showToast(added || updated ? `Imported ${added} old contacts, updated ${updated}.` : "Meta returned 0 Messenger conversations for this Page token.");
  } catch (error) {
    addLog(`Old Messenger contact import failed: ${error.message}`);
    saveState();
    showToast(error.message);
  }
}

async function refreshContactsNow() {
  if (apiEnabled()) {
    try {
      await apiRequest("/api/meta/refresh-contact-names", { method: "POST", body: JSON.stringify({}) });
    } catch (error) {
      console.warn("Contact name refresh failed:", error.message);
    }
  }
  await hydrateRemoteState();
}

function sendWelcomeButton(contact, tenant = activeTenant()) {
  if (!contact || !tenant?.messenger?.welcomeEnabled) return;
  if (contact.booked) {
    addLog(`Did not send booking button to ${contact.name}: contact already booked.`);
    return;
  }
  const text = interpolate(tenant.messenger.welcomeMessage || tenant.messenger.cta, contact, tenant);
  const buttonText = tenant.messenger.buttonLabel || "Book now";
  const url = messengerBookingUrl(tenant, contact);
  contact.welcomeSentAt = now.toISOString();
  contact.lastMessageAt = now.toISOString();
  contact.engagement = Array.isArray(contact.engagement) ? contact.engagement : [];
  contact.engagement.push({ at: now.toISOString(), type: "message" });
  addLog(`Sent new-contact welcome button to ${contact.name}: ${text} [${buttonText} -> ${url}]`);
}

function captureNewMessengerContact(input = {}) {
  const tenant = activeTenant();
  if (!tenant) return null;
  const name = input.name || `New Contact ${tenant.contacts.length + 1}`;
  const existing = tenant.contacts.find((contact) => contact.id === input.id || contact.name.toLowerCase() === String(name).toLowerCase());
  if (existing) return existing;
  const contact = {
    id: input.id || `contact_${uid().slice(0, 8)}`,
    name,
    source: input.source || "Messenger",
    status: input.status || "new",
    createdAt: now.toISOString(),
    lastMessageAt: now.toISOString(),
    engagement: [{ at: now.toISOString(), type: "message" }],
    booked: false,
    followUpsSent: 0,
  };
  tenant.contacts.unshift(contact);
  sendWelcomeButton(contact, tenant);
  saveState();
  return contact;
}

function simulateNewContact() {
  const contact = captureNewMessengerContact();
  if (contact) {
    render();
    showToast(`New contact captured. Welcome button sent to ${contact.name}.`);
  }
}

function sendFollowUp(contactId) {
  const tenant = activeTenant();
  const contact = tenant.contacts.find((item) => item.id === contactId);
  if (!contact) return;
  const plan = nextFollowUp(contact, tenant);
  if (!plan.nextAt && contact.booked && tenant.followUp?.bookedRegularFollowUpsEnabled !== true) {
    showToast("This customer is booked. Normal follow-ups are off; only booking reminders will send.");
    return;
  }
  if (plan.type === "booking_reminder" && plan.reminder) {
    const body = interpolateReminder(plan.reminder.message, contact, tenant, plan.reminder);
    contact.bookingRemindersSent = { ...(contact.bookingRemindersSent || {}), [plan.reminder.key]: now.toISOString() };
    contact.lastMessageAt = now.toISOString();
    contact.lastUserMessageAt = now.toISOString();
    addLog(`Sent ${plan.reminder.label.toLowerCase()} to ${contact.name}: ${body}`);
    saveState();
    showToast(`Reminder sent to ${contact.name}.`);
    return;
  }
  const message = bestMessages(tenant)[0];
  const template = tenant.templates.find((item) => item.name === tenant.messenger.postWindowTemplate) || tenant.templates[0];
  const body = plan.mode === "Utility template" && template ? template.text : message?.text || tenant.messenger.cta;
  if (plan.type === "first24_fibonacci") contact.first24FollowUpsSent = Number(contact.first24FollowUpsSent || 0) + 1;
  contact.followUpsSent += 1;
  contact.lastMessageAt = now.toISOString();
  contact.lastUserMessageAt = now.toISOString();
  contact.engagement.push({ at: now.toISOString(), type: "message", source: "user" });
  if (message && plan.mode === "Human agent") message.sent += 1;
  addLog(`Sent ${plan.mode.toLowerCase()} to ${contact.name}: ${interpolate(body, contact, tenant)}`);
  saveState();
  showToast(`Follow-up sent to ${contact.name}.`);
}

function deleteContact(contactId) {
  const tenant = activeTenant();
  if (!tenant) return;
  const contact = tenant.contacts.find((item) => item.id === contactId);
  if (!contact) return;
  if (!confirm(`Delete ${contact.name} from contacts?`)) return;
  tenant.contacts = tenant.contacts.filter((item) => item.id !== contactId);
  addLog(`Deleted contact ${contact.name}.`);
  saveState();
  render();
  showToast("Contact deleted.");
}

function updateContactField(contactId, field, value) {
  const tenant = activeTenant();
  const contact = tenant?.contacts.find((item) => item.id === contactId);
  if (!contact) return;
  contact[field] = value;
  if (field === "booked") contact.booked = Boolean(value);
  if (field === "booked" && !contact.booked) contact.bookedDone = false;
  if (field === "bookedDone") {
    contact.bookedDone = Boolean(value);
    if (contact.bookedDone) {
      contact.booked = true;
      contact.bookingCompletedAt = contact.bookingCompletedAt || new Date().toISOString();
    } else {
      contact.bookingCompletedAt = "";
    }
  }
  addLog(`Updated ${contact.name || "contact"} contact info.`);
  tenant.contacts = dedupeTenantContacts(tenant);
  saveState();
}

function updateContactPipeline(contactId, stage) {
  if (!stage || stage === "all") return;
  const tenant = activeTenant();
  const contact = tenant?.contacts.find((item) => item.id === contactId);
  if (!contact) return;
  if (stage === "booked_done") {
    contact.booked = true;
    contact.bookedDone = true;
    contact.bookingCompletedAt = contact.bookingCompletedAt || new Date().toISOString();
    contact.status = "booked_done";
  } else if (stage === "booked") {
    contact.booked = true;
    contact.bookedDone = false;
    contact.bookingCompletedAt = "";
    contact.status = "booked";
  } else {
    contact.booked = false;
    contact.bookedDone = false;
    contact.bookingCompletedAt = "";
    contact.status = stage === "high_intent" ? "hot" : stage === "new" ? "new" : "nurture";
  }
  addLog(`Moved ${contact.name || "contact"} to ${pipelineLabel(stage)}.`);
  tenant.contacts = dedupeTenantContacts(tenant);
  saveState();
  render();
}

function markResponded(messageId) {
  const tenant = activeTenant();
  const message = tenant.messages.find((item) => item.id === messageId);
  if (!message) return;
  message.responses += 1;
  saveState();
  render();
}

function addMessage() {
  const tenant = activeTenant();
  tenant.messages.push({
    id: `m_${uid().slice(0, 8)}`,
    text: tenant.messenger?.welcomeMessage || DEFAULT_AB_MESSAGE,
    buttonLabel: tenant.messenger?.buttonLabel || DEFAULT_AB_BUTTON_LABEL,
    buttonMode: "both",
    sent: 0,
    responses: 0,
  });
  saveState();
  render();
}

function abMessageText(message, tenant = activeTenant()) {
  if (!message?.text || message.text === DEFAULT_AB_MESSAGE) return tenant?.messenger?.welcomeMessage || DEFAULT_AB_MESSAGE;
  return message.text;
}

function updateAbMessageText(messageId, value) {
  const tenant = activeTenant();
  const message = tenant?.messages.find((item) => item.id === messageId);
  if (!message) return;
  message.text = value;
  saveState();
}

function updateAbMessageButtonLabel(messageId, value) {
  const tenant = activeTenant();
  const message = tenant?.messages.find((item) => item.id === messageId);
  if (!message) return;
  message.buttonLabel = value;
  saveState();
}

function updateAbMessageButtonMode(messageId, value) {
  const tenant = activeTenant();
  const message = tenant?.messages.find((item) => item.id === messageId);
  if (!message) return;
  message.buttonMode = AB_BUTTON_MODES.includes(value) ? value : "both";
  saveState();
  render();
}

function updateTemplateName(templateId, value) {
  const tenant = activeTenant();
  const template = tenant?.templates.find((item) => item.id === templateId);
  if (!template) return;
  template.name = value;
  saveState();
}

function updateTemplateText(templateId, value) {
  const tenant = activeTenant();
  const template = tenant?.templates.find((item) => item.id === templateId);
  if (!template) return;
  template.text = value;
  saveState();
}

function removeMessage(id) {
  const tenant = activeTenant();
  tenant.messages = tenant.messages.filter((message) => message.id !== id);
  saveState();
  render();
}

function addTemplate() {
  const tenant = activeTenant();
  tenant.templates.push({ id: uid(), name: `UTILITY_TEMPLATE_${tenant.templates.length + 1}`, text: "Your booking link is ready: {{bookingLink}}" });
  saveState();
  render();
}

function addBookingQuestion() {
  const tenant = activeTenant();
  if (!tenant) return;
  tenant.booking.fields = bookingFields(tenant);
  tenant.booking.fields.push({
    id: `field_${uid().slice(0, 8)}`,
    key: `custom_${uid().slice(0, 8)}`,
    label: `Field ${tenant.booking.fields.length + 1}`,
    type: "text",
    required: false,
    options: [],
  });
  saveState();
  render();
}

function updateBookingQuestion(questionId, field, value) {
  const tenant = activeTenant();
  if (!tenant) return;
  tenant.booking.fields = bookingFields(tenant);
  const bookingField = tenant.booking.fields.find((item) => item.id === questionId);
  if (!bookingField) return;
  if (field === "options") bookingField.options = String(value || "").split(",").map((option) => option.trim()).filter(Boolean);
  else bookingField[field] = value;
  saveState();
}

function deleteBookingQuestion(questionId) {
  const tenant = activeTenant();
  if (!tenant) return;
  tenant.booking.fields = bookingFields(tenant).filter((field) => field.id !== questionId);
  saveState();
  render();
}

function deleteTenant(tenantId) {
  if (!isHeadAdmin()) return;
  state.tenants = state.tenants.filter((tenant) => tenant.id !== tenantId);
  state.users.forEach((user) => {
    user.assignedTenantIds = (user.assignedTenantIds || []).filter((id) => id !== tenantId);
  });
  state.activeTenantId = visibleTenants()[0]?.id || "";
  saveState();
  showToast("Page tenant deleted.");
}

function normalizeSlug(value) {
  return String(value || "booking")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "booking";
}

function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  state = repairState(structuredClone(seedState));
  saveState();
  render();
}

function repairLocalState() {
  state = repairState(state);
  saveState();
  showToast("Local state repaired. Head admin login is restored.");
}

async function signIn(event) {
  event.preventDefault();
  state = repairState(state);
  const data = new FormData(event.target);
  const email = String(data.get("email") || "").trim().toLowerCase();
  const password = String(data.get("password") || "");

  if (apiEnabled()) {
    try {
      const payload = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      state = repairState({
        ...payload.state,
        currentUserId: payload.currentUserId,
        authToken: payload.authToken || "",
      });
      ensureAccessibleTenant();
      saveState({ localOnly: true });
      render();
      return;
    } catch (error) {
      console.warn("Remote login failed, trying local state:", error.message);
    }
  }

  let user = state.users.find((item) => String(item.email || "").toLowerCase() === email && String(item.password || "") === password);
  if (!user && email === seedState.users[0].email && password.trim() === seedState.users[0].password) {
    user = upsertHeadAdmin(state);
  }
  if (!user) {
    state.toast = "Invalid email or password.";
    saveState();
    render();
    return;
  }
  state.currentUserId = user.id;
  if (!user.loginToken) user.loginToken = createToken();
  state.authToken = user.loginToken;
  ensureAccessibleTenant();
  saveState();
  render();
}

function signOut() {
  state.currentUserId = null;
  state.authToken = "";
  saveState();
  render();
}

function addUser(input = {}) {
  if (!isHeadAdmin()) return;
  const id = `user_${uid().slice(0, 8)}`;
  const userNumber = state.users.filter((user) => user.role !== "head_admin").length + 1;
  const active = activeTenant();
  const assignedTenantIds = input.assignActiveTenant && active ? [active.id] : [];
  state.users.push({
    id,
    name: input.name || `Tenant User ${userNumber}`,
    email: String(input.email || `tenant${userNumber}@example.com`).trim().toLowerCase(),
    password: input.password || "password123",
    role: "user",
    loginToken: createToken(),
    assignedTenantIds,
  });
  saveState();
  render();
}

function createUserFromForm(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  const email = String(data.get("email") || "").trim().toLowerCase();
  const password = String(data.get("password") || "").trim();
  if (!email || !password) {
    showToast("Email and password are required.");
    return;
  }
  if (state.users.some((user) => String(user.email || "").toLowerCase() === email)) {
    showToast("That email already exists.");
    return;
  }
  addUser({
    name: String(data.get("name") || "").trim() || email,
    email,
    password,
    assignActiveTenant: data.get("assignActiveTenant") === "on",
  });
  showToast("Tenant account created. The tenant can sign in with email and password.");
}

function deleteUser(userId) {
  if (!isHeadAdmin()) return;
  const user = state.users.find((item) => item.id === userId);
  if (!user || user.role === "head_admin") return;
  state.users = state.users.filter((item) => item.id !== userId);
  saveState();
  showToast("User deleted.");
}

function updateUser(userId, path, value) {
  if (!isHeadAdmin()) return;
  const user = state.users.find((item) => item.id === userId);
  if (!user || user.role === "head_admin") return;
  user[path] = value;
  saveState();
}

function assignTenant(userId, tenantId, checked) {
  if (!isHeadAdmin()) return;
  const user = state.users.find((item) => item.id === userId);
  if (!user || user.role === "head_admin") return;
  const assigned = new Set(user.assignedTenantIds || []);
  if (checked) assigned.add(tenantId);
  else assigned.delete(tenantId);
  user.assignedTenantIds = [...assigned];
  saveState();
  render();
}

function updateAvailabilityTime(index, field, value) {
  const tenant = activeTenant();
  if (!tenant?.availability?.[index]) return;
  const nextRule = { ...tenant.availability[index], [field]: value };
  if (nextRule.enabled && nextRule.start >= nextRule.end) {
    showToast("Close time must be after open time.");
    return;
  }
  tenant.availability[index][field] = value;
  saveState();
  render();
}

async function bookSlot(event, tenantId) {
  event.preventDefault();
  const tenant = state.tenants.find((item) => item.id === tenantId);
  if (!tenant) {
    showToast("This booking page is no longer available.");
    return;
  }
  const data = new FormData(event.target);
  const slot = data.get("slot") || state.selectedSlot;
  if (!slot) {
    showToast("Choose a booking time first.");
    return;
  }
  let answers = [];
  try {
    answers = await collectBookingAnswersWithUploads(data, tenant);
  } catch (error) {
    showToast(error.message || "Booking media upload failed.");
    return;
  }
  const contactName = bookingAnswerByKey(answers, "name") || bookingAnswerByKey(answers, "email") || bookingAnswerByKey(answers, "phone") || "Booking visitor";
  const contactEmail = bookingAnswerByKey(answers, "email");
  const contactPhone = bookingAnswerByKey(answers, "phone");
  const note = bookingAnswerByKey(answers, "note");
  const booking = {
    id: uid(),
    contactName,
    contactEmail,
    contactPhone,
    slot,
    source: bookingSourceLabel(),
    status: "requested",
    note,
    answers,
  };
  booking.summary = summarizeBookingRequest(booking, tenant);
  tenant.bookings.unshift(booking);
  const contact = findBookingContact(tenant, data, answers);
  if (contact) {
    contact.booked = true;
    contact.bookingId = booking.id;
    contact.bookingSlot = slot;
    contact.bookingRemindersSent = {};
    contact.bookingSummary = booking.summary;
    contact.bookingAnswers = answers;
    contact.email = contact.email || contactEmail || "";
    contact.phone = contact.phone || contactPhone || "";
  }
  tenant.messenger.lastBookingSummary = booking.summary;
  state.bookingConfirmation = {
    tenantId: tenant.id,
    bookingId: booking.id,
    message: tenant.booking.thankYouMessage || "Thank you for booking. We received your request.",
    fileUrl: tenant.booking.deliveryFileUrl || "",
  };
  addLog(`Messenger booking summary ready for ${booking.contactName}: ${booking.summary.replaceAll("\n", " | ")}`);
  state.selectedSlot = "";
  state.selectedBookingDay = "";
  state.bookingCalendarMonth = "";
  state.showAllBookingTimes = false;
  state.bookingInteractionStarted = false;
  saveState();
  render();
  showToast("Booking requested. Admin can confirm it in the dashboard.");
  await sendBookingDelivery(tenant, booking, contact);
}

async function sendBookingDelivery(tenant, booking, contact) {
  if (!tenant.booking?.thankYouMessage && !tenant.booking?.deliveryFileUrl) return;
  try {
    const payload = await apiRequest("/api/meta/send-booking-delivery", {
      method: "POST",
      body: JSON.stringify({
        tenantId: tenant.id,
        contactPsid: contact?.psid || bookingContactParam(),
        contactId: contact?.id || "",
        contactName: booking.contactName,
        bookingId: booking.id,
      }),
    });
    addLog(payload.sent
      ? `Sent booking delivery${payload.fileSent ? " file" : ""} to ${booking.contactName} in Messenger.`
      : `Booking delivery was not sent in Messenger: ${payload.reason || "not available"}.`);
  } catch (error) {
    addLog(`Booking delivery send failed: ${error.message}`);
  } finally {
    saveState();
  }
}

function markBookingInteractionStarted() {
  state.bookingInteractionStarted = true;
  notifyBookingContinued();
}

async function trackBookingOpen(tenant) {
  if (!apiEnabled() || !tenant || routeFromHash().mode !== "booking") return;
  const contactParam = bookingContactParam();
  if (!contactParam) return;
  const key = `${tenant.id}:${contactParam}`;
  state.bookingOpenTracked = state.bookingOpenTracked || {};
  if (state.bookingOpenTracked[key]) return;
  state.bookingOpenTracked[key] = new Date().toISOString();
  saveState({ localOnly: true });
  try {
    await apiRequest("/api/meta/booking-opened", {
      method: "POST",
      body: JSON.stringify({
        tenantId: tenant.id,
        contactPsid: contactParam,
        source: bookingSourceLabel(),
      }),
    });
  } catch (error) {
    console.warn("Booking open tracking failed:", error.message);
  }
}

async function notifyBookingContinued() {
  if (!apiEnabled() || routeFromHash().mode !== "booking") return;
  const contactParam = bookingContactParam();
  if (!contactParam) return;
  const route = routeFromHash();
  const tenant = state.tenants.find((item) => item.booking.slug === route.slug) || activeTenant();
  if (!tenant) return;
  const key = `${tenant.id}:${contactParam}`;
  state.bookingContinueTracked = state.bookingContinueTracked || {};
  if (state.bookingContinueTracked[key]) return;
  state.bookingContinueTracked[key] = new Date().toISOString();
  saveState({ localOnly: true });
  try {
    await apiRequest("/api/meta/booking-continued", {
      method: "POST",
      body: JSON.stringify({
        tenantId: tenant.id,
        contactPsid: contactParam,
      }),
    });
  } catch (error) {
    console.warn("Booking continue tracking failed:", error.message);
  }
}

function render() {
  const route = routeFromHash();
  const app = document.getElementById("app");
  applyTokenLoginFromUrl();
  if (route.mode === "booking") {
    const tenant = state.tenants.find((item) => item.booking.slug === route.slug) || activeTenant();
    if (!tenant) {
      app.innerHTML = renderBookingNotFound();
      return;
    }
    app.innerHTML = renderBookingPage(tenant);
    wireBooking(tenant);
    trackBookingOpen(tenant);
    return;
  }
  if (route.mode === "site") {
    const tenantId = new URLSearchParams(location.search).get("tenant");
    const tenant = state.tenants.find((item) => item.id === tenantId) ||
      state.tenants.find((item) => item.booking.slug === route.slug) ||
      (!tenantId ? activeTenant() : null);
    app.innerHTML = tenant ? renderEmbeddedSitePage(tenant) : renderEmbeddedSiteUnavailable();
    return;
  }
  if (!currentUser()) {
    app.innerHTML = renderLogin();
    wireLogin();
    return;
  }
  ensureAccessibleTenant();
  app.innerHTML = renderAdmin();
  wireAdmin();
}

function renderLogin() {
  return `
    <div class="login-page">
      <section class="login-visual">
        <div class="brand login-brand"><div class="mark">FU</div><div><strong>FollowUp OS</strong><span>Assigned-page access</span></div></div>
        <h1>Sign in to manage your assigned Messenger pages.</h1>
        <p>Head admin connects Facebook pages once, then assigns each page to the right user. Staff users do not need Meta credentials in env or page connection access.</p>
      </section>
      <section class="login-panel">
        <form class="panel stack" id="loginForm">
          <h2>Sign in</h2>
          <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="username"></label>
          <label class="field"><span>Password</span><input name="password" type="password" required autocomplete="current-password"></label>
          <button class="btn primary" type="submit">Sign in</button>
          <div class="login-demo">
            <strong>Accounts</strong>
            <span>Head admin account is configured by the app environment.</span>
            <span>Tenant users sign in with the email and password created by admin.</span>
            <span>Build: ${BUILD_ID}</span>
          </div>
        </form>
      </section>
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </div>
  `;
}

function renderAdmin() {
  const user = currentUser();
  const allowedTenants = visibleTenants();
  if (!allowedTenants.length) return renderNoAssignedPages(user);
  const tenant = activeTenant();
  const nav = [
    ["dashboard", "D", "Dashboard"],
    ["contacts", "C", "Contacts"],
    ["automation", "A", "Automation"],
    ["booking", "B", "Booking Site"],
    ["availability", "T", "Availability"],
    ["tenants", "M", "Tenants"],
  ];
  return `
    <div class="app">
      <header class="topbar">
        <div class="brand"><div class="mark">FU</div><div><strong>FollowUp OS</strong><span>Messenger to booking automation</span></div></div>
        <div class="tenant-picker">
          <span class="mini-label">Tenant</span>
          <select id="tenantSelect">${allowedTenants.map((item) => `<option value="${item.id}" ${item.id === tenant.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select>
        </div>
        <div class="top-actions">
          <span class="status-pill ${isHeadAdmin() ? "dark" : "info"}">${escapeHtml(user.name)} - ${isHeadAdmin() ? "Head admin" : "User"}</span>
          <button class="btn small" id="copyLink">Share link</button>
          <a class="btn small primary" href="#booking/${tenant.booking.slug}">Open booking</a>
          <button class="btn small" id="logout">Logout</button>
        </div>
      </header>
      <div class="layout">
        <aside class="sidebar">
          <nav class="nav">${nav.map(([id, glyph, label]) => `<button data-view="${id}" class="${state.view === id ? "active" : ""}"><span class="glyph">${glyph}</span>${label}</button>`).join("")}</nav>
        </aside>
        <main class="main">${renderView(tenant)}</main>
      </div>
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </div>
  `;
}

function renderNoAssignedPages(user) {
  if (user?.role === "head_admin") {
    return `
      <div class="app">
        <header class="topbar">
          <div class="brand"><div class="mark">FU</div><div><strong>FollowUp OS</strong><span>No pages connected</span></div></div>
          <div class="top-actions"><span class="status-pill dark">Head admin</span><button class="btn small" id="logout">Logout</button></div>
        </header>
        <main class="main">
          <section class="section-head">
            <div><h1>Connect your first page</h1><p>Use Facebook login to load pages from the head admin account, then assign connected pages to users.</p></div>
            <button class="btn primary" id="connectFacebookFirst" type="button">Connect with Facebook</button>
          </section>
          <div class="grid two">
            <div class="panel">
              <h2>Pages from Facebook</h2>
              <p class="muted">After Facebook login, choose the page to add. No manual page form is needed.</p>
              ${renderFacebookPageList()}
            </div>
            <div class="panel">
              <h2>Connection checklist</h2>
              <div class="timeline">
                <div class="timeline-step"><div class="dot">1</div><div><strong>Use the head admin Facebook account</strong><span class="muted">The account must have access to the page.</span></div></div>
                <div class="timeline-step"><div class="dot">2</div><div><strong>Allow page permissions</strong><span class="muted">Pages list and Messenger permissions must be accepted.</span></div></div>
                <div class="timeline-step"><div class="dot">3</div><div><strong>Add/connect the page</strong><span class="muted">The connected page becomes the first tenant.</span></div></div>
              </div>
            </div>
          </div>
        </main>
        ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
      </div>
    `;
  }
  return `
    <div class="app">
      <header class="topbar">
        <div class="brand"><div class="mark">FU</div><div><strong>FollowUp OS</strong><span>No assigned pages</span></div></div>
        <div class="top-actions"><span class="status-pill info">${escapeHtml(user?.name || "User")}</span><button class="btn small" id="logout">Logout</button></div>
      </header>
      <main class="main">
        <div class="empty">No Facebook pages have been assigned to this user yet. Ask the head admin to assign a connected page.</div>
      </main>
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </div>
  `;
}

function renderFacebookPageList() {
  return `
    <div class="stack">
      <button class="btn primary" id="connectFacebookPanel" type="button">Connect with Facebook</button>
      ${state.facebookPages.length ? state.facebookPages.map((page) => `
        <div class="message-item">
          <div class="message-top">
            <div><strong>${escapeHtml(page.name)}</strong><span class="muted">Page ID ${escapeHtml(page.id)}</span></div>
            <button class="btn small primary" data-add-fb-page="${escapeAttr(page.id)}">Add/connect</button>
          </div>
          <span class="muted">${page.accessToken ? (page.tokenType === "long_lived_page" ? "Long-lived Page token received" : "Short-lived Page token received. Token exchange needs Meta approval/settings.") : "No page token returned. Check Meta permissions."}</span>
        </div>
      `).join("") : `<div class="empty">No pages loaded yet. Use Connect with Facebook.</div>`}
    </div>
  `;
}

function renderView(tenant) {
  if (state.view === "contacts") return renderContactsPipeline(tenant);
  if (state.view === "automation") return renderAutomation(tenant);
  if (state.view === "booking") return renderBookingEditor(tenant);
  if (state.view === "availability") return renderAvailability(tenant);
  if (state.view === "tenants") return renderTenants(tenant);
  return renderDashboard(tenant);
}

function renderDashboard(tenant) {
  const top = topContact(tenant);
  const topPlan = top ? nextFollowUp(top, tenant) : null;
  const responseRate = tenant.messages.reduce((sum, message) => sum + message.responses, 0) / Math.max(1, tenant.messages.reduce((sum, message) => sum + message.sent, 0));
  const pageControl = tenant.pageConnected
    ? `<span class="status-pill good">Connected by head admin</span>${isHeadAdmin() ? `<button class="btn small warn" id="disconnectPage">Disconnect</button>` : ""}`
    : `<span class="status-pill">Not connected</span>${isHeadAdmin() ? `<button class="btn small primary" id="connectPage">Connect with Facebook</button>` : `<span class="muted">Head admin must connect this page.</span>`}`;
  return `
    <section class="section-head">
      <div>
        <h1>${escapeHtml(tenant.name)}</h1>
        <p>Head admin connects Facebook pages once. Assigned users can manage contacts, booking pages, messages, and follow-ups for the pages they are assigned.</p>
      </div>
      <div class="inline-row">
        ${pageControl}
      </div>
    </section>
    <div class="grid metrics">
      ${metric("Contacts", tenant.contacts.length, "old + new imported")}
      ${metric("Bookings", tenant.bookings.length, `${tenant.maxOverlap} overlap allowed`)}
      ${metric("Response rate", `${Math.round(responseRate * 100)}%`, "A/B message performance")}
      ${metric("Best next contact", top ? top.name : "None", topPlan ? topPlan.label : "No queue")}
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="panel">
        <h2>Top follow-up now</h2>
        ${top ? `
          <div class="timeline">
            <div class="timeline-step"><div class="dot">1</div><div><strong>${escapeHtml(top.name)}</strong><span class="muted">Best contact time: ${formatBestContactTime(top)}</span></div></div>
            <div class="timeline-step"><div class="dot">2</div><div><strong>${topPlan.mode}</strong><span class="muted">Scheduled for ${topPlan.label}</span></div></div>
            <div class="timeline-step"><div class="dot">3</div><div><strong>Booking CTA</strong><span class="muted">${escapeHtml(tenant.messenger.buttonLabel)} -> ${escapeHtml(bookingUrl(tenant))}</span></div></div>
          </div>
          <button class="btn primary" data-send="${top.id}" style="margin-top:14px">Send top follow-up</button>
        ` : `<div class="empty">No contacts waiting for follow-up.</div>`}
      </div>
      <div class="panel">
        <h2>System activity</h2>
        <div class="stack">
          ${tenant.logs.length ? tenant.logs.slice(0, 5).map((log) => `<div class="log-item"><strong>${formatDateTime(log.at)}</strong><span>${escapeHtml(log.text)}</span></div>`).join("") : `<div class="empty">Connect a page or wait for live Messenger events to see automation logs.</div>`}
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h2>Recent booking answer summaries</h2>
      <div class="stack">
        ${tenant.bookings.length ? tenant.bookings.slice(0, 5).map((booking) => `
          <div class="message-item">
            <div class="message-top">
              <strong>${escapeHtml(booking.contactName)}</strong>
              <span class="status-pill info">${escapeHtml(booking.source || "public link")}</span>
            </div>
            <pre class="summary-text">${escapeHtml(booking.summary || summarizeBookingRequest(booking, tenant))}</pre>
          </div>
        `).join("") : `<div class="empty">No booking requests yet.</div>`}
      </div>
    </div>
  `;
}

function renderPipelineContactCard(contact, tenant) {
  const stage = contactPipelineStage(contact, tenant);
  const plan = nextFollowUp(contact, tenant);
  const summary = contactBookingSummary(tenant, contact);
  const initials = String(contact.name || "?").split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return `
    <div class="pipeline-card" draggable="true" data-contact-card="${escapeAttr(contact.id)}">
      <div class="pipeline-card-top">
        <div class="pipeline-identity">
          ${contact.profilePic ? `<img src="${escapeAttr(contact.profilePic)}" alt="">` : `<span class="pipeline-avatar">${escapeHtml(initials)}</span>`}
          <div>
            <strong>${escapeHtml(contact.name || "Unknown contact")}</strong>
            <span class="muted">${escapeHtml(contact.source || "Messenger")}</span>
          </div>
        </div>
        <span class="drag-handle" title="Drag contact">::</span>
      </div>
      <div class="pipeline-chip-row">
        <span class="status-pill ${pipelineStatusClass(stage)}">${pipelineLabel(stage)}</span>
        <span class="status-pill info">${inboundMessageCount(contact)} msg</span>
        <span class="status-pill info">${escapeHtml(formatBestContactTime(contact))}</span>
      </div>
      ${contact.lastMessageText ? `<p class="pipeline-last-message">${escapeHtml(contact.lastMessageText).slice(0, 130)}</p>` : `<p class="pipeline-last-message muted">No message preview yet.</p>`}
      <div class="pipeline-next"><strong>${escapeHtml(plan.mode)}</strong><span>${escapeHtml(plan.label)}</span></div>
      ${summary ? `<pre class="summary-text pipeline-summary">${escapeHtml(summary)}</pre>` : ""}
      <div class="inline-row pipeline-actions">
        <button class="btn small" data-send="${escapeAttr(contact.id)}">Send</button>
        <label class="inline-row small-check"><input data-contact-boolean="${escapeAttr(contact.id)}:booked" type="checkbox" ${contact.booked ? "checked" : ""}> <span>Booked</span></label>
        <label class="inline-row small-check"><input data-contact-boolean="${escapeAttr(contact.id)}:bookedDone" type="checkbox" ${contact.bookedDone ? "checked" : ""}> <span>Done</span></label>
      </div>
    </div>
  `;
}

function renderContacts(tenant) {
  const average = averageInboundMessages(tenant);
  const stages = ["all", "booked", "booked_done", "high_intent", "new", "nurture"];
  const grouped = stages.reduce((map, stage) => ({ ...map, [stage]: [] }), {});
  grouped.all = [...tenant.contacts];
  tenant.contacts.forEach((contact) => {
    const stage = contactPipelineStage(contact, tenant);
    if (!grouped[stage]) grouped[stage] = [];
    grouped[stage].push(contact);
  });
  return `
    <section class="section-head">
      <div><h1>Contacts</h1><p>Pipeline is based on booking status, new contacts, and high intent when inbound messages are above the page average (${average.toFixed(1)}).</p></div>
      <div class="inline-row">
        ${isHeadAdmin() ? `<button class="btn" id="syncOld">Import available page contacts</button>` : ""}
        <button class="btn" id="refreshContacts">Refresh contacts</button>
        <button class="btn primary" id="simulateNewContact">Simulate new contact</button>
      </div>
    </section>
    ${tenant.contacts.length ? `
      <div class="pipeline-grid">
        ${stages.map((stage) => `
          <div class="pipeline-column">
            <div class="pipeline-head">
              <strong>${pipelineLabel(stage)}</strong>
              <span class="status-pill info">${grouped[stage].length}</span>
            </div>
            <div class="mini-contact-list">
              ${grouped[stage].slice(0, 5).map((contact) => `
                <div class="mini-contact">
                  <strong>${escapeHtml(contact.name)}</strong>
                  <span>${inboundMessageCount(contact)} messages · ${escapeHtml(formatBestContactTime(contact))}</span>
                </div>
              `).join("") || `<span class="muted">No contacts</span>`}
            </div>
          </div>
        `).join("")}
      </div>
    ` : ""}
    <div class="panel">
      ${tenant.contacts.length ? `
      <table class="table">
        <thead><tr><th>Contact</th><th>Pipeline</th><th>Messages</th><th>Booking answers / notes</th><th>Next follow-up</th><th>Actions</th></tr></thead>
        <tbody>
          ${tenant.contacts.map((contact) => {
            const plan = nextFollowUp(contact, tenant);
            const stage = contactPipelineStage(contact, tenant);
            const summary = contactBookingSummary(tenant, contact);
            return `<tr>
              <td>
                <div class="contact-edit-grid">
                  <label class="field compact-field"><span>Name</span><input data-contact-field="${escapeAttr(contact.id)}:name" value="${escapeAttr(contact.name || "")}"></label>
                  <label class="field compact-field"><span>Email</span><input data-contact-field="${escapeAttr(contact.id)}:email" value="${escapeAttr(contact.email || "")}"></label>
                  <label class="field compact-field"><span>Phone</span><input data-contact-field="${escapeAttr(contact.id)}:phone" value="${escapeAttr(contact.phone || "")}"></label>
                </div>
                <span class="muted">Last message ${formatDateTime(contact.lastMessageAt)}</span>${contact.lastMessageText ? `<br><span class="muted">${escapeHtml(contact.lastMessageText).slice(0, 90)}</span>` : ""}
              </td>
              <td>
                <span class="status-pill ${stage === "booked" ? "good" : stage === "high_intent" ? "hot" : stage === "new" ? "info" : ""}">${pipelineLabel(stage)}</span>
                <label class="inline-row small-check"><input data-contact-boolean="${escapeAttr(contact.id)}:booked" type="checkbox" ${contact.booked ? "checked" : ""}> <span>Booked</span></label>
              </td>
              <td>
                <span class="status-pill info">${inboundMessageCount(contact)}</span>
                <span class="muted">Best ${escapeHtml(formatBestContactTime(contact))}</span>
              </td>
              <td>
                <label class="field compact-field"><span>Extra info</span><textarea data-contact-field="${escapeAttr(contact.id)}:notes" placeholder="Add notes or client info">${escapeHtml(contact.notes || "")}</textarea></label>
                ${summary ? `<pre class="summary-text contact-summary">${escapeHtml(summary)}</pre>` : `<span class="muted">No booking form answers yet.</span>`}
              </td>
              <td><strong>${escapeHtml(plan.label)}</strong><br><span class="muted">${escapeHtml(plan.mode)}</span></td>
              <td>
                <div class="inline-row">
                  <button class="btn small" data-send="${escapeAttr(contact.id)}">Send</button>
                  <button class="btn small warn" data-delete-contact="${escapeAttr(contact.id)}">Delete</button>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      ` : `<div class="empty">No contacts yet. Connect a Facebook page as head admin, then the live webhook/import flow will add contacts here.</div>`}
    </div>
  `;
}

function renderContactsPipeline(tenant) {
  const average = averageInboundMessages(tenant);
  const stages = ["booked", "booked_done", "high_intent", "new", "nurture"];
  const grouped = stages.reduce((map, stage) => ({ ...map, [stage]: [] }), {});
  tenant.contacts.forEach((contact) => {
    const stage = contactPipelineStage(contact, tenant);
    if (!grouped[stage]) grouped[stage] = [];
    grouped[stage].push(contact);
  });

  return `
    <section class="section-head">
      <div><h1>Contacts</h1><p>Pipeline columns: Booked, Booked Done, High Intent, New Contact, and Nurture. The table below remains the all-contacts view. High intent means inbound messages are above the page average (${average.toFixed(1)}).</p></div>
      <div class="inline-row">
        ${isHeadAdmin() ? `<button class="btn" id="syncOld">Import available page contacts</button>` : ""}
        <button class="btn" id="refreshContacts">Refresh contacts</button>
        <button class="btn primary" id="simulateNewContact">Simulate new contact</button>
      </div>
    </section>
    ${tenant.contacts.length ? `
      <div class="pipeline-board">
        ${stages.map((stage) => `
          <div class="pipeline-column" data-pipeline-drop="${escapeAttr(stage)}">
            <div class="pipeline-head">
              <div><strong>${pipelineLabel(stage)}</strong><span>Drop here to update</span></div>
              <span class="status-pill info">${grouped[stage].length}</span>
            </div>
            <div class="pipeline-card-list">
              ${grouped[stage].map((contact) => renderPipelineContactCard(contact, tenant)).join("") || `<span class="muted">No contacts</span>`}
            </div>
          </div>
        `).join("")}
      </div>
    ` : ""}
    <div class="panel">
      ${tenant.contacts.length ? `
      <table class="table">
        <thead><tr><th>Contact</th><th>Pipeline</th><th>Messages</th><th>Booking answers / notes</th><th>Next follow-up</th><th>Actions</th></tr></thead>
        <tbody>
          ${tenant.contacts.map((contact) => {
            const plan = nextFollowUp(contact, tenant);
            const stage = contactPipelineStage(contact, tenant);
            const summary = contactBookingSummary(tenant, contact);
            return `<tr>
              <td>
                <div class="contact-edit-grid">
                  <label class="field compact-field"><span>Name</span><input data-contact-field="${escapeAttr(contact.id)}:name" value="${escapeAttr(contact.name || "")}"></label>
                  <label class="field compact-field"><span>Email</span><input data-contact-field="${escapeAttr(contact.id)}:email" value="${escapeAttr(contact.email || "")}"></label>
                  <label class="field compact-field"><span>Phone</span><input data-contact-field="${escapeAttr(contact.id)}:phone" value="${escapeAttr(contact.phone || "")}"></label>
                </div>
                <span class="muted">Last message ${formatDateTime(contact.lastMessageAt)}</span>${contact.lastMessageText ? `<br><span class="muted">${escapeHtml(contact.lastMessageText).slice(0, 90)}</span>` : ""}
              </td>
              <td>
                <span class="status-pill ${pipelineStatusClass(stage)}">${pipelineLabel(stage)}</span>
                <label class="inline-row small-check"><input data-contact-boolean="${escapeAttr(contact.id)}:booked" type="checkbox" ${contact.booked ? "checked" : ""}> <span>Booked</span></label>
                <label class="inline-row small-check"><input data-contact-boolean="${escapeAttr(contact.id)}:bookedDone" type="checkbox" ${contact.bookedDone ? "checked" : ""}> <span>Booked done</span></label>
              </td>
              <td>
                <span class="status-pill info">${inboundMessageCount(contact)}</span>
                <span class="muted">Best ${escapeHtml(formatBestContactTime(contact))}</span>
              </td>
              <td>
                <label class="field compact-field"><span>Extra info</span><textarea data-contact-field="${escapeAttr(contact.id)}:notes" placeholder="Add notes or client info">${escapeHtml(contact.notes || "")}</textarea></label>
                ${summary ? `<pre class="summary-text contact-summary">${escapeHtml(summary)}</pre>` : `<span class="muted">No booking form answers yet.</span>`}
              </td>
              <td><strong>${escapeHtml(plan.label)}</strong><br><span class="muted">${escapeHtml(plan.mode)}</span></td>
              <td>
                <div class="inline-row">
                  <button class="btn small" data-send="${escapeAttr(contact.id)}">Send</button>
                  <button class="btn small warn" data-delete-contact="${escapeAttr(contact.id)}">Delete</button>
                </div>
              </td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      ` : `<div class="empty">No contacts yet. Connect a Facebook page as head admin, then the live webhook/import flow will add contacts here.</div>`}
    </div>
  `;
}

function renderAutomation(tenant) {
  const ranked = bestMessages(tenant);
  return `
    <section class="section-head">
      <div><h1>Automation</h1><p>Separate the send rules from the A/B test. Timing decides when a card is sent; A/B testing decides which message and button the card uses.</p></div>
    </section>
    <div class="grid two">
      <div class="panel">
        <div class="message-top">
          <h2>A/B message and button tests</h2>
          <button class="btn primary" id="addMessage">Add A/B message</button>
        </div>
        <div class="stack">
          <label class="inline-row"><input data-boolean-path="messenger.autoAbFollowUpEnabled" type="checkbox" ${tenant.messenger.autoAbFollowUpEnabled !== false ? "checked" : ""}> <span>Use A/B variants for automated booking cards</span></label>
          ${ranked.length ? ranked.map((message, index) => `
            <div class="message-item ab-card-editor">
              <div class="message-top">
                <span class="status-pill ${index === 0 ? "dark" : ""}">Rank ${index + 1}</span>
                <div class="inline-row"><button class="btn small" data-respond="${message.id}">+ response</button><button class="icon-btn" title="Remove message" data-remove-message="${message.id}">X</button></div>
              </div>
              <div class="messenger-preview ab-card-preview">
                <span class="mini-label">A/B button card</span>
                <textarea data-message="${message.id}" aria-label="A/B card body">${escapeHtml(abMessageText(message, tenant))}</textarea>
                <label class="field compact-field"><span>Booking button text</span><input data-message-button="${message.id}" value="${escapeAttr(message.buttonLabel || tenant.messenger.buttonLabel || DEFAULT_AB_BUTTON_LABEL)}" maxlength="20"></label>
                <label class="field compact-field"><span>Buttons to show</span><select data-message-button-mode="${message.id}">
                  ${AB_BUTTON_MODES.map((mode) => `<option value="${mode}" ${(message.buttonMode || "both") === mode ? "selected" : ""}>${escapeHtml(abButtonModeLabel(mode))}</option>`).join("")}
                </select></label>
                ${renderMessengerButtonsPreview({ ...tenant, messenger: { ...tenant.messenger, buttonLabel: message.buttonLabel || tenant.messenger.buttonLabel || DEFAULT_AB_BUTTON_LABEL } }, message.buttonMode || "both")}
                <span class="muted">${escapeHtml(messengerBookingUrl(tenant))}</span>
                ${embeddedPageEnabled(tenant) ? `<span class="muted">${escapeHtml(embeddedSiteUrl(tenant))}</span>` : ""}
              </div>
              <div class="inline-row">
                <span class="muted">${message.responses}/${message.sent} responses</span>
                <strong>${messageScore(message)}%</strong>
              </div>
              <div class="scorebar"><span style="width:${messageScore(message)}%"></span></div>
            </div>
          `).join("") : `<div class="empty">No A/B messages yet. Add a message to test card copy and button text.</div>`}
          <div class="message-item">
            <div class="message-top">
              <strong>Shared card buttons</strong>
            </div>
            <label class="inline-row"><input data-boolean-path="messenger.embeddedPageEnabled" type="checkbox" ${tenant.messenger.embeddedPageEnabled ? "checked" : ""}> <span>Add embedded-page button</span></label>
            <label class="field"><span>Embedded page URL</span><input data-path="messenger.embeddedPageUrl" value="${escapeAttr(tenant.messenger.embeddedPageUrl || "")}" placeholder="https://example.com"></label>
            <div class="split-row">
              <label class="field"><span>Embedded button text</span><input data-path="messenger.embeddedPageButtonLabel" maxlength="20" value="${escapeAttr(tenant.messenger.embeddedPageButtonLabel || DEFAULT_EMBEDDED_PAGE_BUTTON_LABEL)}"></label>
              <label class="field"><span>Banner button text</span><input data-path="messenger.embeddedPageBannerButtonLabel" maxlength="20" value="${escapeAttr(tenant.messenger.embeddedPageBannerButtonLabel || DEFAULT_EMBEDDED_PAGE_BANNER_BUTTON_LABEL)}"></label>
            </div>
            <label class="field"><span>Embedded page banner</span><textarea data-path="messenger.embeddedPageBannerMessage">${escapeHtml(tenant.messenger.embeddedPageBannerMessage || DEFAULT_EMBEDDED_PAGE_BANNER_MESSAGE)}</textarea></label>
            <div class="booking-summary">
              <strong>Button destinations</strong>
              <span>${escapeHtml(messengerBookingUrl(tenant))}</span>
              ${embeddedPageEnabled(tenant) ? `<span>${escapeHtml(embeddedSiteUrl(tenant))}</span>` : ""}
            </div>
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>Timing and send rules</h2>
        <div class="stack">
          <label class="field"><span>Human window days</span><input data-path="followUp.humanWindowDays" type="number" min="1" value="${tenant.followUp.humanWindowDays}"></label>
          <label class="field"><span>Human interval pattern, days</span><input data-path="followUp.pattern" value="${tenant.followUp.pattern.join(", ")}"><small class="muted">Examples: 1,3,3 or 1,1,3,7</small></label>
          <label class="field"><span>After 7-day window, send every N days</span><input data-path="followUp.afterWindowEveryDays" type="number" min="1" value="${tenant.followUp.afterWindowEveryDays}"></label>
          <div class="message-item">
            <div class="message-top">
              <strong>First 24 hours send schedule</strong>
              <label class="inline-row"><input data-boolean-path="followUp.first24FibonacciEnabled" type="checkbox" ${tenant.followUp.first24FibonacciEnabled !== false ? "checked" : ""}> <span>Enabled</span></label>
            </div>
            <label class="field"><span>Send after minutes</span><input data-path="followUp.first24FibonacciMinutes" value="${(tenant.followUp.first24FibonacciMinutes || DEFAULT_FIRST24_FIBONACCI_MINUTES).join(", ")}"><small class="muted">These times only decide when to send. The A/B panel decides message and button copy.</small></label>
          </div>
          <div class="message-item">
            <div class="message-top">
              <strong>New contact trigger</strong>
              <label class="inline-row"><input data-boolean-path="messenger.welcomeEnabled" type="checkbox" ${tenant.messenger.welcomeEnabled ? "checked" : ""}> <span>Send automatically</span></label>
            </div>
            <label class="field"><span>Do not send after team message, minutes</span><input data-number-path="messenger.suppressAfterUserMessageMinutes" type="number" min="0" step="1" value="${Number(tenant.messenger.suppressAfterUserMessageMinutes ?? 60)}"></label>
            <div class="split-row">
              <label class="inline-row"><input data-boolean-path="followUp.quietHoursEnabled" type="checkbox" ${tenant.followUp.quietHoursEnabled !== false ? "checked" : ""}> <span>Use quiet hours</span></label>
              <label class="field"><span>Quiet start</span><input data-path="followUp.quietHoursStart" type="time" value="${tenant.followUp.quietHoursStart || "20:00"}" ${tenant.followUp.quietHoursEnabled === false ? "disabled" : ""}></label>
              <label class="field"><span>Quiet end</span><input data-path="followUp.quietHoursEnd" type="time" value="${tenant.followUp.quietHoursEnd || "08:00"}" ${tenant.followUp.quietHoursEnabled === false ? "disabled" : ""}></label>
            </div>
          </div>
          <div class="message-item">
            <div class="message-top">
              <strong>Opened booking but did not continue</strong>
              <label class="inline-row"><input data-boolean-path="followUp.bookingAbandonedEnabled" type="checkbox" ${tenant.followUp.bookingAbandonedEnabled !== false ? "checked" : ""}> <span>Enabled</span></label>
            </div>
            <label class="field"><span>Wait minutes before sending</span><input data-number-path="followUp.bookingAbandonedDelayMinutes" type="number" min="1" value="${Number(tenant.followUp.bookingAbandonedDelayMinutes || 5)}"></label>
          </div>
          <div class="message-item">
            <div class="message-top">
              <strong>Booked customer reminders</strong>
              <label class="inline-row"><input data-boolean-path="followUp.bookingRemindersEnabled" type="checkbox" ${tenant.followUp.bookingRemindersEnabled !== false ? "checked" : ""}> <span>Send reminders</span></label>
            </div>
            <label class="inline-row"><input data-boolean-path="followUp.bookedRegularFollowUpsEnabled" type="checkbox" ${tenant.followUp.bookedRegularFollowUpsEnabled ? "checked" : ""}> <span>Also allow normal follow-ups after booking</span></label>
            <div class="split-row">
              <label class="field"><span>Day-of reminder time</span><input data-path="followUp.bookingReminderDayOfTime" type="time" value="${tenant.followUp.bookingReminderDayOfTime || "09:00"}"></label>
              <label class="field"><span>Before meeting, minutes</span><input data-number-path="followUp.bookingReminderBeforeMinutes" type="number" min="1" value="${Number(tenant.followUp.bookingReminderBeforeMinutes || 60)}"></label>
              <label class="field"><span>Final reminder, minutes</span><input data-number-path="followUp.bookingReminderFinalMinutes" type="number" min="1" value="${Number(tenant.followUp.bookingReminderFinalMinutes || 15)}"></label>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="panel">
        <h2>Fallback and media content</h2>
        <div class="stack">
          <label class="field"><span>Fallback CTA text</span><input data-path="messenger.cta" value="${escapeAttr(tenant.messenger.cta)}"></label>
          <label class="field"><span>Fallback welcome message</span><textarea data-path="messenger.welcomeMessage">${escapeHtml(tenant.messenger.welcomeMessage)}</textarea></label>
          <label class="field"><span>Fallback booking button text</span><input data-path="messenger.buttonLabel" value="${escapeAttr(tenant.messenger.buttonLabel)}"></label>
          <label class="field"><span>Photo/media before card</span><input data-cloudinary-upload="messenger.welcomeMediaUrl" data-cloudinary-type-path="messenger.welcomeMediaType" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx"></label>
          <label class="field"><span>Uploaded media URL</span><input data-path="messenger.welcomeMediaUrl" value="${escapeAttr(tenant.messenger.welcomeMediaUrl || "")}" placeholder="Optional media URL"></label>
          ${tenant.messenger.welcomeMediaUrl ? `<button class="btn small" data-clear-media="messenger.welcomeMediaUrl:messenger.welcomeMediaType" type="button">Remove media</button>` : ""}
          <label class="field"><span>Opened-booking follow-up message</span><textarea data-path="followUp.bookingAbandonedMessage">${escapeHtml(tenant.followUp.bookingAbandonedMessage || "")}</textarea></label>
        </div>
      </div>
      <div class="panel">
        <h2>Utility and reminder messages</h2>
        <div class="stack">
          <label class="field"><span>Template after silence</span><select data-path="messenger.postWindowTemplate">${tenant.templates.map((template) => `<option value="${escapeAttr(template.name)}" ${template.name === tenant.messenger.postWindowTemplate ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}</select></label>
          ${tenant.templates.map((template) => `
            <div class="rule-item">
              <input class="inline-input" data-template-name="${template.id}" value="${escapeAttr(template.name)}">
              <textarea data-template-text="${template.id}">${escapeHtml(template.text)}</textarea>
            </div>
          `).join("")}
          <button class="btn" id="addTemplate">Add utility template</button>
          <label class="field"><span>Day-of reminder message</span><textarea data-path="followUp.bookingReminderDayOfMessage">${escapeHtml(tenant.followUp.bookingReminderDayOfMessage || "")}</textarea></label>
          <label class="field"><span>Before meeting message</span><textarea data-path="followUp.bookingReminderBeforeMessage">${escapeHtml(tenant.followUp.bookingReminderBeforeMessage || "")}</textarea></label>
          <label class="field"><span>Final reminder message</span><textarea data-path="followUp.bookingReminderFinalMessage">${escapeHtml(tenant.followUp.bookingReminderFinalMessage || "")}</textarea></label>
          <span class="muted">Variables: {{firstName}}, {{name}}, {{meetingDate}}, {{meetingTime}}, {{minutesBefore}}</span>
        </div>
      </div>
    </div>
  `;
}

function renderBookingEditor(tenant) {
  return `
    <section class="section-head">
      <div><h1>Booking Site</h1><p>Edit the public booking page. Keep the page simple: photo, short copy, available times, and a request form.</p></div>
      <a class="btn primary" href="#booking/${tenant.booking.slug}">Open public page</a>
    </section>
    <div class="booking-editor-grid">
      <div class="panel">
        <h2>Page content</h2>
        <div class="stack">
          <label class="field"><span>Share slug</span><input data-path="booking.slug" value="${escapeAttr(tenant.booking.slug)}"></label>
          <label class="field"><span>Headline</span><input data-path="booking.headline" value="${escapeAttr(tenant.booking.headline)}"></label>
          <label class="field"><span>Short description</span><textarea data-path="booking.subheadline">${escapeHtml(tenant.booking.subheadline)}</textarea></label>
          <div class="split-row">
            <label class="field"><span>Small label</span><input data-path="booking.offer" value="${escapeAttr(tenant.booking.offer)}"></label>
            <label class="field"><span>Accent color</span><input data-path="booking.accent" type="color" value="${escapeAttr(tenant.booking.accent)}"></label>
          </div>
          <div class="booking-photo-editor">
            <img src="${escapeAttr(tenant.booking.photoUrl || defaultHero)}" alt="">
            <div class="stack">
              <label class="field"><span>Upload booking photo</span><input data-cloudinary-upload="booking.photoUrl" type="file" accept="image/*"></label>
              <label class="field"><span>Photo URL</span><input data-path="booking.photoUrl" value="${escapeAttr(tenant.booking.photoUrl || "")}" placeholder="Optional image URL"></label>
              <div class="inline-row">
                <button class="btn small" data-clear-media="booking.photoUrl" type="button">Use default photo</button>
              </div>
            </div>
          </div>
          <div class="link-box"><input class="inline-input" readonly value="${escapeAttr(bookingUrl(tenant))}"><button class="btn" id="copyLinkEditor">Copy</button></div>
        </div>
      </div>
      <div class="panel booking-preview-shell">${renderBookingPage(tenant, true)}</div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h2>After-booking reward file</h2>
      <p class="muted">Upload the file customers receive after booking. The same thank-you message and file are shown on the booking page and sent in Messenger when the booking came from a Messenger contact.</p>
      <div class="delivery-editor">
        <label class="field"><span>Thank-you message</span><textarea data-path="booking.thankYouMessage" placeholder="Message shown after booking and sent in Messenger">${escapeHtml(tenant.booking.thankYouMessage || "")}</textarea></label>
        <div class="stack">
          <label class="field"><span>Upload reward file</span><input data-cloudinary-upload="booking.deliveryFileUrl" data-cloudinary-type-path="booking.deliveryFileType" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx"></label>
          <label class="field"><span>Reward file URL</span><input data-path="booking.deliveryFileUrl" value="${escapeAttr(tenant.booking.deliveryFileUrl || "")}" placeholder="Optional file URL"></label>
          ${tenant.booking.deliveryFileUrl ? `<button class="btn small" data-clear-media="booking.deliveryFileUrl:booking.deliveryFileType" type="button">Remove file</button>` : ""}
          <div class="booking-summary">
            <strong>Customer receives this after booking</strong>
            <span>${escapeHtml(tenant.booking.thankYouMessage || "No thank-you message set.")}</span>
            ${tenant.booking.deliveryFileUrl ? `<a href="${escapeAttr(tenant.booking.deliveryFileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(tenant.booking.deliveryFileUrl)}</a>` : `<span>No file attached.</span>`}
          </div>
          ${renderRewardPreview(tenant.booking.deliveryFileUrl, tenant.booking.deliveryFileType)}
        </div>
      </div>
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="panel">
        <h2>Welcome message button</h2>
        <div class="stack">
          <label class="field"><span>Welcome message</span><textarea data-path="messenger.welcomeMessage" placeholder="Write the message sent before the booking button">${escapeHtml(tenant.messenger.welcomeMessage)}</textarea></label>
          <label class="field"><span>Welcome button text</span><input data-path="messenger.buttonLabel" value="${escapeAttr(tenant.messenger.buttonLabel)}" placeholder="Book now"></label>
          <label class="field"><span>Upload welcome media</span><input data-cloudinary-upload="messenger.welcomeMediaUrl" data-cloudinary-type-path="messenger.welcomeMediaType" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx"></label>
          <label class="field"><span>Welcome media URL (optional)</span><input data-path="messenger.welcomeMediaUrl" value="${escapeAttr(tenant.messenger.welcomeMediaUrl || "")}" placeholder="Optional media URL"></label>
          ${tenant.messenger.welcomeMediaUrl ? `<button class="btn small" data-clear-media="messenger.welcomeMediaUrl:messenger.welcomeMediaType" type="button">Remove media</button>` : ""}
          <label class="inline-row"><input data-boolean-path="messenger.embeddedPageEnabled" type="checkbox" ${tenant.messenger.embeddedPageEnabled ? "checked" : ""}> <span>Add embedded-page button</span></label>
          <label class="field"><span>Embedded page URL</span><input data-path="messenger.embeddedPageUrl" value="${escapeAttr(tenant.messenger.embeddedPageUrl || "")}" placeholder="https://example.com"></label>
          <div class="split-row">
            <label class="field"><span>Embedded button text</span><input data-path="messenger.embeddedPageButtonLabel" maxlength="20" value="${escapeAttr(tenant.messenger.embeddedPageButtonLabel || DEFAULT_EMBEDDED_PAGE_BUTTON_LABEL)}"></label>
            <label class="field"><span>Banner button text</span><input data-path="messenger.embeddedPageBannerButtonLabel" maxlength="20" value="${escapeAttr(tenant.messenger.embeddedPageBannerButtonLabel || DEFAULT_EMBEDDED_PAGE_BANNER_BUTTON_LABEL)}"></label>
          </div>
          <label class="field"><span>Embedded page banner</span><textarea data-path="messenger.embeddedPageBannerMessage">${escapeHtml(tenant.messenger.embeddedPageBannerMessage || DEFAULT_EMBEDDED_PAGE_BANNER_MESSAGE)}</textarea></label>
          <label class="field"><span>Unique embedded page link</span><input readonly value="${escapeAttr(embeddedSiteUrl(tenant))}"></label>
          <button class="btn" id="copyEmbeddedPageLink">Copy embedded page link</button>
          <label class="field"><span>Unique Messenger booking link</span><input readonly value="${escapeAttr(messengerBookingUrl(tenant))}"></label>
          <button class="btn" id="copyMessengerLink">Copy Messenger button link</button>
          <div class="messenger-preview">
            <span class="mini-label">Messenger preview</span>
            ${renderMessengerMediaPreview(tenant)}
            <p>${escapeHtml(tenant.messenger.welcomeMessage || "Welcome message")}</p>
            ${renderMessengerButtonsPreview(tenant)}
          </div>
          <div class="booking-summary">
            <strong>Answer summary destination</strong>
            <span>When a visitor books from this link, the system stores a summarized answer payload for Messenger handoff.</span>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="message-top">
          <h2>Booking form fields</h2>
          <button class="btn small primary" id="addBookingQuestion">Add field</button>
        </div>
        <div class="stack">
          ${bookingFields(tenant).map((question) => `
            <div class="message-item question-editor">
              <div class="message-top">
                <strong>${escapeHtml(question.label)}</strong>
                <button class="btn small warn" data-delete-question="${escapeAttr(question.id)}">Delete field</button>
              </div>
              <label class="field"><span>Field label</span><input data-question-field="${escapeAttr(question.id)}:label" value="${escapeAttr(question.label)}"></label>
              <div class="question-row">
                <label class="field"><span>Type</span><select data-question-field="${escapeAttr(question.id)}:type">
                  ${BOOKING_FIELD_TYPES.map((type) => `<option value="${type}" ${question.type === type ? "selected" : ""}>${escapeHtml(bookingFieldTypeLabel(type))}</option>`).join("")}
                </select></label>
                <label class="inline-row"><input data-question-required="${escapeAttr(question.id)}" type="checkbox" ${question.required ? "checked" : ""}> <span>Required</span></label>
              </div>
              ${question.type === "multiple_choice" ? `<label class="field"><span>Multiple choice options</span><input data-question-field="${escapeAttr(question.id)}:options" value="${escapeAttr((question.options || []).join(", "))}" placeholder="Option A, Option B, Option C"></label>` : ""}
            </div>
          `).join("") || `<div class="empty">No form fields. Add a field if you want customers to answer anything before booking.</div>`}
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="booking-section-title">
        <div><h2>Business hours</h2><p class="muted">The public calendar only shows appointment times inside these open and close hours.</p></div>
        <span class="status-pill info">${escapeHtml(tenant.meetingLength)} min meetings</span>
      </div>
      <div class="hours-editor">
        ${tenant.availability.map((rule, index) => `
          <div class="rule-item hours-row">
            <label class="inline-row"><input data-availability-enabled="${index}" type="checkbox" ${rule.enabled ? "checked" : ""}> <strong>${rule.day}</strong></label>
            <label class="field"><span>Open</span><input data-availability-start="${index}" type="time" value="${rule.start}"></label>
            <label class="field"><span>Close</span><input data-availability-end="${index}" type="time" value="${rule.end}"></label>
            <span class="status-pill ${rule.enabled ? "good" : ""}">${rule.enabled ? "Open" : "Closed"}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAvailability(tenant) {
  return `
    <section class="section-head">
      <div><h1>Availability</h1><p>Control days, working hours, meeting length, and how many meetings can overlap in the same slot.</p></div>
    </section>
    <div class="grid two">
      <div class="panel">
        <h2>Rules</h2>
        <div class="stack">
          <div class="split-row">
            <label class="field"><span>Meeting length</span><input data-number-path="meetingLength" type="number" min="10" step="5" value="${tenant.meetingLength}"></label>
            <label class="field"><span>Max overlap</span><input data-number-path="maxOverlap" type="number" min="1" value="${tenant.maxOverlap}"></label>
          </div>
          ${tenant.availability.map((rule, index) => `
            <div class="split-row rule-item">
              <label class="inline-row"><input data-availability-enabled="${index}" type="checkbox" ${rule.enabled ? "checked" : ""}> <strong>${rule.day}</strong></label>
              <label class="field"><span>Start</span><input data-availability-start="${index}" type="time" value="${rule.start}"></label>
              <label class="field"><span>End</span><input data-availability-end="${index}" type="time" value="${rule.end}"></label>
              <span class="status-pill ${rule.enabled ? "good" : ""}">${rule.enabled ? "Open" : "Closed"}</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="panel">
        <h2>Next available slots</h2>
        <div class="slot-grid">${generateSlots(tenant).slice(0, 18).map((slot) => `<button class="slot">${escapeHtml(slot)}</button>`).join("")}</div>
      </div>
    </div>
  `;
}

function renderTenants(tenant) {
  if (!isHeadAdmin()) {
    return `
      <section class="section-head">
        <div><h1>Assigned Pages</h1><p>Your account can use the pages assigned by the head admin. Facebook connection is already handled centrally.</p></div>
      </section>
      <div class="grid two">
        ${visibleTenants().map((item) => `
          <div class="panel">
            <div class="message-top">
              <div><h2>${escapeHtml(item.name)}</h2><span class="muted">${escapeHtml(item.pageName)}</span></div>
              <span class="status-pill ${item.pageConnected ? "good" : ""}">${item.pageConnected ? "Connected" : "Waiting for head admin"}</span>
            </div>
            <p class="muted">You can manage this tenant's contacts, automation, booking site, availability, and bookings.</p>
          </div>
        `).join("")}
      </div>
    `;
  }
  const nonHeadUsers = state.users.filter((user) => user.role !== "head_admin");
  return `
    <section class="section-head">
      <div><h1>Users & Pages</h1><p>Head admin connects Facebook pages, creates tenant accounts, and assigns the pages each tenant can access.</p></div>
      <div class="inline-row"><button class="btn primary" id="connectFacebookTop" type="button">Connect with Facebook</button></div>
    </section>
    <div class="grid two">
      <div class="panel">
        <h2>Facebook Page Connection</h2>
        <p class="muted">This is where the head admin connects the selected Facebook page. In production this button starts Meta OAuth and stores the page token on the tenant in Supabase.</p>
        <div class="stack">
          <label class="field"><span>Business name</span><input data-path="name" value="${escapeAttr(tenant.name)}"></label>
          <label class="field"><span>Facebook page name</span><input data-path="pageName" value="${escapeAttr(tenant.pageName)}"></label>
          <label class="field"><span>Meta Page ID</span><input data-path="pageId" value="${escapeAttr(tenant.pageId || "")}" placeholder="Optional until Facebook OAuth is connected"></label>
          <div class="inline-row">
            <span class="status-pill ${tenant.pageConnected ? "good" : ""}">${tenant.pageConnected ? "Connected" : "Not connected"}</span>
            ${tenant.pageConnected ? `<button class="btn small warn" id="disconnectPage" type="button">Disconnect page</button>` : `<button class="btn small primary" id="connectFacebook" type="button">Connect with Facebook</button>`}
            <button class="btn small warn" data-delete-tenant="${tenant.id}">Delete page tenant</button>
            <button class="btn" id="resetDemo">Reset demo data</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>Pages from Facebook</h2>
        <p class="muted">Click Connect with Facebook, then choose the page to add. No manual page form is needed.</p>
        ${renderFacebookPageList()}
      </div>
    </div>
    <div class="grid two" style="margin-top:16px">
      <div class="panel">
        <h2>All page tenants</h2>
        <div class="stack">
          ${state.tenants.map((item) => `<button class="btn" data-tenant="${item.id}">${escapeHtml(item.name)} <span class="muted">${escapeHtml(item.pageName)}${item.pageId ? ` - ${escapeHtml(item.pageId)}` : ""} - ${item.contacts.length} contacts</span></button>`).join("")}
        </div>
      </div>
      <div class="panel">
        <h2>Facebook OAuth status</h2>
        <p class="muted">Connect with Facebook loads pages from the account that has access to your Meta app. In production the backend stores page tokens in Supabase and subscribes webhooks.</p>
        <div class="timeline">
          <div class="timeline-step"><div class="dot">1</div><div><strong>Facebook login</strong><span class="muted">Head admin grants page permissions.</span></div></div>
          <div class="timeline-step"><div class="dot">2</div><div><strong>Choose page</strong><span class="muted">Add/connect from the returned page list.</span></div></div>
          <div class="timeline-step"><div class="dot">3</div><div><strong>Assign users</strong><span class="muted">Use checkboxes below to assign or unassign pages.</span></div></div>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px">
      <h2>User assignments</h2>
      <p class="muted">Create tenant accounts here. Check a page to assign it. Uncheck it to unassign the page from that user.</p>
      <form class="message-item" id="createUserForm" style="margin-bottom:12px">
        <div class="message-top">
          <strong>Create tenant account</strong>
          <button class="btn small primary" type="submit">Create account</button>
        </div>
        <div class="user-row">
          <label class="field"><span>Name</span><input name="name" placeholder="Client or staff name"></label>
          <label class="field"><span>Email</span><input name="email" type="email" required placeholder="tenant@example.com"></label>
          <label class="field"><span>Password</span><input name="password" required value="password123"></label>
        </div>
        <label class="inline-row">
          <input name="assignActiveTenant" type="checkbox" ${tenant ? "checked" : ""}>
          <span>Assign selected page now</span>
        </label>
      </form>
      <div class="grid two">
        ${nonHeadUsers.map((user) => `
          <div class="message-item">
            <div class="message-top">
              <strong>${escapeHtml(user.name)}</strong>
              <div class="inline-row">
                <span class="status-pill info">User</span>
                <button class="btn small warn" data-delete-user="${user.id}">Delete user</button>
              </div>
            </div>
            <div class="user-row">
              <label class="field"><span>Name</span><input data-user-field="${user.id}:name" value="${escapeAttr(user.name)}"></label>
              <label class="field"><span>Email</span><input data-user-field="${user.id}:email" value="${escapeAttr(user.email)}"></label>
              <label class="field"><span>Password</span><input data-user-field="${user.id}:password" value="${escapeAttr(user.password)}"></label>
            </div>
            <div class="stack">
              <span class="mini-label">Assigned pages</span>
              ${state.tenants.map((item) => `
                <label class="inline-row">
                  <input type="checkbox" data-assign-user="${user.id}" data-assign-tenant="${item.id}" ${user.assignedTenantIds.includes(item.id) ? "checked" : ""}>
                  <strong>${escapeHtml(item.name)}</strong>
                  <span class="muted">${escapeHtml(item.pageName)}</span>
                </label>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function metric(label, value, note) {
  return `<div class="panel metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(note)}</small></div>`;
}

function renderEmbeddedSitePage(tenant) {
  const targetUrl = safeExternalUrl(tenant?.messenger?.embeddedPageUrl);
  if (!targetUrl) return renderEmbeddedSiteUnavailable();
  const bannerMessage = tenant.messenger.embeddedPageBannerMessage || DEFAULT_EMBEDDED_PAGE_BANNER_MESSAGE;
  const buttonLabel = tenant.messenger.embeddedPageBannerButtonLabel || DEFAULT_EMBEDDED_PAGE_BANNER_BUTTON_LABEL;
  return `
    <div class="embedded-site-page">
      <header class="embedded-site-banner">
        <div>
          <strong>${escapeHtml(tenant.name || tenant.pageName || "MessengerBook")}</strong>
          <span>${escapeHtml(bannerMessage)}</span>
        </div>
        <a class="btn primary" href="${escapeAttr(bookingUrlFromCurrentContact(tenant))}">${escapeHtml(buttonLabel)}</a>
      </header>
      <iframe class="embedded-site-frame" src="${escapeAttr(targetUrl)}" title="${escapeAttr(tenant.name || "Embedded page")}" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </div>
  `;
}

function renderEmbeddedSiteUnavailable() {
  return `
    <div class="embedded-site-page unavailable">
      <section class="embedded-site-empty">
        <span class="status-pill">Unavailable</span>
        <h1>Embedded page not available</h1>
        <p>This link is not configured yet. Please contact the business for a fresh link.</p>
      </section>
    </div>
  `;
}

function renderMessengerButtonsPreview(tenant, buttonMode = "both") {
  const mode = AB_BUTTON_MODES.includes(buttonMode) ? buttonMode : "both";
  const showEmbedded = mode !== "booking_only";
  const showBooking = mode !== "embedded_only";
  const hasEmbedded = embeddedPageEnabled(tenant);
  return `
    <div class="messenger-button-row">
      ${showEmbedded && hasEmbedded ? `<button class="btn small" type="button">${escapeHtml(tenant.messenger.embeddedPageButtonLabel || DEFAULT_EMBEDDED_PAGE_BUTTON_LABEL)}</button>` : ""}
      ${showBooking ? `<button class="btn small primary" type="button">${escapeHtml(tenant.messenger.buttonLabel || DEFAULT_AB_BUTTON_LABEL)}</button>` : ""}
      ${showEmbedded && !hasEmbedded ? `<span class="muted">Embedded site button needs a configured embedded page URL.</span>` : ""}
    </div>
  `;
}

function renderBookingPage(tenant, embedded = false) {
  const slots = generateSlots(tenant);
  const slotsByDay = groupSlotsByDay(slots);
  const bookingContact = bookingContactFromUrl(tenant);
  const recommendedSlots = recommendedSlotsForContact(slots, bookingContact, 6);
  const showRecommendedFirst = !embedded && bookingContact && recommendedSlots.length && !state.showAllBookingTimes;
  const selectedDay = state.selectedBookingDay && slotsByDay.has(state.selectedBookingDay)
    ? state.selectedBookingDay
    : showRecommendedFirst
      ? bookingDayKey(recommendedSlots[0])
      : "";
  const selectedDaySlots = selectedDay ? slotsByDay.get(selectedDay) || [] : [];
  const fields = bookingFields(tenant);
  const confirmation = state.bookingConfirmation?.tenantId === tenant.id ? state.bookingConfirmation : null;
  const bookingSteps = fields.length
    ? fields.map((field, index) => ({
        label: field.label,
        control: renderBookingFieldControl(field),
        required: field.required,
        submit: index === fields.length - 1,
      }))
    : [{ label: "Ready", control: `<p class="muted">Submit your selected appointment time.</p>`, submit: true }];
  return `
    <div class="booking-page simple-booking-page" style="--teal:${escapeAttr(tenant.booking.accent)}">
      <main class="simple-booking-shell">
        <section class="booking-intro">
          <img src="${escapeAttr(tenant.booking.photoUrl || defaultHero)}" alt="">
          <div class="booking-copy">
            <span class="status-pill good">${escapeHtml(tenant.booking.offer)}</span>
            <h1>${escapeHtml(tenant.booking.headline)}</h1>
            <p>${escapeHtml(tenant.booking.subheadline)}</p>
          </div>
        </section>
        <section class="booking-panel">
          <div class="booking-workspace">
            <div class="booking-calendar-column">
              <div class="booking-section-title">
                <div><span class="mini-label">Calendar</span><h2>Choose a day</h2></div>
                <span class="status-pill info">${slots.length ? `${slots.length} open slots` : "No availability"}</span>
              </div>
              ${slots.length ? `
                ${showRecommendedFirst ? `
                  <div class="recommended-times">
                    <div class="booking-section-title compact">
                      <div><span class="mini-label">Best-time match</span><h3>Nearest times to ${escapeHtml(formatBestContactTime(bookingContact))}</h3></div>
                    </div>
                    <div class="slot-grid time-grid">
                      ${recommendedSlots.map((slot) => `<button type="button" class="slot ${state.selectedSlot === slot ? "active" : ""}" data-slot="${escapeAttr(slot)}"><strong>${escapeHtml(formatSlotTime(slot))}</strong><span>${escapeHtml(parseSlotDate(bookingDayKey(slot)).toLocaleDateString([], { month: "short", day: "numeric" }))}</span></button>`).join("")}
                    </div>
                    <button class="btn full" type="button" data-show-all-times>Show all other times</button>
                  </div>
                ` : `
                  ${renderMonthCalendar(slotsByDay, selectedDay)}
                  <div class="time-panel ${selectedDay ? "visible" : ""}">
                    <div class="booking-section-title compact">
                      <div><span class="mini-label">Available times</span><h3>${selectedDay ? escapeHtml(parseSlotDate(selectedDay).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })) : "Select a day"}</h3></div>
                    </div>
                    ${selectedDay ? `
                      <div class="slot-grid time-grid">
                        ${selectedDaySlots.map((slot) => `<button type="button" class="slot ${state.selectedSlot === slot ? "active" : ""}" data-slot="${escapeAttr(slot)}"><strong>${escapeHtml(formatSlotTime(slot))}</strong><span>${escapeHtml(tenant.meetingLength)} min</span></button>`).join("")}
                      </div>
                    ` : `<div class="empty time-empty">Pick a highlighted day on the calendar to see available times.</div>`}
                  </div>
                `}
              ` : `<div class="empty">No slots available. Check back soon.</div>`}
            </div>
            <div class="booking-form-card">
              ${confirmation ? `
                <div class="booking-delivery-confirmation">
                  <span class="status-pill good">Booking received</span>
                  <p>${escapeHtml(confirmation.message || "Thank you for booking.")}</p>
                  ${confirmation.fileUrl ? `<a class="btn primary" href="${escapeAttr(confirmation.fileUrl)}" target="_blank" rel="noreferrer">Open file</a>` : ""}
                  ${renderRewardPreview(confirmation.fileUrl, tenant.booking.deliveryFileType)}
                </div>
              ` : ""}
              <div class="booking-section-title compact">
                <div><span class="mini-label">Details</span><h2>Request appointment</h2></div>
                <span class="status-pill ${state.selectedSlot ? "good" : ""}">${state.selectedSlot ? escapeHtml(formatSlotTime(state.selectedSlot)) : "Pick a time"}</span>
              </div>
              <form class="booking-form-simple" id="bookingForm">
                <input type="hidden" name="slot" value="${escapeAttr(state.selectedSlot)}">
                <div class="step-dots" aria-hidden="true">${bookingSteps.map((_, index) => `<span class="${index === 0 ? "active" : ""}"></span>`).join("")}</div>
                ${bookingSteps.map((step, index) => `
                  <div class="booking-step ${index === 0 ? "active" : ""}" data-booking-step="${index}">
                    <label class="field"><span>${escapeHtml(step.label)}${step.required ? " *" : ""}</span>${step.control}</label>
                    ${step.submit ? `
                      <div class="inline-row booking-step-actions">
                        <button class="btn" type="button" data-booking-back>Back</button>
                        <button class="btn primary booking-submit" ${embedded ? "type=\"button\"" : "type=\"submit\""}>${state.selectedSlot ? "Request this time" : "Choose a time first"}</button>
                      </div>
                    ` : `
                      <div class="inline-row booking-step-actions">
                        ${index ? `<button class="btn" type="button" data-booking-back>Back</button>` : ""}
                        <button class="btn primary booking-submit" type="button" data-booking-next>Next</button>
                      </div>
                    `}
                  </div>
                `).join("")}
              </form>
              ${renderBookingLiveSummary(tenant)}
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}

function renderBookingNotFound() {
  return `
    <div class="booking-page">
      <section class="booking-hero">
        <img src="${escapeAttr(defaultHero)}" alt="">
        <div class="booking-copy">
          <span class="status-pill">Unavailable</span>
          <h1>Booking page not found</h1>
          <p>This booking link is no longer active. Please contact the business for a fresh link.</p>
        </div>
      </section>
    </div>
  `;
}

function wireAdmin() {
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.getElementById("logout")?.addEventListener("click", signOut);
  document.getElementById("tenantSelect")?.addEventListener("change", (event) => {
    state.activeTenantId = event.target.value;
    saveState();
    render();
  });
  document.querySelectorAll("[data-tenant]").forEach((button) => button.addEventListener("click", () => {
    state.activeTenantId = button.dataset.tenant;
    saveState();
    render();
  }));
  document.getElementById("connectPage")?.addEventListener("click", connectPage);
  document.getElementById("connectFacebook")?.addEventListener("click", connectFacebook);
  document.getElementById("connectFacebookTop")?.addEventListener("click", connectFacebook);
  document.getElementById("connectFacebookPanel")?.addEventListener("click", connectFacebook);
  document.getElementById("connectFacebookFirst")?.addEventListener("click", connectFacebook);
  document.getElementById("disconnectPage")?.addEventListener("click", disconnectPage);
  document.getElementById("simulateNewContact")?.addEventListener("click", simulateNewContact);
  document.getElementById("refreshContacts")?.addEventListener("click", refreshContactsNow);
  document.getElementById("syncOld")?.addEventListener("click", syncOldContacts);
  document.getElementById("addMessage")?.addEventListener("click", addMessage);
  document.getElementById("addTemplate")?.addEventListener("click", addTemplate);
  document.getElementById("addBookingQuestion")?.addEventListener("click", addBookingQuestion);
  document.getElementById("addUser")?.addEventListener("click", addUser);
  document.getElementById("createUserForm")?.addEventListener("submit", createUserFromForm);
  document.getElementById("resetDemo")?.addEventListener("click", resetDemo);
  document.getElementById("copyLink")?.addEventListener("click", copyBookingLink);
  document.getElementById("copyLinkEditor")?.addEventListener("click", copyBookingLink);
  document.getElementById("copyMessengerLink")?.addEventListener("click", copyMessengerBookingLink);
  document.getElementById("copyEmbeddedPageLink")?.addEventListener("click", copyEmbeddedPageLink);
  document.querySelectorAll("[data-send]").forEach((button) => button.addEventListener("click", () => sendFollowUp(button.dataset.send)));
  document.querySelectorAll("[data-delete-contact]").forEach((button) => button.addEventListener("click", () => deleteContact(button.dataset.deleteContact)));
  document.querySelectorAll("[data-contact-field]").forEach((field) => field.addEventListener("change", () => {
    const [contactId, path] = field.dataset.contactField.split(":");
    updateContactField(contactId, path, field.value);
  }));
  document.querySelectorAll("[data-contact-boolean]").forEach((field) => field.addEventListener("change", () => {
    const [contactId, path] = field.dataset.contactBoolean.split(":");
    updateContactField(contactId, path, field.checked);
    render();
  }));
  document.querySelectorAll("[data-contact-card]").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.contactCard);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  document.querySelectorAll("[data-pipeline-drop]").forEach((column) => {
    if (column.dataset.pipelineDrop === "all") return;
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("drag-over");
      const contactId = event.dataTransfer.getData("text/plain");
      updateContactPipeline(contactId, column.dataset.pipelineDrop);
    });
  });
  document.querySelectorAll("[data-respond]").forEach((button) => button.addEventListener("click", () => markResponded(button.dataset.respond)));
  document.querySelectorAll("[data-remove-message]").forEach((button) => button.addEventListener("click", () => removeMessage(button.dataset.removeMessage)));
  document.querySelectorAll("[data-delete-user]").forEach((button) => button.addEventListener("click", () => deleteUser(button.dataset.deleteUser)));
  document.querySelectorAll("[data-delete-tenant]").forEach((button) => button.addEventListener("click", () => deleteTenant(button.dataset.deleteTenant)));
  document.querySelectorAll("[data-delete-question]").forEach((button) => button.addEventListener("click", () => deleteBookingQuestion(button.dataset.deleteQuestion)));
  document.querySelectorAll("[data-add-fb-page]").forEach((button) => button.addEventListener("click", () => addFacebookPage(button.dataset.addFbPage)));
  document.querySelectorAll("[data-path]").forEach((field) => field.addEventListener("change", () => {
    const value = ["followUp.pattern", "followUp.first24FibonacciMinutes"].includes(field.dataset.path)
      ? field.value.split(",").map((item) => Number(item.trim())).filter(Boolean)
      : field.value;
    updateTenant(field.dataset.path, value);
  }));
  document.querySelectorAll("[data-cloudinary-upload]").forEach((field) => field.addEventListener("change", () => uploadCloudinaryMedia(field)));
  document.querySelectorAll("[data-clear-media]").forEach((button) => button.addEventListener("click", () => clearMedia(button.dataset.clearMedia)));
  document.querySelectorAll("[data-number-path]").forEach((field) => field.addEventListener("change", () => updateTenant(field.dataset.numberPath, Number(field.value))));
  document.querySelectorAll("[data-boolean-path]").forEach((field) => field.addEventListener("change", () => updateTenant(field.dataset.booleanPath, field.checked)));
  document.querySelectorAll("[data-message]").forEach((field) => {
    field.addEventListener("input", () => updateAbMessageText(field.dataset.message, field.value));
    field.addEventListener("change", () => updateAbMessageText(field.dataset.message, field.value));
  });
  document.querySelectorAll("[data-message-button]").forEach((field) => {
    field.addEventListener("input", () => updateAbMessageButtonLabel(field.dataset.messageButton, field.value));
    field.addEventListener("change", () => updateAbMessageButtonLabel(field.dataset.messageButton, field.value));
  });
  document.querySelectorAll("[data-message-button-mode]").forEach((field) => {
    field.addEventListener("change", () => updateAbMessageButtonMode(field.dataset.messageButtonMode, field.value));
  });
  document.querySelectorAll("[data-template-name]").forEach((field) => {
    field.addEventListener("input", () => updateTemplateName(field.dataset.templateName, field.value));
    field.addEventListener("change", () => {
      updateTemplateName(field.dataset.templateName, field.value);
      render();
    });
  });
  document.querySelectorAll("[data-template-text]").forEach((field) => {
    field.addEventListener("input", () => updateTemplateText(field.dataset.templateText, field.value));
    field.addEventListener("change", () => updateTemplateText(field.dataset.templateText, field.value));
  });
  document.querySelectorAll("[data-question-field]").forEach((field) => field.addEventListener("change", () => {
    const [questionId, path] = field.dataset.questionField.split(":");
    updateBookingQuestion(questionId, path, field.value);
    render();
  }));
  document.querySelectorAll("[data-question-required]").forEach((field) => field.addEventListener("change", () => {
    updateBookingQuestion(field.dataset.questionRequired, "required", field.checked);
    render();
  }));
  document.querySelectorAll("[data-availability-enabled]").forEach((field) => field.addEventListener("change", () => {
    activeTenant().availability[Number(field.dataset.availabilityEnabled)].enabled = field.checked;
    saveState();
    render();
  }));
  document.querySelectorAll("[data-availability-start]").forEach((field) => field.addEventListener("change", () => {
    updateAvailabilityTime(Number(field.dataset.availabilityStart), "start", field.value);
  }));
  document.querySelectorAll("[data-availability-end]").forEach((field) => field.addEventListener("change", () => {
    updateAvailabilityTime(Number(field.dataset.availabilityEnd), "end", field.value);
  }));
  document.querySelectorAll("[data-user-field]").forEach((field) => field.addEventListener("change", () => {
    const [userId, path] = field.dataset.userField.split(":");
    updateUser(userId, path, field.value);
    render();
  }));
  document.querySelectorAll("[data-assign-user]").forEach((field) => field.addEventListener("change", () => {
    assignTenant(field.dataset.assignUser, field.dataset.assignTenant, field.checked);
  }));
  wireBooking(activeTenant());
}

function wireLogin() {
  document.getElementById("loginForm")?.addEventListener("submit", signIn);
}

function shiftBookingCalendarMonth(direction, tenant = activeTenant()) {
  const slotsByDay = groupSlotsByDay(generateSlots(tenant));
  const monthKey = resolveBookingCalendarMonth(state.selectedBookingDay, slotsByDay);
  const { year, month } = parseCalendarMonthKey(monthKey);
  const next = new Date(year, month + direction, 1);
  state.bookingCalendarMonth = calendarMonthKey(next.getFullYear(), next.getMonth());
  saveState();
  render();
}

function wireBooking(tenant) {
  document.querySelectorAll("[data-show-all-times]").forEach((button) => button.addEventListener("click", () => {
    state.showAllBookingTimes = true;
    state.selectedBookingDay = state.selectedSlot ? bookingDayKey(state.selectedSlot) : "";
    saveState();
    render();
  }));
  document.querySelectorAll("[data-calendar-prev]").forEach((button) => button.addEventListener("click", () => shiftBookingCalendarMonth(-1, tenant)));
  document.querySelectorAll("[data-calendar-next]").forEach((button) => button.addEventListener("click", () => shiftBookingCalendarMonth(1, tenant)));
  document.querySelectorAll("[data-booking-day]").forEach((button) => button.addEventListener("click", () => {
    markBookingInteractionStarted();
    state.selectedBookingDay = button.dataset.bookingDay;
    state.bookingCalendarMonth = button.dataset.bookingDay.slice(0, 7);
    state.selectedSlot = "";
    saveState();
    render();
  }));
  document.querySelectorAll("[data-slot]").forEach((button) => button.addEventListener("click", () => {
    markBookingInteractionStarted();
    state.selectedSlot = button.dataset.slot;
    state.selectedBookingDay = bookingDayKey(button.dataset.slot);
    state.bookingCalendarMonth = state.selectedBookingDay.slice(0, 7);
    saveState();
    render();
  }));
  document.querySelectorAll("[data-booking-next]").forEach((button) => button.addEventListener("click", () => {
    markBookingInteractionStarted();
    moveBookingStep(button, 1);
  }));
  document.querySelectorAll("[data-booking-back]").forEach((button) => button.addEventListener("click", () => moveBookingStep(button, -1)));
  document.querySelectorAll("#bookingForm input, #bookingForm textarea, #bookingForm select").forEach((field) => {
    field.addEventListener("input", () => {
      markBookingInteractionStarted();
      updateBookingLiveSummary(tenant);
    });
    field.addEventListener("change", () => updateBookingLiveSummary(tenant));
    field.addEventListener("focus", () => {
      if (window.innerWidth > 720) return;
      setTimeout(() => field.closest(".booking-step")?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    });
  });
  document.getElementById("bookingForm")?.addEventListener("submit", (event) => bookSlot(event, tenant.id));
  updateBookingLiveSummary(tenant);
}

function updateBookingLiveSummary(tenant) {
  const target = document.getElementById("bookingLiveSummary");
  const form = document.getElementById("bookingForm");
  if (!target || !form) return;
  const data = new FormData(form);
  const slot = data.get("slot") || state.selectedSlot;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderBookingLiveSummary(tenant, slot, collectBookingAnswers(data, tenant)).trim();
  target.replaceWith(wrapper.firstElementChild);
}

function moveBookingStep(button, direction) {
  const form = button.closest("#bookingForm");
  if (!form) return;
  const steps = [...form.querySelectorAll("[data-booking-step]")];
  const currentIndex = steps.findIndex((step) => step.classList.contains("active"));
  if (currentIndex === -1) return;
  if (direction > 0 && !validateBookingStep(steps[currentIndex])) return;
  const nextIndex = Math.max(0, Math.min(steps.length - 1, currentIndex + direction));
  steps.forEach((step, index) => step.classList.toggle("active", index === nextIndex));
  form.querySelectorAll(".step-dots span").forEach((dot, index) => dot.classList.toggle("active", index === nextIndex));
}

function validateBookingStep(step) {
  const requiredFields = [...step.querySelectorAll("[data-step-required], [required]")];
  const invalid = requiredFields.find((field) => !field.checkValidity() || !String(field.value || "").trim());
  if (!invalid) return true;
  showToast("Fill this in to continue.");
  invalid.reportValidity?.();
  invalid.focus();
  return false;
}

function copyBookingLink() {
  if (!activeTenant()) {
    showToast("Connect a Facebook page before sharing a booking link.");
    return;
  }
  const text = bookingUrl(activeTenant());
  navigator.clipboard?.writeText(text);
  showToast("Booking link copied.");
}

function copyMessengerBookingLink() {
  if (!activeTenant()) {
    showToast("Connect a Facebook page before copying the Messenger link.");
    return;
  }
  navigator.clipboard?.writeText(messengerBookingUrl(activeTenant()));
  showToast("Messenger booking button link copied.");
}

function copyEmbeddedPageLink() {
  const tenant = activeTenant();
  if (!tenant || !embeddedPageEnabled(tenant)) {
    showToast("Add an embedded page URL before copying the link.");
    return;
  }
  navigator.clipboard?.writeText(embeddedSiteUrl(tenant));
  showToast("Embedded page link copied.");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

globalThis.fbAsyncInit = () => {
  initFacebookSdk();
};

window.addEventListener("hashchange", render);
render();
hydrateRemoteState();
startRemoteRefresh();
