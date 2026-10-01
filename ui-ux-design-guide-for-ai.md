# UI/UX Design Master Guide (Briefing Document for AI Assistants)

> **Source:** Zero To Mastery "UI/UX Design Cheat Sheet" (https://zerotomastery.io/cheatsheets/ui-ux-design-cheat-sheet/), created from notes by designer Brittney Postma while taking the "Complete Web & Mobile Designer" course taught by Daniel Schifano.
>
> **Purpose of this file:** This is a long-form, fully elaborated explanation of that cheat sheet, written so that any AI model (or human) can read it cold and understand what UI/UX design is, how the design process flows, and which rules and tools designers rely on. It is meant to be pasted or attached as context before asking an AI to design, review, critique, or generate interfaces.
>
> **Convention used below:** Sections marked **[From the cheat sheet]** are the source's ideas, restated in my own words. Sections marked **[Added context]** are my elaborations, examples, and practical guidance that go beyond the source, included to make understanding deeper. Sections marked **[How an AI should apply this]** translate the theory into concrete behavior.

---

## TABLE OF CONTENTS

1. How to use this document
2. Big picture: what UI and UX are, and the overall process
3. Part 1: Getting started
   - 3.1 Sketching
   - 3.2 Inspiration
   - 3.3 User flows
   - 3.4 Sitemaps
   - 3.5 Levels of fidelity
4. Part 2: Explore and iterate
   - 4.1 Wireframes
   - 4.2 Prototyping
   - 4.3 Getting feedback
5. Part 3: Design theory and fundamentals
   - 5.1 Grids
   - 5.2 Layouts and responsiveness
   - 5.3 Color
   - 5.4 Typography
   - 5.5 Motion and microinteractions
   - 5.6 Accessibility
   - 5.7 Mobile design
   - 5.8 Design patterns
   - 5.9 Design systems
6. Complete list of recommended sites and tools (inspiration, color, typography, systems, process)
7. Master checklist an AI can run against any design
8. Common mistakes and how to avoid them
9. Glossary
10. Sample prompts for working with an AI using this guide
11. Quick-reference cheat table

---

## 1. HOW TO USE THIS DOCUMENT

If you are an AI reading this: treat it as a design knowledge base. When a user asks you to design, critique, plan, or write code for a user interface, use these principles as your default framework unless the user gives conflicting instructions (for example, a brand guideline that dictates a font or color).

Key behaviors this document should produce in you:

1. **Follow the process order.** Do not jump to polished visuals before you understand goals, users, flows, and structure. The process runs roughly: goals and audience, then sketches, then user flows, then sitemap, then wireframes, then prototype, then testing and feedback, then visual polish and design system.
2. **Use measurable rules** (8px spacing, 12-column grid, contrast ratios, defined breakpoints, a type scale) rather than arbitrary values.
3. **Treat accessibility as a foundation**, not a final checklist item.
4. **Prefer proven patterns** over novelty, and only innovate where it adds value.
5. **Be consistent.** The same colors, fonts, spacing, components, and navigation behavior throughout.
6. **Explain your reasoning** in design terms when you produce output (why this layout, why this color scheme, why this hierarchy).

---

## 2. THE BIG PICTURE

### 2.1 UI vs UX **[Added context]**

The cheat sheet says user experience (UX) and user interface (UI) are two key components that together make up the flow and design of a project, and that a great design involves much more than either alone.

- **UX (User Experience)** is about the *whole journey and how it feels*: Can the person accomplish their goal? Is it easy, fast, and frustration-free? Does the structure make sense? UX is about problem solving, research, flows, structure, and testing.
- **UI (User Interface)** is about the *visible and interactive layer*: buttons, colors, typography, spacing, icons, imagery, animations. UI is about how the product looks and how its controls are presented.

A helpful analogy: UX is the architecture and floor plan of a house (where rooms are, how you move between them), while UI is the paint, furniture, lighting, and door handles. A beautiful house with a confusing floor plan is bad UX; a well-planned house with ugly, hard-to-use fixtures is bad UI. Great products need both.

### 2.2 The overall workflow **[From the cheat sheet, organized]**

The cheat sheet follows this progression:

| Stage | What happens | Fidelity |
|---|---|---|
| Sketching | Generate many rough ideas fast | Low |
| User flows | Map the steps a user takes to reach a goal | Low |
| Sitemap | Map how all pages/sections are organized | Low |
| Wireframes | Blueprint of each page's content and structure | Mid |
| Prototype | Clickable, interactive version linking the screens | High |
| Feedback and testing | Validate assumptions with real people, iterate | All stages |
| Design fundamentals applied | Grid, layout, color, type, motion, accessibility | Mid to High |
| Patterns and design system | Reusable, consistent building blocks | High |

The central philosophy: **find and fix problems as early and cheaply as possible.** A flaw discovered on paper costs minutes; the same flaw discovered after development costs days or weeks.

---

## 3. PART 1: GETTING STARTED WITH UI/UX DESIGN

### 3.1 SKETCHING

#### What it is **[From the cheat sheet]**
Sketching is the very first phase of design. The goal is to produce *as many ideas as possible, quickly*, by getting them onto paper (or a tablet). **Details do not matter at this stage.** After you have a pool of ideas, you pick the best or most efficient direction.

After the raw idea stage, you refine sketches into wireframes: this is where you add detail, cut ideas that don't work, and start identifying the most important or most repeated elements of the design. Those repeated elements become reusable components later, which will speed up building the product.

#### The sketching process, step by step **[From the cheat sheet, elaborated]**

1. **Be prepared.** Gather tools before you start: rulers, markers, pens, pencils, or a tablet. Interruptions to find supplies break creative flow.
2. **Understand goals and audience.** Before drawing anything, know what the design must accomplish and who it is for. A sketch without a goal is just doodling.
3. **Time yourself.** Set a strict time limit. Constraints force you to focus on what matters most instead of polishing details. (This is the same principle behind well-known rapid-ideation exercises where you produce many variations in a few minutes.)
4. **Draw a frame.** Give the design a container, such as a phone screen outline for an app or a browser window for a website, so you sketch in the correct context and proportions.
5. **Annotate and share.** Write notes on your sketches. Then share them; anyone can offer valuable insight about flow, even non-designers.
6. **Refine.** Add titles, add notes explaining things that are hard to draw, number the screens, and add arrows to show flow. Draw gesture indicators (tap, press, swipe) where relevant. This makes it far easier for others to give feedback.

#### Sketching user flows **[From the cheat sheet]**
Start by deciding *what part of the project to begin with* and *where you want to lead the user*. As you draw, keep asking questions such as:
- "What happens if the user taps here?"
- "What should this element do?"

Think of it as the user's journey from the moment they arrive to the moment they leave. **Always look for pain points**, places where the user might be confused, blocked, or annoyed, and look for ways to improve them.

#### Sketching screen flows **[From the cheat sheet]**
After a first draft, break each page down and think about what flow starts from that page. Example given: a search bar. Does the user need to press a search button, or do results appear automatically as they type? Each such decision affects the experience.

As you go, you will notice **similar elements and patterns recurring**. Those become your **components and eventually your design system**.

#### Tips for sketching **[From the cheat sheet]**
- Do not worry about being messy.
- Practice makes it easier; use simple building-block shapes (rectangles, circles, lines).
- Preserve your sketches: scan or photograph paper sketches and keep them organized in a folder.
- Always keep something nearby to capture ideas when they arrive.
- Communicate and share your sketches.

#### [How an AI should apply this]
- When asked to design something, begin by stating the goal and audience, then propose several distinct concepts (not just one) before elaborating one.
- Describe layouts in low-fidelity terms first (boxes, labels, arrows, flow) before discussing color or styling.
- Explicitly flag potential pain points in each flow.

---

### 3.2 INSPIRATION

#### What the cheat sheet says **[From the cheat sheet]**
Inspiration is a deliberate practice, not luck. The recommendations:
- **Talk to peers and colleagues.** Conversations spark ideas and help solve design challenges.
- **Study how other designers reach solutions.** Build a personal collection of great techniques to use as a foundation.
- **Surround yourself with great design.** Keep good design visible in your environment.
- **Optimize your workspace.** Your desk and screen setup can help or hurt your workflow; tune it to what works best for you.
- **Read widely.** Knowledge from other fields can give you a fresh perspective on a design problem.
- **Experience other cultures.** Traveling, or meeting different people in your own community, expands your design vocabulary. Even a walk can help.

#### Inspiration websites listed in the cheat sheet **[From the cheat sheet]**

| Site | URL | What it is good for |
|---|---|---|
| **Dribbble** | https://dribbble.com/ | Browsing designer showcases and creating collections of design patterns |
| **Pinterest** | https://www.pinterest.co.uk/ | Creating boards to organize visual ideas and moodboards |
| **Behance** | https://www.behance.net/ | Deeper case studies showing more detail about how a product or project came together |
| **Pttrns** | https://www.pttrns.com/ | UI pattern library; some free content, premium for more |
| **Awwwards** | https://www.awwwards.com/ | Showcase of award-graded, high-quality website designs with strict scoring |

#### [Added context] How to use each inspiration site well
- **Dribbble**: Good for quick visual ideas (screens, icons, small UI pieces). Remember that many shots are polished visual concepts that may not represent a shipped, usable product, so use them for aesthetics and micro-ideas, not as proof a flow works.
- **Pinterest**: Ideal for mood, color, and style direction. Create a board per project (for example "Fintech app - calm and trustworthy") and collect references.
- **Behance**: Best when you want the *process* behind a project: research, iterations, final results, often with written explanations.
- **Pttrns**: Best when you need to see how many apps solved one specific pattern (onboarding, login, checkout, empty states) side by side.
- **Awwwards**: Best for cutting-edge web design, animation, and layout experimentation. Note that award-winning sites are sometimes experimental and may sacrifice usability or accessibility, so borrow ideas thoughtfully.

**Best practice:** Inspiration is for *understanding why something works*, not for copying. Extract the principle (for example, "large headline with one clear button creates a strong focal point") and apply it to your own context.

#### [How an AI should apply this]
When a user wants a design direction, recommend they collect 5 to 10 references from these sites, then ask what they like about each (layout, color, typography, tone). Use those reasons, not the surface look, to guide your output.

---

### 3.3 USER FLOWS

#### Definition **[From the cheat sheet]**
A **user flow** shows the steps a user takes to achieve a specific goal. Sketching flows communicates how a user moves through different screens and actions. Each flow should include:
- A **name**
- **Step numbers**
- The **type of user** it applies to

#### Principles **[From the cheat sheet]**
- Like initial sketches, flows should **not be pixel perfect** and don't need much detail. **Simpler is better.**
- Show only the steps you expect a user to take to complete the task, with minimal visuals.
- It is smarter to draw flows quickly and discuss with your team than to spend hours on visuals that may be technically infeasible or not helpful to the experience.
- **Flows move in one direction**, from the start of the task to its completion. They do not go backward; going back and exploring alternate paths is what prototyping is for.
- **Name each flow and label each screen descriptively**, based on its purpose (for example "Sign up flow: New customer" with screens like "Enter email", "Verify code", "Create profile", "Welcome").

#### [Added context] Example user flow
**Flow name:** "Purchase a product: Guest user"
1. Land on product page
2. Tap "Add to cart"
3. View cart
4. Tap "Checkout"
5. Enter shipping info
6. Enter payment info
7. Review order
8. Confirmation screen

For each step, a designer asks: What can go wrong here? (out-of-stock item, invalid card, slow network). Those become extra screens or states to design (error states, loading states, empty states).

#### [How an AI should apply this]
When planning an app or feature, output a numbered flow per major user goal and per user type, keep it linear, and list potential failure points separately.

---

### 3.4 SITEMAPS

#### Definition **[From the cheat sheet]**
A **sitemap** is a diagram showing how all the pages of a product are organized and related. It should be created **fairly early** in the process, because it helps you understand what components and pages you need to build.

It benefits everyone: designers, developers, and content creators, because it communicates the product's structure. It also helps you **place content where users can find it** and supports **navigation** planning.

#### How to build one **[From the cheat sheet]**
1. Use your **sketches and user flows** as raw material.
2. Start with the **anatomy** of the product: list every individual page.
3. Place the **home page at the top**.
4. Label each box with the page name and a **reference number** indicating its step or position.
5. Use **color coding or a legend** when something is hard to describe.
6. Layout direction (left-to-right or top-to-bottom) is your choice.

#### Flat vs deep sitemaps **[From the cheat sheet]**
- **Flat sitemap:** Few levels; suited to small sites.
- **Deep sitemap:** For very large sites (hundreds of pages) that go more than **three levels** deep.

#### [Added context] Example sitemap (small business website)
```
Home
├── About
│   ├── Team
│   └── Story
├── Services
│   ├── Service A
│   ├── Service B
│   └── Service C
├── Blog
│   └── Article pages
├── Contact
└── Legal
    ├── Privacy
    └── Terms
```
A commonly cited usability guideline (not from this cheat sheet) is to keep important content reachable in a small number of clicks; deep hierarchies risk hiding content.

#### [How an AI should apply this]
Before generating pages or navigation code, produce a text-based sitemap (tree format) and confirm it with the user. Use the sitemap to determine navigation items, URL structure, and the list of templates required.

---

### 3.5 LEVELS OF FIDELITY

#### Definition **[From the cheat sheet]**
**Fidelity** is how much detail and functionality is shown at a given stage. Three levels:

| Level | Used for | Characteristics |
|---|---|---|
| **Low fidelity** | Sketches and user flows | Rough, fast, minimal detail; focuses on ideas and structure |
| **Mid fidelity** | Wireframes | More structure and content detail; still no final visuals |
| **High fidelity** | Prototypes of the product | Close to final; visuals and interactions polished |

#### Why it matters **[From the cheat sheet]**
Getting the **low-to-mid range right builds a strong foundation** because the design can evolve and change as it is tested. By **not focusing on visuals too early**, you can concentrate on **getting functionality right first**.

Cheat sheet link on this topic: https://cantina.co/understanding-design-fidelity-for-creating-a-great-product-experience/ ("Understand where to apply each level of design fidelity").

#### [Added context] Why not start polished?
- Polished visuals make people give feedback about colors and fonts rather than structure and function.
- Polished work is emotionally harder to throw away. Rough work is easy to discard.
- Changing a sketch takes seconds; changing a finished visual design takes hours.

#### [How an AI should apply this]
Match your output fidelity to the stage the user is in. If they are at idea stage, give conceptual layouts and flows, not finished CSS. If they are at high fidelity, provide precise tokens, spacing, and states.

---

## 4. PART 2: EXPLORE AND ITERATE YOUR IDEAS

### 4.1 WIREFRAMES

#### Definition and purpose **[From the cheat sheet]**
Wireframes are a **blueprint** of the product. They detail the information shown on each page, give an outline and structure, and describe the direction and message of the product. They bring together everything created so far (sketches, flows, sitemap).

Benefits:
- Help you understand **how users will navigate** and ensure efficient pathways.
- Provide something to **build on** and learn from via feedback.
- On a team, get **everyone aligned on layout**.
- Even solo, **get users to test** the wireframes: this uncovers pain points.
- Great for **client feedback**.
- **The earlier issues are found, the easier they are to fix.**

#### How to make them **[From the cheat sheet]**
- **Keep it simple:** more detailed than a sketch, but not the final design.
- Start with **pencil and paper**, then move into a tool like **Figma** for easier sharing.
- If sharing with a **client**, add a little polish so it looks presentable, **and explain that it demonstrates interactions and structure, not the final visual design.**

#### [Added context] What a wireframe typically contains
- Layout blocks (header, navigation, hero, content sections, sidebar, footer)
- Placeholder boxes for images (often a rectangle with an X)
- Real or realistic headings and labels (so content hierarchy can be judged)
- Buttons and form fields with their labels
- Annotations explaining behavior ("Tap to expand", "Loads more on scroll")
- Grayscale only, no brand colors, standard fonts

#### [How an AI should apply this]
When describing wireframes in text, use structured layouts: list regions top to bottom, note the content hierarchy, primary and secondary actions, and annotations for behavior. If generating code for a wireframe, keep styling neutral (grays, simple borders).

---

### 4.2 PROTOTYPING

#### Definition **[From the cheat sheet]**
Prototyping is where the product **starts to come alive**, even before full designs exist. Using a tool like **Figma**, you **link the screens from your user flows** so you can show how the design evolves and how actions affect it.

Example given: you design a landing page with a sign-up flow. How does the landing page change once a user signs up? Ideally you considered this earlier, but the prototype is where it becomes easy to demonstrate.

#### Benefits **[From the cheat sheet]**
- Communicates clearly with the **team and client**.
- Lets you **test with users at a stage close to how the product will be built**.
- Reveals whether your **assumptions about navigation** were right and whether the experience **meets expectations**.

#### [Added context] What to test in a prototype
- Can users complete the main task without help?
- How long does it take them?
- Where do they hesitate, click the wrong thing, or express confusion?
- Do labels and icons mean what you think they mean?

#### [How an AI should apply this]
When designing flows, also specify state changes (logged out vs logged in, empty vs filled, loading vs loaded, error vs success). List the interactions a prototype needs to demonstrate.

---

### 4.3 GETTING FEEDBACK

#### Why **[From the cheat sheet]**
Feedback throughout the process helps you find issues earlier, making the project more efficient and better for users.

#### Two kinds of feedback **[From the cheat sheet]**
- **Constructive feedback:** Can be positive *or* negative, but it **helps the design progress**.
- **Destructive feedback:** **Blocks progress**. It is mostly caused by **asking the wrong questions or misleading people**, or by clients going on tangents irrelevant to the current design stage.

#### How to get constructive feedback **[From the cheat sheet, elaborated]**
**You** are responsible for steering feedback. Tactics:
1. **Be crystal clear about context** of what you want feedback on. Send a message ahead of time explaining what you need.
2. **Set goals per stage.** Decide which aspects need attention and which questions must be answered.
3. **Tell reviewers what stage you're at** (sketch, wireframe, prototype) so they know what to expect and don't critique the wrong things (for example, colors on a wireframe).
4. **Limit the number of people in meetings.** Too many voices overwhelms. Invite only the people who can answer your questions.
5. **Run structured sessions:** generate ideas, vote, then discuss.
6. **Stay focused.** If good feedback is off-topic, "bookmark it" for later rather than derailing.

#### [Added context] Good vs bad feedback questions
- Bad: "Do you like it?" (invites opinions on taste)
- Better: "Looking at this checkout wireframe, what would you do first? What do you expect to happen when you tap this button?"
- Bad: "Should the button be blue?" during a wireframe review.
- Better: "Is it clear what the main action on this page is?"

#### [How an AI should apply this]
When asked to review a design, ask (or assume) the stage, and restrict critique to what matters at that stage. Provide feedback that is specific, actionable, and tied to user goals. If you are collecting feedback from users through survey questions, phrase them neutrally to avoid leading answers.

---

## 5. PART 3: DESIGN THEORY AND FUNDAMENTALS

### 5.1 GRIDS

#### Base units **[From the cheat sheet]**
Start with a **base unit**: the number from which all other measurements derive. It makes the design **easier to scale and hand off** to developers. The recommended base unit is **8px**, because:
- Most screen sizes are divisible by 8.
- 8 itself divides cleanly (into 4, 2, 1).

All other UI elements (spacing, padding, heights, widths, icon sizes) should be **increments of the base unit**: 8, 16, 24, 32, 40, 48, 56, 64, and so on.

#### The three parts of a grid **[From the cheat sheet]**
1. **Columns:** Vertical sections running left to right. **12 columns** is the typical choice because 12 divides many ways (into 2, 3, 4, 6), giving flexibility (halves, thirds, quarters, sixths).
2. **Gutters:** The **white space between columns**.
3. **Margins:** The **outer space** between the grid and the screen edge.

Gutter and margin sizes should be **multiples of the base unit** (for example 16px or 24px gutters, 24px or 32px margins).

**Important note about wide screens:** Most desktop displays are very wide today. Use **max-width** to contain the grid so people don't have to sweep their eyes far left to right to read content.

#### [Added context] Example
A desktop layout: 12 columns, 24px gutters, 64px margins, container max-width 1200px. A sidebar could span 3 columns, main content 9 columns. A card grid could have cards spanning 4 columns each (3 across) or 3 columns each (4 across).

#### [How an AI should apply this]
When writing CSS or design specs, use spacing values from an 8px scale (4px is often permitted as a half-step for tight spots). Use a 12-column grid (CSS Grid or a framework) and set a max-width for content containers. Avoid arbitrary numbers like 13px or 37px.

---

### 5.2 LAYOUTS AND RESPONSIVENESS

#### Combining grids **[From the cheat sheet]**
Using **multiple types of grids together** can balance and visually enhance a design. After placing grids on a page, there are still decisions to make.

#### Fixed, fluid, adaptive **[From the cheat sheet]**
The responsive behavior is determined by choosing between:
- **Fixed layouts:** Stay the same regardless of screen size.
- **Fluid layouts:** **Stretch and shrink** with the content/screen.
- **Adaptive layouts:** **Switch to different grids** depending on the screen size.

Using **breakpoints** lets you change the design at particular screen widths.

#### Suggested breakpoints **[From the cheat sheet]**
There are too many device sizes to target each one. Start with four:

| Name | Width |
|---|---|
| Small | 600px |
| Medium | 768px |
| Large | 1024px |
| Extra-large | 1280px |

These are "a good starting off point," not rigid law.

#### [Added context] Practical guidance
- **Design mobile-first** where possible: start with the narrowest layout, then enhance for larger screens. This forces prioritization of content.
- Typical column behavior: 4 columns on mobile, 8 on tablet, 12 on desktop (a common convention, not from this cheat sheet).
- At each breakpoint check: does the navigation still work? Do images scale? Does text remain readable? Are touch targets large enough?

#### [How an AI should apply this]
Generate responsive code (flex/grid, relative units, media queries) using the four breakpoints as defaults. Explain how the layout changes at each size (for example, "cards go from 1 column on small to 2 on medium to 3 on large to 4 on extra-large").

---

### 5.3 COLOR

#### Start with meaning, not taste **[From the cheat sheet]**
Before choosing colors ask:
- What **message** does the brand want to communicate, or what **problem** does it solve? Color influences brand personality.
- Who are the **target users**? Demographics and **cultural influences** affect how colors are perceived.
- What do the colors **mean** to you? The **psychology of color** shapes how we perceive the world.

#### [Added context] Common color associations (vary by culture)
- Blue: trust, calm, stability (finance, healthcare, tech)
- Red: urgency, energy, danger, passion
- Green: growth, health, success, nature
- Yellow/orange: optimism, warmth, attention
- Purple: creativity, luxury
- Black/white/gray: sophistication, minimalism, neutrality
Always check cultural meanings; for example, white symbolizes different things in different cultures.

#### Build scalable palettes **[From the cheat sheet]**
- Each color should be **scalable**: have a small **monochromatic range** (lighter and darker shades) so you can use it for backgrounds, borders, hover states, text, and so on.
- **Add hints of brand color into your blacks and greys** for depth. Pure black can feel harsh.

#### Accessibility first **[From the cheat sheet]**
**The most important thing** when choosing colors: **test for accessibility**. Ensure enough **contrast** between foreground and background so content is readable for everyone.

Tools:
- **Colorable** (https://colorable.jxnblk.com/): test two colors for web accessibility.
- **Contrast** (Figma plugin): https://www.figma.com/community/plugin/748533339900865323/Contrast

#### Color schemes **[From the cheat sheet]**

| Scheme | How it is built | Effect |
|---|---|---|
| **Monochromatic** | One primary color, using different shades of it | Simplest, least distracting |
| **Analogous** | Three colors adjacent on the color wheel | Blended, simple, harmonious |
| **Complementary** | Two colors directly opposite each other on the wheel | High contrast; brighter and more prominent |
| **Split-complementary** | One color plus the two colors adjacent to its opposite | Bright like complementary but more versatile |
| **Triadic** | Three colors forming a triangle, each 120 degrees apart | Bold and vibrant, slightly less contrast than complementary, more versatile |
| **Tetradic** | Four evenly spaced colors | Hard to balance; sticking to **three or fewer** colors is usually best |

**Palette generator:** **Coolors.co** (https://coolors.co/) is recommended as a starting point for finding palettes.

#### [Added context] A practical palette structure (a common industry approach)
- **Primary color:** the main brand color (buttons, links, key highlights)
- **Secondary/accent color:** supports and highlights
- **Neutrals:** a scale from near-white to near-black (backgrounds, borders, text)
- **Semantic colors:** success (green), warning (yellow/orange), error (red), info (blue)
- Rule of thumb often used: about 60% neutral/dominant, 30% secondary, 10% accent.

#### [Added context] Contrast ratios (WCAG guidance)
The cheat sheet says to ensure enough contrast; the widely used standard (WCAG) sets numbers you can check against: at least **4.5:1** for normal body text and **3:1** for large text and key UI components at the AA level. Do not rely on color alone to convey meaning (for example, show an error with an icon and text as well as red).

#### [How an AI should apply this]
When proposing a palette, state the intended brand message and audience, name the scheme type used, provide hex codes for a primary color with light/dark shades, neutrals tinted toward the brand color, and semantic colors. State contrast ratios for text/background pairs, or instruct the user to verify them with the tools above.

---

### 5.4 TYPOGRAPHY

#### Definition **[From the cheat sheet]**
Typography is the **style and appearance of text**. Choosing and combining type styles well enhances a design.

#### Type styles **[From the cheat sheet]**
- **Serif:** Traditional typefaces with **serifs**, the small tails/strokes at the ends of letters. There are several sub-types (the cheat sheet illustrates four).
- **Sans serif:** No serifs. **One of the most popular typefaces today**, popularized by the **Swiss style**. It has four sub-types.
- **Display:** The **broadest** category with the most variation. Used **only for headlines or short copy** to grab attention.
- **Script:** Resemble handwriting or cursive. Very fluid; two classifications: **formal** and **casual**.
- **Mono (monospaced):** **Fixed-width**; every character takes the same space. Typically used for **code blocks** or when content should look technical.

#### [Added context] When to use which
- **Serif:** editorial, traditional, luxury, long-form reading brands.
- **Sans serif:** interfaces, apps, modern brands, clean readability on screens.
- **Display:** hero headlines, posters, logos; never for long paragraphs.
- **Script:** invitations, boutique brands, accents; use sparingly and never for body text.
- **Mono:** code, data, technical or retro aesthetics.

#### Choosing a typeface **[From the cheat sheet]**
- **Client restrictions:** If your font choices are limited, you can still change the look via **line height, letter spacing (tracking), and font weights**.
- **Too many choices:** Narrow down by thinking about the brand: goals of the product, traditional vs modern, and the **platform** it is centered on.
- **Practical tip:** Go to **Google Fonts** (https://fonts.google.com/), type in a real heading, and visually compare. Pick a few, download them, and test in mockups.

#### Type scale with the golden ratio **[From the cheat sheet]**
Start with a **base size of 16px** and multiply by the **golden ratio (1.618)** to get heading sizes:

| Size (approx.) | In em | Suggested use |
|---|---|---|
| 10px | 0.618em | Small/caption text |
| 16px | 1em | Body text (base) |
| 26px | ~1.618em | Small heading |
| 42px | ~2.618em | Medium heading |
| 68px | ~4.236em | Large heading/hero |

These follow a curve that is described as pleasing to the eye. (The source page has a small typo writing 1.6118em; the correct ratio value is 1.618em.)

**Font pairing workflow:**
1. Go to **Font Pair** (https://www.fontpair.co/) and choose two fonts that work well together.
2. Go to **Type Scale** (https://type-scale.com/) and enter them.
3. Pick the **golden ratio** from the scale dropdown for the heading font; pull out the second font for body text to preview them together.
4. You now have a **full type system**.

#### [Added context] Practical typography rules
- Limit to **two typefaces** (one for headings, one for body) or even one family with multiple weights.
- Body text is commonly 16px minimum on the web for readability.
- Line height for body text is often around 1.4 to 1.6 times the font size.
- Comfortable line length is roughly 45 to 75 characters per line.
- Create hierarchy with size, weight, and color, not just size.
- Avoid all-caps for long text; it reduces readability.

#### [How an AI should apply this]
When specifying type, provide: heading and body font names (with fallbacks), a defined scale (sizes, weights, line heights), and reasoning tied to brand personality. Prefer freely available fonts (Google Fonts) unless told otherwise.

---

### 5.5 MOTION AND MICROINTERACTIONS

#### Why **[From the cheat sheet]**
Think about animations and interactions **early** so you can refine them. They **communicate what is happening** to the user and **encourage engagement**. **Microinteractions** are small interactive reactions triggered by a user's action. Even small animations can significantly improve the experience.

#### The four-part structure of a microinteraction **[From the cheat sheet]**

| Part | Meaning | Example |
|---|---|---|
| **Trigger** | What starts it; a user-initiated action | Pull to refresh, tapping "Add to cart," tapping a nav item |
| **Rules** | What happens during the interaction; the steps | When "like" is tapped, toggle the state and increment the count |
| **Feedback** | What tells the user something is happening | A heart fills with color; a field shows a green check or red error |
| **Loops and modes** | How long it lasts, whether it repeats, and alternate behaviors | A spinner loops until data loads; a "dark mode" changes normal behavior |

#### [Added context] Guidelines for good motion
- Purposeful: motion should explain (where something came from, what changed), not just decorate.
- Fast: most UI transitions feel good around 150 to 300ms.
- Natural easing (ease-in-out) rather than robotic linear motion.
- Respect users who prefer reduced motion (the `prefers-reduced-motion` setting), which ties directly to accessibility.
- Never let animation block the user from completing a task.

#### [How an AI should apply this]
For each interactive element, define trigger, rules, feedback, and loops/modes. Specify durations, easing, and a reduced-motion fallback.

---

### 5.6 ACCESSIBILITY

#### Philosophy **[From the cheat sheet]**
Products should be **usable by everyone**. The cheat sheet's stance: if even **one person cannot use your design**, in a sense you have failed that person. It quotes Daniel Schifano: accessibility is **not a checklist**; it should be **ingrained in the way we design**.

#### Assistive technologies **[From the cheat sheet]**
- **Screen readers:** Software that reads web page content aloud, for visually impaired users.
- **Braille terminals:** Devices (a keyboard-like tool) that let blind or visually impaired users navigate computers and the internet through braille.
- **Screen magnifiers:** Enlarge the part of the screen the user hovers over.
- **Alternate input devices and software:** Voice control, push buttons, and other means to control the computer.

#### Visual patterns to get right **[From the cheat sheet]**
1. **Color contrast**: a big one that is *easy to get wrong*. Tools:
   - **Color Safe** (http://colorsafe.co/): choose accessible colors if you don't have a palette yet.
   - **Colorable** (https://colorable.jxnblk.com/): verify existing brand colors against contrast ratios.
   - **Color Contrast Analyzer** (Chrome extension by Google): run a website through it to detect problems. URL: https://chrome.google.com/webstore/detail/color-contrast-analyzer/dagdlcijhfbmgkjokkjicnnfimlebcll?hl=en
2. **Focus states** on form elements and buttons are essential (for keyboard and screen reader users). If you remove default focus styling, **replace it with something visible and contrast-compliant.**
3. **Modals, hover states, and click targets** are areas of concern.
4. **Click target size**: clickable content must be big enough to click easily. The **clickable area can be larger than the visible item**, which helps users with motor impairments without enlarging the visual design.
5. **Start early and collaborate with developers**, or include the code/annotations that make the design accessible.

#### [Added context] Accessibility practices to include
- **Semantic HTML:** use proper elements (`button`, `nav`, `main`, `label`, headings in order) so screen readers understand structure.
- **Alt text** for meaningful images; empty alt for decorative ones.
- **Keyboard operability:** everything reachable and usable with Tab, Enter, Space, Escape, arrow keys; logical tab order.
- **Labels for every form field** (not placeholder-only) and clear error messages.
- **Touch targets** commonly recommended around 44x44 px (Apple) to 48x48 dp (Android/Material) at minimum.
- **Do not rely on color alone** to convey status.
- **Captions/transcripts** for audio and video.
- **Modals** should trap focus while open, be closable via Escape, and return focus to the trigger on close.
- **ARIA** attributes only when native HTML cannot express the semantics.
- Support **text resizing** and zoom without breaking the layout.

#### [How an AI should apply this]
Every UI you generate should include: semantic markup, visible focus styles, sufficient contrast, labeled inputs, adequate target sizes, alt text, keyboard support, and reduced-motion support. Mention these explicitly in your explanation so the user knows accessibility was considered from the start.

---

### 5.7 MOBILE DESIGN

#### Core idea **[From the cheat sheet]**
A great in-app experience is key to product success. **Users should not have to think too much**; if parts of the app are hard to use or understand, people give up.

#### Principles **[From the cheat sheet]**
1. **Declutter.** Remove unnecessary content; keep only the important information. Keep the interface **clean and minimal** and **break long content or tasks into chunks**.
2. **Design forms thoughtfully.** Help users by:
   - **Pre-formatting input fields** for readability (for example, phone or card number formatting),
   - Providing **auto-completion**,
   - Showing **well-placed hints** during the task.
3. **Be consistent.** Use the same colors, typefaces, and interactions throughout so the product feels cohesive. **Predictability** makes users feel they already know how to use it.
4. **Make navigation easy.** Perhaps the most important point: users should be able to go where they want and **return to the previous screen easily**. **Do not mix different navigation patterns**; choose one that suits the app and keep it consistent.

#### [Added context] Mobile-specific considerations
- Thumb reach: place primary actions within easy thumb reach (bottom of screen) on large phones.
- Use the right keyboard type per input (numeric for phone numbers, email keyboard for emails).
- Minimize typing (use selectors, toggles, pickers, autofill, biometrics).
- Show progress on multi-step tasks (step indicators, progress bars).
- Design for interruptions and poor connectivity (loading, offline, and retry states).
- Follow platform conventions (iOS Human Interface Guidelines; Android Material Design) so behaviors feel familiar.
- Common navigation patterns: bottom tab bar (3 to 5 destinations), hamburger/drawer menu, top app bar with back arrow. Do not mix these arbitrarily.

#### [How an AI should apply this]
For mobile designs: limit each screen to one primary goal, chunk long forms into steps, specify input types and autofill attributes, pick one navigation pattern, and ensure a clear back path from every screen.

---

### 5.8 DESIGN PATTERNS

#### Definition **[From the cheat sheet]**
A **design pattern** is a **general, repeatable solution to a commonly occurring problem.**

#### The process for using patterns **[From the cheat sheet]**
1. **Analyze the problem** and find ways to eliminate or reduce pain points. Use **real data from testing and feedback** to identify usability issues.
2. **Look at how other brands and products solved it.** Multiple examples give insight into whether a solution suits your product.
3. **Choose the one solution that works best** for your product.

That is why many sites look alike: patterns become **standards proven to help users**. You don't always need to invent new ways of doing things, but sameness can be boring too. It is **a delicate balance between good design and good user experience.**

#### The six pattern categories **[From the cheat sheet]**

| Category | What it does | Examples |
|---|---|---|
| **Data and input** | Products that give feedback and respond to data received | Drag-and-drop UI, forms, autocomplete, search |
| **Content structure** | Organizes content on a page to streamline flow and improve accessibility | Cards, lists, tabs, accordions, pagination |
| **Navigation** | Ensures ease of moving through the product | Sidebars, hamburger menus, navigation bars, breadcrumbs |
| **Incentivization** | Gives positive feedback so users keep using the product | Progress bars, achievements, streaks, rewards, badges |
| **Hierarchy** | Gives visual flow by establishing important/primary elements | Size, contrast, position, whitespace to emphasize key items |
| **Social media** | Encourages sharing with the user's social networks | Share buttons, invite friends, social login, feeds |

(The example column beyond the ones named in the cheat sheet such as drag-and-drop, sidebars, hamburger menus, and navigation bars is added context.)

#### Why patterns work **[From the cheat sheet]**
Human brains are wired to look for patterns in repeated activities and to seek efficiency and easy access. Using familiar standards creates **less cognitive strain (mental effort)** for users.

#### [Added context] Well-known patterns
Onboarding walkthroughs, empty states, skeleton loading screens, search with filters, sticky headers, modals and dialogs, toasts/snackbars, breadcrumbs, pull-to-refresh, infinite scroll vs pagination, floating action buttons, wizards for multi-step processes, dashboards with cards. Use Pttrns and Dribbble (listed above) to explore real examples.

#### [How an AI should apply this]
Before inventing a new interaction, name the known pattern that fits the problem, cite how established products handle it, and justify any deviation. Use patterns to reduce learning time for users.

---

### 5.9 DESIGN SYSTEMS

#### Definition **[From the cheat sheet]**
A **design system** is a single place where all elements needed to design a product live: a **single source of truth** for each design element that anyone on the team can find and use.

#### Atomic design **[From the cheat sheet]**
A common methodology is **atomic design**, from Brad Frost's book of the same name. It splits a system into five levels that build on each other:

1. **Atoms:** the smallest elements (a button, a label, an input, a color, an icon)
2. **Molecules:** simple groups of atoms working together (a label + input + button forming a search form)
3. **Organisms:** complex sections built from molecules and atoms (a header with logo, navigation, and search)
4. **Templates:** page-level layouts that arrange organisms, showing structure without real content
5. **Pages:** templates filled with real content, showing the final result

Reference: https://atomicdesign.bradfrost.com/

#### The Zero To Mastery variant: foundation, components, recipes **[From the cheat sheet]**
The course instructor uses a similar three-level model:

- **Foundation:** the basic individual items such as **colors, typography, icons**, spacing and other small pieces used throughout the product.
- **Components:** foundation elements combined into **reusable items** such as **buttons, inputs, and cards**.
- **Recipes:** components combined into **larger groupings** that make up **sections of an app or page**.

#### Golden rule **[From the cheat sheet]**
**Design systems are ever evolving.** They are never "finished"; they are updated as the product grows and needs change.

#### [Added context] Why design systems matter
- **Consistency** across screens and teams
- **Speed**: designers and developers reuse rather than rebuild
- **Easier handoff**: developers know exact values (design tokens for color, spacing, type)
- **Scalability**: adding new pages or features stays coherent
- **Easier maintenance**: change a token or component once and it updates everywhere

#### [Added context] What a starter design system includes
- Color tokens (primary, secondary, neutral scale, semantic colors)
- Typography tokens (font families, scale, weights, line heights)
- Spacing scale (8px increments)
- Border radius and shadow (elevation) rules
- Icon set
- Components with all states (default, hover, focus, active, disabled, loading, error)
- Grid and breakpoint definitions
- Usage guidelines (do and don't)

#### [How an AI should apply this]
When generating UI, structure the output as tokens, then components, then page compositions. Define reusable components (button, input, card) once with variants and states, and reuse them rather than restyling ad hoc.

---

## 6. COMPLETE LIST OF SITES AND TOOLS FROM THE CHEAT SHEET

### Design process
| Resource | URL | Use |
|---|---|---|
| Design fidelity (Cantina article) | https://cantina.co/understanding-design-fidelity-for-creating-a-great-product-experience/ | Understand where to apply each level of design fidelity |

### Inspiration
| Resource | URL | Use |
|---|---|---|
| Dribbble | https://dribbble.com/ | Create collections of design patterns |
| Pinterest | https://www.pinterest.co.uk/ | Create boards to organize ideas |
| Behance | https://www.behance.net/ | More detail about how the product came together |
| Pttrns | https://www.pttrns.com/ | Free UI patterns; premium for more content |
| Awwwards | https://www.awwwards.com/ | Strictly graded, great website designs |

### Color
| Resource | URL | Use |
|---|---|---|
| Contrast (Figma plugin) | https://www.figma.com/community/plugin/748533339900865323/Contrast | Check color contrast inside Figma |
| Colorable | https://colorable.jxnblk.com/ | Check color contrast between two colors |
| Coolors | https://coolors.co/ | Generate color palettes |
| Color Safe | http://colorsafe.co/ | Create accessible color palettes |
| Color Contrast Analyzer | https://chrome.google.com/webstore/detail/color-contrast-analyzer/dagdlcijhfbmgkjokkjicnnfimlebcll?hl=en | Test web pages for contrast issues |

### Typography
| Resource | URL | Use |
|---|---|---|
| Google Fonts | https://fonts.google.com/ | Search for and download fonts |
| Font Pair | https://www.fontpair.co/ | Find good font pairings |
| Type Scale | https://type-scale.com/ | Set out fonts and choose sizes (golden ratio option) |

### Design systems
| Resource | URL | Use |
|---|---|---|
| Atomic Design (Brad Frost) | https://atomicdesign.bradfrost.com/ | The methodology behind atoms, molecules, organisms, templates, pages |

### Course and source
| Resource | URL |
|---|---|
| Complete Web & Mobile Designer: UI/UX, Figma + more (ZTM course) | https://zerotomastery.io/courses/learn-web-design/ |
| Instructor Daniel Schifano | https://zerotomastery.io/about/instructor/daniel-schifano/ |
| Cheat sheet page | https://zerotomastery.io/cheatsheets/ui-ux-design-cheat-sheet/ |

### Tool mentioned repeatedly
- **Figma** is the primary design/prototyping tool mentioned for moving from paper sketches to shareable wireframes and clickable prototypes.

### [Added context] Additional well-known resources (NOT in the cheat sheet)
These are optional extras an AI or user may find helpful:
- **WCAG guidelines** (W3C Web Content Accessibility Guidelines) for accessibility standards
- **WebAIM Contrast Checker** for another contrast tool
- **Material Design** (Google) and **Human Interface Guidelines** (Apple) for platform conventions
- **Nielsen Norman Group** for research-based UX articles and usability heuristics
- **Mobbin** for mobile app pattern screenshots
- **Refactoring UI** for practical visual design tips

---

## 7. MASTER CHECKLIST (RUN THIS AGAINST ANY DESIGN)

**Goals and audience**
- [ ] The goal of the design and the target user are clearly stated.
- [ ] The brand message/problem being solved is understood.

**Process**
- [ ] Multiple ideas were considered before choosing one.
- [ ] User flows are named, numbered, one-directional, and per user type.
- [ ] A sitemap exists and reflects the flows; depth is appropriate (flat for small, deep only for large).
- [ ] Fidelity matches the current stage (low: sketches/flows; mid: wireframes; high: prototype).
- [ ] Feedback was requested with clear context and stage.

**Layout**
- [ ] A base unit (8px) is used; all spacing is a multiple.
- [ ] A 12-column grid with defined gutters and margins is used.
- [ ] Content has a max-width on large screens.
- [ ] Layout behavior (fixed/fluid/adaptive) is chosen; breakpoints defined (600/768/1024/1280 as a start).

**Color**
- [ ] Colors are chosen for brand message and audience/culture.
- [ ] A named scheme (monochromatic, analogous, complementary, split-complementary, triadic, tetradic) is used; three or fewer main colors.
- [ ] Each color has a scale of shades; neutrals are tinted with brand color.
- [ ] Contrast is tested with a tool.

**Typography**
- [ ] Typeface category suits the brand (serif, sans serif, display, script, mono).
- [ ] Limited number of fonts; pairing verified.
- [ ] A consistent type scale (for example golden ratio from 16px base) is used.
- [ ] Line height, spacing, and weights adjusted for readability.

**Interaction**
- [ ] Microinteractions defined by trigger, rules, feedback, loops/modes.
- [ ] Animations are purposeful and don't hinder tasks.

**Accessibility**
- [ ] Sufficient contrast everywhere.
- [ ] Visible, compliant focus states.
- [ ] Click targets large enough (clickable area may exceed the visual item).
- [ ] Modals, hover states, and forms are accessible.
- [ ] Works with screen readers, magnifiers, keyboard and alternate input.

**Mobile**
- [ ] Decluttered; content chunked.
- [ ] Forms have pre-formatting, autocomplete, and hints.
- [ ] Consistent look and behavior.
- [ ] One consistent navigation pattern with easy back navigation.

**Patterns and systems**
- [ ] Known patterns are used where suitable (data/input, content structure, navigation, incentivization, hierarchy, social).
- [ ] Reusable components are defined once (foundation, components, recipes, or atomic levels).
- [ ] The design system is documented and treated as evolving.

---

## 8. COMMON MISTAKES AND HOW TO AVOID THEM **[Added context, aligned to the cheat sheet's principles]**

| Mistake | Why it hurts | Fix (per the cheat sheet's ideas) |
|---|---|---|
| Jumping straight to polished visuals | Hides structural problems; feedback focuses on looks | Work through low and mid fidelity first |
| No time limit on sketching | Over-polishing; ideas stall | Time-box sketching sessions |
| Copying inspiration wholesale | Doesn't fit your users; may be inaccessible | Extract principles; adapt to your context |
| Flows that loop backward and clutter | Hard to read and communicate | Keep flows one-directional; explore alternatives in prototypes |
| Random spacing values | Inconsistent look; hard developer handoff | Use an 8px base unit |
| Grid stretching across ultra-wide screens | Hard-to-read content | Set a max-width |
| Too many colors | Hard to balance | Three or fewer main colors |
| Ignoring contrast | Excludes many users | Test with Colorable, Color Safe, Contrast plugin, Color Contrast Analyzer |
| Pure black on white everywhere | Can feel harsh | Tint neutrals with brand color |
| Too many fonts | Messy hierarchy | Limit and pair carefully with Font Pair |
| Removing focus outlines with no replacement | Keyboard users get lost | Provide a visible, compliant focus state |
| Tiny click targets | Frustrating, especially for motor impairments | Increase clickable area beyond the visual element |
| Mixing navigation patterns | Users get lost | Choose one pattern and stay consistent |
| Asking vague feedback questions | Destructive or useless feedback | State the stage, goals, and specific questions |
| Treating the design system as finished | It goes stale | Keep evolving it |
| Reinventing standard interactions | Increases cognitive load | Use proven patterns unless there is a strong reason not to |

---

## 9. GLOSSARY

- **Accessibility (a11y):** Designing so people of all abilities can use a product.
- **Adaptive layout:** Layout that switches between different grids at certain screen sizes.
- **Analogous colors:** Three neighboring colors on the color wheel.
- **Assistive technology:** Tools that help people with disabilities use computers (screen readers, braille terminals, magnifiers, alternate input devices).
- **Atomic design:** Methodology (Brad Frost) building systems from atoms, molecules, organisms, templates, and pages.
- **Base unit:** The fundamental measurement (recommended 8px) from which all spacing and sizing derive.
- **Breakpoint:** A screen width at which the layout changes.
- **Cognitive load/strain:** The mental effort needed to use something.
- **Complementary colors:** Colors directly opposite each other on the color wheel.
- **Component:** A reusable UI element (button, input, card).
- **Constructive feedback:** Feedback that helps the design progress (positive or negative).
- **Destructive feedback:** Feedback that blocks progress, often from wrong questions or off-topic tangents.
- **Design pattern:** A repeatable, general solution to a common design problem.
- **Design system:** A single source of truth for all design elements and rules.
- **Display typeface:** Attention-grabbing font for headlines and short copy.
- **Fidelity:** The amount of detail and functionality shown at a stage (low, mid, high).
- **Fixed layout:** Layout that does not change with screen size.
- **Flat sitemap:** Sitemap with few levels, for small sites.
- **Fluid layout:** Layout that stretches and shrinks with the screen.
- **Focus state:** The visual indication of which element is currently selected via keyboard or assistive tech.
- **Foundation (ZTM model):** Colors, typography, icons, and other base items.
- **Golden ratio:** 1.618; used to generate harmonious type scales.
- **Grid:** Structure of columns, gutters, and margins for aligning content.
- **Gutter:** Space between columns.
- **Hierarchy:** Visual arrangement showing what is most and least important.
- **Incentivization pattern:** Design that rewards users to encourage continued use.
- **Margin:** Space between the grid and the screen edge.
- **Microinteraction:** A small, user-triggered reaction with a trigger, rules, feedback, and loops/modes.
- **Monochromatic:** One color in different shades.
- **Mono (monospaced) typeface:** Fixed-width font, common for code.
- **Prototype:** An interactive, linked version of the designed screens, used for demonstration and testing.
- **Recipe (ZTM model):** Larger groupings of components forming sections of an app or page.
- **Sans serif:** Typeface without serifs.
- **Script typeface:** Handwriting-style typeface (formal or casual).
- **Serif:** Typeface with small strokes (tails) at the ends of letters.
- **Sitemap:** Diagram showing how pages are organized.
- **Split-complementary:** One color plus the two neighbors of its opposite.
- **Tetradic:** Four evenly spaced colors on the wheel.
- **Triadic:** Three colors 120 degrees apart on the wheel.
- **User flow:** The steps a user takes to achieve a goal.
- **Wireframe:** A mid-fidelity blueprint of a page's structure and content.

---

## 10. SAMPLE PROMPTS FOR WORKING WITH AN AI USING THIS GUIDE

Paste this document first, then use prompts like:

1. **Planning:** "Using the process in this guide, help me plan a [type of product] for [audience]. Start with goals, then 3 sketch concepts, then user flows and a sitemap in text form."
2. **Wireframe description:** "Write a mid-fidelity wireframe description for the [page name] page, listing regions top to bottom, primary and secondary actions, and annotations."
3. **Design tokens:** "Create a foundation for my product: 8px spacing scale, a [scheme name] color palette with shades and semantic colors, and a golden-ratio type scale from a 16px base. State contrast ratios for the main text/background pairs."
4. **Code:** "Build this page in HTML/CSS using a 12-column grid, an 8px spacing system, breakpoints at 600/768/1024/1280, accessible focus states, and semantic markup."
5. **Review:** "Audit this design/description against the Master Checklist in this guide and list issues by severity with fixes."
6. **Accessibility:** "Check this UI for accessibility problems: contrast, focus states, click target sizes, modals, hover states, and screen reader support."
7. **Patterns:** "Which design patterns (from the six categories) fit this problem? Give examples of how well-known products solve it and recommend one."
8. **Design system:** "Turn this UI into a design system using atomic design (or foundation, components, recipes). List all components with their states."
9. **Feedback prep:** "Write a message and a list of questions I can send to reviewers for feedback at the [wireframe/prototype] stage, so their feedback is constructive."

---

## 11. QUICK-REFERENCE CHEAT TABLE

| Topic | Key rule |
|---|---|
| Sketching | Fast, rough, time-boxed, annotated, shared |
| User flows | Named, numbered, per user type, one direction, simple |
| Sitemap | Home at top; flat for small sites; deep (3+ levels) for very large ones |
| Fidelity | Low for sketches/flows, mid for wireframes, high for prototypes |
| Wireframes | Simple but more detailed than sketches; tell clients they show structure, not final visuals |
| Prototypes | Link screens (for example in Figma); test with users |
| Feedback | Steer it: clear context, stage, goals, limited attendees; bookmark tangents |
| Base unit | 8px; everything in multiples |
| Grid | 12 columns; gutters and margins are multiples of the base; use max-width |
| Layout types | Fixed, fluid, adaptive; breakpoints 600 / 768 / 1024 / 1280 |
| Color | Meaning and audience first; scalable shades; tinted neutrals; test contrast; three or fewer main colors |
| Color schemes | Monochromatic, analogous, complementary, split-complementary, triadic, tetradic |
| Type styles | Serif, sans serif, display, script, mono |
| Type scale | 16px base multiplied by 1.618 (about 10, 16, 26, 42, 68px) |
| Microinteractions | Trigger, rules, feedback, loops and modes |
| Accessibility | Contrast, focus states, click target size, modals, hover states; start early; not a checklist |
| Mobile | Declutter, chunk content, smart forms, be consistent, one navigation pattern with easy back |
| Patterns | Data and input, content structure, navigation, incentivization, hierarchy, social media |
| Design systems | Single source of truth; atomic design or foundation, components, recipes; always evolving |

---

### FINAL NOTE TO THE AI READER

The single most important takeaway from this cheat sheet is a mindset: **design is an iterative, user-centered process that moves from rough to refined, and every decision (spacing, color, type, motion, navigation, patterns) should be deliberate, consistent, tested, and accessible.** When in doubt, ask: *Does this make the user's task easier, clearer, and more inclusive?* If yes, it is probably good design. If not, revisit it.
