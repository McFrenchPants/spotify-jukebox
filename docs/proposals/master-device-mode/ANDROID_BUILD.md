# Android Build Prerequisites (Master Device Mode)

Status: **partially verified**. This doc was written after actually attempting a
debug build in a real dev environment (Windows 11, this repo, branch
`feature/master-device-mode`). Sections marked "Verified" below were
confirmed by running the commands. Sections marked "Per Capacitor/AGP
convention" are documented from the generated Gradle config's own stated
requirements and standard Capacitor/Android Gradle Plugin (AGP) behavior,
but were **not** exercised end-to-end here because the local Android SDK
platform used for the successful parts of this attempt was not fully set up
for the final assemble step — see "What was actually tried" for the exact
point where it stopped working, and why.

## 1. What must be installed locally

### JDK

The generated project needs **JDK 21**, not JDK 17.

- `frontend/android/gradle/wrapper/gradle-wrapper.properties` pins
  **Gradle 8.14.3** (`distributionUrl=...gradle-8.14.3-all.zip`).
- `frontend/android/build.gradle` pins the **Android Gradle Plugin (AGP) to
  8.13.0** (`classpath 'com.android.tools.build:gradle:8.13.0'`).
- Gradle 8.14 / AGP 8.13 both support running on JDK 17–24, so JDK 17 is
  enough to *start* Gradle and configure the project. However, the
  Capacitor Android runtime module itself (`@capacitor/android`, pulled in
  as the `:capacitor-android` Gradle module from
  `node_modules/@capacitor/android/capacitor/build.gradle`) explicitly sets:

  ```groovy
  sourceCompatibility JavaVersion.VERSION_21
  targetCompatibility JavaVersion.VERSION_21
  ```

  **Verified**: with only JDK 17 installed (`java -version` →
  `17.0.9`, `JAVA_HOME=C:\Program Files\Java\jdk-17`), running
  `gradlew.bat assembleDebug` gets all the way through project
  configuration and resource merging, then fails at
  `:capacitor-android:compileDebugJavaWithJavac` with:

  ```
  > Task :capacitor-android:compileDebugJavaWithJavac FAILED
  ...
  Execution failed for task ':capacitor-android:compileDebugJavaWithJavac'.
  > Java compilation initialization error
      error: invalid source release: 21
  ```

  So **install a JDK 21 LTS distribution** (Eclipse Temurin 21, or the JDK
  bundled with a recent Android Studio) and point `JAVA_HOME` at it before
  building. This was not re-tried with a JDK 21 install in this pass —
  installing a JDK was out of scope for this task — so the fix itself is
  inferred from the error message and the `capacitor-android` build file,
  not re-verified after switching JDKs.

### Android SDK

Two routes, either works — Gradle only needs the SDK components on disk,
it doesn't care how they got there:

1. **Android Studio** (simplest for most contributors): install it, open
   `frontend/android` as a project once, and let its SDK Manager install
   the platform/build-tools it asks for. Android Studio's bundled JDK
   (21+ in current releases) can also be pointed to via `JAVA_HOME` /
   Gradle JVM setting, sidestepping the JDK question above.
2. **Command-line tools only** (headless / CI-friendly): download the
   "command line tools only" package from
   `https://developer.android.com/studio#command-tools`, unpack it under
   `<sdk-root>/cmdline-tools/latest/`, then use its `sdkmanager` to
   install what's needed, e.g.:

   ```
   sdkmanager --sdk_root=<sdk-root> "platform-tools" "platforms;android-36" "build-tools;35.0.0"
   ```

   The exact platform/build-tools versions to fetch come from
   `frontend/android/variables.gradle`:

   ```groovy
   ext {
       minSdkVersion = 24
       compileSdkVersion = 36
       targetSdkVersion = 36
       ...
   }
   ```

   So `compileSdk`/`targetSdk` = **36**, `minSdk` = **24**. A
   `platforms;android-36` package is required.

   **Verified (partially)**: this machine already had an SDK at
   `C:\Dev\Android SDK` (found via a `platform-tools` entry already on
   `PATH`), with `platforms/android-34` and `platforms/android-35`
   installed but **not** `android-36`. Gradle's own SDK auto-download
   kicked in during the build attempt and successfully fetched and
   installed `Android SDK Platform 36` on the fly (accepting the license
   non-interactively via `local.properties`/environment being present):

   ```
   Checking the license for package Android SDK Platform 36 in C:\Dev\Android SDK\licenses
   License for package Android SDK Platform 36 accepted.
   ...
   Installing Android SDK Platform 36 in C:\Dev\Android SDK\platforms\android-36
   "Install Android SDK Platform 36 (revision 2)" finished.
   ```

   So a from-scratch `sdkmanager` install could in principle skip
   `platforms;android-36` and let Gradle's auto-install fetch it — but
   don't rely on that in a CI/offline environment; install it explicitly
   there.

