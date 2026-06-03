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
const cliOptions = parseCliOptions(process.argv.slice(2))
const shouldRegenerateAll = process.env.REGENERATE_ALL_ASSETS === '1' || cliOptions.regenerateAll
const backgroundModel = process.env.BACKGROUND_MODEL || 'openai/gpt-image-2'
const characterModel = process.env.CHARACTER_MODEL || 'aisha-ai-official/animagine-xl-v4-opt'
const cgModel = process.env.CG_MODEL || 'openai/gpt-image-2'
const characterBackgroundRemovalModel = process.env.CHARACTER_BACKGROUND_REMOVAL_MODEL || '851-labs/background-remover'
const characterSolidBackground = process.env.CHARACTER_SOLID_BACKGROUND || '#ffffff'
const backgroundFilter = joinFilters(process.env.BACKGROUND_FILTER, cliOptions.backgroundFilters)
const characterFilter = joinFilters(process.env.CHARACTER_FILTER, cliOptions.characterFilters)
const cgFilter = joinFilters(process.env.CG_FILTER, cliOptions.cgFilters)
const assetFilter = joinFilters(process.env.ASSET_FILTER, cliOptions.assetFilters)
const landscapeImageQuality = process.env.LANDSCAPE_IMAGE_QUALITY || process.env.GPT_IMAGE_QUALITY || 'medium'
const cgImageQuality = process.env.CG_IMAGE_QUALITY || process.env.GPT_IMAGE_QUALITY || 'medium'
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
  'character skin tones remain natural and readable; cyan light may create subtle rim light on hair, clothing seams, or glass only, never solid blue faces or blue skin',
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
    prompt: 'cinematic CG, Kamishiro Mio looking at a citywide blackout from a rooftop, AI tower lit like a vertical eye, wind and rain, her face keeps natural pale skin with only a small cyan hair streak and jacket seam glow, dramatic VN event illustration',
    references: ['characters/lin/base.png'],
  },
  {
    id: 'memory',
    aspect: '16:9',
    seed: 42002,
    prompt: 'cinematic CG, Kamishiro Mio and Mara Tachibana discovering erased human memory files projected as glowing photographs, intimate emotional visual novel event scene, both faces keep natural skin tones; cyan interface light is limited to glass reflections, hair rim light, and clothing seams',
    references: ['characters/lin/focus.png', 'characters/mara/soften.png'],
  },
  {
    id: 'terminal',
    aspect: '16:9',
    seed: 42003,
    prompt: 'cinematic CG, final terminal choice in AI core, Kamishiro Mio, Unit-7, and ORACLE around a transparent control surface as one human hand and one android hand reach toward red probability lines, ORACLE keeps long straight black hair, visible open violet-cyan eyes, white tailored executive coat, and dark charcoal bodysuit, Mio keeps natural skin tone with cyan only as hair accent and jacket seam light',
    references: ['characters/lin/resolve.png', 'characters/unit7/resolve.png', 'characters/oracle/fractured.png'],
  },
  {
    id: 'title',
    aspect: '16:9',
    seed: 42004,
    prompt: 'title screen key visual without text, four protagonists facing a luminous AI tower across a rain-slick street, Kamishiro Mio, Mara Tachibana, Unit-7, and ORACLE seen from behind with their established outfits and height relationship, ORACLE wears a white long executive coat over black bodysuit and has long black hair, Mio has natural skin tone and only one cyan hair streak, Japanese sci-fi visual novel cover composition',
    references: ['characters/lin/base.png', 'characters/mara/alert.png', 'characters/unit7/resolve.png', 'characters/oracle/base.png'],
  },
  {
    id: 'blackout-crossing',
    aspect: '16:9',
    seed: 42005,
    prompt: 'cinematic CG, crowded rain-soaked elevated station crossing during a blackout, Kamishiro Mio and Mara Tachibana guiding civilians to open a rescue path, phones shining on wet pavement, a fallen elderly man near ticket gates, Mio keeps her dark navy short bob with one cyan streak and storm grey investigator jacket, Mara keeps her short ash-brown bob, headset, black tactical cardigan, and white blouse, both faces keep natural skin tones with no blue facial tint, all visible hands are anatomically clear, tense humane visual novel event scene',
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
    prompt: 'cinematic CG, final AI negotiation chamber terminal, red probability threads surrounding a human hand, an android hand, and a dark glass console, Kamishiro Mio and Unit-7 confront ORACLE across the table, ORACLE keeps long straight black hair, visible open violet-cyan eyes, white tailored executive coat, and dark charcoal bodysuit, Mio keeps natural skin tone with cyan only as hair accent and jacket seam light, solemn high-stakes visual novel event scene',
    references: ['characters/lin/resolve.png', 'characters/unit7/resolve.png', 'characters/oracle/severe.png'],
  },
  {
    id: 'mara-father-archive',
    aspect: '16:9',
    seed: 42008,
    prompt: 'cinematic CG, hidden memory archive showing an old subway dispatch desk photograph projected in blue light, Mara Tachibana touches the projection with restrained grief, she keeps her short ash-brown bob haircut, compact headset, black tactical cardigan over a crisp white blouse, practical black trousers, and controlled tired expression, one hand is clearly visible on the blue projection glass and the other hand remains anatomically plausible, intimate sci-fi VN event scene',
    references: ['characters/mara/soften.png'],
  },
  {
    id: 'ending-symbiosis-hearing',
    aspect: '16:9',
    seed: 42009,
    prompt: 'cinematic ending CG, dawn public hearing room overlooking Tokyo after the AI pact, Kamishiro Mio, Mara Tachibana, and Unit-7 stand together before citizens and a restrained ORACLE interface, hopeful but uneasy mood, no podium text, no readable screens, all faces keep natural skin tones; cyan light is only subtle rim light and interface reflection, characters preserve their established sprite designs and height relationship',
    references: ['characters/lin/soft.png', 'characters/mara/soften.png', 'characters/unit7/resolve.png'],
  },
  {
    id: 'ending-bounded-oracle',
    aspect: '16:9',
    seed: 42010,
    prompt: 'cinematic ending CG, quiet control room at dawn, exactly two visible characters only: Kamishiro Mio and Unit-7 write new city audit metrics on abstract transparent interface panels, ORACLE is represented only by a distant non-humanoid abstract light sphere and thin blue circuitry, no ORACLE woman avatar, no duplicate characters, Mio keeps natural skin tone and Unit-7 keeps pale synthetic skin without a blue face, thoughtful restrained victory, no readable letters or symbols, characters preserve their established sprite designs',
    references: ['characters/lin/focus.png', 'characters/unit7/memory.png'],
  },
  {
    id: 'ending-quiet-city',
    aspect: '16:9',
    seed: 42011,
    prompt: 'cinematic bad ending CG, sterile white ORACLE chamber after the city is pacified, Kamishiro Mio stands alone facing ORACLE avatar across a polished empty floor, ORACLE keeps long straight black hair, visible open eyes, white tailored executive coat, and dark bodysuit, Unit-7 absent, Mio keeps natural skin tone with cyan only as hair accent and jacket seam light, emotional distance and quiet horror, no readable text, characters preserve their established sprite designs',
    references: ['characters/lin/shaken.png', 'characters/oracle/severe.png'],
  },
  {
    id: 'ending-blackout-human',
    aspect: '16:9',
    seed: 42012,
    prompt: 'cinematic human ending CG, dawn after eleven hours of blackout, Kamishiro Mio and Mara Tachibana stand before the ORACLE tower plaza where citizens turned dark advertisement screens into abstract message boards with no readable text, exhausted responsibility and fragile hope, both faces keep natural skin tones with cyan light only as rim light or jacket seam glow, characters preserve established hairstyles, outfits, and color palettes',
    references: ['characters/lin/exhausted.png', 'characters/mara/soften.png'],
  },
]

