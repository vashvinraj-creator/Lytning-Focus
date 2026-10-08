// Put this file in src/ (next to App.jsx and characterAssets.js).
// It automatically picks up every image in src/Profile/ named with a number
// (1.jpg, 2.png, 3.webp ... any of jpg/jpeg/png/webp) — no need to list them.
//
// Unlock levels (profile number -> level the user must have reached):
export const PROFILE_UNLOCK_LEVELS = {
  1: 1,
  2: 10,
  3: 30,
  4: 60,
  5: 100,
  6: 150,
  7: 200,
  8: 500, // secret top tier — the picker never shows this number
};
export const SECRET_PROFILE_ID = 8;

const files = import.meta.glob("./Profile/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}", {
  eager: true,
  import: "default",
});

export const PROFILE_AVATARS = Object.entries(files)
  .map(([path, src]) => {
    const m = path.match(/(\d+)\.[a-z]+$/i);
    return m ? { id: parseInt(m[1], 10), src } : null;
  })
  .filter(Boolean)
  .sort((a, b) => a.id - b.id)
  .map((p) => ({
    ...p,
    // Any extra image you add later without a rule here unlocks at level 1.
    unlockLevel: PROFILE_UNLOCK_LEVELS[p.id] ?? 1,
    secret: p.id === SECRET_PROFILE_ID,
  }));
