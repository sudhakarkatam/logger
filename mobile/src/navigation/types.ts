export type TabType = 'home' | 'chat' | 'analytics' | 'pantry' | 'timeline' | 'settings';

export interface TabConfig {
  id: TabType;
  label: string;
  icon: string;
}

export interface NavigationProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onQuickLog?: (prefix: string) => void;
}
