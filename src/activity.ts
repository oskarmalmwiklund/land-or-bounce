const ACTIVE_MS = 180_000;
const REFRESH_MS = 30_000;
const VISIT_KEY = 'land-or-bounce-visit';
const PARTICIPANT_KEY = 'land-or-bounce-participant';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function anonymousParticipantId(): string {
  try {
    const saved = localStorage.getItem(PARTICIPANT_KEY);
    if (saved && UUID.test(saved)) return saved;
    const id = crypto.randomUUID(); localStorage.setItem(PARTICIPANT_KEY, id); return id;
  } catch { return crypto.randomUUID(); }
}

export function activityMarkup(): string {
  return `<div class="activity-bar" data-activity hidden><span class="activity-now" title="Anonymous browser visits active in the last 90 seconds"><i aria-hidden="true"></i><strong data-active-visits></strong></span><span class="activity-divider" aria-hidden="true">·</span><span data-completed-experiments title="One saved five-choice run per anonymous browser participant."></span></div>`;
}

/** A short-lived identifier shared across tabs; no URLs, IPs or user agents are stored. */
export function startActivity(): () => Promise<void> {
  let lastInteraction = Date.now();
  let inFlight = false;
  let fallbackId = crypto.randomUUID();
  const visitId = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(VISIT_KEY) ?? 'null');
      const valid = saved && typeof saved.id === 'string' && /^[0-9a-f-]{36}$/i.test(saved.id) && Number.isFinite(saved.updatedAt);
      const id = valid && Date.now() - saved.updatedAt < ACTIVE_MS ? saved.id : crypto.randomUUID();
      localStorage.setItem(VISIT_KEY, JSON.stringify({ id, updatedAt: Date.now() }));
      fallbackId = id;
      return id;
    } catch { return fallbackId; }
  };
  const refresh = async () => {
    if (document.hidden || inFlight) return;
    inFlight = true;
    try {
      const active = Date.now() - lastInteraction < ACTIVE_MS;
      const response = await fetch(active ? `/api/activity?visit=${encodeURIComponent(visitId())}` : '/api/activity', { method: active ? 'POST' : 'GET' });
      if (!response.ok) throw new Error('Activity is unavailable');
      const data = await response.json();
      if (![data.activeVisits, data.completedExperiments].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid activity');
      document.querySelectorAll<HTMLElement>('[data-active-visits]').forEach((element) => { element.textContent = `${data.activeVisits.toLocaleString()} here now`; });
      document.querySelectorAll<HTMLElement>('[data-completed-experiments]').forEach((element) => {
        const count = data.completedExperiments;
        element.textContent = count === 0 ? 'Be the first to complete the experiment' : `${count.toLocaleString()} science ${count === 1 ? 'experiment' : 'experiments'} completed`;
      });
      document.querySelectorAll<HTMLElement>('[data-activity]').forEach((element) => { element.hidden = false; });
    } catch {
      // Hide unavailable counts instead of inventing activity or displaying stale numbers.
      document.querySelectorAll<HTMLElement>('[data-activity]').forEach((element) => { element.hidden = true; });
    } finally { inFlight = false; }
  };
  for (const event of ['pointerdown', 'keydown', 'scroll']) {
    window.addEventListener(event, () => { lastInteraction = Date.now(); }, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { lastInteraction = Date.now(); void refresh(); }
  });
  window.setInterval(() => { void refresh(); }, REFRESH_MS);
  void refresh();
  return refresh;
}
