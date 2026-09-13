import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentCategory, ContentItem } from '../types/content';
import { ContentCard } from './ContentCard';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

interface ContentRowProps {
  category: ContentCategory;
  onItemPress: (item: ContentItem) => void;
  autoFocus?: boolean;
}

export const ContentRow = ({ category, onItemPress, autoFocus }: ContentRowProps) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{category.title}</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {category.items.map((item, index) => (
          <ContentCard 
            key={item.id} 
            item={item} 
            onPress={onItemPress}
            hasTVPreferredFocus={autoFocus && index === 0}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xxl, // More breathing room between rows
  },
  title: {
    color: colors.primaryText,
    fontSize: typography.tagline.fontSize,
    fontWeight: '700',
    letterSpacing: typography.tagline.letterSpacing,
    paddingHorizontal: spacing.heroInset,
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.heroInset,
    paddingVertical: spacing.md, // Room for shadows
  },
});
