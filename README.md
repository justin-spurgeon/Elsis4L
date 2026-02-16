# Elsis4L

L-System MIDI clip generator for Max for Live. Generates notes in the currently selected MIDI clip from an L-system string and a turtle DSL.

See [INSTRUCTIONS.md](INSTRUCTIONS.md) for the full specification (arguments, logic flow, and DSL operations).

## Usage

1. Create a Max for Live device that includes a `js` object loading this script (e.g. `js Elsis.js`).
2. Select a MIDI clip in Live (Session or Arrangement) so it has focus in the clip detail view.
3. Send a **list** of 5 elements to the `js` object:
   - **axiom** (string) – starting L-system string, e.g. `"A"`
   - **productions** (string) – JSON object of production rules, e.g. `"{\"A\":\"AB\",\"B\":\"A\"}"`
   - **transformations** (string) – JSON object mapping each L-system character to a DSL string, e.g. `"{\"F\":\"w s0.25 w\",\"A\":\"p2 w\"}"`
   - **generations** (number) – number of L-system generations, e.g. `4`
   - **overwrite** (number) – `1` to clear the clip before writing, `0` to append

Example (from a Max message box or `prepend list`):
```
list A {"A":"AB","B":"A"} {"A":"w s0.25 w","B":"p2 w"} 4 1
```

The script uses the LiveAPI to resolve the **currently selected clip** (`live_set view selected_clip_slot`). All times and durations are in **beats**.
