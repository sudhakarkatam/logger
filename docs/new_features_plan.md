# Product Roadmap: Next-Gen AI Coach Features & Plans

This roadmap outlines high-end, visual, and proactive features to elevate the Second Brain AI Coach into a premium, state-of-the-art wellness platform.

---

## 1. 📊 Interactive AI Chart Cards (Visual Analytics inside Chat)

### 📋 What it is
Instead of outputting text tables when you ask about trends, the AI generates and renders fully interactive charts (Line, Bar, Pie, Radar) directly within your conversation flow.

### ⚙️ How it works
1. **The Query:** The user asks: *"Show me my step counts over the past week."*
2. **The Backend Output:** The Deno Edge Function retrieves the metrics from the daily summaries view and returns a structured response format:
   ```json
   {
     "entry": null,
     "acknowledgment": "Here is your steps trend for the past week:",
     "needs_clarification": false,
     "interactiveCard": {
       "type": "chart",
       "chartType": "line",
       "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
       "datasets": [
         {
           "label": "Steps",
           "data": [4200, 8500, 11200, 6000, 9400, 12000, 5100],
           "borderColor": "#10B981"
         }
       ]
     }
   }
   ```
3. **The Frontend Rendering:** The React app detects `interactiveCard.type === 'chart'` and renders a beautiful animated chart using a library like **Recharts** or **Chart.js** directly inside a chat bubble.

---

## 2. 🥦 AI Smart Recipe Builder & Pantry Sync

### 📋 What it is
The AI suggestions go beyond text recommendations. The Coach knows what is currently in your kitchen (based on previous grocery expense logs) and uses it to recommend customized, calorie-mapped recipes.

### ⚙️ How it works
1. **Pantry Mapping:** When you log expenses categorized under `"shopping/groceries"` (e.g. *"bought chicken, spinach, eggs, and tomatoes at supermarket"*), the AI saves these items in your virtual pantry.
2. **Recipe Suggestion:** When you say *"what should I cook for dinner?"*, the AI:
   - Scans the pantry list.
   - Suggests a recipe using only existing ingredients.
   - If a key ingredient is missing, it suggests the recipe but says: *"I added Olive Oil and Rice to your smart grocery list since you didn't have them in stock."*
3. **Grocery List Integration:** Automatically appends missing items to a new `grocery_list` table, rendering them as a checklist on your dashboard.

---

## 3. 💧 Automated Context-Aware Alerts (Micro-Coaching Nudges)

### 📋 What it is
A proactive warning system. The app doesn't wait for you to open it—it runs silent background checks and sends coaching alerts when a target is missed.

### ⚙️ How it works
1. **Cron Job Trigger:** A Supabase PG_CRON task runs a lightweight check daily at 1:00 PM, 5:00 PM, and 9:00 PM.
2. **Analysis:** It checks the `daily_activity_summaries` view for the user:
   - At 5:00 PM: If `hydration_ml < 1000`, send nudge: *"You've only drank 500ml of water today. Time to rehydrate!"*
   - At 9:00 PM: If `steps < 4000`, send nudge: *"Only 3,200 steps logged. How about a quick 10-minute walk before bed?"*
3. **Delivery:** Delivers a silent notification or pops up a special alert message the next time the app opens.

---

## 💳 4. AI Smart Budget Auto-Splitter

### 📋 What it is
Logs multi-item transactions cleanly. When you spend money at a large supermarket or store, the AI splits the purchase into logical subcategories.

### ⚙️ How it works
1. **The Entry:** You log: *"spent ₹3200 at D-Mart"*
2. **AI Categorization:** The LLM scans the amount and merchant. It splits the cost based on your shopping patterns or asks for details:
   ```json
   {
     "category": "expense",
     "data": {
       "amount": 3200,
       "currency": "INR",
       "description": "D-Mart",
       "splits": [
         { "amount": 1800, "subcategory": "food" },
         { "amount": 1400, "subcategory": "shopping" }
       ]
     }
   }
   ```
3. **Analytics Sync:** Your analytics graphs display a breakdown, showing you spend 60% on food and 40% on home supplies even when logged in a single message.
