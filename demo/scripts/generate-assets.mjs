import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = resolve(root, '../../replicate-cli/dist/cli.js')
const profile = process.env.REPLICATE_PROFILE || 'quaengine-demo'
const rawDir = resolve(root, '.generated/raw')
const tempDir = resolve(root, '.generated/input')
const characterQaDir = resolve(root, '.generated/qa/characters')
const shouldRegenerateAll = process.env.REGENERATE_ALL_ASSETS === '1'
const shouldRegenerateBackgrounds = shouldRegenerateAll || process.env.REGENERATE_BACKGROUNDS === '1'
const shouldRegenerateCgs = shouldRegenerateAll || process.env.REGENERATE_CGS === '1'
const shouldRegenerateCharacters = shouldRegenerateAll || process.env.REGENERATE_CHARACTERS === '1'
const backgroundModel = process.env.BACKGROUND_MODEL || 'openai/gpt-image-2'
const characterModel = process.env.CHARACTER_MODEL || 'aisha-ai-official/animagine-xl-v4-opt'
const cgModel = process.env.CG_MODEL || characterModel
const characterBackgroundRemovalModel = process.env.CHARACTER_BACKGROUND_REMOVAL_MODEL || '851-labs/background-remover'
const characterSolidBackground = process.env.CHARACTER_SOLID_BACKGROUND || '#ffffff'
const characterFilter = process.env.CHARACTER_FILTER || ''
const cgFilter = process.env.CG_FILTER || ''
const landscapeImageQuality = process.env.LANDSCAPE_IMAGE_QUALITY || process.env.GPT_IMAGE_QUALITY || 'medium'
const characterImageQuality = process.env.CHARACTER_IMAGE_QUALITY || process.env.GPT_IMAGE_QUALITY || 'medium'
const predictionWaitSeconds = process.env.REPLICATE_WAIT_SECONDS || '60'
const imageQaPython = process.env.IMAGE_QA_PYTHON || resolve(root, '.generated/chroma-venv/bin/python')

const artBible = [
  'Japanese visual novel anime background art style',
  'near-future Tokyo megacity in 2048',
  'clean cel shading with soft painterly lighting',
  'sharp line art, detailed architecture, polished background painting',
  'cool cyan shadows with warm amber warning lights',
  'consistent commercial Japanese sci-fi VN background plate',
  'empty environment plate for character sprites',
  'full-frame wide establishing composition with detailed foreground floor and no blank panels',
  'no people, no characters, no faces, no silhouettes',
  'no text, no letters, no numbers, no kanji, no kana, no signage, no readable symbols, no pseudo text, no watermark, no logo',
].join(', ')

const characterArtBible = [
  'mainstream Japanese anime visual novel standing sprite',
  'modern sci-fi suspense galgame character art',
  'all characters are adult women with feminine facial features and body language',
  'consistent regular Japanese anime style, not painterly fantasy and not semi-realistic',
  'clean cel shading, crisp line art, polished commercial anime rendering, elegant delicate finish',
  'normal adult anime proportions, six-and-a-half to seven-head-tall body',
  'full-body standing pose, head-to-toe visible, shoes visible',
  'both arms and both hands fully visible, clear five-finger hands',
  'opaque white eye sclera, clean iris highlights, no holes in the eyes',
  'appealing but practical character design, readable silhouette',
  'not BL, not danmei, not yaoi, not male idol cover art, not romance novel cover style',
  'plain studio cutout source with a perfectly solid background',
  'no scenery, no city, no room, no props, no text, no watermark',
].join(', ')

const cgArtBible = [
  'Japanese visual novel anime event CG style',
  'near-future Tokyo megacity in 2048',
  'clean cel shading with soft painterly lighting',
  'polished commercial sci-fi galgame event illustration',
  'cinematic dramatic framing with readable silhouettes',
  'cool cyan shadows with warm amber warning lights',
  'no text, no letters, no numbers, no kanji, no kana, no signage, no readable symbols, no pseudo text, no watermark, no logo',
].join(', ')

const baseNegative = [
  'nsfw',
  'naked',
  'cleavage',
  'bare shoulders',
  'strapless dress',
  'revealing clothes',
  'photorealistic',
  'western comic',
  '3d render',
  'man',
  'male',
  'boy',
  '2girls',
  'multiple girls',
  'two characters',
  'two people',
  'another person',
  'duplicate character',
  'twin character',
  'cloned character',
  'animal ears',
  'cat ears',
  'fox ears',
  'bunny ears',
  'horns',
  'character sheet',
  'turnaround sheet',
  'split screen',
  'androgynous',
  'masculine',
  'danmei',
  'BL',
  'boys love',
  'yaoi',
  'male idol cover',
  'romance novel cover',
  'overly delicate pretty-boy style',
  'low quality',
  'decorative background',
  'ornate background',
  'gradient background',
  'grey background',
  'vignette',
  'halo',
  'circle frame',
  'ornate frame',
  'flower',
  'flowers',
  'leaves',
  'branches',
  'glass panel',
  'transparent panel',
  'display panel',
  'screen panel',
  'energy shield',
  'extra fingers',
  'bad hands',
  'missing hand',
  'hidden hand',
  'mangled hands',
  'deformed anatomy',
  'transparent eyes',
  'hollow eyes',
  'missing sclera',
  'cutout holes in eyes',
  'blurry',
  'text',
  'letters',
  'numbers',
  'kanji',
  'kana',
  'signage',
  'pseudo text',
  'gibberish text',
  'watermark',
]

const characterNegative = [
  ...baseNegative,
  'city background',
  'buildings',
  'environment',
  'detailed background',
  'chibi',
  'super deformed',
  'SD character',
  'oversized head',
  'large head',
  'childlike proportions',
  'child',
  'mascot',
  'doll body',
  'bobblehead',
  'bust portrait',
  'headshot',
  'half body',
  'cowboy shot',
  'upper body',
  'portrait crop',
  'thigh-up',
  'knee-up',
  'face close-up',
  'torso close-up',
  'hips focus',
  'thighs focus',
  'close up framing',
  'cropped body',
  'missing legs',
  'missing feet',
  'cropped shoes',
  'cut off shoes',
  'pinup pose',
  'sexy pose',
  'sensual pose',
  'large side props',
  'large equipment',
  'external tools',
  'tool arms',
  'mechanical arm attachments',
  'giant mechanical forearms',
  'oversized sleeves',
  'giant gauntlets',
  'robot arm cannon',
  'oversized weapons',
  'shield',
  'long trench coat',
  'floor length coat',
  'school uniform',
  'necktie',
  'cat ear headband',
  'backpack',
  'drone',
  'floating devices',
  'wing-like equipment',
  'side machinery',
  'robotic frame',
  'equipment rack',
  'maintenance arm',
  'background robot arms',
  'companion robot',
  'robot companion',
  'helmeted robot',
  'armored companion',
  'sitting',
  'seated',
  'kneeling',
  'crouching',
  'squatting',
  'lying down',
  'leaning on floor',
  'foreshortening',
  'dramatic perspective',
  'large foreground legs',
  'feet close to camera',
  'low angle',
  'wide angle distortion',
  'wide spread hair',
  'flowing hair reaching edge',
  'wide coat hem',
  'cloak',
  'cape',
  'spread arms',
  'tiny body',
].join(', ')

const backgroundNegative = [
  ...baseNegative,
  'people',
  'person',
  'human',
  'portrait',
  'face',
].join(', ')

