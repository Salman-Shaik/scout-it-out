# Scout It Out

A multiplayer country trivia game built with React and Vite.

## Refresh country data

The app reads its 195-country dataset from
`src/data/countries_info.json`. To generate a future replacement, attach that
file to a GPT-5.6 Sol conversation and use the prompt in
`scripts/CHATGPT_COUNTRY_DATA_PROMPT.md`. Validate the downloaded JSON before
replacing the app dataset.

## Web app

Install dependencies and start the development server:

```powershell
npm install
npm start
```

Other commands:

```powershell
npm test
npm run build
```
