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
