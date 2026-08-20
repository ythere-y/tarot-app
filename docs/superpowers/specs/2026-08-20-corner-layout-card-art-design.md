# Corner Layout and Card Art Design

## Goal

Make every drawn tarot card render its local artwork and reorganize the desktop interface into predictable corner controls without obscuring the 3D table.

## Design

- Ship the existing 79 JPEG assets from `D:\VS_code\project\tarot-app\tarot_img` with the feature and reference them from the app root as `/tarot_img/<file>.jpg`.
- Keep the archive fixed at bottom-left, the oracle controls fixed at bottom-right, and the contextual onboarding guide fixed at top-right. The status panel sits below the guide area.
- Render the brand as one non-wrapping `ETHER TAROT` line and reduce its size responsively on narrow screens.
- On small screens, retain the same semantic placement while constraining widths and heights so the center draw area remains usable.

## Failure Handling and Verification

The existing texture fallback remains active if an individual JPEG cannot load. Automated smoke coverage verifies a real JPEG response, root-relative card URLs, and the four-corner layout contract; browser verification confirms a real draw displays artwork.
