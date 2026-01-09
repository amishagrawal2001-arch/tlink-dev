Bundled Fish shell (optional)
============================

Tlink does NOT ship the Fish shell binary by default.

If you want Fish to be part of the app bundle, place prebuilt Fish binaries here
before building the installers.

Expected layout inside the repository:

  extras/
    fish/
      mac/
        fish
      linux/
        fish

At runtime, Tlink will look for:
  - Packaged builds: <resources>/extras/fish/<platform>/fish
  - Dev mode:        <repo>/extras/fish/<platform>/fish

When found, "Fish (bundled)" will appear as a built-in Local shell and can be
selected as the default local terminal profile.

Notes:
  - Ensure the binary is executable (Tlink will try chmod 755 on mac/linux).
  - Verify licensing/compliance for redistribution of the Fish binary.


