// Drop this file in the SAME folder as your existing characterAssets.js,
// alongside your "growth-portraits" folder containing level-1.jpg ...
// level-18.jpg (rename your 18 images to match this pattern if they're
// not already named that way).
//
// Level 200 is exclusive to image 18 (the max-level reward); images 1-17
// split the other 199 levels as evenly as possible (199 isn't divisible by
// 17, so it's twelve groups of 12 levels followed by five groups of 11):
//   Level   1–12   → level-1.jpg
//   Level  13–24   → level-2.jpg
//   Level  25–36   → level-3.jpg
//   Level  37–48   → level-4.jpg
//   Level  49–60   → level-5.jpg
//   Level  61–72   → level-6.jpg
//   Level  73–84   → level-7.jpg
//   Level  85–96   → level-8.jpg
//   Level  97–108  → level-9.jpg
//   Level 109–120  → level-10.jpg
//   Level 121–132  → level-11.jpg
//   Level 133–144  → level-12.jpg
//   Level 145–155  → level-13.jpg
//   Level 156–166  → level-14.jpg
//   Level 167–177  → level-15.jpg
//   Level 178–188  → level-16.jpg
//   Level 189–199  → level-17.jpg
//   Level 200      → level-18.jpg (exclusive)

import level1 from "./growth-portraits/level-1.jpg";
import level2 from "./growth-portraits/level-2.jpg";
import level3 from "./growth-portraits/level-3.jpg";
import level4 from "./growth-portraits/level-4.jpg";
import level5 from "./growth-portraits/level-5.jpg";
import level6 from "./growth-portraits/level-6.jpg";
import level7 from "./growth-portraits/level-7.jpg";
import level8 from "./growth-portraits/level-8.jpg";
import level9 from "./growth-portraits/level-9.jpg";
import level10 from "./growth-portraits/level-10.jpg";
import level11 from "./growth-portraits/level-11.jpg";
import level12 from "./growth-portraits/level-12.jpg";
import level13 from "./growth-portraits/level-13.jpg";
import level14 from "./growth-portraits/level-14.jpg";
import level15 from "./growth-portraits/level-15.jpg";
import level16 from "./growth-portraits/level-16.jpg";
import level17 from "./growth-portraits/level-17.jpg";
import level18 from "./growth-portraits/level-18.jpg";
import level500 from "./growth-portraits/level-500.jpg";

// Keyed by the LEVEL each image starts being used at — matches
// GrowthCharacterPortrait's updated `thresholds` array in App.jsx:
// [0, 13, 25, 37, 49, 61, 73, 85, 97, 109, 121, 133, 145, 156, 167, 178, 189, 200]
export const GROWTH_PORTRAIT_IMAGES = {
  0: level1,
  13: level2,
  25: level3,
  37: level4,
  49: level5,
  61: level6,
  73: level7,
  85: level8,
  97: level9,
  109: level10,
  121: level11,
  133: level12,
  145: level13,
  156: level14,
  167: level15,
  178: level16,
  189: level17,
  200: level18,
  500: level500,
};