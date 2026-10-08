import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Text } from 'react-native';
import { ContentItem, ContentCategory } from '../types/content';
import { ContentRow } from '../components/ContentRow';
import { HeroBanner } from '../components/HeroBanner';
import { mockCategories } from '../data/mockContent';
import { colors } from '../theme/colors';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { listContent } from '../services/contentApi';

interface HomeScreenProps {
  onSelectItem: (item: ContentItem) => void;
}

export const HomeScreen = ({ onSelectItem }: HomeScreenProps) => {
  const [categories, setCategories] = useState<ContentCategory[]>(mockCategories);

  useEffect(() => {
    const loadContent = async () => {
      const apiContent = await listContent();
      if (apiContent && Array.isArray(apiContent) && apiContent.length > 0) {
        // Map API items to ContentItem format
        const dynamicItems: ContentItem[] = apiContent.map((item: any) => ({
          id: item.contentId,
          title: item.title,
          description: item.description || '',
          genre: item.contentType || 'unknown',
          runtime: item.durationSeconds ? `${Math.floor(item.durationSeconds / 60)}m` : 'Unknown',
          year: new Date(item.createdAt || Date.now()).getFullYear(),
          posterColor: '#1a1a24', // Fallback color
          posterUrl: item.posterUrl,
          videoSource: item.videoUrl,
          aiReady: item.aiReady,
          mediaPlayable: item.mediaPlayable,
        }));
        
        const dynamicCategory: ContentCategory = {
          id: 'cloud-content',
          title: 'NarraView Cloud',
          items: dynamicItems
        };
        
        // Add dynamic row first, then mock rows
        setCategories([dynamicCategory, ...mockCategories]);
      }
    };
    
    loadContent();
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <HeroBanner onExplore={() => onSelectItem(categories[0].items[0])} />

        <TVFocusGuideView style={styles.rowsContainer}>
          {categories.map((category) => (
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