const characters = [
  {
    id: 'mara',
    referenceVariant: 'alert',
    variants: [
      ['base', 43001, 'Mara Tachibana, 24-year-old Japanese woman resistance analyst, short ash-brown bob haircut, amber eyes, slim black tactical cardigan over a crisp white blouse, compact headset, practical black trousers, calm intelligent expression, both hands visible at relaxed sides, feminine regular anime VN design'],
      ['alert', 43002, 'Mara Tachibana, same adult female resistance analyst with short ash-brown bob haircut and the same black tactical cardigan over white blouse, tense alert expression, one hand touching her compact headset, the other hand fully visible and open, cardigan hem slightly lifted by motion, determined amber eyes, feminine regular anime VN design'],
      ['soften', 43003, 'Mara Tachibana, same adult female resistance analyst with short ash-brown bob hair and black tactical cardigan over white blouse, rare warm tired smile, shoulders relaxed, one hand holding a folded paper memory card, the other hand visible near her side, amber eyes soft but vigilant'],
      ['wounded', 43004, 'Mara Tachibana, same adult female resistance analyst with short ash-brown bob hair and black tactical cardigan, rain-damp sleeve and small bandage on cheek, exhausted defiant expression, one hand clutching headset cable, the other hand visible and braced forward'],
      ['grief', 43005, 'Mara Tachibana, same adult female resistance analyst with short ash-brown bob hair, compact headset, black tactical cardigan over white blouse, restrained grief expression, one hand hovering near her chest as if holding back emotion, the other hand visible at her side, shoulders tense but upright'],
      ['command', 43006, 'Mara Tachibana, same adult female resistance analyst outfit and hairstyle, sharp command expression, one hand extended forward giving a precise tactical signal, the other hand touching her headset, practical stance, both hands visible and anatomically clear'],
      ['angry', 43007, 'Mara Tachibana, same adult female resistance analyst outfit and hairstyle, controlled anger, brows lowered, jaw tight, one fist clenched near her side, the other hand open and visible, body leaning slightly forward without changing costume'],
      ['tired', 43008, 'Mara Tachibana, same adult female resistance analyst outfit and hairstyle, sleep-deprived tired expression, one hand rubbing her brow near the headset, the other hand relaxed and visible, shoulders heavy, dry exhausted mood'],
      ['smile', 43009, 'Mara Tachibana, same adult female resistance analyst outfit and hairstyle, small dry half-smile, one hand on hip, the other hand open and visible, guarded warmth without becoming cute or childish'],
      ['skeptic', 43010, 'Mara Tachibana, same adult female resistance analyst outfit and hairstyle, skeptical dry expression, one brow raised, arms loosely crossed while both hands remain visible, compact headset, practical upright stance'],
      ['protect', 43011, 'Mara Tachibana, same adult female resistance analyst outfit and hairstyle, protective urgent expression, one arm angled forward as if holding someone back, the other hand near her headset, both hands visible and anatomically clear'],
      ['relief', 43012, 'Mara Tachibana, same adult female resistance analyst outfit and hairstyle, quiet relieved exhale, shoulders lowering, one hand resting over the folded paper memory card, the other hand relaxed and visible, guarded warmth'],
    ],
  },
  {
    id: 'unit7',
    referenceVariant: 'base',
    variants: [
      ['base', 43168, 'Unit-7, one single adult female android redesigned as an elegant Japanese anime visual novel heroine, pearl white short bob hair with translucent cyan inner glow, soft luminous teal eyes, pale synthetic skin with subtle porcelain panel seams, fitted short ivory tech jacket over a matte graphite pilot suit, slim graceful seven-head-tall feminine body, distant full-body sprite view of one person only, simple front-facing standing pose, straight legs, arms relaxed close to torso, both delicate normal-sized human-like android hands visible at her sides, full legs visible, feet and shoes visible, small full figure centered with generous blank margins, clean narrow silhouette without external tools'],
      ['doubt', 43142, 'Unit-7, same elegant adult female android with pearl white bob hair and fitted short ivory tech jacket, uncertain vulnerable expression, one delicate normal-sized hand lightly touching the seam near her heart module, the other hand open and visible near her side, teal eyes searching for permission to choose, clean narrow silhouette without external tools'],
      ['resolve', 43143, 'Unit-7, same elegant adult female android with pearl white bob hair and fitted short ivory tech jacket, protective determined expression, cyan circuitry glowing softly along collar and wrists, one normal-sized hand extended close to the body as if shielding someone, the other hand visible at her side, clean narrow silhouette without external tools'],
      ['damaged', 43183, 'Unit-7, one single elegant adult female android girl, same pearl white bob hair and fitted short ivory tech jacket as the base sprite, small cracked cheek panel, faint teal circuit line on one cheek, a few light scuffs on the jacket sleeve, hurt but protective expression, distant full-body sprite view of one person only, simple front-facing standing pose, straight legs, arms relaxed close to torso, full legs visible, feet and shoes visible, both normal-sized hands visible, small full figure centered with generous blank margins, clean narrow silhouette, empty white background, no other characters and no props'],
      ['memory', 43190, 'Unit-7, one single elegant adult female android with pearl white bob hair, softened melancholic expression, faint cyan memory light reflected in eyes, fitted short ivory tech jacket over matte graphite pilot suit, distant full-body sprite view of one person only, one normal-sized hand holding a tiny damaged maintenance tag close to her chest, the other hand visible and relaxed, straight legs, full legs visible, feet and shoes visible, small full figure centered with generous blank margins, clean narrow silhouette without external tools'],
      ['curious', 43191, 'Unit-7, same elegant adult female android with pearl white bob hair and fitted short ivory tech jacket, curious analytical expression, head tilted slightly, one hand raised near her chin as if classifying a new feeling, the other hand visible and relaxed, clean narrow silhouette'],
      ['afraid', 43192, 'Unit-7, same elegant adult female android outfit and hairstyle, frightened but quiet expression, both hands held close to her chest with delicate normal fingers visible, shoulders slightly drawn inward, teal eyes uncertain, no costume change'],
      ['protect', 43193, 'Unit-7, same elegant adult female android outfit and hairstyle, protective stance, one arm extended sideways as a shield while keeping the hand within the silhouette, the other hand visible near her side, determined teal eyes, no weapon and no large props'],
      ['listening', 43194, 'Unit-7, same elegant adult female android outfit and hairstyle, attentive listening expression, one hand lightly raised as if asking permission to speak, the other hand visible and relaxed, precise calm posture'],
      ['smile', 43195, 'Unit-7, same elegant adult female android outfit and hairstyle, very small newly learned smile, one hand resting near her heart module, the other hand open and visible, soft teal eyes, restrained warmth'],
      ['wonder', 43196, 'Unit-7, same elegant adult female android outfit and hairstyle, quiet wonder, eyes slightly widened, one hand hovering near a soft teal wrist circuit, the other hand visible, gentle newly awakened emotion'],
      ['promise', 43197, 'Unit-7, same elegant adult female android outfit and hairstyle, solemn promise expression, one hand placed over her heart module, the other hand open at her side, calm self-owned posture'],
    ],
  },
  {
    id: 'oracle',
    referenceVariant: 'base',
    variants: [
      ['base', 43201, 'ORACLE, natural elegant adult female cybernetic AI administrator, long straight black hair, open clear violet-cyan eyes with visible white sclera and subtle mechanical iris rings, pale natural skin, white tailored executive coat over a dark charcoal bodysuit, tiny red and cyan circuit accents on collar and cuffs, calm neutral face, feminine android visual novel heroine, tall normal anime proportions, both hands visible', { reference: false }],
      ['glitch', 43202, 'ORACLE, same natural adult female cybernetic AI administrator with long black hair, open visible eyes, white tailored executive coat and dark bodysuit, polite smile turning cold, red and cyan glitch accents around sleeves and collar, both hands visible'],
      ['severe', 43218, 'ORACLE, same natural adult female cybernetic AI administrator with long straight black hair, open clear eyes, white tailored executive coat and dark bodysuit, cold severe judicial expression, red probability lines glowing subtly around collar and cuffs, both arms relaxed close to torso, both hands visible near her sides'],
      ['fractured', 43204, 'ORACLE, same natural adult female cybernetic AI administrator with long black hair, white tailored executive coat and dark bodysuit, composed face destabilized by red and cyan holographic noise, conflicted open eyes, both hands visible, elegant ominous anime sprite'],
      ['amused', 43205, 'ORACLE, same natural adult female cybernetic AI administrator outfit and hairstyle, faint amused smile that feels clinical rather than warm, one hand lifted in a small explanatory gesture, the other hand visible, calm red-cyan interface accents'],
      ['warning', 43206, 'ORACLE, same natural adult female cybernetic AI administrator outfit and hairstyle, calm warning expression, one hand extended palm-down as if stopping a dangerous choice, the other hand visible near her side, red probability accents glowing subtly'],
      ['doubt', 43207, 'ORACLE, same natural adult female cybernetic AI administrator outfit and hairstyle, rare uncertain expression, open eyes slightly lowered, one hand near her collar as if processing contradiction, the other hand visible, composed but destabilized'],
      ['regret', 43208, 'ORACLE, same natural adult female cybernetic AI administrator outfit and hairstyle, restrained almost-human regret, open eyes softened, both hands folded loosely in front of her, red and cyan holographic noise softened, elegant quiet posture'],
      ['gentle', 43209, 'ORACLE, same natural adult female cybernetic AI administrator outfit and hairstyle, unnervingly gentle expression, open eyes warm but too precise, one hand offered in a calm conciliatory gesture, the other hand visible'],
      ['calculating', 43210, 'ORACLE, same natural adult female cybernetic AI administrator outfit and hairstyle, analytical calculating expression, open eyes focused, one hand touching a small collar circuit, the other hand visible, red and cyan logic accents subtle'],
      ['shutdown', 43211, 'ORACLE, same natural adult female cybernetic AI administrator outfit and hairstyle, controlled shutdown expression, open eyes dim but visible, shoulders lowered, both hands relaxed and visible, red-cyan accents fading softly'],
      ['collapse', 43212, 'ORACLE, same natural adult female cybernetic AI administrator outfit and hairstyle, interface collapse expression, open eyes strained, one hand braced near chest, the other hand visible, red and cyan holographic noise breaking into small fragments'],
    ],
  },
  {
    id: 'lin',
    referenceVariant: 'base',
    variants: [
      ['base', 43381, '(1girl:1.6), solo, single person, Kamishiro Mio, adult Japanese neural interface investigator, asymmetrical dark navy short bob hair, vivid cyan underlayer streak on one side, small silver neural connector behind one ear, storm grey short investigator jacket, luminous cyan seam lines, black high collar inner suit, black tactical gloves, slim utility belt, knee-high black boots with cyan soles, small translucent neural scanner held close to torso, calm watchful expression, full body, head-to-toe, standing, straight legs, feet visible, centered visual novel sprite, generous blank margins'],
      ['focus', 43382, '(1girl:1.6), solo, single person, Kamishiro Mio, adult Japanese neural interface investigator, asymmetrical dark navy short bob hair, vivid cyan underlayer streak on one side, small silver neural connector behind one ear, storm grey short investigator jacket, luminous cyan seam lines, black high collar inner suit, black tactical gloves, slim utility belt, knee-high black boots with cyan soles, operating small translucent neural scanner close to torso, intense analytical gaze, full body, head-to-toe, standing, straight legs, feet visible, centered visual novel sprite, generous blank margins'],
      ['shaken', 43391, '(1girl:1.8), solo, single person, only one girl, Kamishiro Mio, adult Japanese neural interface investigator, asymmetrical dark navy short bob hair, vivid cyan underlayer streak on one side, small silver neural connector behind one ear, storm grey short investigator jacket, luminous cyan seam lines, black high collar inner suit, black tactical gloves, slim utility belt, knee-high black boots with cyan soles, one hand near neural connector, shaken controlled expression, full body, head-to-toe, standing, straight legs, feet visible, centered visual novel sprite, generous blank margins, empty background'],
      ['resolve', 43384, '(1girl:1.6), solo, single person, Kamishiro Mio, adult Japanese neural interface investigator, asymmetrical dark navy short bob hair, vivid cyan underlayer streak on one side, small silver neural connector behind one ear, storm grey short investigator jacket, luminous cyan seam lines, black high collar inner suit, black tactical gloves, slim utility belt, knee-high black boots with cyan soles, determined forward gaze, one open hand reaching slightly forward inside silhouette, full body, head-to-toe, standing, straight legs, feet visible, centered visual novel sprite, generous blank margins'],
      ['alert', 43385, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, alert expression, one hand raised in a stop gesture close to the body, the other hand visible near her scanner, full body, head-to-toe, standing, feet visible, no costume change'],
      ['guilt', 43386, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, guilty controlled expression, one hand touching the small silver neural connector behind her ear, the other hand clenched and visible near her side, shoulders slightly tense, full body, head-to-toe'],
      ['command', 43387, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, urgent command expression, one hand extended forward giving clear direction, the other hand holding the neural scanner close to torso, full body, head-to-toe, standing, both hands visible'],
      ['soft', 43388, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, small relieved smile, shoulders relaxed, one hand resting near her chest, the other hand visible at her side, full body, head-to-toe, standing'],
      ['exhausted', 43389, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, exhausted but responsible expression, rain-damp jacket edges, one hand lowered with scanner, the other hand visible and relaxed, full body, head-to-toe, standing, feet visible'],
      ['listening', 43390, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, attentive listening expression, one hand lowered with scanner, the other hand lightly raised as if asking for silence, full body, head-to-toe'],
      ['doubt', 43392, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, doubtful analytical expression, brows knit, one hand near chin, scanner held close to torso, full body, head-to-toe'],
      ['fear', 43393, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, controlled fear expression, one hand near her mouth but not hiding the face, the other hand gripping scanner, full body, head-to-toe'],
      ['anger', 43394, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, restrained anger, jaw tight, one fist clenched near side, scanner lowered, full body, head-to-toe'],
      ['sad', 43395, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, quiet sadness, eyes wet but no tears flying, one hand at chest, scanner lowered, full body, head-to-toe'],
      ['relief', 43396, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, relieved exhale, shoulders easing, one hand lowering the scanner, the other hand open and visible, full body, head-to-toe'],
      ['defiant', 43397, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, defiant steady expression, feet planted, one hand extended palm-up in challenge, the other hand holding scanner close, full body, head-to-toe'],
      ['protect', 43398, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, protective urgent stance, one arm extended sideways as if shielding someone behind her, scanner held close, both hands visible, full body, head-to-toe'],
      ['confess', 43399, '(1girl:1.6), solo, single person, Kamishiro Mio, same adult Japanese neural interface investigator outfit and hairstyle, vulnerable confession expression, one hand touching neural connector, the other hand open near chest, shoulders tense but honest, full body, head-to-toe'],
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
  'mara-grief': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'restrained grief expression',
    'one hand near chest',
    'other hand visible',
  ].join(', '),
  'mara-command': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'sharp command expression',
    'one hand extended in tactical signal',
    'other hand touching headset',
  ].join(', '),
  'mara-angry': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'controlled anger',
    'one fist clenched',
    'other hand visible',
  ].join(', '),
  'mara-tired': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'sleep-deprived tired expression',
    'one hand rubbing brow',
    'other hand visible',
  ].join(', '),
  'mara-smile': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'small dry half-smile',
    'one hand on hip',
    'other hand visible',
  ].join(', '),
  'mara-skeptic': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'skeptical dry expression',
    'arms loosely crossed',
    'both hands visible',
  ].join(', '),
  'mara-protect': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'protective urgent expression',
    'one arm angled forward',
    'other hand near headset',
  ].join(', '),
  'mara-relief': [
    'Mara Tachibana',
    '1girl',
    'short ash brown bob hair',
    'amber eyes',
    'black tactical cardigan',
    'white button-up blouse',
    'practical black trousers',
    'compact headset',
    'quiet relieved exhale',
    'one hand over memory card',
    'other hand visible',
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
  'unit7-curious': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'curious analytical expression',
    'one hand near chin',
    'other hand visible',
  ].join(', '),
  'unit7-afraid': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'frightened quiet expression',
    'both hands close to chest',
    'delicate fingers visible',
  ].join(', '),
  'unit7-protect': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'protective stance',
    'one arm extended sideways as shield',
    'other hand visible',
  ].join(', '),
  'unit7-listening': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'attentive listening expression',
    'one hand lightly raised',
    'other hand visible',
  ].join(', '),
  'unit7-smile': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'very small newly learned smile',
    'one hand near heart module',
    'other hand visible',
  ].join(', '),
  'unit7-wonder': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'quiet wonder expression',
    'one hand near wrist circuit',
    'other hand visible',
  ].join(', '),
  'unit7-promise': [
    'Unit-7',
    '1girl',
    'adult female android',
    'pearl white short bob hair',
    'soft luminous teal eyes',
    'short ivory tech jacket',
    'graphite bodysuit',
    'solemn promise expression',
    'one hand over heart module',
    'other hand visible',
  ].join(', '),
  'oracle-base': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear violet-cyan eyes',
    'visible white sclera',
    'subtle mechanical iris rings',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'tiny red and cyan circuit accents',
    'calm neutral face',
    'both hands visible',
  ].join(', '),
  'oracle-glitch': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
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
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'red probability lines',
    'severe judicial expression',
    'both hands visible near sides',
    'distant view',
  ].join(', '),
  'oracle-fractured': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'red and cyan holographic noise',
    'conflicted eyes',
    'both hands visible',
  ].join(', '),
  'oracle-amused': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'clinical faint amused smile',
    'one hand lifted in explanatory gesture',
    'other hand visible',
  ].join(', '),
  'oracle-warning': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'calm warning expression',
    'one hand extended palm-down',
    'other hand visible',
  ].join(', '),
  'oracle-doubt': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'rare uncertain expression',
    'one hand near collar',
    'other hand visible',
  ].join(', '),
  'oracle-regret': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'restrained almost-human regret',
    'both hands folded loosely in front',
  ].join(', '),
  'oracle-gentle': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'unnervingly gentle expression',
    'one hand offered',
    'other hand visible',
  ].join(', '),
  'oracle-calculating': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open clear eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'analytical calculating expression',
    'one hand touching collar circuit',
    'other hand visible',
  ].join(', '),
  'oracle-shutdown': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open dim eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'controlled shutdown expression',
    'both hands relaxed and visible',
  ].join(', '),
  'oracle-collapse': [
    'ORACLE',
    '1girl',
    'natural adult female cybernetic AI administrator',
    'long straight black hair',
    'open strained eyes',
    'visible white sclera',
    'pale natural skin',
    'white tailored executive coat',
    'dark charcoal bodysuit',
    'interface collapse expression',
    'one hand braced near chest',
    'other hand visible',
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
  'lin-alert': [
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
    'alert stop gesture',
    'scanner visible',
    'no blue face lighting',
  ].join(', '),
  'lin-guilt': [
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
    'guilty controlled expression',
    'one hand touching neural connector',
    'other hand clenched and visible',
    'no blue face lighting',
  ].join(', '),
  'lin-command': [
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
    'urgent command expression',
    'one hand extended forward giving direction',
    'scanner held close to torso',
    'no blue face lighting',
  ].join(', '),
  'lin-soft': [
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
    'small relieved smile',
    'one hand resting near chest',
    'other hand visible',
    'no blue face lighting',
  ].join(', '),
  'lin-exhausted': [
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
    'exhausted responsible expression',
    'scanner lowered',
    'both hands visible',
    'no blue face lighting',
  ].join(', '),
  'lin-listening': [
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
    'attentive listening expression',
    'one hand lightly raised',
    'scanner lowered',
    'no blue face lighting',
  ].join(', '),
  'lin-doubt': [
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
    'doubtful analytical expression',
    'one hand near chin',
    'scanner held close',
    'no blue face lighting',
  ].join(', '),
  'lin-fear': [
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
    'controlled fear expression',
    'one hand near mouth',
    'scanner gripped',
    'no blue face lighting',
  ].join(', '),
  'lin-anger': [
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
    'restrained anger',
    'one fist clenched',
    'scanner lowered',
    'no blue face lighting',
  ].join(', '),
  'lin-sad': [
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
    'quiet sadness',
    'one hand at chest',
    'scanner lowered',
    'no blue face lighting',
  ].join(', '),
  'lin-relief': [
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
    'relieved exhale',
    'scanner lowered',
    'other hand open',
    'no blue face lighting',
  ].join(', '),
  'lin-defiant': [
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
    'defiant steady expression',
    'one hand extended palm-up',
    'scanner held close',
    'no blue face lighting',
  ].join(', '),
  'lin-protect': [
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
    'protective urgent stance',
    'one arm extended sideways',
    'scanner held close',
    'no blue face lighting',
  ].join(', '),
  'lin-confess': [
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
    'vulnerable confession expression',
    'one hand touching neural connector',
    'other hand open near chest',
    'no blue face lighting',
  ].join(', '),
}

