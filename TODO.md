# Settings & Budget Fixes

## Issues Found (after thorough code review):

1. **Settings visual changes not applying to DOM** ✅ FIXED
   - `applyToDOM()` called only AFTER successful API load in `SettingsProvider`
   - On failed/initial load, CSS data-* attributes never get set (no density, font_size, font_scaling, high_contrast, reduce_motion)
   - ✅ Called `applyToDOM(DEFAULTS)` on mount

2. **Accessibility slider can receive undefined value** ✅ FIXED
   - `value={[a11y.font_scaling]}` — if undefined, slider breaks
   - ✅ Changed to safe default: `value={[a11y.font_scaling ?? 100]}`

3. **No default budget categories seeded** ✅ IMPLEMENTED
   - BudgetPage depends on `/api/categories` for presets
   - If no categories exist, no suggestions/autocomplete show up
   - ✅ Implemented DEFAULT_MONTHLY_BUDGETS with 22 categories
   - ✅ seed_default_budgets_for_user() function in budget_system.py
   - ✅ Integrated into register() in auth.py
   - ✅ New users get £1,810 monthly budget with smart category allocation

4. **Backend settings view/update improvements**
   - Ensure proper error handling
   - Add missing validation