# Settings & Budget Fixes

## Issues Found (after thorough code review):

1. **Settings visual changes not applying to DOM**
   - `applyToDOM()` called only AFTER successful API load in `SettingsProvider`
   - On failed/initial load, CSS data-* attributes never get set (no density, font_size, font_scaling, high_contrast, reduce_motion)
   - Need to call `applyToDOM(DEFAULTS)` on mount

2. **Accessibility slider can receive undefined value**
   - `value={[a11y.font_scaling]}` — if undefined, slider breaks
   - Need safe default: `value={[a11y.font_scaling ?? 100]}`

3. **No default budget categories seeded**
   - BudgetPage depends on `/api/categories` for presets
   - If no categories exist, no suggestions/autocomplete show up
   - Need to seed default categories

4. **Backend settings view/update improvements**
   - Ensure proper error handling
   - Add missing validation