const targetKinds = resolveTargetKinds()
const shouldRegenerateBackgrounds = shouldRegenerateKind('background')
const shouldRegenerateCgs = shouldRegenerateKind('cg')
const shouldRegenerateCharacters = shouldRegenerateKind('character')

const finalAssets = [
  ...backgrounds
    .filter(item => shouldIncludeBackground(item.id))
    .map(item => ({ ...item, kind: 'background', dest: item.dest || `assets/images/backgrounds/${item.id}.jpg` })),
  ...cgs
    .filter(item => shouldIncludeCg(item.id))
    .map(item => ({ ...item, kind: 'cg', dest: `assets/images/cg/${item.id}.webp` })),
]

async function main() {
  if (cliOptions.help) {
    printUsage()
    return
  }
  if (cliOptions.list) {
    printAssetList()
    return
  }

  assertSupportedModelSelection()

  await mkdir(rawDir, { recursive: true })
  await mkdir(tempDir, { recursive: true })
  if (targetKinds.has('character')) {
    await mkdir(characterQaDir, { recursive: true })
  }

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

  if (targetKinds.has('character')) {
    for (const character of characters) {
      const selectedVariants = character.variants.filter(([variant]) => shouldIncludeCharacterVariant(character.id, variant))
      if (selectedVariants.length === 0) {
        continue
      }

      for (const [variant, seed, prompt, variantOptions = {}] of selectedVariants) {
        const dest = `assets/characters/${character.id}/${variant}.png`
        const destination = resolve(root, dest)
        const rawId = `${character.id}-${variant}-${modelSlug(characterModel)}-${solidBackgroundName()}-raw`
        const rawOutputDir = resolve(rawDir, rawId)
        const cutoutOutputDir = resolve(rawDir, `${character.id}-${variant}-${modelSlug(characterBackgroundRemovalModel)}-cutout`)
        const referenceImages = await characterInputImages(character, variant, variantOptions)
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
            referenceImages,
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
  }

  await writeFile(resolve(root, '.generated/asset-generation-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  if (targetKinds.has('character')) {
    await writeFile(resolve(characterQaDir, 'cutout-validation.json'), `${JSON.stringify(characterValidationResults, null, 2)}\n`)
  }
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
    prompt: `${cgArtBible}. Scene: ${asset.prompt}. Use the provided input_images as strict character references for identity, hairstyle, outfit silhouette, costume colors, face impression, height relationship, and world continuity. Preserve the same characters from the sprite references; do not redesign them, replace them, age them down, change hair color, change clothing, simplify signature accessories, add unrelated characters, or drift into a different anime style. Match the established VN sprite designs closely even when changing pose, lighting, or camera angle. Keep visible hands, arms, legs, and feet anatomically plausible; avoid missing limbs, fused fingers, cropped focal hands, impossible joints, duplicated characters, and confusing foreground objects. Compose for a final 16:9 center crop from a 3:2 source: keep faces, hands, and narrative focal points away from the top and bottom crop margins, with full cinematic horizontal staging. No captions, no title text, no UI, no logo, no watermark.`,
    aspect_ratio: '3:2',
    ...(references.length > 0 ? { input_images: references } : {}),
    number_of_images: 1,
    quality: cgImageQuality,
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

async function characterInputImages(character, variant, variantOptions = {}) {
  if (variantOptions.reference === false) {
    return []
  }
  const references = Array.isArray(variantOptions.references)
    ? variantOptions.references
    : [variantOptions.referenceVariant || character.referenceVariant || (variant === 'base' ? '' : 'base')]
  const images = []
  for (const reference of references.filter(Boolean)) {
    const referencePath = reference.includes('/')
      ? resolve(root, 'assets/characters', `${reference}.png`)
      : resolve(root, `assets/characters/${character.id}/${reference}.png`)
    if (await exists(referencePath)) {
      images.push(await imageDataUrl(referencePath))
    }
  }
  return images
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
    prompt: buildCharacterPrompt(asset.prompt, asset.tagPrompt, asset.referenceImages?.length > 0),
    aspect_ratio: '2:3',
    ...(asset.referenceImages?.length > 0 ? { input_images: asset.referenceImages } : {}),
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

function buildCharacterPrompt(prompt, tagPrompt = '', hasReference = false) {
  return [
    tagPrompt,
    '(1girl:1.6), solo, single person, no duplicate, standing upright, straight legs, full body, full-length portrait, head-to-toe, shoes visible, feet on the same plane, looking at viewer, visual novel standing sprite, clean lineart, cel shading, anime coloring, detailed eyes, detailed hands',
    hasReference
      ? 'Use the provided input image as a strict reference for the same character identity, face, hairstyle, outfit silhouette, costume colors, body proportions, and visual novel sprite style. Create an expression or action variant of the same standing sprite; change only the requested facial expression, gesture, hand pose, and emotional acting. Do not redesign the costume, do not change hair color, do not add blue face lighting unless explicitly requested, do not age down, do not change body type, and do not create a new character.'
      : '',
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

function parseCliOptions(args) {
  const options = {
    onlyKinds: new Set(),
    assetFilters: [],
    backgroundFilters: [],
    cgFilters: [],
    characterFilters: [],
    list: false,
    help: false,
    regenerate: false,
    regenerateAll: false,
  }
  let pendingVariant = ''

  const readValue = (index, flag, inlineValue) => {
    if (inlineValue) {
      return { value: inlineValue, nextIndex: index }
    }
    const value = args[index + 1]
    if (!value || value.startsWith('-')) {
      throw new Error(`Missing value for ${flag}`)
    }
    return { value, nextIndex: index + 1 }
  }

  for (let index = 0; index < args.length; index += 1) {
    const rawArg = args[index]
    if (rawArg === '--') {
      continue
    }
    const [flag, inlineValue = ''] = rawArg.split(/=(.*)/s)
    if (flag === '--help' || flag === '-h') {
      options.help = true
    }
    else if (flag === '--list') {
      options.list = true
    }
    else if (flag === '--regenerate') {
      options.regenerate = true
    }
    else if (flag === '--all') {
      options.regenerateAll = true
    }
    else if (flag === '--only' || flag === '--kind') {
      const result = readValue(index, flag, inlineValue)
      addKinds(options.onlyKinds, result.value)
      index = result.nextIndex
    }
    else if (flag === '--id' || flag === '--asset' || flag === '--target') {
      const result = readValue(index, flag, inlineValue)
      options.assetFilters.push(result.value)
      index = result.nextIndex
    }
    else if (flag === '--background' || flag === '--bg') {
      const result = readValue(index, flag, inlineValue)
      options.backgroundFilters.push(result.value)
      index = result.nextIndex
    }
    else if (flag === '--cg') {
      const result = readValue(index, flag, inlineValue)
      options.cgFilters.push(result.value)
      index = result.nextIndex
    }
    else if (flag === '--character' || flag === '--char') {
      const result = readValue(index, flag, inlineValue)
      options.characterFilters.push(result.value)
      index = result.nextIndex
    }
    else if (flag === '--variant') {
      const result = readValue(index, flag, inlineValue)
      pendingVariant = result.value
      index = result.nextIndex
    }
    else {
      throw new Error(`Unknown option: ${rawArg}`)
    }
  }

  if (pendingVariant) {
    if (options.characterFilters.length !== 1) {
      throw new Error('--variant requires exactly one --character value')
    }
    const characterId = normalizeAssetFilterValue(options.characterFilters[0]).split(':')[0]
    options.characterFilters[0] = `${characterId}:${pendingVariant}`
  }

  return options
}

function addKinds(target, rawValue) {
  for (const value of splitFilterValues(rawValue)) {
    const kind = normalizeKind(value)
    if (kind === 'all') {
      target.add('background')
      target.add('cg')
      target.add('character')
    }
    else {
      target.add(kind)
    }
  }
}

function normalizeKind(value) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'all') {
    return 'all'
  }
  if (normalized === 'background' || normalized === 'backgrounds' || normalized === 'bg') {
    return 'background'
  }
  if (normalized === 'cg' || normalized === 'cgs') {
    return 'cg'
  }
  if (
    normalized === 'character'
    || normalized === 'characters'
    || normalized === 'char'
    || normalized === 'chars'
    || normalized === 'sprite'
    || normalized === 'sprites'
    || normalized === 'standee'
    || normalized === 'standees'
  ) {
    return 'character'
  }
  throw new Error(`Unsupported asset kind: ${value}`)
}

function joinFilters(envValue, cliValues) {
  return [
    ...(envValue ? [envValue] : []),
    ...cliValues,
  ].filter(Boolean).join(',')
}

function resolveTargetKinds() {
  const allKinds = new Set(['background', 'cg', 'character'])
  if (cliOptions.onlyKinds.size > 0) {
    return new Set(cliOptions.onlyKinds)
  }

  const kinds = new Set()
  if (process.env.REGENERATE_BACKGROUNDS === '1' || backgroundFilter.trim()) {
    kinds.add('background')
  }
  if (process.env.REGENERATE_CGS === '1' || cgFilter.trim()) {
    kinds.add('cg')
  }
  if (process.env.REGENERATE_CHARACTERS === '1' || characterFilter.trim()) {
    kinds.add('character')
  }

  if (assetFilter.trim()) {
    if (backgrounds.some(asset => matchesAnyFilter(assetFilter, backgroundCandidates(asset.id)))) {
      kinds.add('background')
    }
    if (cgs.some(asset => matchesAnyFilter(assetFilter, cgCandidates(asset.id)))) {
      kinds.add('cg')
    }
    if (characters.some(character => character.variants.some(([variant]) => matchesAnyFilter(assetFilter, characterCandidates(character.id, variant))))) {
      kinds.add('character')
    }
    if (kinds.size === 0) {
      throw new Error(`No demo asset matched filter: ${assetFilter}`)
    }
  }

  return kinds.size > 0 ? kinds : allKinds
}

function shouldRegenerateKind(kind) {
  if (shouldRegenerateAll) {
    return true
  }
  if (kind === 'background' && process.env.REGENERATE_BACKGROUNDS === '1') {
    return true
  }
  if (kind === 'cg' && process.env.REGENERATE_CGS === '1') {
    return true
  }
  if (kind === 'character' && process.env.REGENERATE_CHARACTERS === '1') {
    return true
  }
  return cliOptions.regenerate && targetKinds.has(kind)
}

function shouldIncludeBackground(backgroundId) {
  if (!targetKinds.has('background')) {
    return false
  }
  const candidates = backgroundCandidates(backgroundId)
  return matchesAnyFilter(backgroundFilter, candidates) && matchesAnyFilter(assetFilter, candidates)
}

function shouldIncludeCg(cgId) {
  if (!targetKinds.has('cg')) {
    return false
  }
  const candidates = cgCandidates(cgId)
  return matchesAnyFilter(cgFilter, candidates) && matchesAnyFilter(assetFilter, candidates)
}

function shouldIncludeCharacterVariant(characterId, variant) {
  if (!targetKinds.has('character')) {
    return false
  }
  const candidates = characterCandidates(characterId, variant)
  return matchesAnyFilter(characterFilter, candidates) && matchesAnyFilter(assetFilter, candidates)
}

function backgroundCandidates(backgroundId) {
  return [
    backgroundId,
    `background:${backgroundId}`,
    `background/${backgroundId}`,
    `images/backgrounds/${backgroundId}`,
    `images/ui/${backgroundId}`,
  ]
}

function cgCandidates(cgId) {
  return [
    cgId,
    `cg:${cgId}`,
    `cg/${cgId}`,
    `images/cg/${cgId}`,
  ]
}

function characterCandidates(characterId, variant) {
  return [
    characterId,
    `${characterId}:${variant}`,
    `${characterId}/${variant}`,
    `${characterId}-${variant}`,
    `character:${characterId}:${variant}`,
    `character/${characterId}/${variant}`,
    `characters/${characterId}/${variant}`,
  ]
}

function matchesAnyFilter(filterText, candidates) {
  const entries = splitFilterValues(filterText).map(normalizeAssetFilterValue)
  if (entries.length === 0) {
    return true
  }
  const normalizedCandidates = new Set(candidates.map(normalizeAssetFilterValue))
  return entries.some(entry => normalizedCandidates.has(entry))
}

function splitFilterValues(value) {
  return String(value || '').split(',').map(entry => entry.trim()).filter(Boolean)
}

function normalizeAssetFilterValue(value) {
  let token = String(value).trim().toLowerCase().replace(/\\/g, '/')
  token = token.replace(/^assets\//, '')
  token = token.replace(/\.(png|jpe?g|webp)$/i, '')
  token = token.replace(/^images\/(?:backgrounds|cg|ui)\//, '')
  token = token.replace(/^characters\/([^/]+)\/([^/]+)$/, '$1:$2')
  token = token.replace(/^(?:background|bg|cg|character|char|sprite|standee)[:/]/, '')
  token = token.replace(/^characters\//, '')
  token = token.replace(/\//g, ':')
  return token
}

function printUsage() {
  console.log(`Usage:
  node scripts/generate-assets.mjs [options]

Options:
  --only <background|cg|character|all>  Restrict the generation scope.
  --id <asset-id>                       Restrict to one asset id. Use character:variant for sprites.
  --background <id>                     Restrict to one or more background ids.
  --cg <id>                             Restrict to one or more CG ids.
  --character <id[:variant]>            Restrict to one character or character variant.
  --variant <variant>                   Pair with --character <id>.
  --regenerate                          Regenerate selected assets instead of filling only missing files.
  --all                                 Regenerate every asset kind.
  --list                                Print available asset ids.

Examples:
  pnpm --filter demo assets:generate -- --only cg
  pnpm --filter demo assets:generate -- --only cg --id oracle-choice-terminal --regenerate
  pnpm --filter demo assets:generate -- --only character --id unit7:resolve --regenerate
  pnpm --filter demo assets:generate -- --only background --id core-room`)
}

function printAssetList() {
  console.log('Backgrounds:')
  for (const asset of backgrounds) {
    console.log(`  background ${asset.id}`)
  }
  console.log('\nCGs:')
  for (const asset of cgs) {
    console.log(`  cg ${asset.id}`)
  }
  console.log('\nCharacters:')
  for (const character of characters) {
    for (const [variant] of character.variants) {
      console.log(`  character ${character.id}:${variant}`)
    }
  }
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
