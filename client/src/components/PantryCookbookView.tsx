import { useState, useEffect } from 'react';
import { 
  queryPantry, 
  queryRecipes, 
  deleteRecipe, 
  deletePantryItem, 
  updatePantryItemQuantity, 
  updatePantryItemExpiry 
} from '../api';

export default function PantryCookbookView() {
  const [pantry, setPantry] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const pRes = await queryPantry();
      const rRes = await queryRecipes();
      if (pRes.error) throw new Error(pRes.error);
      if (rRes.error) throw new Error(rRes.error);
      setPantry(pRes.data || []);
      setRecipes(rRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = async (id: number, currentQty: number, delta: number) => {
    const nextQty = Math.max(0, currentQty + delta);
    try {
      if (nextQty === 0) {
        await deletePantryItem(id);
      } else {
        await updatePantryItemQuantity(id, nextQty);
      }
      loadData();
    } catch (err: any) {
      alert(`Error updating quantity: ${err.message}`);
    }
  };

  const handleExpiryChange = async (id: number, dateStr: string) => {
    try {
      await updatePantryItemExpiry(id, dateStr);
      loadData();
    } catch (err: any) {
      alert(`Error updating expiry date: ${err.message}`);
    }
  };

  const handleDeletePantry = async (id: number) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await deletePantryItem(id);
      loadData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteRecipe = async (id: number) => {
    if (!confirm('Are you sure you want to delete this recipe?')) return;
    try {
      await deleteRecipe(id);
      loadData();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const getExpiryBadgeClass = (expiryDateStr?: string) => {
    if (!expiryDateStr) return 'badge-stable';
    const expiry = new Date(expiryDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 1) return 'badge-expired';     // Red: Expires today or expired
    if (diffDays <= 3) return 'badge-soon';        // Yellow: Expires in 3 days
    return 'badge-stable';                         // Green: Safe
  };

  const getExpiryLabel = (expiryDateStr?: string) => {
    if (!expiryDateStr) return 'Stable';
    const expiry = new Date(expiryDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `Expired ${Math.abs(diffDays)}d ago`;
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `Expires in ${diffDays}d`;
  };

  return (
    <div className="pantry-cookbook-viewport" style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '20px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        🍲 Kitchen Pantry & Cookbook
      </h2>

      {error && <div className="error-alert" style={{ marginBottom: '20px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)' }}>{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading pantry inventory and recipes...</div>
      ) : (
        <div className="pantry-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          
          {/* SECTION 1: PANTRY INVENTORY */}
          <div className="pantry-section" style={{ background: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '16px', color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🥦 Pantry Inventory
            </h3>
            {pantry.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your pantry is empty. Tell the Chef Coach what groceries you bought to stock it!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pantry.map((item) => (
                  <div key={item.id} className="pantry-item-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.name}</span>
                      <span className={`pantry-expiry-badge ${getExpiryBadgeClass(item.expiry_date)}`} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', width: 'fit-content' }}>
                        {getExpiryLabel(item.expiry_date)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Quantity Editor */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '2px 6px' }}>
                        <button 
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 'bold' }}
                          onClick={() => handleQtyChange(item.id, Number(item.quantity), -1)}
                        >
                          -
                        </button>
                        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', minWidth: '40px', textAlign: 'center' }}>
                          {item.quantity} {item.unit}
                        </span>
                        <button 
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 'bold' }}
                          onClick={() => handleQtyChange(item.id, Number(item.quantity), 1)}
                        >
                          +
                        </button>
                      </div>

                      {/* Expiry Editor calendar override */}
                      <input 
                        type="date" 
                        value={item.expiry_date ? item.expiry_date.split('T')[0] : ''}
                        onChange={(e) => handleExpiryChange(item.id, e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 6px', color: 'var(--text-main)', fontSize: '0.75rem', cursor: 'pointer' }}
                      />

                      <button 
                        onClick={() => handleDeletePantry(item.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}
                        title="Delete item"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: DIGITAL COOKBOOK */}
          <div className="cookbook-section" style={{ background: 'var(--surface)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '16px', color: 'var(--brand-orange)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📖 Digital Cookbook
            </h3>
            {recipes.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No recipes saved in your cookbook. Say: *"Save recipe for Egg Toast: 2 eggs, 2 slices bread"* to start!</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                {recipes.map((recipe) => (
                  <div key={recipe.id} className="recipe-card" style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.03)', position: 'relative' }}>
                    <button 
                      onClick={() => handleDeleteRecipe(recipe.id)}
                      style={{ position: 'absolute', top: '14px', right: '14px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.95rem' }}
                      title="Delete recipe"
                    >
                      🗑️
                    </button>
                    
                    <h4 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)', marginBottom: '8px', paddingRight: '24px' }}>
                      {recipe.name}
                    </h4>

                    {/* Ingredients list */}
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>INGREDIENTS:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {recipe.ingredients.map((ing: any, idx: number) => (
                          <span key={idx} style={{ fontSize: '0.74rem', background: 'rgba(255, 145, 77, 0.1)', color: 'var(--brand-orange)', padding: '2px 8px', borderRadius: '12px' }}>
                            {ing.qty} {ing.unit} {ing.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {recipe.instructions && (
                      <div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '2px' }}>INSTRUCTIONS:</span>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-dark)', margin: 0, lineHeight: 1.4 }}>{recipe.instructions}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
