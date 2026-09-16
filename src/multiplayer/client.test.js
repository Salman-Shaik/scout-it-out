import { shuffleCodes } from "./client";

const fakeClient = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    signInAnonymously: vi.fn(),
  },
  rpc: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => fakeClient),
}));

test("shuffles country codes without losing or repeating cards", () => {
  const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
  const countries = [
    { country_code: "aa" },
    { country_code: "bb" },
    { country_code: "cc" },
  ];

  const codes = shuffleCodes(countries);
  expect(codes).toHaveLength(3);
  expect(new Set(codes)).toEqual(new Set(["aa", "bb", "cc"]));
  expect(countries.map((country) => country.country_code)).toEqual([
    "aa",
    "bb",
    "cc",
  ]);
  expect(randomSpy).toHaveBeenCalledTimes(2);
  randomSpy.mockRestore();
});

test("reports multiplayer as unavailable when configuration is missing", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
  vi.resetModules();
  const client = await import("./client");
  expect(client.multiplayerConfigured).toBe(false);
  expect(client.supabase).toBeNull();
  vi.unstubAllEnvs();
});

test("reuses an existing anonymous identity", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.resetModules();
  fakeClient.auth.getUser.mockResolvedValue({ data: { user: { id: "Ada" } } });

  const client = await import("./client");
  expect(client.multiplayerConfigured).toBe(true);
  expect(await client.ensureAnonymousUser()).toEqual({ id: "Ada" });
  expect(fakeClient.auth.signInAnonymously).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

test("signs in a new anonymous player and handles auth failures", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.resetModules();
  fakeClient.auth.getUser.mockResolvedValue({ data: { user: null } });
  fakeClient.auth.signInAnonymously.mockResolvedValue({
    data: { user: { id: "Grace" } },
    error: null,
  });

  const client = await import("./client");
  expect(await client.ensureAnonymousUser()).toEqual({ id: "Grace" });
  fakeClient.auth.signInAnonymously.mockResolvedValueOnce({
    data: null,
    error: new Error("Auth failure"),
  });
  await expect(client.ensureAnonymousUser()).rejects.toThrow("Auth failure");
  vi.unstubAllEnvs();
});

test("concurrent startup calls share one anonymous sign-in", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.resetModules();
  fakeClient.auth.getUser.mockClear().mockResolvedValue({ data: { user: null } });
  fakeClient.auth.signInAnonymously.mockClear().mockResolvedValue({
    data: { user: { id: "SamePlayer" } }, error: null,
  });
  const client = await import("./client");
  const [first, second] = await Promise.all([
    client.ensureAnonymousUser(), client.ensureAnonymousUser(),
  ]);
  expect(first).toEqual(second);
  expect(fakeClient.auth.getUser).toHaveBeenCalledTimes(1);
  expect(fakeClient.auth.signInAnonymously).toHaveBeenCalledTimes(1);
  vi.unstubAllEnvs();
});

test("RPC returns successful data and propagates database errors", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.resetModules();
  fakeClient.rpc.mockResolvedValueOnce({ data: 4, error: null });
  const client = await import("./client");
  expect(await client.rpc("roll_die", { target_game_id: "room" })).toBe(4);
  fakeClient.rpc.mockResolvedValueOnce({
    data: null,
    error: new Error("Room closed"),
  });
  await expect(client.rpc("roll_die")).rejects.toThrow("Room closed");
  vi.unstubAllEnvs();
});
