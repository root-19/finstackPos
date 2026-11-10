# Architect decisions

- Marketing pages (`/`, `/privacy`, `/terms`) are isolated from the app: `marketing` view flag in `app.blade.php`, own font, `mk-*` classes.
- Plan facts (price, limits, trial) always come from `App\Support\Platform`, never from copy.

Active features: [landing-ui](landing-ui.md)
