import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ContentItem } from '../types/content';
import { ContentRow } from '../components/ContentRow';
import { HeroBanner } from '../components/HeroBanner';
import { mockCategories } from '../data/mockContent';
import { colors } from '../theme/colors';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';

interface HomeScreenProps {
  onSelectItem: (item: ContentItem) => void;
}

export const HomeScreen = ({ onSelectItem }: HomeScreenProps) => {
  return (
    <View style={styles.screen}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <HeroBanner onExplore={() => onSelectItem(mockCategories[0].items[0])} />

        <TVFocusGuideView style={styles.rowsContainer}>
          {mockCategories.map((category) => (
            <ContentRow
              key={category.id}
              category={category}
              onItemPress={onSelectItem}
            />
          ))}
        </TVFocusGuideView>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  rowsContainer: {
    marginTop: -20,
    zIndex: 3,
  },
});