## 2. `ANDROID_HOME` / `local.properties`

The generated Android project (like any Capacitor/Android Studio project)
needs to know where the SDK lives, via **either**:

- an `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) environment variable pointing
  at the SDK root, **or**
- `frontend/android/local.properties` (not checked into git — it's
  covered by the generated `frontend/android/.gitignore`'s
  `local.properties` line) containing:

  ```properties
  sdk.dir=C:\\path\\to\\Android\\Sdk
  ```

**Verified**: this repo's `frontend/android/local.properties` did not
exist before this task (confirmed it wasn't present, and no `ANDROID_HOME`
was set in the shell). For this attempt, a `local.properties` was created
locally pointing at `C:\Dev\Android SDK` and `ANDROID_HOME` was also
exported for the same path — either alone would have worked, both were
set here as a belt-and-suspenders measure. That file was **not** added
back to the doc's constraints as a repo change — it stays untracked
per `.gitignore`, and is not part of this commit.

## 3. Build command sequence from a clean checkout

```
cd frontend
npm install
npm run build          # runs `tsc -b && vite build`, per frontend/package.json
npx cap sync android
cd android
./gradlew assembleDebug        # or gradlew.bat assembleDebug on Windows
```

Notes on the actual script names (checked against `frontend/package.json`):
the build script is `npm run build` (→ `tsc -b && vite build`), matching
the sequence above — no adjustment needed there.

**Verified**: `npm run build` and `npx cap sync android` were both run for
real in this pass and succeeded:

```
> frontend@0.0.0 build
> tsc -b && vite build
✓ 98 modules transformed.
dist/index.html                   0.71 kB
dist/assets/index-B05V6MMT.css   37.20 kB
dist/assets/index-OM_Sp5QA.js   339.51 kB
✓ built in 429ms
```

```
√ Copying web assets from dist to android\app\src\main\assets\public
√ Creating capacitor.config.json in android\app\src\main\assets
√ copy android
√ Updating Android plugins
√ update android
[info] Sync finished in 0.107s
```

`gradlew.bat assembleDebug` was then run and progressed through Gradle
distribution download, SDK license acceptance, SDK Platform 36
auto-install, and 39 actionable Gradle tasks (manifest merging, resource
processing, R-file generation, etc.) before failing at
`:capacitor-android:compileDebugJavaWithJavac` for the JDK 21 reason
documented in section 1. **No APK was produced in this environment** —
the command sequence above is accurate as far as it went, but has not
been confirmed to succeed to completion here. The next attempt should
install JDK 21, set `JAVA_HOME` to it, and re-run
`gradlew.bat assembleDebug` from this same checkout (the SDK and
`local.properties`/`ANDROID_HOME` setup already in place should not need
to change).

## 4. Where the APK lands

Per AGP's default output convention, and consistent with the fact that
`frontend/android/app/build.gradle` defines no custom build-type output
directory or APK filename override (only the standard `debug`/`release`
`buildTypes` block, `applicationId "com.mcfrench.guestjukebox"`, no
`archivesBaseName` or `outputFileName` overrides), a successful
`assembleDebug` should produce:

```
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

This path was **not** confirmed by an actual successful build in this
pass (the build failed before reaching the `:app:assembleDebug`/packaging
task), so treat it as the expected default rather than a verified fact
until someone runs this to completion with a JDK 21 toolchain.

## Summary of what's confirmed vs. not

| Item | Status |
|---|---|
| JDK 17 alone is insufficient (`capacitor-android` requires source/target 21) | Verified by actual build failure |
| Gradle 8.14.3 / AGP 8.13.0 accept JDK 17 for Gradle itself (project configures, fails later at Java compile) | Verified |
| `npm run build` works from a clean-ish checkout | Verified |
| `npx cap sync android` works | Verified |
| Android SDK routes (Android Studio vs. `sdkmanager` command-line tools) | Documented from Capacitor/Android convention, not both tried here (only the pre-existing SDK-on-disk route was used) |
| `compileSdk`/`targetSdk` 36, `minSdk` 24 requiring `platforms;android-36` | Verified indirectly — Gradle auto-installed it when missing |
| `ANDROID_HOME` / `local.properties` mechanism | Verified working (build progressed past SDK resolution) |
| Final APK output path | Not verified — inferred from default AGP convention and absence of custom output overrides in `app/build.gradle` |
| A full, successful `assembleDebug` producing an installable APK | **Not achieved in this environment** — blocked on missing JDK 21 |
