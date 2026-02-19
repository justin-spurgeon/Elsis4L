// Elsis4L: L-System MIDI clip generator for Max for Live
// INSTRUCTIONS.md defines the full spec.

var MAX_LSYSTEM_LENGTH = 1000;

/**
 * Expand L-system string from axiom using productions for N generations.
 * Stops if length would exceed maxLen; returns last string with length <= maxLen.
 */
function expandLSystem(axiom, productions, generations, maxLen) {
  var s = axiom;
  var gen = 0;
  while (gen < generations) {
    var next = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      next += (productions[c] !== undefined) ? productions[c] : c;
      if (next.length > maxLen) {
        return s;
      }
    }
    s = next;
    gen++;
  }
  return s;
}

/**
 * Parse a numeric argument: integer, float, or fraction like "1/16".
 */
function parseArg(str) {
  if (str === undefined || str === "") return 0;
  str = str.trim();
  var slash = str.indexOf("/");
  if (slash >= 0) {
    var num = parseFloat(str.substring(0, slash));
    var den = parseFloat(str.substring(slash + 1));
    return den != 0 ? num / den : 0;
  }
  return parseFloat(str);
}

/**
 * Remove leading "text" prefix from string arguments (Max list format).
 */
function stripTextPrefix(val) {
  var s = String(val);
  return (s.indexOf("text") === 0) ? s.substring(4) : s;
}

/**
 * Wrap value into inclusive [0, 127] for MIDI.
 */
function wrapMidi(v) {
  v = Math.round(v);
  v = v % 128;
  if (v < 0) v += 128;
  return v > 127 ? 0 : v;
}

/**
 * Wrap value into inclusive [0, clipLength] for time.
 */
function wrapTime(v, clipLength) {
  if (v >= 0 && v <= clipLength) return v;
  v = v % (clipLength + 1);
  if (v < 0) v += (clipLength + 1);
  return v > clipLength ? 0 : v;
}

/**
 * Turtle state: pitch, duration, velocity, release_velocity, start_time.
 */
function makeTurtle() {
  return {
    pitch: 24,
    duration: 0.25,
    velocity: 100,
    release_velocity: 100,
    start_time: 0
  };
}

/**
 * Parse DSL string into tokens: "w" or "op" or "opArg" (e.g. "p12", "d-1/16").
 * Tokens are space-separated; leading/trailing spaces ignored.
 */
function tokenizeDSL(str) {
  var tokens = [];
  var t = str.trim().split(/\s+/);
  for (var i = 0; i < t.length; i++) {
    var s = t[i];
    if (!s) continue;
    if (s === "w") {
      tokens.push({ op: "w", arg: null });
      continue;
    }
    var match = s.match(/^(p|px|v|vx|r|rx|d|dx|s|sx)(-?[\d./]+)?$/);
    if (match) {
      tokens.push({ op: match[1], arg: match[2] ? parseArg(match[2]) : 0 });
    }
  }
  return tokens;
}

/**
 * Apply one DSL token to the turtle; optionally write to clip via clipApi.
 * clipApi: LiveAPI clip object; clipLength: number (beats).
 */
function applyToken(turtle, token, clipLength, clipApi, notes) {
  var op = token.op;
  var arg = token.arg;
  if (op === "w") {
    if (clipApi) {
      notes.push({
        pitch: turtle.pitch,
        start_time: turtle.start_time,
        duration: turtle.duration,
        velocity: turtle.velocity,
        release_velocity: turtle.release_velocity
      });
    }
    return;
  }
  if (op === "p") {
    turtle.pitch = wrapMidi(turtle.pitch + arg);
    return;
  }
  if (op === "px") {
    turtle.pitch = wrapMidi(turtle.pitch * arg);
    return;
  }
  if (op === "v") {
    turtle.velocity = wrapMidi(turtle.velocity + arg);
    return;
  }
  if (op === "vx") {
    turtle.velocity = wrapMidi(turtle.velocity * arg);
    return;
  }
  if (op === "r") {
    turtle.release_velocity = wrapMidi(turtle.release_velocity + arg);
    return;
  }
  if (op === "rx") {
    turtle.release_velocity = wrapMidi(turtle.release_velocity * arg);
    return;
  }
  if (op === "d") {
    turtle.duration = wrapTime(turtle.duration + arg, clipLength);
    return;
  }
  if (op === "dx") {
    turtle.duration = wrapTime(turtle.duration * arg, clipLength);
    return;
  }
  if (op === "s") {
    turtle.start_time = wrapTime(turtle.start_time + arg, clipLength);
    return;
  }
  if (op === "sx") {
    turtle.start_time = wrapTime(turtle.start_time * arg, clipLength);
    return;
  }
}

