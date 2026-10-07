# Long Scroll redesign prompt

You are Claude Design.

Please redesign my COMP4020 final project website **Long Scroll**.  
The project already exists as a deployed web app and GitHub repository:

- Live site: https://comp4020-final-dachi.fly.dev/
- Repo: https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi

Your task is to design an improved version of this project based on the concept and requirements below.

---

## 1. Project essence

**Long Scroll** is a shared digital handscroll.

Anyone who visits can leave one small coloured mark on the same shared scroll, with an optional short note.  
Nothing is edited or removed.  
When a visitor comes back later in the same browser, the app can still recognise which marks are theirs.

This should **not** become a social feed, chat app, or comment wall.

The design should strengthen the feeling that this is:

- a **shared artwork**
- a **growing handscroll**
- a **persistent object that accumulates traces over time**
- a place where a returning visitor can feel: **“my trace is still here”**

---

## 2. New core concept to introduce

I want to extend the project so that everyone’s coloured traces are transformed into a second collective artwork:

**visual scroll + generated music**

The colour sequence on the scroll should influence a musical experience.

This does **not** need to become a full DAW or music tool.  
It should remain simple, poetic, and conceptually tied to the scroll.

Think in terms of:

- each colour contributing a tone / timbre / motif
- the sequence of strokes shaping a melody or ambient composition
- the scroll being something you can both **see** and **hear**

Please incorporate this concept into the design in a tasteful way.

---

## 3. Main design goals

### Goal A — Strengthen the handscroll identity
The current app concept is strong, but the interface should feel much more like a real scroll and much less like a list of comments.

### Goal B — Strengthen “this is my trace”
Returning visitors should feel a stronger emotional connection to their own marks.

### Goal C — Add a stronger sense of time
The interface should make it clear that the scroll is growing over days and accumulating many marks.

### Goal D — Make the “add a mark” interaction feel ceremonial
Adding a stroke should feel like continuing a collective artwork, not submitting an ordinary form.

### Goal E — Maintain accessibility and native usability
The redesign must still respect accessibility, keyboard use, and native HTML form behaviour.

---

## 4. Required content and behaviours

Please design around the following specific ideas.

### 4.1 Shared artwork + generated music
The project should visually remain a scroll, but the scroll should also have a music-related layer.

Please design a lightweight interaction such as:

- a “Play the scroll” or “Hear the scroll” control
- music generated from the sequence of colours already on the scroll
- playback that visually corresponds to marks on the scroll

The design should show how this works conceptually, even if the final implementation is modest.

Important:
- keep it elegant and simple
- do not turn this into a complex music production UI
- the music is a second reading of the same shared data

---

### 4.2 Stronger “this is my trace”
The README already emphasises that returning visitors can still find their own strokes.

Please make this much stronger in the design.

Required ideas:
- the visitor’s own mark should be recognisable in a way that is **not only colour-based**
- there should be a clear “welcome back” feeling
- there should be a quick way to jump to the visitor’s most recent mark

Use this specific visual idea:

- marks belonging to the current visitor should carry a **small vermilion seal** inspired by traditional Chinese handscroll collector seals
- the seal should read **“yours”**
- textual labelling should still exist, for example ending with **“— yours”**, so accessibility/testing does not depend only on colour or the seal

Also include:
- a “Welcome back” line with a link that jumps directly to the visitor’s most recent mark

---

### 4.3 Stronger sense of time
At the top of the page, include a line similar to:

`This scroll has been growing for 12 days · 86 marks`

This should create a sense that the scroll is a living object accumulating over time.

Please design this so it feels atmospheric and meaningful, not like a dashboard.

---

### 4.4 Scroll body and visual language
I want the whole page to feel like a real mounted handscroll.

Required visual direction:

- the page background should become a **dark mounting silk / brocade-like surface**
- only the scroll itself should be paper
- the scroll should have a **wooden roller at the top and bottom**
- the scroll should visually feel like an artwork placed against a darker surrounding field

