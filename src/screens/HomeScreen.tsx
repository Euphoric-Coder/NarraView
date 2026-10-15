import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ContentItem, ContentCategory, RuntimeProvider } from '../types/content';
import { ContentRow } from '../components/ContentRow';
import { HeroBanner } from '../components/HeroBanner';
import { mockCategories } from '../data/mockContent';
import { colors } from '../theme/colors';
import { TVFocusGuideView } from '@amazon-devices/react-native-kepler';
import { listContent } from '../services/contentApi';
import { formatRuntime } from '../utils/formatRuntime';

interface HomeScreenProps {
  onSelectItem: (item: ContentItem) => void;
}

export const HomeScreen = ({ onSelectItem }: HomeScreenProps) => {
  const [categories, setCategories] = useState<ContentCategory[]>(mockCategories);

  const loadContent = useCallback(async () => {
    const apiContent = await listContent();
    if (apiContent && Array.isArray(apiContent) && apiContent.length > 0) {
      // Map API items to ContentItem format preserving canonical state
      const publicItems = apiContent.filter((item: any) => item.catalogVisible !== false);
      const dynamicItems: ContentItem[] = publicItems.map((item: any) => {
        const canonicalContentId = item.contentId || item.id;
        const runtimeProvider: RuntimeProvider | undefined = canonicalContentId === 'signal-lost'
          ? 'handcrafted'
          : (item.runtimeProvider || (item.aiReady ? 'intelligence' : undefined));
        
        const durationSec = typeof item.durationSeconds === 'number' ? item.durationSeconds : undefined;
        const genre = item.contentType
          ? item.contentType.charAt(0).toUpperCase() + item.contentType.slice(1)
          : 'Tutorial';
        const runtime = formatRuntime(durationSec);

        return {
          id: canonicalContentId,
          contentId: canonicalContentId,
          title: item.title,
          description: item.description || '',
          genre,
          contentType: item.contentType,
          runtime,
          durationSeconds: durationSec,
          year: item.createdAt ? new Date(item.createdAt).getFullYear() : new Date().getFullYear(),
          posterColor: '#1a1a24',
          posterUrl: item.posterUrl,
          videoSource: item.videoUrl,
          aiReady: item.aiReady === true,
          runtimeProvider,
          mediaPlayable: item.mediaPlayable !== false,
          catalogVisible: item.catalogVisible !== false,
        };
      });

      console.log('[CLOUD_CONTENT_MAPPED]', dynamicItems.map(d => ({
        contentId: d.contentId,
        title: d.title,
        aiReady: d.aiReady,
        runtimeProvider: d.runtimeProvider,
        mediaPlayable: d.mediaPlayable,
        contentType: d.contentType,
        runtime: d.runtime
      })));

      const dynamicCategory: ContentCategory = {
        id: 'cloud-content',
        title: 'NarraView Cloud',
        items: dynamicItems
      };

      setCategories([dynamicCategory, ...mockCategories]);
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const handleSelectItem = (item: ContentItem) => {
    console.log('[CONTENT_SELECTED]', {
      contentId: item.contentId || item.id,
      title: item.title,
      aiReady: item.aiReady,
      runtimeProvider: item.runtimeProvider
    });
    onSelectItem(item);
  };

  return (
    <View style={styles.screen}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <HeroBanner onExplore={() => handleSelectItem(categories[0].items[0])} />

        <TVFocusGuideView style={styles.rowsContainer}>
          {categories.map((category) => (
            <ContentRow
              key={category.id}
              category={category}
              onItemPress={handleSelectItem}
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