const backgrounds = [
  {
    id: 'menu-route',
    aspect: '16:9',
    seed: 40991,
    prompt: 'dedicated title menu and route map background, empty rain-soaked elevated Tokyo observation deck at night, distant AI tower network, subtle abstract route lines reflected in wet glass and floor, cinematic composition with open dark space on the left for menu text',
    dest: 'assets/images/ui/menu-route.jpg',
  },
  {
    id: 'blackout-city',
    aspect: '16:9',
    seed: 41001,
    prompt: 'wide establishing background, rain-soaked elevated crossing in a blacked-out Tokyo district, distant holographic AI towers still glowing, empty tram lines, cinematic night',
  },
  {
    id: 'node-subway',
    aspect: '16:9',
    seed: 41002,
    prompt: 'abandoned underground subway control node, vending machines dark, emergency amber lights, cables and fiber conduits exposed, tense investigation mood',
  },
  {
    id: 'memory-archive',
    aspect: '16:9',
    seed: 41003,
    prompt: 'hidden human memory archive, rows of translucent data coffins and paper photographs, blue server mist, quiet sacred atmosphere, detailed walkway and reflective floor continuing through the full foreground, no blank white lower band',
  },
  {
    id: 'maintenance-bay',
    aspect: '16:9',
    seed: 41004,
    prompt: 'android maintenance bay, clean white robotic arms, cracked inspection glass, hanging uniforms, cold laboratory light with amber hazard strips',
  },
  {
    id: 'oracle-space',
    aspect: '16:9',
    seed: 41005,
    prompt: 'abstract AI negotiation chamber, infinite white floor, black monolith screens, floating city maps and red probability threads, elegant ominous space',
  },
  {
    id: 'core-room',
    aspect: '16:9',
    seed: 41006,
    prompt: 'central AI core room, circular server cathedral, massive suspended black processor sphere, human-scale catwalks, emergency red and cyan lighting',
  },
  {
    id: 'morning-city',
    aspect: '16:9',
    seed: 41007,
    prompt: 'same Tokyo megacity at dawn after the decision, wet streets reflecting sunrise, citizens emerging from shelters, bittersweet quiet ending background',
  },
]

const cgs = [
  {
    id: 'blackout',
    aspect: '16:9',
    seed: 42001,
    prompt: 'cinematic CG, young Japanese investigator looking at a citywide blackout from a rooftop, AI tower lit like a vertical eye, wind and rain, dramatic VN event illustration',
    references: ['characters/lin/resolve.png'],
  },
  {
    id: 'memory',
    aspect: '16:9',
    seed: 42002,
    prompt: 'cinematic CG, heroine and analyst discovering erased human memory files projected as glowing photographs, intimate emotional visual novel event scene',
    references: ['characters/lin/focus.png', 'characters/mara/soften.png'],
  },
  {
    id: 'terminal',
    aspect: '16:9',
    seed: 42003,
    prompt: 'cinematic CG, final terminal choice in AI core, human hand and android hand reaching toward a transparent control surface, red probability lines splitting',
    references: ['characters/lin/resolve.png', 'characters/unit7/resolve.png', 'characters/oracle/fractured.png'],
  },
  {
    id: 'title',
    aspect: '16:9',
    seed: 42004,
    prompt: 'title screen key visual without text, four protagonists facing a luminous AI tower across a rain-slick street, Japanese sci-fi visual novel cover composition',
    references: ['characters/lin/resolve.png', 'characters/mara/alert.png', 'characters/unit7/resolve.png', 'characters/oracle/base.png'],
  },
  {
    id: 'blackout-crossing',
    aspect: '16:9',
    seed: 42005,
    prompt: 'cinematic CG, crowded rain-soaked elevated station crossing during a blackout, phones shining on wet pavement to open a rescue path, a fallen elderly man near ticket gates, tense humane visual novel event scene',
    references: ['characters/lin/focus.png', 'characters/mara/alert.png'],
  },
  {
    id: 'unit7-memory-door',
    aspect: '16:9',
    seed: 42006,
    prompt: 'cinematic CG, elegant female android in a cold maintenance bay facing a half-open service door, a tiny yellow raincoat reflected in cracked inspection glass, quiet melancholy sci-fi VN event scene',
    references: ['characters/unit7/memory.png'],
  },
  {
    id: 'oracle-choice-terminal',
    aspect: '16:9',
    seed: 42007,
    prompt: 'cinematic CG, final AI negotiation chamber terminal, red probability threads surrounding a human hand, an android hand, and a dark glass console, solemn high-stakes visual novel event scene',
    references: ['characters/lin/resolve.png', 'characters/unit7/resolve.png', 'characters/oracle/severe.png'],
  },
  {
    id: 'mara-father-archive',
    aspect: '16:9',
    seed: 42008,
    prompt: 'cinematic CG, hidden memory archive showing an old subway dispatch desk photograph projected in blue light, young analyst touching the projection with restrained grief, intimate sci-fi VN event scene',
    references: ['characters/mara/soften.png'],
  },
]