Please interpret this elegantly rather than literally copying museum UI.

---

### 4.5 Brush strokes
Each user contribution should look like a real brush stroke rather than a flat UI blob.

Required behaviour:

- each stroke should have a **brush quality**:
  - heavier at the start
  - thinner at the end
- the shape of the stroke should be **determined by its id**
- this means:
  - each stroke can have a different shape
  - but it must remain **stable across refreshes**
  - the same stored stroke should always render the same visual form

The design should show how this system could feel visually.

---

### 4.6 “Add the next stroke” form
The form should feel like continuing the scroll, not filling a generic form.

Required ideas:
- rename the action conceptually to **“Add the next stroke”**
- the palette should not visually repeat standard radio circles unnecessarily
- however, the underlying form must still use **native radio inputs**
- keyboard interaction must still work
- focus must still be clearly visible

Also include:
- a **140-character counter**
- the submit button should be disabled while submitting
- the design should make the act of submission feel deliberate and calm

---

### 4.7 Feedback after adding a new stroke
After a new stroke is added:

- it should receive a one-time **ink landing / brush-on-paper** animation
- the page should automatically scroll so that the new stroke is visible
- if the user has **prefers-reduced-motion** enabled, the animation must be removed

Please reflect this in the interaction design.

---

## 5. Tone and aesthetic

The tone should be:

- calm
- poetic
- tactile
- slightly contemplative
- intimate rather than commercial
- artful, but still usable

Avoid:
- loud social-media energy
- bright gamified dashboards
- overly dense productivity-app UI
- fake “ancient China” cliches
- excessive ornament that hurts readability

This is a contemporary digital artwork interface inspired by the handscroll tradition, not a historical simulation.

---

## 6. Accessibility and implementation constraints

These constraints matter.

Please keep the design realistic for a student web project.

Must preserve:
- semantic HTML where appropriate
- native form behaviour
- keyboard accessibility
- visible focus states
- labels that do not rely only on colour
- graceful behaviour for reduced-motion users

Please do **not** propose a design that depends on:
- accounts or login
- editing or deleting strokes
- chat
- likes or ranking
- highly complex audio tooling
- highly complex canvas-only UI that would be difficult to make accessible

---

## 7. What I want from you

Please produce a **design proposal** for this redesigned Long Scroll.

Include:

1. **A clear design concept**
   - 1–2 paragraph overall direction

2. **A page structure / layout description**
   - top section
   - scroll section
   - music interaction section
   - form section
   - returning-visitor affordances

3. **Component-level design details**
   - header / intro
   - time summary line
   - scroll paper + wooden rollers
   - individual stroke appearance
   - “yours” seal treatment
   - note presentation
   - “welcome back” jump link
   - colour palette control
   - character counter
   - submit button states
   - playback / hear-the-scroll control

4. **Interaction behaviour**
   - adding a stroke
   - seeing your own old strokes
   - jumping to your latest stroke
   - hearing the scroll
   - playback highlighting
   - reduced-motion behaviour

5. **Visual design system suggestions**
   - colour mood
   - typography direction
   - texture/material hints
   - spacing and hierarchy
   - how to balance atmosphere with readability

6. **Accessibility notes**
   - especially around radio inputs, focus, text labels, and motion

7. **Implementation guidance**
   - practical notes for a front-end student project
   - how to keep stroke shapes deterministic from ids
   - how generated music could be scoped modestly

---

## 8. Preferred output style

Please present the answer in a structured, practical format.

Use sections and bullets.

Where useful, include:
- example UI copy
- microcopy suggestions
- specific interaction wording
- specific component naming

If possible, finish with:
- a **recommended MVP version**
- a **stretch version**
so I can decide what to implement first.

---

## 9. Important reminder

The redesign should make the project feel more conceptually complete, not just more decorative.

The best outcome is a design where the visitor feels:

- this is one shared object
- it has been growing over time
- my mark matters
- I can return to it
- I can now also hear the scroll as a collective composition
