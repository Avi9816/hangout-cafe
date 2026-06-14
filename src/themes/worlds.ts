export interface WorldConfig {
  theme: string;
  name: string;
  desc: string;
  weather: 'rain' | 'streaks' | 'motes' | 'aurora' | 'snow';
  ambientCopy: string;
  skyTop: string;
  skyBottom: string;
  accent: string;
  lightingStyle: string; // CSS variables to inject
  silhouetteType: 'city' | 'railway' | 'library' | 'mountain' | 'default';
}

export const WORLDS: Record<string, WorldConfig> = {
  'window-seat': {
    theme: 'window-seat',
    name: 'Window Seat',
    desc: 'watching heavy drops race down the glass in silence.',
    weather: 'rain',
    ambientCopy: 'The city never really sleeps.',
    skyTop: '#000000',
    skyBottom: '#05040a',
    accent: '#C98245',
    lightingStyle: `
      --theme-accent: #C98245;
      --theme-glow: radial-gradient(circle at 100% 0%, rgba(201,130,69,0.18) 0%, transparent 62%);
      --fog-color: linear-gradient(to top, rgba(201,130,69,0.07) 0%, transparent 100%);
      --accent: #C98245;
      --room-view-transform: translateX(-32px);
      --theme-tint: rgba(72,88,105,0.09);
      --room-card-bg: linear-gradient(180deg, rgba(20,18,16,0.90), rgba(9,8,7,0.94)), radial-gradient(circle at 50% 0%, rgba(201,130,69,0.18), transparent 58%);
      --room-card-border: rgba(232,218,196,0.09);
    `,
    silhouetteType: 'city'
  },
  'last-train': {
    theme: 'last-train',
    name: 'The Last Train',
    desc: 'a rhythmic journey through the sleeping city suburbs.',
    weather: 'streaks',
    ambientCopy: 'The final train has already gone.',
    skyTop: '#000000',
    skyBottom: '#040202',
    accent: '#B45345',
    lightingStyle: `
      --theme-accent: #B45345;
      --theme-glow: radial-gradient(circle at 100% 0%, rgba(180,83,69,0.18) 0%, transparent 62%);
      --fog-color: linear-gradient(to top, rgba(180,83,69,0.07) 0%, transparent 100%);
      --accent: #B45345;
      --room-view-transform: translateX(32px);
      --theme-tint: rgba(55,34,36,0.10);
      --room-card-bg: linear-gradient(180deg, rgba(20,16,16,0.90), rgba(9,7,7,0.94)), radial-gradient(circle at 50% 0%, rgba(180,83,69,0.18), transparent 58%);
      --room-card-border: rgba(232,210,196,0.09);
    `,
    silhouetteType: 'railway'
  },
  'between-pages': {
    theme: 'between-pages',
    name: 'Between Pages',
    desc: 'a sanctuary of old paper and the smell of ancient ink.',
    weather: 'motes',
    ambientCopy: 'Some stories never leave.',
    skyTop: '#000000',
    skyBottom: '#060402',
    accent: '#B98B5B',
    lightingStyle: `
      --theme-accent: #B98B5B;
      --theme-glow: radial-gradient(circle at 100% 0%, rgba(185,139,91,0.20) 0%, transparent 62%);
      --fog-color: linear-gradient(to top, rgba(185,139,91,0.08) 0%, transparent 100%);
      --accent: #B98B5B;
      --room-view-transform: translateX(0px);
      --theme-tint: rgba(84,55,34,0.12);
      --room-card-bg: linear-gradient(180deg, rgba(20,18,14,0.90), rgba(9,8,6,0.94)), radial-gradient(circle at 50% 0%, rgba(185,139,91,0.20), transparent 58%);
      --room-card-border: rgba(232,220,196,0.09);
    `,
    silhouetteType: 'library'
  },
  'northern-lights': {
    theme: 'northern-lights',
    name: 'Northern Lights',
    desc: 'where the sky dances in violet and shimmering emerald.',
    weather: 'aurora',
    ambientCopy: 'The sky is alive tonight.',
    skyTop: '#000000',
    skyBottom: '#020605',
    accent: '#7FA37A',
    lightingStyle: `
      --theme-accent: #7FA37A;
      --theme-glow: radial-gradient(circle at 100% 0%, rgba(127,163,122,0.17) 0%, transparent 62%);
      --fog-color: linear-gradient(to top, rgba(127,163,122,0.06) 0%, transparent 100%);
      --accent: #7FA37A;
      --room-view-transform: translateX(0px);
      --theme-tint: rgba(45,70,68,0.11);
      --room-card-bg: linear-gradient(180deg, rgba(14,20,16,0.90), rgba(7,9,8,0.94)), radial-gradient(circle at 50% 0%, rgba(127,163,122,0.17), transparent 58%);
      --room-card-border: rgba(196,225,210,0.09);
    `,
    silhouetteType: 'mountain'
  },
  'default': {
    theme: 'default',
    name: 'Late Night Café',
    desc: 'a forgotten place on the internet.',
    weather: 'rain',
    ambientCopy: 'the night is young...',
    skyTop: '#000000',
    skyBottom: '#050305',
    accent: '#C98245',
    lightingStyle: `
      --theme-accent: #C98245;
      --theme-glow: radial-gradient(circle at 100% 0%, rgba(201,130,69,0.07) 0%, transparent 60%);
      --fog-color: linear-gradient(to top, rgba(201,130,69,0.04) 0%, transparent 100%);
      --accent: #C98245;
      --room-view-transform: translateX(0px);
      --theme-tint: rgba(0,0,0,0);
      --room-card-bg: linear-gradient(180deg, rgba(18,16,14,0.90), rgba(9,8,7,0.94)), radial-gradient(circle at 50% 0%, rgba(201,130,69,0.10), transparent 58%);
      --room-card-border: rgba(232,218,196,0.07);
    `,
    silhouetteType: 'default'
  }
};
