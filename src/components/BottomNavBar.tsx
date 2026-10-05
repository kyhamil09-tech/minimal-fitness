import React from 'react';
import { Home, Activity, HeartPulse, BarChart3, User } from 'lucide-react';
import { TabId } from '../types/health';
import { ColorPalette } from '../types/theme';

interface BottomNavBarProps {
  currentTab: TabId;
  onSelectTab: (tab: TabId) => void;
  theme: ColorPalette;
}

/** Flat track-black tab bar: the active tab lights up in the accent with a bar above it. */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentTab, onSelectTab, theme }) => {
  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'today', label: 'Home', icon: Home },
    { id: 'exercise', label: 'Run', icon: Activity },
    { id: 'nutrition', label: 'Health', icon: HeartPulse },
    { id: 'progress', label: 'Progress', icon: BarChart3 },
    { id: 'settings', label: 'You', icon: User },
  ];

  return (
    <nav aria-label="Main" className="relative shrink-0 z-0 w-full">
      <div className="grid grid-cols-5 items-stretch w-full max-w-md mx-auto glass-nav pb-safe">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            currentTab === tab.id ||
            (tab.id === 'today' && currentTab === 'dashboard') ||
            (tab.id === 'exercise' && currentTab === 'fitness') ||
            (tab.id === 'nutrition' && (currentTab === 'fasting' || currentTab === 'sleep' || currentTab === 'healthlog')) ||
            (tab.id === 'progress' && currentTab === 'health');

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-col items-center justify-start gap-1 pt-3 pb-2 min-h-[60px]"
              style={{ color: isActive ? theme.primary : '#7a7a7a' }}
            >
              <span
                className="absolute top-0 h-[3px] rounded-b-full transition-all duration-300"
                style={{
                  width: isActive ? 30 : 0,
                  backgroundColor: theme.primary,
                }}
              />
              <Icon className="w-[24px] h-[24px]" strokeWidth={isActive ? 2.6 : 1.9} />
              <span
                className="text-[10px] leading-none font-extrabold uppercase"
                style={{ letterSpacing: '0.1em' }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
