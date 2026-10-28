// The last demo request, kept for this browser tab only (sessionStorage) so "send it again" and "wrong address" on
// the check-email page can use it without asking for everything twice. It never leaves the browser except as a
// normal form submission, and it is cleared once the visitor is in their office.
import type { DemoFormValues } from './demo-validation';

const KEY = 'agentcity:lite-draft:v1';

export function saveDraft(values: DemoFormValues): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(values));
  } catch {
    // storage blocked: resend asks for the form again
  }
}

export function loadDraft(): DemoFormValues | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DemoFormValues>;
    if (typeof v.fullName !== 'string' || typeof v.email !== 'string' || typeof v.company !== 'string') return null;
    return {
      fullName: v.fullName,
      email: v.email,
      company: v.company,
      industry: typeof v.industry === 'string' ? v.industry : '',
      phone: typeof v.phone === 'string' ? v.phone : '',
      website: typeof v.website === 'string' ? v.website : '',
      marketingConsent: v.marketingConsent === true,
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
