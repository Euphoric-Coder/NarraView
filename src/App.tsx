import React, { useState } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { LandingScreen } from './screens/LandingScreen';
import { ContentItem } from './types/content';

type Route = 'Landing' | 'Home' | 'Details' | 'Player';

export const App = () => {
  const [route, setRoute] = useState<Route>('Home');
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [initialSeekSeconds, setInitialSeekSeconds] = useState<number>(0);
  const [homeRefreshTimestamp, setHomeRefreshTimestamp] = useState<number>(Date.now());

  const handleSelectItem = (item: ContentItem) => {
    setSelectedItem(item);
    setRoute('Details');
  };

  const handleWatch = (freshItem?: ContentItem, resumePosition?: number) => {
    if (freshItem) {
      setSelectedItem(freshItem);
    }
    setInitialSeekSeconds(resumePosition || 0);
    setRoute('Player');
  };

  const renderScreen = () => {
    switch (route) {
      case 'Landing':
        return <LandingScreen onEnter={() => setRoute('Home')} />;
      case 'Home':
        return <HomeScreen onSelectItem={handleSelectItem} refreshTrigger={homeRefreshTimestamp} />;
      case 'Details':
        return selectedItem ? (
          <DetailsScreen 
            item={selectedItem} 
            onWatch={handleWatch}
            onBack={() => {
              setHomeRefreshTimestamp(Date.now());
              setRoute('Home');
            }}
          />
        ) : (
          <HomeScreen onSelectItem={handleSelectItem} refreshTrigger={homeRefreshTimestamp} />
        );
      case 'Player':
        return selectedItem ? (
          <PlayerScreen 
            item={selectedItem} 
            initialPositionSeconds={initialSeekSeconds}
            onExit={() => {
              setInitialSeekSeconds(0);
              setHomeRefreshTimestamp(Date.now());
              setRoute('Home');
            }}
          />
        ) : (
          <HomeScreen onSelectItem={handleSelectItem} refreshTrigger={homeRefreshTimestamp} />
        );
      default:
        return <HomeScreen onSelectItem={handleSelectItem} refreshTrigger={homeRefreshTimestamp} />;
    }
  };

  return renderScreen();
};

export default App;
