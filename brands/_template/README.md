# Brand template notes

`brand.json` cannot hold comments, so the fields added for Reda are explained here. Copy the folder to `brands/<slug>/` and fill it in.
Reference example: `brands/reda/brand.json` (do not copy its values).

- `colors.on_primary`: text color on `primary` fills (pills, boxes). `null` = use `ink`.
- `colors.accent_on_paper`: accent variant with enough contrast on light backgrounds (accent text on `paper`). `null` = use `accent`.
- `cta_card.background`: `"ink"` (dark end card, default) or `"paper"` (light card for light brands).
- `characters`: recurring characters/avatars, `{"<id>": {"image": "assets/<id>.png", "role": "what it is for"}}`. Paths are relative to the brand dir.
  The id `rex` is the chat avatar used by `chatBubbles` (`characters.rex.image`); without it the avatar falls back to an ink circle.
- `ai_label`: draw the in-video AI legend (`true`/`false`). It is a brand option, not the legal requirement.
- `ai_disclosure`: free text, how the brand discloses AI people/voices (e.g. in-video legend or not, and which platform toggle to switch on when publishing: Meta "Informacion de IA", TikTok "Contenido generado por IA").
- `faces`:
  - `real_people_allowed` / `consent_on_file`: both must be `true` before any real person's face or voice is used.
  - `people[]` (the template ships one blank entry; delete it if the brand has no real people):
    - `name`, `role`: who they are and their function in the videos.
    - `identity_media_ids`: Higgsfield media ids of the face references (strings).
    - `voice_ref_media_id`: media id of the voice reference clip (timbre only), or `null`.
    - `consent`: who confirmed it, when and for what use.
    - `pronunciation`: notes for TTS/voice, e.g. `"REDA = REH-dah"`.
    - `voice_clone`: `null`, or `{"provider": "elevenlabs" | "higgsfield", "voice_id": "", "created": "YYYY-MM-DD", "consent": ""}` when a voice clone exists.
    - `default_for_type3`: `true` if this person is the default presenter for type-3 (100 % AI) videos.
