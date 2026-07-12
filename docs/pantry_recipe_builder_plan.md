# Feature Plan: AI Smart Recipe Builder & Pantry Tracker

This document details the architecture, database schema, and LLM implementation plan to build a state-of-the-art Pantry Inventory Tracker and Smart Recipe Suggestion system.

---

## 📋 1. Core Feature Concept & Capabilities

The goal is to turn the Second Brain into an active kitchen assistant that eliminates food waste, maps recipe macros automatically, and makes shopping frictionless.

### Key Sub-Features:
1. **🛒 Auto-Ingestion from Expenses:** When you log a grocery receipt or expense (e.g., *"spent ₹1200 on chicken breast, spinach, eggs, and bread"*), the AI logs the transaction and automatically splits and registers these ingredients in your virtual pantry.
2. **⏳ Freshness & Expiry Alerts:** The AI estimates the shelf life of fresh items (e.g., spinach: 5 days, chicken: 3 days). When you ask for suggestions, the AI prioritizes recipes that use up items close to their expiration date: *"Your spinach is expiring tomorrow. Let's make a healthy Chicken & Spinach scramble!"*
3. **🍳 Smart Ingredient Deductions:** When you log a meal (e.g., *"logged breakfast: scrambled eggs and bread"*), the system automatically deducts the ingredients from your pantry list to keep your inventory accurate without manual work.
4. **📝 Smart Checklist Auto-Generation:** If a recipe requires 5 ingredients and you only have 3 in stock, the remaining 2 are automatically added to an interactive `grocery_list` table.

---

## 🗄️ 2. Database Schemas

We will create two new tables in Supabase: `pantry` and `grocery_list`.

```sql
-- 1. Virtual Pantry Inventory Table
CREATE TABLE public.pantry (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT DEFAULT 'other', -- 'protein', 'vegetable', 'dairy', 'grain', 'oil/sauce', etc.
  quantity TEXT,                -- '500g', '6 items', etc. (Optional)
  added_at TIMESTAMPTZ DEFAULT NOW(),
  estimated_expiry DATE,        -- Automatically calculated by AI based on category
  
  CONSTRAINT fk_pantry_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_pantry_user_expiry ON public.pantry(user_id, estimated_expiry);

-- 2. Smart Grocery Shopping Checklist
CREATE TABLE public.grocery_list (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INT NOT NULL,
  item_name TEXT NOT NULL,
  quantity TEXT,
  checked BOOLEAN DEFAULT FALSE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_grocery_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_grocery_user_checked ON public.grocery_list(user_id, checked);
```

---

## 🤖 3. AI Ingestion & Deduction Rules (System Prompt)

To integrate this in the Deno Edge Function (`message/index.ts`), we will update the LLM schemas:

### A. Ingestion Rule (When parsing `expense` under subcategory `food`)
When a user logs groceries, instruct the system prompt to return a `pantry_additions` array in the JSON response:
```json
{
  "category": "expense",
  "data": {
    "amount": 1200,
    "description": "Supermarket Groceries"
  },
  "pantry_additions": [
    { "item_name": "chicken breast", "category": "protein", "estimated_expiry_days": 3 },
    { "item_name": "spinach", "category": "vegetable", "estimated_expiry_days": 5 },
    { "item_name": "eggs", "category": "dairy", "estimated_expiry_days": 14 }
  ]
}
```

### B. Deduction Rule (When parsing `meal` logs)
When a user logs eating a meal, instruct the prompt to output a `pantry_deductions` array to automatically subtract ingredients:
```json
{
  "category": "meal",
  "data": {
    "meal_type": "breakfast",
    "items": ["eggs", "spinach"]
  },
  "pantry_deductions": ["eggs", "spinach"]
}
```

---

## 🍳 4. The Suggestion Engine & RAG Integration

When the user queries dinner/lunch suggestions:
1. The Deno backend queries the database for all active pantry items:
   ```typescript
   const { data: pantryItems } = await supabaseClient
     .from('pantry')
     .select('item_name, estimated_expiry')
     .eq('user_id', userId)
     .order('estimated_expiry', { ascending: true });
   ```
2. The items (with their relative expiration warnings) are injected into the LLM context:
   ```text
   AVAILABLE PANTRY STOCK:
   - chicken breast (expires in 2 days)
   - spinach (expires tomorrow)
   - eggs (expires in 10 days)
   ```
3. The LLM suggests a recipe prioritizing soon-to-expire ingredients, details the recipe, and outputs any missing items to add to the shopping list:
   ```json
   {
     "acknowledgment": "Since your spinach is expiring tomorrow, I suggest making a Spinach & Egg Scramble with chicken. It maps to 450 calories and 40g of protein!",
     "grocery_additions": ["cooking oil"]
   }
   ```
   *The Deno function automatically inserts "cooking oil" into the `grocery_list` table.*
