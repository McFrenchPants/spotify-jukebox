// Runs before each test file's own imports. Points backend/src/db/index.ts
// at an isolated in-memory database instead of the real ./data/jukebox.db
// file, so tests can never race on or leak shared state (app_settings,
// rate_limit_state, etc.) across test files or across separate `npm test`
// invocations — each test file gets its own fresh, empty database.
process.env.DB_PATH = ":memory:";
