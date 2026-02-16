INSTRUCTIONS.md

## Intro
This repository is for a Max4Live tool that will generate a MIDI clip using an L-System and the LiveAPI. 

## Argument Descriptions
This L-System MIDI tool takes in 5 arguments:
1. A String "axiom" that represents the starting axiom of the L-System.
2. A String "productions" that is a JSON map of production rules used to produce the next generation of the L-System from the current generation (or axiom if just starting). Example: `{"A": "AB", "B": "A"}` (single-character symbols, string replacement).
3. A string "transformations" that is a JSON map where each key corresponds to a letter in the L-System alphabet, and each value is a DSL string of operations to apply to the turtle. Example: `{"F": "w s0.25 w", "A": "p2 w"}`.
4. An integer "generations" representing the number of generations to produce.
5. A boolean "overwrite" which indicates whether the MIDI clip should be erased before writing new MIDI data.

## Logic Flow
The actual MIDI clip operations will use a turtle model. All times and durations (including clip length, start_time, and duration) are in **beats** (Ableton's native time unit). When the tool is run with the given axiom and parameters, it will follow these steps:
1. Call the LiveAPI to get the currently selected clip. It should also store the length of the clip as a value.
2. If overwrite is true, call the LiveAPI to delete all notes from the currently selected clip.
3. Using the "axiom" string, "productions" map, and "generations" integer, calculate a new string representing the completed L-system. If the string length would exceed 1000 (e.g. after applying productions for the next generation), stop expanding and use the last string that had length ≤ 1000 for the rest of the pipeline.
4. Create a turtle with default values for pitch (64), duration (0.25), velocity (100), and release velocity (100). Also initialize its start_time to 0 which indicates the beginning of the clip.
5. Iterate over each character in the completed L-system. For each character, use it as a key in the "transformations" map and grab its value. If the character has no key in the map, skip it (no operations, turtle unchanged). Otherwise interpret the value as a string written in a DSL that specifies a pipeline of operations to do to the turtle. Operations are applied **left to right** in order. Tokens are separated by spaces; leading and trailing spaces are ignored. I will describe all possible operations and give some examples in the next section.
6. Once the L-System has been iterated over, exit processing.

## Turtle DSL description
I will list the full set of possible DSL operations now, include their syntax and expected behaviors. All numeric bounds use **inclusive** ranges: pitch, velocity, and release velocity use [0, 127]; start_time and duration use [0, clip_length]. When a value exceeds the range, wrap to the other end (e.g. 128 → 0, -1 → 127 for MIDI; similarly for time within [0, clip_length]).
- w : This operation calls the LiveAPI to write the note currently specified by the turtle to the currently selected clip. It should use the turtle's pitch, duration, velocity, release velocity, and start_time. After `w`, the turtle's start_time does **not** change unless a subsequent operation (e.g. `s` or `sx`) changes it.
- p : This operation adds the argument to the turtle's pitch. This should support positive and negative integers, and should bound the resulting value within the inclusive range [0, 127]. If the bounds are exceeded in either direction, wrap to the other end of the boundary. Example syntax `p12` (increment pitch by 12 semitones) or `p-6` (decrement pitch by 6 semitones).
- px : This operation multiplies the turtle's pitch by the argument. This should support positive floats, and should bound the resulting value within the inclusive range [0, 127]. If the bounds are exceeded in either direction, wrap to the other end of the boundary. It should also convert the result to an integer. Example syntax `px0.5` (Divide e.g. a pitch of 64 to 32) or `px2` (double pitch).
- v : This operation adds the argument to the turtle's velocity. This should support positive and negative integers, and should bound the resulting value within the inclusive range [0, 127]. If the bounds are exceeded in either direction, wrap to the other end of the boundary. Example syntax `v12` (increment velocity by 12) or `v-6` (decrement velocity by 6).
- vx : This operation multiplies the turtle's velocity by the argument. This should support positive floats, and should bound the resulting value within the inclusive range [0, 127]. If the bounds are exceeded in either direction, wrap to the other end of the boundary. It should also convert the result to an integer. Example syntax `vx0.5` (Divide e.g. a velocity of 80 to 40) or `vx2` (double velocity).
- r : This operation adds the argument to the turtle's release velocity. This should support positive and negative integers, and should bound the resulting value within the inclusive range [0, 127]. If the bounds are exceeded in either direction, wrap to the other end of the boundary. Example syntax `r10` (increment release velocity by 10) or `r-3` (decrement release velocity by 3).
- rx : This operation multiplies the turtle's release velocity by the argument. This should support positive floats, and should bound the resulting value within the inclusive range [0, 127]. If the bounds are exceeded in either direction, wrap to the other end of the boundary. It should also convert the result to an integer. Example syntax `rx0.2` (Divide e.g. a velocity of 100 to 20) or `rx2` (double release velocity).
- d : This operation adds the argument to the turtle's duration. This should support positive and negative floats, and should bound the resulting value within the inclusive range [0, clip_length] (zero duration is allowed). If the bounds are exceeded in either direction, wrap to the other end of the boundary. This operation should also support fractional arguments. Example syntax `d0.1` (increment duration by 0.1) or `d-1/16` (decrement duration by 1/16 or 0.0625).
- dx : This operation multiplies the turtle's duration by the argument. This should support positive floats, and should bound the resulting value within the inclusive range [0, clip_length] (zero duration is allowed). If the bounds are exceeded in either direction, wrap to the other end of the boundary. Example syntax `dx0.2` (Divide e.g. a duration of 1.0 to 0.2) or `dx2` (double duration).
- s : This operation adds the argument to the turtle's start_time. This should support positive and negative floats, and should bound the resulting value within the inclusive range [0, clip_length]. If the bounds are exceeded in either direction, wrap to the other end of the boundary. This operation should also support fractional arguments. Example syntax `s1/8` (increment start_time by 1/8 or 0.125) or `s-3` (decrement start_time by 3).
- sx : This operation multiplies the turtle's start_time by the argument. This should support positive floats, and should bound the resulting value within the inclusive range [0, clip_length]. If the bounds are exceeded in either direction, wrap to the other end of the boundary. Example syntax `sx0.25` (Divide e.g. a start_time of 4.0 to 1.0) or `sx2` (double start_time).

### Sample DSL strings
I will now describe two example DSL strings and step through their operations:
1. `w d0.5 p2 w s0.2 w s0.2 w` this string:
- Writes the current turtle to the clip.
- Divides the turtle's duration in half.
- Increments the turtle's pitch by 2.
- Writes the current turtle to the clip.
- Increments the turtle's start_time by 0.2.
- Writes the current turtle to the clip.
- Increments the turtle's start_time by 0.2.
- Writes the current turtle to the clip.
2. `sx2 d-1/16 w p2 w p-4 w` this string:
- Scales the turtle's start_time by 2.
- Decreases the turtle's duration by 1/16 or 0.0625.
- Writes the current turtle to the clip.
- Increments the turtle's pitch by 2.
- Writes the current turtle to the clip.
- Decrements the turtle's pitch by 4.
- Writes the current turtle to the clip.
