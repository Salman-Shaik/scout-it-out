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

The app uses the existing single-device game until Supabase is configured.
For the shared-device game, create `.env.local` from `.env.example` and set
`VITE_SUPABASE_URL` to the project URL and
`VITE_SUPABASE_PUBLISHABLE_KEY` to the **publishable** API key shown in
Supabase Project Settings → API Keys. A JWT signing key or key ID is not an
API key and must never be placed in a `VITE_` variable. The shared game also
requires the migration in `supabase/migrations` and anonymous sign-ins enabled
in Supabase Auth. Add the same two public variables in Vercel before deploying
multiplayer mode.

This is a family-game implementation, not an anti-cheat design: country facts
are still bundled into the browser app, so a player who inspects the client
bundle can discover answers. Only the card holder sees the card in the normal
UI. Keep this limitation in mind before using it for competitive play.

Other commands:

```powershell
npm test
npm run test:coverage
npm run test:e2e
npm run build
```

## Map attribution

World map geometry is provided by
[`@svg-maps/world`](https://github.com/VictorCazanave/svg-maps/tree/master/packages/world)
by Victor Cazanave, licensed under CC BY 4.0.