const characters = [
  {
    id: 'mara',
    variants: [
      ['base', 43001, 'Mara Tachibana, 24-year-old Japanese woman resistance analyst, short ash-brown bob haircut, amber eyes, slim black tactical cardigan over a crisp white blouse, compact headset, practical black trousers, calm intelligent expression, both hands visible at relaxed sides, feminine regular anime VN design'],
      ['alert', 43002, 'Mara Tachibana, same adult female resistance analyst with short ash-brown bob haircut and the same black tactical cardigan over white blouse, tense alert expression, one hand touching her compact headset, the other hand fully visible and open, cardigan hem slightly lifted by motion, determined amber eyes, feminine regular anime VN design'],
      ['soften', 43003, 'Mara Tachibana, same adult female resistance analyst with short ash-brown bob hair and black tactical cardigan over white blouse, rare warm tired smile, shoulders relaxed, one hand holding a folded paper memory card, the other hand visible near her side, amber eyes soft but vigilant'],
      ['wounded', 43004, 'Mara Tachibana, same adult female resistance analyst with short ash-brown bob hair and black tactical cardigan, rain-damp sleeve and small bandage on cheek, exhausted defiant expression, one hand clutching headset cable, the other hand visible and braced forward'],
    ],
  },
  {
    id: 'unit7',
    variants: [
      ['base', 43168, 'Unit-7, one single adult female android redesigned as an elegant Japanese anime visual novel heroine, pearl white short bob hair with translucent cyan inner glow, soft luminous teal eyes, pale synthetic skin with subtle porcelain panel seams, fitted short ivory tech jacket over a matte graphite pilot suit, slim graceful seven-head-tall feminine body, distant full-body sprite view of one person only, simple front-facing standing pose, straight legs, arms relaxed close to torso, both delicate normal-sized human-like android hands visible at her sides, full legs visible, feet and shoes visible, small full figure centered with generous blank margins, clean narrow silhouette without external tools'],
      ['doubt', 43142, 'Unit-7, same elegant adult female android with pearl white bob hair and fitted short ivory tech jacket, uncertain vulnerable expression, one delicate normal-sized hand lightly touching the seam near her heart module, the other hand open and visible near her side, teal eyes searching for permission to choose, clean narrow silhouette without external tools'],
      ['resolve', 43143, 'Unit-7, same elegant adult female android with pearl white bob hair and fitted short ivory tech jacket, protective determined expression, cyan circuitry glowing softly along collar and wrists, one normal-sized hand extended close to the body as if shielding someone, the other hand visible at her side, clean narrow silhouette without external tools'],
      ['damaged', 43183, 'Unit-7, one single elegant adult female android girl, same pearl white bob hair and fitted short ivory tech jacket as the base sprite, small cracked cheek panel, faint teal circuit line on one cheek, a few light scuffs on the jacket sleeve, hurt but protective expression, distant full-body sprite view of one person only, simple front-facing standing pose, straight legs, arms relaxed close to torso, full legs visible, feet and shoes visible, both normal-sized hands visible, small full figure centered with generous blank margins, clean narrow silhouette, empty white background, no other characters and no props'],
      ['memory', 43190, 'Unit-7, one single elegant adult female android with pearl white bob hair, softened melancholic expression, faint cyan memory light reflected in eyes, fitted short ivory tech jacket over matte graphite pilot suit, distant full-body sprite view of one person only, one normal-sized hand holding a tiny damaged maintenance tag close to her chest, the other hand visible and relaxed, straight legs, full legs visible, feet and shoes visible, small full figure centered with generous blank margins, clean narrow silhouette without external tools'],
    ],
  },
  {
    id: 'oracle',
    variants: [
      ['base', 43201, 'ORACLE, adult female humanoid AI avatar, long straight black hair, pale skin, white executive coat over dark inner suit, subtle red and cyan interface halo motif behind the collar, serene unreadable smile, tall normal anime proportions, both hands visible'],
      ['glitch', 43202, 'ORACLE, same long black hair and white executive coat, polite smile turning cold, red and cyan glitch accents around sleeves and collar, calm threatening eyes, tall normal anime proportions, both hands visible'],
      ['severe', 43218, 'ORACLE, one single adult female humanoid AI avatar with long straight black hair and white executive coat, cold severe expression, red probability lines glowing subtly around collar and cuffs, distant full-body standing sprite view, narrow compact silhouette, hair falling straight close to the body, coat hanging close to the body, both arms relaxed close to torso, both hands visible near her sides, straight legs, full legs visible, feet and shoes visible, small full figure centered with generous blank margins, no hand gesture and no props'],
      ['fractured', 43204, 'ORACLE, same adult female humanoid AI avatar with long straight black hair and white executive coat, composed face fractured by red and cyan holographic noise, conflicted almost human eyes, both hands visible, elegant ominous anime sprite'],
    ],
  },
  {
    id: 'lin',
    variants: [
      ['base', 43381, '(1girl:1.6), solo, single person, Kamishiro Mio, adult Japanese neural interface investigator, asymmetrical dark navy short bob hair, vivid cyan underlayer streak on one side, small silver neural connector behind one ear, storm grey short investigator jacket, luminous cyan seam lines, black high collar inner suit, black tactical gloves, slim utility belt, knee-high black boots with cyan soles, small translucent neural scanner held close to torso, calm watchful expression, full body, head-to-toe, standing, straight legs, feet visible, centered visual novel sprite, generous blank margins'],
      ['focus', 43382, '(1girl:1.6), solo, single person, Kamishiro Mio, adult Japanese neural interface investigator, asymmetrical dark navy short bob hair, vivid cyan underlayer streak on one side, small silver neural connector behind one ear, storm grey short investigator jacket, luminous cyan seam lines, black high collar inner suit, black tactical gloves, slim utility belt, knee-high black boots with cyan soles, operating small translucent neural scanner close to torso, intense analytical gaze, full body, head-to-toe, standing, straight legs, feet visible, centered visual novel sprite, generous blank margins'],
      ['shaken', 43391, '(1girl:1.8), solo, single person, only one girl, Kamishiro Mio, adult Japanese neural interface investigator, asymmetrical dark navy short bob hair, vivid cyan underlayer streak on one side, small silver neural connector behind one ear, storm grey short investigator jacket, luminous cyan seam lines, black high collar inner suit, black tactical gloves, slim utility belt, knee-high black boots with cyan soles, one hand near neural connector, shaken controlled expression, full body, head-to-toe, standing, straight legs, feet visible, centered visual novel sprite, generous blank margins, empty background'],
      ['resolve', 43384, '(1girl:1.6), solo, single person, Kamishiro Mio, adult Japanese neural interface investigator, asymmetrical dark navy short bob hair, vivid cyan underlayer streak on one side, small silver neural connector behind one ear, storm grey short investigator jacket, luminous cyan seam lines, black high collar inner suit, black tactical gloves, slim utility belt, knee-high black boots with cyan soles, determined forward gaze, one open hand reaching slightly forward inside silhouette, full body, head-to-toe, standing, straight legs, feet visible, centered visual novel sprite, generous blank margins'],
    ],
  },
]

const characterTagPrompts = {
  'mara-base': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'calm intelligent expression',
    'both hands visible at relaxed sides',
  ].join(', '),
  'mara-alert': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'tense alert expression',
    'one hand touching headset',
    'other hand open and visible',
  ].join(', '),
  'mara-soften': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'warm tired smile',
    'holding folded paper memory card',
    'other hand visible',
  ].join(', '),
  'mara-wounded': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset cable',
    'small cheek bandage',
    'exhausted defiant expression',
    'both hands visible',
  ].join(', '),
  'unit7-base': [
    'Unit-7',
    '1girl',
    'full body',
    'head-to-toe',
    'standing',
    'feet visible',
    'shoes visible',
    'adult female android',
    'pearl white short bob hair',
    'pale synthetic skin',
    'soft luminous teal eyes',
    'porcelain panel seams',
    'short ivory tech jacket',
    'graphite bodysuit',
    'normal-sized human-like android hands',
    'quiet curious expression',
    'both hands visible',
    'distant view',
  ].join(', '),
  'unit7-doubt': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'uncertain vulnerable expression',
    'one hand touching heart module seam',
    'other hand open and visible',
  ].join(', '),
  'unit7-resolve': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'cyan circuitry glowing',
    'protective determined expression',
    'one hand extended shielding gesture',
    'other hand visible',
  ].join(', '),
  'unit7-damaged': [
    'Unit-7',
    '1girl',
    'full body',
    'head-to-toe',
    'standing',
    'feet visible',
    'shoes visible',
    'adult female android',
    'pearl white short bob hair',
    'pale synthetic skin',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'cracked cheek panel',
    'exposed teal circuitry at collar and forearm',
    'scuffed coat',
    'protective conflicted expression',
    'both hands visible',
    'distant view',
  ].join(', '),
  'unit7-memory': [
    'Unit-7',
    '1girl',
    'full body',
    'head-to-toe',
    'standing',
    'feet visible',
    'shoes visible',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'melancholic expression',
    'holding damaged maintenance tag',
    'both hands visible',
    'distant view',
  ].join(', '),
  'oracle-base': [
    'ORACLE',
    '1girl',
    'adult female humanoid AI avatar',
    'long straight black hair',
    'pale skin',
    'white executive coat',
    'dark inner suit',
    'red and cyan interface halo motif behind collar',
    'serene unreadable smile',
    'both hands visible',
  ].join(', '),
  'oracle-glitch': [
    'ORACLE',
    '1girl',
    'adult female humanoid AI avatar',
    'long straight black hair',
    'pale skin',
    'white executive coat',
    'dark inner suit',
    'red and cyan glitch accents around sleeves and collar',
    'cold polite smile',
    'calm threatening eyes',
    'both hands visible',
  ].join(', '),
  'oracle-severe': [
    'ORACLE',
    '1girl',
    'full body',
    'head-to-toe',
    'standing',
    'feet visible',
    'shoes visible',
    'adult female humanoid AI avatar',
    'long straight black hair',
    'pale skin',
    'white executive coat',
    'dark inner suit',
    'red probability lines',
    'severe judicial expression',
    'both hands visible near sides',
    'distant view',
  ].join(', '),
  'oracle-fractured': [
    'ORACLE',
    '1girl',
    'adult female humanoid AI avatar',
    'long straight black hair',
    'pale skin',
    'white executive coat',
    'dark inner suit',
    'red and cyan holographic noise',
    'conflicted eyes',
    'both hands visible',
  ].join(', '),
  'lin-base': [
    'Kamishiro Mio',
    '1girl',
    'full body',
    'head-to-toe',
    'standing',
    'feet visible',
    'boots visible',
    'Japanese woman',
    'asymmetrical dark navy short bob hair',
    'single cyan underlayer streak',
    'small silver neural connector behind one ear',
    'short asymmetrical storm grey investigator jacket',
    'luminous cyan seam lines',
    'black high collar inner suit',
    'black interface gloves',
    'utility belt',
    'knee-high black boots',
    'holding small translucent neural scanner',
    'calm watchful expression',
    'distant view',
  ].join(', '),
  'lin-focus': [
    'Kamishiro Mio',
    '1girl',
    'full body',
    'head-to-toe',
    'standing',
    'feet visible',
    'boots visible',
    'Japanese woman',
    'asymmetrical dark navy short bob hair',
    'single cyan underlayer streak',
    'small silver neural connector behind one ear',
    'short asymmetrical storm grey investigator jacket',
    'luminous cyan seam lines',
    'black high collar inner suit',
    'black interface gloves',
    'utility belt',
    'knee-high black boots',
    'operating small translucent neural scanner',
    'intense analytical gaze',
    'both hands visible',
    'distant view',
  ].join(', '),
  'lin-shaken': [
    'Kamishiro Mio',
    '1girl',
    'full body',
    'head-to-toe',
    'standing',
    'feet visible',
    'boots visible',
    'Japanese woman',
    'asymmetrical dark navy short bob hair',
    'single cyan underlayer streak',
    'small silver neural connector behind one ear',
    'short asymmetrical storm grey investigator jacket',
    'luminous cyan seam lines',
    'black high collar inner suit',
    'black interface gloves',
    'utility belt',
    'knee-high black boots',
    'shaken controlled expression',
    'one hand pressed to ear cuff',
    'other hand clenched and visible',
    'distant view',
  ].join(', '),
  'lin-resolve': [
    'Kamishiro Mio',
    '1girl',
    'full body',
    'head-to-toe',
    'standing',
    'feet visible',
    'boots visible',
    'Japanese woman',
    'asymmetrical dark navy short bob hair',
    'single cyan underlayer streak',
    'small silver neural connector behind one ear',
    'short asymmetrical storm grey investigator jacket',
    'luminous cyan seam lines',
    'black high collar inner suit',
    'black interface gloves',
    'utility belt',
    'knee-high black boots',
    'determined forward stance',
    'one open hand reaching forward',
    'scanner lowered',
    'both hands visible',
    'distant view',
  ].join(', '),
}

