/**
 * The catalog of fillable document templates. Each one is defined here in code (not admin-authored
 * freeform, unlike report templates) because the PDF layout is hand-designed per template — but
 * which departments feature which templates is fully admin-controlled (department_document_templates).
 */
export type FieldType = 'text' | 'textarea' | 'date' | 'time' | 'select'

export interface Field {
  key: string
  label: string
  type: FieldType
  hint?: string
  placeholder?: string
  rows?: number
  options?: string[]
  default?: string
  required?: boolean
}

export interface DocTemplate {
  slug: string
  name: string
  description: string
  /** Which brand mark the PDF's header carries. */
  brand: 'mui' | 'conversations'
  category: string
  fields: Field[]
}

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    slug: 'episode-planner',
    name: 'MUI Conversations — Episode Planner',
    description: 'Plan an episode end to end: resources, guest bios, run of show, and production & publishing notes.',
    brand: 'conversations',
    category: 'MUI Conversations',
    fields: [
      { key: 'title', label: 'Episode name', type: 'text', required: true, placeholder: 'e.g. Building without burning out' },
      { key: 'number', label: 'Episode #', type: 'text', placeholder: 'e.g. 014' },
      { key: 'format', label: 'Format / style', type: 'text', placeholder: 'Interview, panel, solo, narrative…' },
      { key: 'length', label: 'Length', type: 'text', placeholder: 'e.g. 00:42' },
      { key: 'start_prep', label: 'Start prep', type: 'date' },
      { key: 'recording_date', label: 'Recording date', type: 'date' },
      { key: 'publish_date', label: 'Publish date', type: 'date', hint: 'Date of publication.' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'Where it will be recorded' },
      { key: 'hosts', label: 'Host(s)', type: 'text', placeholder: 'Name and title for each host' },
      { key: 'guests', label: 'Guest(s)', type: 'text', placeholder: 'Name and title for each guest' },
      { key: 'concept', label: 'Concept / goal', type: 'textarea', rows: 2, hint: 'What is this episode for, and what should listeners take away?' },
      { key: 'resources_prep', label: 'Resources — for show prep', type: 'textarea', rows: 3, hint: 'Everything needed before recording: research, questions, past episodes.' },
      { key: 'resources_shownotes', label: 'Resources — for show notes', type: 'textarea', rows: 3, hint: 'Links and resources to publish alongside the episode.' },
      { key: 'guest1_name', label: 'Guest 1 — name', type: 'text' },
      { key: 'guest1_intro', label: 'Guest 1 — on-air introduction', type: 'textarea', rows: 2, hint: 'A short blurb to introduce them during the show.' },
      { key: 'guest1_bio', label: 'Guest 1 — show-notes biography', type: 'textarea', rows: 3, hint: 'A longer-form biography for the published show notes.' },
      { key: 'guest2_name', label: 'Guest 2 — name', type: 'text' },
      { key: 'guest2_intro', label: 'Guest 2 — on-air introduction', type: 'textarea', rows: 2 },
      { key: 'guest2_bio', label: 'Guest 2 — show-notes biography', type: 'textarea', rows: 3 },
      { key: 'intro', label: 'Intro', type: 'textarea', rows: 2, hint: "How the episode opens — guest intro, topic overview, or the story to be told." },
      { key: 'topic_1', label: 'Topic 1', type: 'text' },
      { key: 'topic_2', label: 'Topic 2', type: 'text' },
      { key: 'topic_3', label: 'Topic 3', type: 'text' },
      { key: 'topic_4', label: 'Topic 4', type: 'text' },
      { key: 'outro', label: 'Outro', type: 'textarea', rows: 2, hint: 'How it wraps up — takeaways, calls to action, what’s next.' },
      { key: 'production_notes', label: 'Production notes', type: 'textarea', rows: 3, hint: 'Editing, mixing, music/sound cues, technical issues, who’s handling post-production.' },
      { key: 'publishing_notes', label: 'Publishing notes', type: 'textarea', rows: 3, hint: 'Platforms, thumbnail/cover art, episode title & description, social captions, cross-posting.' },
      { key: 'notes', label: 'Notes', type: 'textarea', rows: 2, hint: 'Anything else worth recording for next time.' },
    ],
  },
  {
    slug: 'guest-briefing',
    name: 'MUI Conversations — Guest Briefing',
    description: 'Everything a podcast guest needs before recording, ready to send.',
    brand: 'conversations',
    category: 'MUI Conversations',
    fields: [
      { key: 'guest_name', label: 'Guest name', type: 'text', required: true },
      { key: 'show_name', label: 'Show name', type: 'text', default: "MUI Conversations", required: true },
      { key: 'audience', label: 'Who this episode is for', type: 'textarea', rows: 2, hint: 'The audience, in one sentence.' },
      { key: 'objective', label: 'What we want this episode to do', type: 'textarea', rows: 2, hint: 'The practical outcome or theme.' },
      { key: 'format', label: 'Format', type: 'select', options: ['Audio', 'Video'], default: 'Audio' },
      { key: 'length', label: 'Length', type: 'text', placeholder: 'e.g. 45 minutes' },
      { key: 'mode', label: 'Remote or in-person', type: 'select', options: ['Remote', 'In-person'], default: 'Remote' },
      { key: 'tone', label: 'Tone', type: 'text', placeholder: 'Tactical, conversational, story-driven, opinionated…' },
      { key: 'theme_1', label: 'Likely theme 1', type: 'text' },
      { key: 'theme_2', label: 'Likely theme 2', type: 'text' },
      { key: 'theme_3', label: 'Likely theme 3', type: 'text' },
      { key: 'theme_4', label: 'Likely theme 4', type: 'text' },
      {
        key: 'prep', label: 'Helpful prep', type: 'textarea', rows: 5,
        default: 'Please join 5–10 minutes early if possible\nHeadphones are strongly preferred\nExternal mic if you have one\nQuiet room, notifications off\nBring one concrete example, one mistake, or one story we can dig into',
        hint: 'One tip per line.',
      },
      { key: 'recording_link', label: 'Recording link', type: 'text', placeholder: 'https://…' },
      {
        key: 'final_remarks', label: 'Final remarks', type: 'textarea', rows: 2,
        default: 'We are aiming for a natural conversation, not scripted answers. The goal is clarity and substance, not polish for its own sake.',
      },
    ],
  },
]

export const templateBySlug = (slug: string) => DOC_TEMPLATES.find((t) => t.slug === slug) ?? null
