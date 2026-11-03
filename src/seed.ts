import type { Template, Question, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  school: 'McGill Faculty of Law',
  year: '1L',
  email: '',
  signature: '{{myName}}\n{{year}}, {{school}}',
  silenceWeeks: 8,
  noReplyDays: 14,
};

export const TEMPLATE_HELP: [string, string][] = [
  ['{{first}}', "Contact's first name"],
  ['{{name}}', "Contact's full name"],
  ['{{firm}}', 'Their firm (short name)'],
  ['{{when}}', 'When you last spoke, e.g. "on Monday" or "on Oct 14"'],
  ['{{detail}}', 'Note(s) you tick in the composer'],
  ['{{connection}}', 'Shared connection tag, e.g. "McGill alum"'],
  ['{{myName}} {{year}} {{school}}', 'From Settings'],
  ['{{signature}}', 'Your signature from Settings'],
];

export const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 't-alum', name: 'Alum outreach', kind: 'email-out',
    subject: '{{school}} {{year}} — quick question about {{firm}}',
    body: `Hi {{first}},

I'm a {{year}} at {{school}} and saw that you're {{connection}}. I'm learning about {{firm}} and would really value 15–20 minutes of your perspective on your path and the work there.

Would a short call in the next couple of weeks work? Happy to fit your schedule.

Thank you,
{{signature}}`,
  },
  {
    id: 't-cold', name: 'Cold outreach', kind: 'email-out',
    subject: '{{year}} student — 15 minutes on your practice at {{firm}}?',
    body: `Hi {{first}},

I'm a {{year}} at {{school}}. I came across your work at {{firm}} and {{detail}}

Would you be open to a 15–20 minute call sometime in the next few weeks? I'd appreciate hearing how you got there and what the work is like day to day.

Best,
{{signature}}`,
  },
  {
    id: 't-intro', name: 'Ask for an intro', kind: 'email-out',
    subject: 'Small ask — intro to someone at {{firm}}?',
    body: `Hi {{first}},

Thanks again for your help {{when}}. You mentioned {{detail}} — would you be comfortable introducing me? A short email is plenty; I'll take it from there.

No worries at all if it's not a good time.

Best,
{{signature}}`,
  },
  {
    id: 't-thanks', name: 'Thank-you', kind: 'thank-you',
    subject: 'Thank you',
    body: `Hi {{first}},

Thank you for taking the time to speak with me {{when}}. {{detail}}

It was really helpful as I think about where I want to be. I hope we can stay in touch.

Best,
{{signature}}`,
  },
  {
    id: 't-checkin', name: 'Check-in', kind: 'check-in',
    subject: 'Quick update',
    body: `Hi {{first}},

I hope things are going well at {{firm}}. We spoke {{when}}, and I wanted to share a quick update: {{detail}}

Thanks again for your advice — it's been useful.

Best,
{{signature}}`,
  },
  {
    id: 't-applied', name: '"I applied"', kind: 'check-in',
    subject: 'Applied to {{firm}}',
    body: `Hi {{first}},

When we spoke {{when}}, you kindly offered to keep an eye out — I wanted to let you know I've just applied to {{firm}}.

Thank you again for your help. I'd be glad to hear any last advice before interviews.

Best,
{{signature}}`,
  },
  {
    id: 't-holiday', name: 'Holiday note', kind: 'check-in',
    subject: 'Happy holidays',
    body: `Hi {{first}},

I hope you get a proper break over the holidays. Thanks again for your time this fall — our conversation stuck with me.

Wishing you a great start to the new year.

Best,
{{signature}}`,
  },
];

const Q = (category: string, list: string[]) => list.map((text, i) => ({ id: `q-${category.slice(0, 4).toLowerCase()}-${i}`, category, text }));

export const DEFAULT_QUESTIONS: Question[] = [
  ...Q('Their path', [
    'How did you end up at this firm, and what made you choose it over others?',
    'What do you wish you had known as a 1L?',
    'What did you do in your 1L and 2L summers, and how much did they matter?',
    'Looking back, which courses or experiences in law school actually helped?',
  ]),
  ...Q('The work', [
    'What does a typical week look like for you right now?',
    'How is work assigned — free market, assigning partner, or a pool?',
    'How early did you get real responsibility (drafting, client contact)?',
    'What kind of matter do you enjoy most, and which do you avoid?',
    'How do juniors here choose or change practice groups?',
  ]),
  ...Q('Culture', [
    'What would surprise people about the culture here?',
    'How do people who leave the firm usually end up leaving — and where do they go?',
    'How are hours and face time really handled in your group?',
    'Who has been your most useful mentor, and how did that relationship form?',
    'What makes someone stand out positively in their first year?',
  ]),
  ...Q('Recruiting', [
    'What does the firm look for in summer students that isn’t obvious from the website?',
    'How big is the summer class, and how many come back full-time?',
    'Is there anyone else at the firm you think I should speak with?',
    'What makes an application or interview stand out for you?',
    'Would it be appropriate to mention our conversation when I apply?',
  ]),
  ...Q('Canada → US', [
    'How did you make the move from a Canadian school to a US office?',
    'Did you write the New York bar? How did you prepare alongside work?',
    'Which practice areas travel best across jurisdictions?',
    'How did immigration (TN or otherwise) work in practice for you?',
    'Is it easier to start in Toronto and lateral, or go straight to the US?',
    'How does the firm view McGill / civil-law training?',
  ]),
  ...Q('Closing', [
    'What is one thing you would do in my position over the next few months?',
    'Is it alright if I follow up with you later in the recruit?',
  ]),
];
