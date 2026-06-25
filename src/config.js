import RUNE_DATA from "../config/config.json";

export const CANVAS_WIDTH = 500;
export const CANVAS_HEIGHT = 500;

export const STROKE_COLOR = "#000000";
export const STROKE_WIDTH = 2;
export const ERASER_WIDTH = 20;

export const RUNES_PATH = "/assets/alphabet/modifiers";
export const SIGNS_PATH = "/assets/alphabet/signs";

export const RUNE_NAMES = [
  "Aeriforms_Defined",
  "Bend",
  "Billowing",
  "Binding",
  "Bolt",
  "Coil_Sign",
  "Collection",
  "Column",
  "Convergence",
  "Cooling",
  "Crosshair",
  "Crush",
  "Dancing_Puppet",
  "Diamond",
  "Direction",
  "Dispersion",
  "Enlarge",
  "Entwine",
  "Float",
  "Gather",
  "Glaives",
  "Levitation",
  "Link_Sign",
  "Orb",
  "Pull",
  "Purify_Sign",
  "Radial",
  "Rain",
  "Repetition",
  "Sign_of_concealment_redraw",
  "Sign_of_projection_redraw",
  "Sign_of_reflection_redraw",
  "Sign_of_Wind",
  "Solidify",
  "Stasis_Sign",
  "Weave",
  "Window",
];

export const RUNE_COUNT = RUNE_NAMES.length;

export const SIGN_NAMES = [
  "Aeriforms_(Wind)",
  "Bird",
  "Bird_B_Sign",
  "Dragon_Sign",
  "Earth",
  "Fire_sigil",
  "Flower_Sigil",
  "Frillram_Sigil",
  "Horse_Sign",
  "Ice_Sigil",
  "Light",
  "Liongoat_Sigil_Redraw",
  "Owlcat_Sigil_Full",
  "Owlcat_Sign",
  "Repetition",
  "Scalewolf_Sign",
  "Smoke_Sigil",
  "Sword_Sigil",
  "Time_Stop_Redraw",
  "Torchstag_Sign",
  "Unburning_flame_sigil",
  "Valance_Leech_Sign",
  "Water",
  "Whorling_Winds",
  "Wind_(redirect)",
  "Wind_Underfoot",
];

export const SIGN_COUNT = SIGN_NAMES.length;

// Aktivierte Einträge (disabled === false) aus config/config.json, nach Dateiname
// gruppiert. type "sign" gehört zum modifiers-Ordner (Runen, rechts),
// type "sigil" zum signs-Ordner (Zeichen, links). Der Anzeigename kommt aus
// dem config-Feld `name`, nicht mehr aus dem Dateinamen.
const labelByBasename = (type) =>
  new Map(
    RUNE_DATA.filter((entry) => entry.type === type && entry.disabled === false).map(
      (entry) => [entry.image_filename.replace(/\.[^.]+$/, ""), entry.name]
    )
  );

const SIGN_LABELS = labelByBasename("sign");
const SIGIL_LABELS = labelByBasename("sigil");

// Nur in der UI angezeigte Listen: gefiltert auf aktivierte Einträge.
// file = Bild-Basisname (zum Laden), label = Anzeigename aus config.
export const ENABLED_RUNES = RUNE_NAMES.filter((file) => SIGN_LABELS.has(file)).map(
  (file) => ({ file, label: SIGN_LABELS.get(file) })
);
export const ENABLED_SIGNS = SIGN_NAMES.filter((file) => SIGIL_LABELS.has(file)).map(
  (file) => ({ file, label: SIGIL_LABELS.get(file) })
);

// Working resolution for the iterative scan. The canvas is downscaled to this
// square size before convolution so conv2d intermediate textures stay under the
// WebGL maximum texture size (16384) for the largest templates. Must be <= 350.
export const DETECTION_RESOLUTION = 250

// Stroke dilation radius (in working-resolution pixels) applied to both the
// drawing and each template before correlation. Thin runes only overlap when
// aligned almost perfectly; thickening the strokes gives tolerance to small
// scale/rotation/position offsets so the correct template still matches.
export const DILATION_RADIUS = 2

// White margin padded around each rasterized template, as a multiple of the
// glyph's rotated bounding box. The scoring penalty spans this padded box, so
// drawn ink that spills into a template's margin (i.e. the template only covers
// a fragment of a larger drawn glyph) is penalized — while genuinely isolated
// runes keep clean margins and still score high. This is what lets multi-rune
// detection reject fragment matches.
// NOTE: the padded template must fit the working canvas for the 'valid' conv,
// i.e. max(ITERATIVE_SIZES) * √2 * TEMPLATE_MARGIN_FACTOR <= CANVAS_WIDTH.
// With a 256px max size this caps the factor at ~1.38.
export const TEMPLATE_MARGIN_FACTOR = 1.3

// How many rotations to score in a single batched convolution. Each rune size's
// 72 rotations are processed in sequential sub-batches of this many channels,
// so the peak GPU tensor (coverage map: [1, oH, oW, batch]) stays small and
// textures are released between sub-batches.
export const ROTATION_BATCH_SIZE = 24

export const ITERATIVE_SIZES = [32, 48, 64, 96, 128, 192, 256]
export const ITERATIVE_ROTATIONS = Array.from({ length: 36 }, (_, i) => i * 10)
// Minimum IoU (intersection-over-union) for a template to count as a finding.
// IoU runs lower than the old coverage score — a near-perfect match is ~0.8,
// so this is set below that to admit imperfect freehand drawings.
export const MATCH_THRESHOLD = 0.5
export const NMS_RELATIVE = 0.5
