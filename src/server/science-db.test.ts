import { describe, expect, it } from 'vitest';
import { CATEGORIES, inferCategory } from './science-db';

/**
 * Every host in the pool on 16 Sep 2026 with its title as captured, and the category it should
 * land in. Pairing happens within a category, so a wrong answer here means a page is compared
 * against the wrong neighbours or never shown at all.
 */
const POOL: Array<[host: string, title: string, category: string]> = [
  ['bolt.new', 'bolt.new', 'ai-builder'],
  ['lovable.dev', 'AI App Builder | Vibe Code Apps & Websites with AI, Fast', 'ai-builder'],
  ['stripe.com', 'stripe.com', 'payments'],
  ['mollie.com', 'mollie.com', 'payments'],
  ['linear.app', 'linear.app', 'productivity'],
  ['notion.com', 'notion.com', 'productivity'],
  ['shopify.com', 'shopify.com', 'commerce'],
  ['gumroad.com', 'gumroad.com', 'commerce'],
  ['houseplant.com', 'Ceramics, Home Goods & Accessories | Houseplant by Seth Rogen', 'commerce'],
  ['mailchimp.com', 'mailchimp.com', 'marketing'],
  ['beehiiv.com', 'beehiiv.com', 'marketing'],
  ['klaviyo.com', 'Klaviyo: AI Email Marketing & SMS | B2C CRM', 'marketing'],
  ['lemonado.io', 'Lemonado - The marketing employee you dreamt of', 'marketing'],
  ['avrea.com', 'Faster CI for GitHub Actions | Avrea', 'dev-tools'],
  ['blacksmith.sh', 'The Fastest Way to Run GitHub Actions | Blacksmith', 'dev-tools'],
  ['fastest.ee', 'fastest.ee – be the fastest EE', 'dev-tools'],
  ['defendec.com', 'Wireless surveillance with AI', 'security'],
  ['defsecintel.com', 'DefSecIntel', 'security'],
  ['reconeyez.com', 'Autonomous intrusion detection system with AI | Reconeyez', 'security'],
  ['ryngegroup.com', 'The Rynge Group | Senior Consulting for Strategy, Innovation, and AI', 'consulting'],
  ['westsummit.co.uk', 'West Summit Consulting — Your Next Summit. Within Reach.', 'consulting'],
  ['narrativeaudit.com', 'Narrative Audit', 'consulting'],
  ['aftonbladet.se', 'Aftonbladet', 'media'],
  ['feber.se', 'Feber', 'media'],
  ['dominicplaza.com', 'Dominic Plaza | 3D Design, Motion & Art Direction', 'portfolio'],
  ['flyyoufools.wtf', 'Fly you Fools | Tech Storyteller', 'portfolio'],
  ['evely.health', 'Evely — Built for Female Biology', 'health'],
  ['tammuznordics.com', 'Tammuz Northern Europe - Vägen till föräldraskap börjar här.', 'health'],
  ['isolerab.se', 'Energieffektiv isolering - Få offert | Isolerab', 'services'],
  ['prepinson.com', 'Haras de Prepinson: Elite Horse Breeding and Luxury Seminar Venue', 'services'],
  ['brevelang.com', 'breve — language learning app: learn from videos you’d watch anyway', 'consumer'],
  ['joinmycorner.com', 'Corner | Your Favorite Athletes, Unfiltered', 'consumer'],
  ['minpingis.se', 'minpingis du vet!', 'consumer'],
  ['google.com', 'Google', 'consumer'],
  ['supersimple.io', 'Supersimple | AI-native BI and Enterprise Search', 'software'],
  ['kneticapp.com', 'Knetic | One coaching platform. You stay the expert.', 'software'],
  ['multiply.co', 'Multiply — The AI Operating System for Creative Agencies', 'software'],
  ['openai.com', 'OpenAI | Research & Deployment', 'software'],
  ['holycomms.se', 'Holy Comms | En hel marknadsavdelning på abonnemang', 'agency'],
  ['fridan.se', 'Studio Fridan – Web design and development', 'agency'],
  ['aniara.one', 'Aniara - Making Your Stories Travel', 'agency'],
  ['otherpossibilities.se', 'otherpossibilities.se -', 'other'],
  ['corsogroepfunfun.nl', 'Corsogroep Fun Fun - Samen Creatief!', 'other'],
  ['zparq.se', 'Zparq Z10 - Världens lättaste 10 kW utombordsmotor', 'other'],
  ['mykold.xyz', 'tack', 'other'],
];

describe('inferCategory', () => {
  it.each(POOL)('%s → %s', (host, title, category) => {
    expect(inferCategory(host, title), `${host}: ${title}`).toBe(category);
  });

  it('ignores a www prefix and letter case', () => {
    expect(inferCategory('WWW.Aftonbladet.se', 'Aftonbladet')).toBe('media');
  });

  it('gives every category in the pool at least two hosts, so its pages can be paired', () => {
    const counts = new Map<string, Set<string>>();
    for (const [host, , category] of POOL) counts.set(category, (counts.get(category) ?? new Set()).add(host));
    for (const [category, hosts] of counts) expect(hosts.size, category).toBeGreaterThanOrEqual(2);
  });

  it('lists every category the rules can produce', () => {
    for (const [, , category] of POOL) expect(CATEGORIES).toContain(category);
  });
});
