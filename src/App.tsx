import React, { useState, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { HomeScreen } from './screens/HomeScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import { ContentItem } from './types/content';

export const App = () => {
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);

  useEffect(() => {
    const onBackPress = () => {
      if (selectedItem) {
        setSelectedItem(null);
        return true;
      }
      return false;
    };

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backSubscription.remove();
  }, [selectedItem]);

  return selectedItem ? (
    <DetailsScreen item={selectedItem} />
  ) : (
    <HomeScreen onSelectItem={setSelectedItem} />
  );
};