/**
 * Run a DSL pipeline (left to right) on the turtle.
 */
function runDSL(turtle, dslString, clipLength, clipApi, notes) {
  var tokens = tokenizeDSL(dslString);
  for (var i = 0; i < tokens.length; i++) {
    applyToken(turtle, tokens[i], clipLength, clipApi, notes);
  }
}

/**
 * Get the currently selected clip via LiveAPI.
 * Returns { clip: LiveAPI, length: number } or null if no clip selected / not MIDI.
 */
function getSelectedClip() {
  var slotApi = new LiveAPI("live_set tracks 0 clip_slots 0");
  var clipPath = slotApi.unquotedpath + " clip";
  var clip = new LiveAPI(clipPath);
  if (clip.get("is_midi_clip") != 1) return null;
  var length = parseFloat(clip.get("length"));
  return { clip: clip, length: length };
}

/**
 * Main entry: run the L-System MIDI generator.
 * axiom: string
 * productionsJson: JSON string e.g. '{"A":"AB","B":"A"}'
 * transformationsJson: JSON string e.g. '{"F":"w s0.25 w","A":"p2 w"}'
 * generations: number
 * overwrite: boolean (true = clear clip before writing)
 */
function run(axiom, productionsJson, transformationsJson, generations, overwrite) {
  var clipInfo = getSelectedClip();

  if (!clipInfo) {
    post("Elsis4L: No selected MIDI clip.\n");
    return;
  }
  var clip = clipInfo.clip;
  var clipLength = clipInfo.length;

  if (overwrite) {
    clip.call("remove_notes_extended", 0, 128, 0, clipLength);
  }

  var productions = {};
  try {
    productions = JSON.parse(productionsJson);
  } catch (e) {
    post("Elsis4L: Invalid productions JSON.\n");
    post("Error: " + e + "\n");
    return;
  }

  var transformations = {};
  try {
    transformations = JSON.parse(transformationsJson);
  } catch (e) {
    post("Elsis4L: Invalid transformations JSON.\n");
    post("Error: " + e + "\n");
    return;
  }

  var lstring = expandLSystem(axiom, productions, generations, MAX_LSYSTEM_LENGTH);
  var turtle = makeTurtle();
  var notes = [];

  for (var i = 0; i < lstring.length; i++) {
    var c = lstring.charAt(i);
    var dsl = transformations[c];
    if (dsl === undefined) continue;
    if (typeof dsl !== "string") dsl = String(dsl);
    runDSL(turtle, dsl, clipLength, clip, notes);
  }

  clip.call("add_new_notes", { notes: notes });
  post("\nNotes added: " + notes.length);
}

// Max js: respond to list with (axiom, productions, transformations, generations, overwrite)
function list() {
  var a = arrayfromargs(arguments);
  if (a.length >= 5) {
    run(
      stripTextPrefix(a[0]),
      stripTextPrefix(a[1]),
      stripTextPrefix(a[2]),
      parseInt(a[3], 10) || 0,
      a[4] ? true : false
    );
  } else {
    post("Elsis4L: need 5 args: axiom, productions, transformations, generations, overwrite\n");
  }
}

// Allow external call with named args (e.g. from another script or v8)
function bang() {
  // No args from bang; could use autovar or stored state. For now require list.
  post("Elsis4L: send a list: axiom productions transformations generations overwrite\n");
}
