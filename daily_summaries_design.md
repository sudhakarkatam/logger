# Design Specification: Dynamic Daily Summaries & Multi-Variable Correlation Insights

## 📋 What this Feature is About
This feature transforms the Second Brain assistant from a simple journal search engine into an intelligent, proactive health and lifestyle coach. Instead of just searching individual past logs (e.g., *"What did I eat yesterday?"*), the system compiles all your daily metrics—meals, exercise, sleep, hydration, step counts, moods, and spending—into a single pre-calculated habit sheet.

## ⚡ What it Does
1. **Dynamic Database Aggregation:** PostgreSQL compiles your hourly log entries into clean daily rows on the fly, keeping summaries perfectly in sync with your logs while reducing application memory load.
2. **Calculates Daily Net Totals:**
   - **Calorie Balance:** Subtracts active calories burned from total calorie intake.
   - **Active Minutes & Steps:** Aggregates activity levels from workouts or connected wearable feeds.
   - **Hydration Tracker:** Monitines cumulative water intake (in ml) to keep you on track.
   - **Average Mood Score:** Computes daily average mood intensities.
3. **Enables Proactive Correlation Insights:** Allows the AI Coach to connect the dots across different metrics in the past 30 days (e.g., discovering that you sleep 1.5 hours longer on days you log more than 8,000 steps).

---

## 1. Database Layer: PostgreSQL Views & Schemas

### A. The dynamic `daily_activity_summaries` View SQL
Run the following SQL migration to create the view. It groups all entries chronologically by day in the user's timezone (`Asia/Kolkata`) and aggregates individual category metrics:

```sql
CREATE OR REPLACE VIEW public.daily_activity_summaries AS
SELECT 
  user_id,
  (entry_time::timestamptz AT TIME ZONE 'Asia/Kolkata')::date as log_date,
  
  -- 1. Meals & Calories (Intake)
  jsonb_agg(data) FILTER (WHERE category = 'meal') as meals,
  COALESCE(SUM((data->'nutrition'->>'calories')::numeric) FILTER (WHERE category = 'meal'), 0) as calories_intake,
  
  -- 2. Exercise & Active Calories Burned
  jsonb_agg(data) FILTER (WHERE category = 'exercise') as exercises,
  COALESCE(SUM((data->>'calories_burned')::numeric) FILTER (WHERE category = 'exercise'), 0) as calories_burned,
  COALESCE(SUM((data->>'duration_minutes')::numeric) FILTER (WHERE category = 'exercise'), 0) as active_minutes,
  
  -- 3. Steps (Logged manually or synced via Wearables)
  COALESCE(SUM((data->>'steps')::numeric) FILTER (WHERE category = 'exercise' OR category = 'other'), 0) as steps,
  
  -- 4. Sleep metrics
  COALESCE(SUM((data->>'hours')::numeric) FILTER (WHERE category = 'sleep'), 0) as sleep_hours,
  jsonb_agg(data->>'quality') FILTER (WHERE category = 'sleep' AND data->>'quality' IS NOT NULL) as sleep_qualities,
  
  -- 5. Hydration / Water Intake (ml)
  COALESCE(SUM((data->>'amount_ml')::numeric) FILTER (WHERE category = 'hydration'), 0) as hydration_ml,
  
  -- 6. Mood Indexing & Averaging
  COALESCE(AVG((data->>'intensity')::numeric) FILTER (WHERE category = 'mood'), 0) as avg_mood_intensity,
  jsonb_agg(data->>'mood') FILTER (WHERE category = 'mood' AND data->>'mood' IS NOT NULL) as moods_logged,
  
  -- 7. Daily Expenses (INR)
  COALESCE(SUM((data->>'amount')::numeric) FILTER (WHERE category = 'expense'), 0) as total_expenses_inr
  
FROM entries
GROUP BY user_id, log_date;
```

---

## 2. Payload Structure for New Categories

### A. Hydration Log Payload
* **Raw Prompt:** *"Drank 500ml water"*
* **Category:** `hydration`
* **JSONB `data` schema:**
  ```json
  {
    "amount_ml": 500,
    "type": "water"
  }
  ```

### B. Wearable/Step Sync Payload
* **Raw Prompt:** *"Logged 8400 steps today"* or automated sync from Apple Health / Google Fit.
* **Category:** `exercise`
* **JSONB `data` schema:**
  ```json
  {
    "steps": 8400,
    "source": "Apple Health"
  }
  ```

---

## 3. Edge Function Integration (Deno)

When the user triggers a `QUERY` intent, replace the Javascript loop calculations in `message/index.ts` with a direct SELECT query from the View:

```typescript
// Fetch the past 30 days of pre-aggregated summaries
const { data: viewData, error: viewErr } = await supabaseClient
  .from('daily_activity_summaries')
  .select('log_date, calories_intake, calories_burned, active_minutes, steps, sleep_hours, sleep_qualities, hydration_ml, avg_mood_intensity, total_expenses_inr')
  .eq('user_id', userId)
  .order('log_date', { ascending: false })
  .limit(30);

let dailyMetricsContext = '';
if (viewData && viewData.length > 0) {
  dailyMetricsContext = `DAILY LOG METRICS SUMMARY (PAST 30 DAYS):\n` +
    `Date | Cal Intake | Cal Burned | Steps | Sleep | Water (ml) | Mood | Expenses\n` +
    `---|---|---|---|---|---|---|---\n` +
    viewData.map(d => {
      const sleepQual = d.sleep_qualities && d.sleep_qualities.length > 0 ? ` (${d.sleep_qualities.join(', ')})` : '';
      return `${d.log_date} | ${d.calories_intake} kcal | ${d.calories_burned} kcal | ${d.steps} | ${d.sleep_hours} hrs${sleepQual} | ${d.hydration_ml} ml | Intensity ${d.avg_mood_intensity} | ₹${d.total_expenses_inr}`;
    }).join('\n');
}
```

---

## 4. Prompt Engineering for Correlation Insights

Inject the following guidelines into the LLM system prompt (`queryPrompt`) to trigger smart, preventative coaching responses:

```text
Strict Health Correlation Guidelines:
1. When generating summaries or answering questions about general health, mood, sleep, or weight/exercise, you MUST actively analyze patterns in the DAILY LOG METRICS SUMMARY.
2. Look for correlations between different variables over the past 30 days:
   - Sleep vs. Steps (e.g. Does the user sleep better/longer on days they walk > 8,000 steps?).
   - Mood vs. Sleep (e.g. Does mood intensity drop on days with less than 6 hours of sleep?).
   - Hydration vs. Headaches/Mood (e.g. Check if the user logged headaches or low mood when hydration was < 1,500ml).
   - Net Calories (e.g. Compare Calorie Intake vs. Calorie Burned to see if they are in a deficit or surplus).
3. Frame suggestions as friendly coaching realizations. Example:
   "I noticed that on days you get over 8,000 steps, your sleep quality improves to 'Good' and you sleep 1.5 hours longer on average compared to days under 4,000 steps. Let's aim to get a quick walk in today!"
```