const finalAssets = [
  ...backgrounds.map(item => ({ ...item, kind: 'background', dest: item.dest || `assets/images/backgrounds/${item.id}.jpg` })),
  ...cgs
    .filter(item => shouldIncludeCg(item.id))
    .map(item => ({ ...item, kind: 'cg', dest: `assets/images/cg/${item.id}.webp` })),
]

async function main() {
  assertSupportedModelSelection()

  await mkdir(rawDir, { recursive: true })
  await mkdir(tempDir, { recursive: true })
  await mkdir(characterQaDir, { recursive: true })

  const characterValidationResults = []

  const manifest = {
    generatedAt: new Date().toISOString(),
    profile,
    models: {
      background: backgroundModel,
      cg: cgModel,
      character: characterModel,
      characterBackgroundRemoval: characterBackgroundRemovalModel,
    },
    assets: [],
  }

  for (const asset of finalAssets) {
    const destination = resolve(root, asset.dest)
    await mkdir(dirname(destination), { recursive: true })
    if (asset.kind === 'background') {
      if (shouldRegenerateBackgrounds || !(await exists(destination))) {
        const artifact = await generateBackgroundImage(asset)
        await finalizeRasterAsset(artifact, destination, {
          width: 2848,
          height: 1600,
          format: 'jpeg',
        })
      }
    }
    else if (shouldRegenerateCgs || !(await exists(destination))) {
      const artifact = await generateCgImage(asset)
      await finalizeRasterAsset(artifact, destination, {
        width: 1344,
        height: 768,
        format: 'webp',
      })
    }
    manifest.assets.push({ id: asset.id, kind: asset.kind, path: asset.dest, seed: asset.seed, prompt: asset.prompt, model: asset.kind === 'background' ? backgroundModel : cgModel })
  }

  for (const character of characters) {
    const selectedVariants = character.variants.filter(([variant]) => shouldIncludeCharacterVariant(character.id, variant))
    if (selectedVariants.length === 0) {
      continue
    }

    for (const [variant, seed, prompt] of selectedVariants) {
      const dest = `assets/characters/${character.id}/${variant}.png`
      const destination = resolve(root, dest)
      const rawId = `${character.id}-${variant}-${modelSlug(characterModel)}-${solidBackgroundName()}-raw`
      const rawOutputDir = resolve(rawDir, rawId)
      const cutoutOutputDir = resolve(rawDir, `${character.id}-${variant}-${modelSlug(characterBackgroundRemovalModel)}-cutout`)
      await mkdir(dirname(destination), { recursive: true })
      if (shouldRegenerateCharacters) {
        await rm(rawOutputDir, { recursive: true, force: true })
        await rm(cutoutOutputDir, { recursive: true, force: true })
        await rm(resolve(rawDir, `${character.id}-${variant}-raw`), { recursive: true, force: true })
        await rm(resolve(rawDir, `${character.id}-${variant}-cutout`), { recursive: true, force: true })
        await rm(resolve(rawDir, `${character.id}-${variant}-openai-gpt-image-1-5-transparent`), { recursive: true, force: true })
        await rm(resolve(rawDir, `${character.id}-${variant}-openai-gpt-image-2-transparent`), { recursive: true, force: true })
      }
      if (shouldRegenerateCharacters || !(await exists(destination))) {
        const raw = await firstArtifact(rawOutputDir) || await generateCharacterImage({
          id: rawId,
          aspect: '2:3',
          seed,
          prompt,
          tagPrompt: characterTagPrompt(character.id, variant),
          character: true,
        })
        const cutout = await firstArtifact(cutoutOutputDir) || await removeCharacterBackground(raw, `${character.id}-${variant}`)
        await cp(cutout, destination)
      }
      await cleanCharacterCutout(destination)
      await normalizeCharacterSprite(destination)
      const cutoutValidation = await validateCharacterCutout(destination, `${character.id}-${variant}`)
      characterValidationResults.push(cutoutValidation)
      manifest.assets.push({
        id: `${character.id}-${variant}`,
        kind: 'character',
        path: dest,
        seed,
        prompt,
        model: characterModel,
        solidBackground: characterSolidBackground,
        backgroundRemovalModel: characterBackgroundRemovalModel,
        cutoutValidation,
      })
    }
    await writeSpriteManifest(character)
  }

  await writeFile(resolve(root, '.generated/asset-generation-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(resolve(characterQaDir, 'cutout-validation.json'), `${JSON.stringify(characterValidationResults, null, 2)}\n`)
  await rm(tempDir, { recursive: true, force: true })
}

async function generateBackgroundImage(asset) {
  if (isOpenAiImageModel(backgroundModel)) {
    return generateOpenAiBackground(asset)
  }
  return generateFluxImage(asset, backgroundModel)
}

async function generateCgImage(asset) {
  if (isOpenAiImageModel(cgModel)) {
    return generateOpenAiCg(asset)
  }
  if (isAnimagineModel(cgModel)) {
    return generateAnimagineCg(asset)
  }
  return generateFluxImage(asset, cgModel)
}

async function generateCharacterImage(asset) {
  if (isGrokImageModel(characterModel)) {
    return generateGrokCharacter(asset)
  }
  if (isZAnimeModel(characterModel)) {
    return generateZAnimeCharacter(asset)
  }
  if (isAnimagineModel(characterModel)) {
    return generateAnimagineCharacter(asset)
  }
  if (isOpenAiImageModel(characterModel)) {
    return generateOpenAiSolidCharacter(asset)
  }
  return generateFluxImage(asset, characterModel)
}

async function generateOpenAiBackground(asset) {
  const outputDir = resolve(rawDir, `${asset.id}-${modelSlug(backgroundModel)}-jpeg`)
  const existing = await firstArtifact(outputDir)
  if (existing) {
    return existing
  }
  const input = {
    prompt: `${artBible}. Scene: ${asset.prompt}. IMPORTANT: this is a pure environment background only. Compose for a final 16:9 center crop from a 3:2 source: keep essential architecture and horizon details away from the top and bottom crop margins, fill the horizontal frame, and keep usable foreground depth. Avoid all labels, UI text, posters, signs, numbers, symbols, captions, humans, androids, portraits, and silhouettes. Screens and panels may contain abstract blocks, lines, dots, waveforms, and geometric light only, never written characters.`,
    aspect_ratio: '3:2',
    number_of_images: 1,
    quality: landscapeImageQuality,
    background: 'opaque',
    moderation: 'auto',
    output_format: 'jpeg',
    output_compression: 92,
  }
  return runPrediction({
    model: backgroundModel,
    input,
    outputDir,
  })
}

async function generateOpenAiCg(asset) {
  const outputDir = resolve(rawDir, `${asset.id}-${modelSlug(cgModel)}-webp`)
  if (shouldRegenerateCgs) {
    await rm(outputDir, { recursive: true, force: true })
  }
  const existing = await firstArtifact(outputDir)
  if (existing) {
    return existing
  }
  const references = await cgInputImages(asset)
  const input = {
    prompt: `${cgArtBible}. Scene: ${asset.prompt}. Use the provided input_images as strict character references for identity, hairstyle, outfit silhouette, costume colors, face impression, and world continuity. Preserve the same characters from the sprite references; do not redesign them, replace them, age them down, change hair color, change clothing, add unrelated characters, or drift into a different anime style. Compose for a final 16:9 center crop from a 3:2 source: keep faces, hands, and narrative focal points away from the top and bottom crop margins, with full cinematic horizontal staging. No captions, no title text, no UI, no logo, no watermark.`,
    aspect_ratio: '3:2',
    ...(references.length > 0 ? { input_images: references } : {}),
    number_of_images: 1,
    quality: landscapeImageQuality,
    background: 'opaque',
    moderation: 'auto',
    output_format: 'webp',
    output_compression: 92,
  }
  return runPrediction({
    model: cgModel,
    input,
    outputDir,
  })
}

async function generateAnimagineCg(asset) {
  const outputDir = resolve(rawDir, `${asset.id}-${modelSlug(cgModel)}-webp`)
  if (shouldRegenerateCgs) {
    await rm(outputDir, { recursive: true, force: true })
  }
  const existing = await firstArtifact(outputDir)
  if (existing) {
    return existing
  }
  const input = {
    vae: 'default',
    model: animagineInternalModelName(cgModel),
    prompt: buildCgPrompt(asset),
    negative_prompt: [
      backgroundNegative,
      'off model character',
      'wrong hairstyle',
      'wrong hair color',
      'wrong outfit',
      'different costume',
      'unrelated protagonist',
      'character redesign',
      'inconsistent character',
      'photo',
      'semi realistic',
      'western comic',
      '3d',
    ].join(', '),
    width: Number(process.env.CG_WIDTH || 1344),
    height: Number(process.env.CG_HEIGHT || 768),
    steps: Number(process.env.CG_STEPS || 34),
    cfg_scale: Number(process.env.CG_CFG_SCALE || 5),
    pag_scale: Number(process.env.CG_PAG_SCALE || 1),
    guidance_rescale: Number(process.env.CG_GUIDANCE_RESCALE || 1),
    clip_skip: Number(process.env.CG_CLIP_SKIP || 1),
    scheduler: process.env.CG_SCHEDULER || 'Euler a',
    batch_size: 1,
    seed: asset.seed,
    prepend_preprompt: true,
  }
  return runPrediction({
    model: cgModel,
    input,
    outputDir,
  })
}

async function cgInputImages(asset) {
  const references = asset.references || []
  const images = []
  for (const reference of references) {
    const path = resolve(root, 'assets', reference)
    if (!(await exists(path))) {
      throw new Error(`Missing CG reference image for ${asset.id}: ${path}`)
    }
    images.push(await imageDataUrl(path))
  }
  return images
}

async function imageDataUrl(path) {
  const buffer = await readFile(path)
  const lower = path.toLowerCase()
  const mime = lower.endsWith('.webp')
    ? 'image/webp'
    : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

async function generateAnimagineCharacter(asset) {
  const outputDir = resolve(rawDir, asset.id)
  const existing = await firstArtifact(outputDir)
  if (existing) {
    return existing
  }
  const input = {
    vae: 'default',
    model: animagineInternalModelName(characterModel),
    prompt: buildCharacterPrompt(asset.prompt, asset.tagPrompt),
    negative_prompt: characterNegative,
    width: Number(process.env.CHARACTER_WIDTH || 1024),
    height: Number(process.env.CHARACTER_HEIGHT || 1536),
    steps: Number(process.env.CHARACTER_STEPS || 30),
    cfg_scale: Number(process.env.CHARACTER_CFG_SCALE || 5),
    pag_scale: Number(process.env.CHARACTER_PAG_SCALE || 1),
    guidance_rescale: Number(process.env.CHARACTER_GUIDANCE_RESCALE || 1),
    clip_skip: Number(process.env.CHARACTER_CLIP_SKIP || 1),
    scheduler: process.env.CHARACTER_SCHEDULER || 'Euler a',
    batch_size: 1,
    seed: asset.seed,
    prepend_preprompt: true,
  }
  return runPrediction({
    model: characterModel,
    input,
    outputDir,
  })
}

async function generateZAnimeCharacter(asset) {
  const outputDir = resolve(rawDir, asset.id)
  const existing = await firstArtifact(outputDir)
  if (existing) {
    return existing
  }
  const input = {
    prompt: buildCharacterPrompt(asset.prompt, asset.tagPrompt),
    negative_prompt: characterNegative,
    aspect_ratio: process.env.CHARACTER_ASPECT_RATIO || 'portrait',
    num_inference_steps: Number(process.env.CHARACTER_STEPS || 36),
    guidance_scale: Number(process.env.CHARACTER_GUIDANCE_SCALE || 4),
    seed: asset.seed,
  }
  return runPrediction({
    model: characterModel,
    input,
    outputDir,
  })
}

async function generateGrokCharacter(asset) {
  const outputDir = resolve(rawDir, asset.id)
  const existing = await firstArtifact(outputDir)
  if (existing) {
    return existing
  }
  const input = {
    prompt: buildCharacterPrompt(asset.prompt, asset.tagPrompt),
    aspect_ratio: process.env.CHARACTER_ASPECT_RATIO || '2:3',
  }
  return runPrediction({
    model: characterModel,
    input,
    outputDir,
  })
}

async function generateOpenAiSolidCharacter(asset) {
  const outputDir = resolve(rawDir, asset.id)
  const existing = await firstArtifact(outputDir)
  if (existing) {
    return existing
  }
  const input = {
    prompt: buildCharacterPrompt(asset.prompt, asset.tagPrompt),
    aspect_ratio: '2:3',
    number_of_images: 1,
    quality: characterImageQuality,
    background: 'opaque',
    moderation: 'auto',
    output_format: 'png',
    output_compression: 100,
  }
  return runPrediction({
    model: characterModel,
    input,
    outputDir,
  })
}

async function generateFluxImage(asset, model = cgModel) {
  const input = {
    prompt: `${asset.character ? characterArtBible : asset.kind === 'cg' ? cgArtBible : artBible}, ${asset.prompt}. Negative prompt: ${asset.character ? characterNegative : backgroundNegative}`,
    aspect_ratio: asset.aspect,
    num_outputs: 1,
    num_inference_steps: 4,
    seed: asset.seed,
    output_format: 'webp',
    output_quality: 92,
    go_fast: false,
    megapixels: '1',
  }
  return runPrediction({
    model,
    input,
    outputDir: resolve(rawDir, asset.id),
  })
}

function buildCharacterPrompt(prompt, tagPrompt = '') {
  return [
    tagPrompt,
    '(1girl:1.6), solo, single person, no duplicate, standing upright, straight legs, full body, full-length portrait, head-to-toe, shoes visible, feet on the same plane, looking at viewer, visual novel standing sprite, clean lineart, cel shading, anime coloring, detailed eyes, detailed hands',
    `plain ${solidBackgroundPromptName()} background, empty background, simple background, studio cutout source, no shadow, no floor, no reflection, no background ornament, no frame`,
    characterArtBible,
    `Character: ${prompt}`,
    'Create a production-ready full-body adult standing VN sprite of exactly one person, centered, head-to-toe body visible, feet and shoes visible, uncropped silhouette, normal upright standing pose, no sitting, no crouching, no second character.',
    'Leave clear blank solid background margins around the full body, including a small visible margin below the shoes.',
    `The entire background must be perfectly flat solid ${characterSolidBackground}, with no gradients, no texture, no vignette, no floor plane, no cast shadow, no contact shadow, and no reflection.`,
    'Keep the entire visible silhouette clean and complete for later background removal.',
    'Keep both hands visible and anatomically correct. Keep the eye whites opaque and intact.',
  ].join(' ')
}

function buildCgPrompt(asset) {
  return [
    characterReferencePrompt(asset.references || []),
    'masterpiece, high score, great score, absurdres, cinematic visual novel event cg, anime screencap composition, 16:9 wide scene, clean cel shading, crisp lineart, detailed background, dramatic lighting',
    cgArtBible,
    `Scene: ${asset.prompt}`,
    'Keep the named character designs exactly consistent with their established sprites: same hair color, hairstyle, clothing silhouette, accessory placement, costume palette, and facial impression.',
    'No redesign, no alternate outfit, no extra named characters unless the scene explicitly requires them, no text.',
  ].filter(Boolean).join(', ')
}

function characterReferencePrompt(references) {
  const names = references.map(reference => reference.split('/')[1]).filter(Boolean)
  const uniqueNames = Array.from(new Set(names))
  if (uniqueNames.length === 0) {
    return ''
  }
  return uniqueNames.map((id) => {
    if (id === 'lin') {
      return 'Kamishiro Mio, adult Japanese woman, asymmetrical dark navy short bob hair with vivid cyan underlayer streak, small silver neural connector behind one ear, storm grey short investigator jacket with luminous cyan seam lines, black high collar inner suit, black interface gloves, knee-high black boots'
    }
    if (id === 'mara') {
      return 'Mara Tachibana, adult Japanese woman, short ash-brown bob haircut, amber eyes, compact headset, slim black tactical cardigan over crisp white blouse, practical black trousers'
    }
    if (id === 'unit7') {
      return 'Unit-7, elegant adult female android, pearl white short bob hair, luminous teal eyes, pale synthetic skin with subtle porcelain panel seams, short ivory tech jacket over matte graphite pilot suit, cyan circuitry accents'
    }
    if (id === 'oracle') {
      return 'ORACLE, adult female humanoid AI avatar, long straight black hair, pale skin, white executive coat over dark inner suit, subtle red and cyan interface accents, serene unreadable expression'
    }
    return ''
  }).filter(Boolean).join(', ')
}

async function removeCharacterBackground(imagePath, id) {
  const outputDir = resolve(rawDir, `${id}-${modelSlug(characterBackgroundRemovalModel)}-cutout`)
  await mkdir(outputDir, { recursive: true })
  const { input, inputFileKey } = characterBackgroundRemovalInput()
  return runPrediction({
    model: characterBackgroundRemovalModel,
    input,
    inputFiles: [`${inputFileKey}=${imagePath}`],
    fileMode: process.env.CHARACTER_BACKGROUND_REMOVAL_FILE_MODE || 'upload',
    outputDir,
  })
}

function characterBackgroundRemovalInput() {
  if (process.env.CHARACTER_BACKGROUND_REMOVAL_INPUT_JSON) {
    return {
      input: JSON.parse(process.env.CHARACTER_BACKGROUND_REMOVAL_INPUT_JSON),
      inputFileKey: process.env.CHARACTER_BACKGROUND_REMOVAL_INPUT_KEY || 'image',
    }
  }

  if (characterBackgroundRemovalModel === 'smoretalk/rembg-enhance') {
    return {
      input: {},
      inputFileKey: 'image',
    }
  }

  if (characterBackgroundRemovalModel === '851-labs/background-remover') {
    return {
      input: {
        threshold: 0,
        reverse: false,
        background_type: 'rgba',
        format: 'png',
      },
      inputFileKey: 'image',
    }
  }

  if (characterBackgroundRemovalModel === 'fottoai/remove-bg-2') {
    return {
      input: {},
      inputFileKey: 'image_url',
    }
  }

  return {
    input: {},
    inputFileKey: process.env.CHARACTER_BACKGROUND_REMOVAL_INPUT_KEY || 'image',
  }
}


async function finalizeRasterAsset(sourcePath, destinationPath, options) {
  const python = await exists(imageQaPython) ? imageQaPython : 'python3'
  await mkdir(dirname(destinationPath), { recursive: true })
  await execFileAsync(python, [
    '-c',
    rasterFinalizeProgram,
    sourcePath,
    destinationPath,
    String(options.width),
    String(options.height),
    options.format,
  ], {
    maxBuffer: 1024 * 1024 * 10,
  })
}

async function validateCharacterCutout(imagePath, id) {
  const previewPath = resolve(characterQaDir, `${id}-qa-magenta.png`)
  const python = await exists(imageQaPython) ? imageQaPython : 'python3'
  const { stdout } = await execFileAsync(python, ['-c', characterCutoutQaProgram, imagePath, previewPath, id], {
    maxBuffer: 1024 * 1024 * 10,
  })
  const result = JSON.parse(stdout)
  if (!result.ok) {
    throw new Error(`Character cutout validation failed for ${id}: ${result.failedChecks.join(', ')}`)
  }
  return result
}

async function cleanCharacterCutout(imagePath) {
  const python = await exists(imageQaPython) ? imageQaPython : 'python3'
  await execFileAsync(python, ['-c', characterCutoutCleanupProgram, imagePath], {
    maxBuffer: 1024 * 1024 * 10,
  })
}

async function normalizeCharacterSprite(imagePath) {
  const python = await exists(imageQaPython) ? imageQaPython : 'python3'
  await execFileAsync(python, ['-c', characterSpriteNormalizeProgram, imagePath], {
    maxBuffer: 1024 * 1024 * 10,
  })
}

const rasterFinalizeProgram = String.raw`
import sys
from pathlib import Path
from PIL import Image, ImageOps

source_path, destination_path, width_text, height_text, format_name = sys.argv[1:6]
target_width = int(width_text)
target_height = int(height_text)
format_name = format_name.lower()

image = Image.open(source_path)
image = ImageOps.exif_transpose(image).convert("RGB")
source_width, source_height = image.size
target_ratio = target_width / target_height
source_ratio = source_width / source_height

if source_ratio > target_ratio:
    crop_width = round(source_height * target_ratio)
    left = max(0, (source_width - crop_width) // 2)
    box = (left, 0, left + crop_width, source_height)
else:
    crop_height = round(source_width / target_ratio)
    top = max(0, (source_height - crop_height) // 2)
    box = (0, top, source_width, top + crop_height)

image = image.crop(box).resize((target_width, target_height), Image.Resampling.LANCZOS)
Path(destination_path).parent.mkdir(parents=True, exist_ok=True)

if format_name in ("jpg", "jpeg"):
    image.save(destination_path, "JPEG", quality=92, optimize=True, progressive=True)
elif format_name == "webp":
    image.save(destination_path, "WEBP", quality=92, method=6)
else:
    image.save(destination_path)
`

const characterCutoutCleanupProgram = String.raw`
import sys
from collections import deque
from PIL import Image

image_path = sys.argv[1]
image = Image.open(image_path).convert("RGBA")
width, height = image.size
pixels = bytearray(image.tobytes())
alpha_data = bytearray(pixels[3::4])
total = width * height
low_alpha_threshold = 32
edge_desaturate_threshold = 228
minimum_area = max(96, round(total * 0.003))

# Remove broad low-alpha haze left by background-removal models before component analysis.
for index, value in enumerate(alpha_data):
    if value < low_alpha_threshold:
        alpha_data[index] = 0

def neighbors(index):
    x = index % width
    y = index // width
    if x > 0:
        yield index - 1
    if x + 1 < width:
        yield index + 1
    if y > 0:
        yield index - width
    if y + 1 < height:
        yield index + width

visited = bytearray(total)
components = []
for start, value in enumerate(alpha_data):
    if value <= 0 or visited[start]:
        continue
    queue = deque([start])
    visited[start] = 1
    component = []
    while queue:
        index = queue.popleft()
        component.append(index)
        for neighbor in neighbors(index):
            if alpha_data[neighbor] > 0 and not visited[neighbor]:
                visited[neighbor] = 1
                queue.append(neighbor)
    components.append(component)

if components:
    main_component = max(components, key=len)
    main = set(main_component)
    for component in components:
        if component is main_component:
            continue
        if len(component) < minimum_area:
            for index in component:
                alpha_data[index] = 0

    # If a significant translucent smear is still connected only by hairline pixels,
    # keep the main body and remove tiny detached islands after low-alpha pruning.
    for component in components:
        if component is main_component:
            continue
        if len(component) >= minimum_area:
            for index in component:
                alpha_data[index] = 0

# Despill white matte halos on antialiased edges without changing opaque interior colors.
for index, alpha in enumerate(alpha_data):
    base = index * 4
    if alpha <= 0:
        pixels[base + 3] = 0
        continue
    r, g, b = pixels[base], pixels[base + 1], pixels[base + 2]
    if alpha < edge_desaturate_threshold and r > 220 and g > 220 and b > 220:
        pull = (edge_desaturate_threshold - alpha) / edge_desaturate_threshold
        pixels[base] = max(0, min(255, round(r - (r - 210) * pull)))
        pixels[base + 1] = max(0, min(255, round(g - (g - 210) * pull)))
        pixels[base + 2] = max(0, min(255, round(b - (b - 210) * pull)))
    pixels[base + 3] = alpha

image = Image.frombytes("RGBA", (width, height), bytes(pixels))
image.save(image_path)
`

const characterSpriteNormalizeProgram = String.raw`
import sys
from pathlib import Path
from PIL import Image

image_path = sys.argv[1]
target_width = 1024
target_height = 1536
target_bbox_height = 1380
target_max_bbox_width = 840
bottom_margin = 24

image = Image.open(image_path).convert("RGBA")
alpha = image.getchannel("A")
bbox = alpha.getbbox()
if not bbox:
    image.resize((target_width, target_height), Image.Resampling.LANCZOS).save(image_path)
    raise SystemExit(0)

left, top, right, bottom = bbox
bbox_width = right - left
bbox_height = bottom - top

scale = target_bbox_height / bbox_height
if bbox_width * scale > target_max_bbox_width:
    scale = target_max_bbox_width / bbox_width

new_width = max(1, round(image.width * scale))
new_height = max(1, round(image.height * scale))
resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
resized_bbox = resized.getchannel("A").getbbox()
if not resized_bbox:
    resized.save(image_path)
    raise SystemExit(0)

r_left, r_top, r_right, r_bottom = resized_bbox
r_center_x = (r_left + r_right) / 2
paste_x = round(target_width / 2 - r_center_x)
paste_y = round(target_height - bottom_margin - r_bottom)

canvas = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
canvas.alpha_composite(resized, (paste_x, paste_y))

# If very wide hair or sleeves would clip after centering, nudge the full resized image back in bounds.
final_bbox = canvas.getchannel("A").getbbox()
if final_bbox:
    f_left, f_top, f_right, f_bottom = final_bbox
    shift_x = 0
    shift_y = 0
    if f_left < 0:
        shift_x = -f_left
    elif f_right > target_width:
        shift_x = target_width - f_right
    if f_top < 0:
        shift_y = -f_top
    elif f_bottom > target_height:
        shift_y = target_height - f_bottom
    if shift_x or shift_y:
        shifted = Image.new("RGBA", (target_width, target_height), (0, 0, 0, 0))
        shifted.alpha_composite(canvas, (shift_x, shift_y))
        canvas = shifted

Path(image_path).parent.mkdir(parents=True, exist_ok=True)
canvas.save(image_path)
`

const characterCutoutQaProgram = String.raw`
import json
import sys
from pathlib import Path
from PIL import Image

image_path, preview_path, asset_id = sys.argv[1:4]
image = Image.open(image_path)
has_alpha = image.mode in ("RGBA", "LA") or "transparency" in image.info
rgba = image.convert("RGBA")
width, height = rgba.size
total = width * height
alpha = rgba.getchannel("A")
histogram = alpha.histogram()
transparent_pixels = sum(histogram[:8])
opaque_pixels = sum(histogram[248:])
partial_pixels = total - transparent_pixels - opaque_pixels

corner_size = max(8, min(48, width // 12, height // 12))
corner_boxes = [
    (0, 0, corner_size, corner_size),
    (width - corner_size, 0, width, corner_size),
    (0, height - corner_size, corner_size, height),
    (width - corner_size, height - corner_size, width, height),
]
corner_opaque = 0
corner_total = 0
for box in corner_boxes:
    for value in alpha.crop(box).getdata():
        corner_total += 1
        if value > 8:
            corner_opaque += 1

bbox = alpha.getbbox()
if bbox:
    left, top, right, bottom = bbox
    bbox_width_ratio = (right - left) / width
    bbox_height_ratio = (bottom - top) / height
else:
    left = top = right = bottom = 0
    bbox_width_ratio = 0
    bbox_height_ratio = 0

transparent_ratio = transparent_pixels / total
opaque_ratio = opaque_pixels / total
partial_ratio = partial_pixels / total
corner_opaque_ratio = corner_opaque / corner_total if corner_total else 1

checks = {
    "has_alpha": has_alpha,
    "transparent_corners": corner_opaque_ratio <= 0.02,
    "transparent_background": transparent_ratio >= 0.15,
    "visible_subject": opaque_ratio >= 0.02,
    "not_solid_rectangle": bool(bbox) and bbox_width_ratio <= 0.995,
}
failed = [name for name, passed in checks.items() if not passed]

preview = Image.new("RGBA", rgba.size, (255, 0, 255, 255))
preview.alpha_composite(rgba)
preview_rgb = preview.convert("RGB")
max_side = max(width, height)
if max_side > 1400:
    scale = 1400 / max_side
    preview_rgb = preview_rgb.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
Path(preview_path).parent.mkdir(parents=True, exist_ok=True)
preview_rgb.save(preview_path)

print(json.dumps({
    "id": asset_id,
    "ok": not failed,
    "failedChecks": failed,
    "path": image_path,
    "previewPath": preview_path,
    "width": width,
    "height": height,
    "transparentRatio": round(transparent_ratio, 4),
    "opaqueRatio": round(opaque_ratio, 4),
    "partialAlphaRatio": round(partial_ratio, 4),
    "cornerOpaqueRatio": round(corner_opaque_ratio, 4),
    "alphaBoundingBox": {
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "widthRatio": round(bbox_width_ratio, 4),
        "heightRatio": round(bbox_height_ratio, 4),
    },
    "checks": checks,
}, separators=(",", ":")))
`

async function writeSpriteManifest(character) {
  const [baseVariant = 'base'] = character.variants[0] || []
  const expressions = Object.fromEntries(
    character.variants
      .filter(([variant]) => variant !== baseVariant)
      .map(([variant]) => [
        variant,
        {
          fallback: `${baseVariant}.png`,
          layers: [
            {
              asset: `${variant}.png`,
            },
          ],
        },
      ]),
  )
  const spriteManifest = {
    version: 1,
    family: character.id,
    base: {
      asset: `${baseVariant}.png`,
    },
    ...(Object.keys(expressions).length > 0 ? { expressions } : {}),
  }
  const path = resolve(root, `assets/characters/${character.id}/sprite.manifest.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(spriteManifest, null, 2)}\n`)
}

async function runPrediction({ model, input, inputFiles = [], fileMode = 'auto', outputDir }) {
  await mkdir(outputDir, { recursive: true })
  const inputPath = resolve(tempDir, `${model.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}.json`)
  await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`)
  const version = modelVersion(model)
  const args = [
    '--profile', profile,
    '--json',
    'run',
    version ? `${model}:${version}` : model,
    '--input-json', inputPath,
    '--wait', predictionWaitSeconds,
    '--output', outputDir,
  ]
  for (const file of inputFiles) {
    args.push('--input-file', file)
  }
  if (inputFiles.length > 0) {
    args.push('--file-mode', fileMode)
  }

  const envelope = await runCli(args)
  if (envelope.artifacts?.[0]?.path) {
    return envelope.artifacts[0].path
  }
  const predictionId = envelope.data?.id
  if (!predictionId) {
    throw new Error(`Prediction for ${model} did not return an artifact or prediction id.`)
  }
  const waited = await runCli([
    '--profile', profile,
    '--json',
    'predictions',
    'wait',
    predictionId,
    '--timeout', '20m',
    '--output', outputDir,
  ])
  if (!waited.artifacts?.[0]?.path) {
    throw new Error(`Prediction ${predictionId} completed without downloadable artifacts.`)
  }
  return waited.artifacts[0].path
}

function assertSupportedModelSelection() {
  const selectedModels = {
    background: backgroundModel,
    cg: cgModel,
    character: characterModel,
    characterBackgroundRemoval: characterBackgroundRemovalModel,
  }
  for (const [slot, model] of Object.entries(selectedModels)) {
    if (model.toLowerCase().includes('seedream')) {
      throw new Error(`Seedream is disabled for ${slot} generation. Choose a non-seedream model.`)
    }
  }
}

function isOpenAiImageModel(model) {
  return model.startsWith('openai/gpt-image-')
}

function isGrokImageModel(model) {
  return model === 'xai/grok-imagine-image'
}

function isZAnimeModel(model) {
  return model === 'lucataco/z-anime'
}

function isAnimagineModel(model) {
  return model === 'aisha-ai-official/animagine-xl-v4-opt' || model === 'aisha-ai-official/animagine-xl-4.0'
}

function animagineInternalModelName(model) {
  if (model === 'aisha-ai-official/animagine-xl-v4-opt') {
    return 'Animagine-XL-v4-Opt'
  }
  if (model === 'aisha-ai-official/animagine-xl-4.0') {
    return 'Animagine-XL-4.0'
  }
  throw new Error(`Unsupported Animagine model: ${model}`)
}

function modelVersion(model) {
  if (model === 'xai/grok-imagine-image') {
    return '3032db31147241f86351f0d7ab1ffd5150dcb482bcb873580f15d8cb8970a812'
  }
  if (model === 'smoretalk/rembg-enhance') {
    return '4067ee2a58f6c161d434a9c077cfa012820b8e076efa2772aa171e26557da919'
  }
  if (model === '851-labs/background-remover') {
    return 'a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc'
  }
  if (model === 'lucataco/z-anime') {
    return '452357eaceec03183df5267118ae6556f05aecebd2dc7eb4ecd8fd94deedc143'
  }
  if (model === 'aisha-ai-official/animagine-xl-v4-opt') {
    return 'cfd0f86fbcd03df45fca7ce83af9bb9c07850a3317303fe8dcf677038541db8a'
  }
  if (model === 'aisha-ai-official/animagine-xl-4.0') {
    return '057e2276ac5dcd8d1575dc37b131f903df9c10c41aed53d47cd7d4f068c19fa5'
  }
  return ''
}

function shouldIncludeCharacterVariant(characterId, variant) {
  if (!characterFilter.trim()) {
    return true
  }
  const entries = characterFilter.split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
  return entries.some((entry) => {
    const [filterCharacter, filterVariant] = entry.split(':')
    if (!filterVariant) {
      return filterCharacter === characterId.toLowerCase()
    }
    return filterCharacter === characterId.toLowerCase() && filterVariant === variant.toLowerCase()
  })
}

function shouldIncludeCg(cgId) {
  if (!cgFilter.trim()) {
    return true
  }
  const entries = cgFilter.split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
  return entries.includes(cgId.toLowerCase())
}

function characterTagPrompt(characterId, variant) {
  return characterTagPrompts[`${characterId}-${variant}`] || ''
}

function solidBackgroundName() {
  return characterSolidBackground === '#000000' || characterSolidBackground.toLowerCase() === 'black'
    ? 'black'
    : 'white'
}

function solidBackgroundPromptName() {
  return solidBackgroundName() === 'black' ? 'black' : 'white'
}

function modelSlug(model) {
  return model.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
}

async function exists(path) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function firstArtifact(outputDir) {
  try {
    const manifest = JSON.parse(await readFile(resolve(outputDir, 'manifest.json'), 'utf8'))
    const path = manifest.artifacts?.[0]?.path
    if (path && await exists(path)) {
      return path
    }
  }
  catch {
    return undefined
  }
  return undefined
}

async function runCli(args) {
  let stdout
  try {
    ;({ stdout } = await execFileAsync('node', [cli, ...args], {
      cwd: root,
      maxBuffer: 1024 * 1024 * 10,
    }))
  }
  catch (error) {
    stdout = error.stdout
    if (!stdout) {
      throw error
    }
  }
  const envelope = JSON.parse(stdout)
  if (!envelope.ok) {
    throw new Error(envelope.error?.message || 'Replicate CLI command failed')
  }
  return envelope
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
