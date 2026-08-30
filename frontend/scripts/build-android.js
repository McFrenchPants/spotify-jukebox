#!/usr/bin/env node
/**
 * One-command Android build: repo -> installable debug APK.
 *
 * Chains, in order:
 *   1. `npm run build`        (existing web build: tsc -b && vite build)
 *   2. `npx cap sync android` (copies web build into the native project)
 *   3. Gradle `assembleDebug` (via the wrapper in frontend/android/)
 *
 * Cross-platform: picks `gradlew.bat` on Windows and `./gradlew` elsewhere,
 * and prints the final APK path on success.
 *
 * JDK 21 wrinkle (see docs/proposals/master-device-mode/ANDROID_BUILD.md):
 * the Capacitor Android runtime module requires JDK 21 to compile, but a
 * shell can have JDK 17 as the default `java`/JAVA_HOME even when a JDK 21
 * is installed and JAVA_HOME is correctly set at the Windows User/Machine
 * environment level (a fresh shell doesn't always pick that up). This
 * script checks whether the *effective* JAVA_HOME (or default `java`) is
 * actually 21+, and if not, tries to auto-locate a JDK 21 install in common
 * locations and use that just for the Gradle step. If none can be found, it
 * fails fast with a clear message rather than letting Gradle fail deep into
 * the build with a confusing "invalid source release: 21" error.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const isWindows = process.platform === "win32";
const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const androidDir = path.join(frontendDir, "android");
const apkPath = path.join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  "debug",
  "app-debug.apk",
);

function log(msg) {
  console.log(`[build-android] ${msg}`);
}

function fail(msg) {
  console.error(`\n[build-android] ERROR: ${msg}\n`);
  process.exit(1);
}

function run(command, args, opts = {}) {
  log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: isWindows,
    cwd: opts.cwd ?? frontendDir,
    env: opts.env ?? process.env,
  });
  if (result.error) {
    fail(`Failed to run "${command}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `"${command} ${args.join(" ")}" exited with code ${result.status}. Aborting build.`,
    );
  }
}

/** Returns the major version number reported by `java -version`, or null. */
function getJavaMajorVersion(javaHome) {
  const javaBin = javaHome
    ? path.join(javaHome, "bin", isWindows ? "java.exe" : "java")
    : "java";
  if (javaHome && !existsSync(javaBin)) return null;

  const result = spawnSync(javaBin, ["-version"], {
    encoding: "utf8",
    shell: false,
  });
  if (result.error || result.status !== 0) return null;

  // `java -version` prints to stderr, e.g.: java version "21.0.12" 2024-07-16
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const match = output.match(/version "(\d+)(?:\.\d+)?/);
  if (!match) return null;
  const major = parseInt(match[1], 10);
  // Old-style versioning: "1.8.0_xxx" -> major version is the second number.
  if (major === 1) {
    const legacyMatch = output.match(/version "1\.(\d+)/);
    return legacyMatch ? parseInt(legacyMatch[1], 10) : major;
  }
  return major;
}

/** Best-effort search for a JDK 21+ install in common per-OS locations. */
function findJdk21() {
  const candidateRoots = isWindows
    ? [
        "C:\\Program Files\\Eclipse Adoptium",
        "C:\\Program Files\\Java",
        "C:\\Program Files\\Microsoft",
        "C:\\Program Files\\Amazon Corretto",
      ]
    : process.platform === "darwin"
      ? ["/Library/Java/JavaVirtualMachines"]
      : ["/usr/lib/jvm"];

  for (const root of candidateRoots) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/jdk-?21/i.test(entry.name)) continue;
      let jdkHome = path.join(root, entry.name);
      // macOS JDKs nest the real home under Contents/Home.
      const macHome = path.join(jdkHome, "Contents", "Home");
      if (existsSync(macHome)) jdkHome = macHome;
      if (getJavaMajorVersion(jdkHome) >= 21) return jdkHome;
    }
  }
  return null;
}

/** Resolves a JAVA_HOME (env override for this process only) that is JDK 21+. */
function resolveJava21Home() {
  const currentJavaHome = process.env.JAVA_HOME;
  if (currentJavaHome) {
    const version = getJavaMajorVersion(currentJavaHome);
    if (version && version >= 21) {
      log(`Using JAVA_HOME from environment (JDK ${version}): ${currentJavaHome}`);
      return currentJavaHome;
    }
    log(
      `JAVA_HOME is set (${currentJavaHome}) but reports JDK ${version ?? "unknown"}, not 21+. Looking for a JDK 21 install instead...`,
    );
  } else {
    const defaultVersion = getJavaMajorVersion(null);
    if (defaultVersion && defaultVersion >= 21) {
      log(`Default "java" on PATH is already JDK ${defaultVersion}; no JAVA_HOME override needed.`);
      return null;
    }
    log(
      `JAVA_HOME is not set and default "java" on PATH is JDK ${defaultVersion ?? "unknown"}, not 21+. Looking for a JDK 21 install...`,
    );
  }

  const found = findJdk21();
  if (found) {
    log(`Found JDK 21 at ${found}; using it for the Gradle step.`);
    return found;
  }

  fail(
    [
      "Could not find a JDK 21 install (needed for the Capacitor Android module — see",
      "docs/proposals/master-device-mode/ANDROID_BUILD.md, section 1).",
      "Install Eclipse Temurin 21 (or any JDK 21 distribution) and either:",
      "  - set JAVA_HOME to point at it before running this script, or",
      "  - make sure it lives under a standard install location so it can be auto-detected.",
    ].join("\n"),
  );
}

function main() {
  log("Step 1/3: npm run build");
  run(isWindows ? "npm.cmd" : "npm", ["run", "build"]);

  log("Step 2/3: npx cap sync android");
  run(isWindows ? "npx.cmd" : "npx", ["cap", "sync", "android"]);

  log("Step 3/3: gradle assembleDebug");
  const java21Home = resolveJava21Home();
  const gradleEnv = { ...process.env };
  if (java21Home) {
    gradleEnv.JAVA_HOME = java21Home;
    const javaBinDir = path.join(java21Home, "bin");
    gradleEnv.PATH = `${javaBinDir}${path.delimiter}${process.env.PATH ?? ""}`;
  }

  const gradlew = isWindows
    ? path.join(androidDir, "gradlew.bat")
    : path.join(androidDir, "gradlew");
  run(gradlew, ["assembleDebug"], { cwd: androidDir, env: gradleEnv });

  if (!existsSync(apkPath)) {
    fail(
      `Gradle reported success but the expected APK was not found at:\n  ${apkPath}`,
    );
  }

  log("BUILD SUCCEEDED");
  console.log(`\nAPK ready at: ${apkPath}\n`);
}

main();
