import dotenv from "dotenv";

dotenv.config();

import { createApp } from "./app";
import { runMigrations } from "./db";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

runMigrations();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Guest Jukebox backend listening on port ${PORT}`);
});
