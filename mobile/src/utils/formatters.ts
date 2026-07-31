export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning, Buddy';
  if (hour < 17) return 'Afternoon, Buddy';
  return 'Evening, Buddy';
}

export function getExpiryBadgeClass(expiryDateStr?: string): 'badge-expired' | 'badge-soon' | 'badge-stable' {
  if (!expiryDateStr) return 'badge-stable';
  const expiry = new Date(expiryDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return 'badge-expired';
  if (diffDays <= 3) return 'badge-soon';
  return 'badge-stable';
}

export function getExpiryLabel(expiryDateStr?: string): string {
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
}

export function calculateStreak(entries: any[], category: string, filterFn?: (e: any) => boolean): number {
  if (!entries || entries.length === 0) return 0;
  
  const dates = entries
    .filter(e => e.category === category && (!filterFn || filterFn(e)))
    .map(e => (e.entry_time || e.created_at || '').split('T')[0]);
    
  if (dates.length === 0) return 0;
  
  const uniqueDates = Array.from(new Set(dates)).sort((a: any, b: any) => b.localeCompare(a));
  
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const mostRecent = uniqueDates[0];
  if (mostRecent !== todayStr && mostRecent !== yesterdayStr) {
    return 0;
  }
  
  let streak = 1;
  let currentDate = new Date(mostRecent);
  
  for (let i = 1; i < uniqueDates.length; i++) {
    const nextDate = new Date(uniqueDates[i]);
    const diffTime = Math.abs(currentDate.getTime() - nextDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      streak++;
      currentDate = nextDate;
    } else if (diffDays > 1) {
      break;
    }
  }
  
  return streak;
}
