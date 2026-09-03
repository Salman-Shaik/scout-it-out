# ChatGPT prompt: generate the complete Scout It Out country dataset

Use GPT-5.6 Sol. Attach `src/data/countries_info.json` to the conversation, then
paste everything below as one prompt.

---

I am expanding a country guessing card game inspired by the tone and play style
of Skillmatics Scout It Out. Create a complete, polished country dataset and
give me the result as a downloadable file named `countries_info.json`.

Use my attached `countries_info.json` only as a reference for the JSON field
names and overall structure. Do not copy, paraphrase, or preserve its facts;
some existing facts are inaccurate, repetitive, awkward, or based on rankings.
Generate and verify a completely fresh dataset.

## Scope

Include exactly 195 sovereign states: the 193 United Nations member states plus
the two UN observer states, Palestine and the Holy See (use the display name
`Vatican City`). Do not include territories, dependencies, constituent
countries, or partially recognized states outside this definition. In
particular, do not add Hong Kong, Taiwan, Kosovo, Puerto Rico, Greenland, or
Western Sahara.

Every country must appear exactly once. Use familiar English display names,
such as `South Korea`, `North Korea`, `Russia`, `Turkey`, `Laos`, `Vietnam`,
`Bolivia`, `Tanzania`, `Ivory Coast`, `Democratic Republic of the Congo`, and
`Republic of the Congo`.

## Exact output schema

Return one JSON array containing exactly 195 objects. Every object must have
exactly these fields in this order:

```json
{
  "clues": [
    "easy clue 1",
    "easy clue 2",
    "medium clue 1",
    "medium clue 2",
    "hard clue 1",
    "hard clue 2"
  ],
  "buzzword": "one short challenge clue",
  "continent": "Africa",
  "answer": "Country name",
  "country_code": "xx"
}
```

`country_code` must be the unique lowercase ISO 3166-1 alpha-2 code. Use only
these continent values: `Africa`, `Asia`, `Europe`, `North America`,
`South America`, and `Oceania`. For transcontinental countries, choose one
continent consistently according to the country's commonly taught primary
geographic classification.

## Clue design

Write six concise, child-friendly clues for each country, ordered from easiest
to hardest:

1. Clues 1-2: recognizable entry points suitable for families and casual
   players.
2. Clues 3-4: moderately distinctive cultural, geographic, historical,
   linguistic, culinary, wildlife, art, sport, or landmark facts.
3. Clues 5-6: lesser-known but meaningful facts that remain fair and useful in
   a guessing game.

Each clue should normally be one sentence and 8-22 words. Use natural,
engaging language. Prefer concrete facts that help a player reason toward the
answer over generic encyclopedia filler.

The six clues for a country must cover varied aspects of that country. Do not
repeat or lightly reword the same fact. Across neighboring or culturally
related countries, avoid using interchangeable clue sets.

## Hard prohibitions

- Never mention the answer, a recognizable fragment of the answer, its common
  abbreviation, or its demonym in any clue or buzzword.
- Do not use ordinal or ranking facts: no `first`, `second`, `third`, `Nth`,
  `top ten`, `one of the largest`, `ranks`, or similar constructions.
- Do not use volatile statistics such as population, GDP, production totals,
  percentages, officeholders, current politics, or recent rankings.
- Do not use vague filler such as `it has a rich culture`, `it has a diverse
  landscape`, `it is known for its history`, or `it is a popular destination`.
- Do not make subjective, promotional, disputed, stereotypical, political, or
  derogatory claims.
- Do not rely on a fact that is also true of dozens of countries unless another
  detail makes the clue distinctive.
- Do not reveal the answer too early through a capital city in clues 1-2.
- Do not mention flags or describe flag colors; the game displays the flag
  separately.
- Do not include citations, Markdown, comments, trailing commas, placeholders,
  difficulty labels, or any fields beyond the five in the schema.

The `buzzword` is a final compact challenge clue, ideally one to three words.
It may be a lesser-known landmark, food, tradition, geographic feature,
historical site, art form, or other meaningful association. It should reward
deeper knowledge and may be harder than the six main clues, but it must not
contain the country name or merely repeat a clue.

## Accuracy and quality control

Use web research when available and verify every claim against reliable,
current sources. Prefer stable facts that are unlikely to become outdated.
When a claim is uncertain, replace it with a better-supported fact rather than
qualifying it.

Before creating the file, silently perform these checks and repair every
failure:

1. Exactly 195 objects and 195 unique answers.
2. Exactly 195 unique, valid lowercase ISO alpha-2 codes.
3. Exactly six non-empty, unique clues in every object.
4. Every object has only `clues`, `buzzword`, `continent`, `answer`, and
   `country_code`.
5. No answer name, obvious name fragment, abbreviation, or demonym appears in
   that country's clues or buzzword.
6. No ordinal rankings, volatile statistics, duplicate facts, vague filler,
   malformed characters, or unsupported claims remain.
7. The file parses as strict UTF-8 JSON without Markdown fences.

Do not paste the entire dataset into the chat response if you can create files.
Create and attach the downloadable `countries_info.json` file. In the message,
report only the filename, record count, validation results, and any important
interpretation you had to make.
