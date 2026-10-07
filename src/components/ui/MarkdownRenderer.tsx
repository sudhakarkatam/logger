import React from 'react';
import { StyleSheet, Text, View, Image, Linking, ScrollView, Platform } from 'react-native';
import { colors } from '../../theme';

interface MarkdownRendererProps {
  content: string;
  style?: object;
  textStyle?: object;
}

export default function MarkdownRenderer({ content, textStyle }: MarkdownRendererProps) {
  if (!content) return null;

  // Split lines and parse structure
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. TABLE PARSING (| col1 | col2 |)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      // Filter out markdown separator lines (e.g., |---|---|)
      const cleanRows = tableLines
        .map(rowStr =>
          rowStr
            .split('|')
            .map(cell => cell.trim())
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
        )
        .filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));

      if (cleanRows.length > 0) {
        const header = cleanRows[0];
        const body = cleanRows.slice(1);

        blocks.push(
          <ScrollView horizontal key={`table-${i}`} showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
            <View style={styles.tableContainer}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                {header.map((cell, cIdx) => (
                  <View key={`th-${cIdx}`} style={[styles.tableHeaderCell, cIdx === header.length - 1 && { borderRightWidth: 0 }]}>
                    {renderInlineText(cell, `th-${cIdx}`, styles.tableHeaderText)}
                  </View>
                ))}
              </View>

              {/* Table Body Rows */}
              {body.map((row, rIdx) => (
                <View key={`tr-${rIdx}`} style={[styles.tableBodyRow, rIdx % 2 === 1 && styles.tableRowZebra]}>
                  {row.map((cell, cIdx) => (
                    <View key={`td-${rIdx}-${cIdx}`} style={[styles.tableCell, cIdx === row.length - 1 && { borderRightWidth: 0 }]}>
                      {renderInlineText(cell, `td-${rIdx}-${cIdx}`, styles.tableCellText)}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      }
      continue;
    }

    // 2. HEADERS (# Header)
    if (trimmed.startsWith('#')) {
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const titleText = trimmed.replace(/^#+\s+/, '');
      blocks.push(
        <Text
          key={`h-${i}`}
          style={[
            styles.headerText,
            level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3,
          ]}
        >
          {titleText}
        </Text>
      );
      i++;
      continue;
    }

    // 3. BULLETS (- item or * item)
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      const bulletText = trimmed.replace(/^[\-*•]\s+/, '');
      blocks.push(
        <View key={`bullet-${i}`} style={styles.bulletRow}>
          <Text style={styles.bulletSymbol}>•</Text>
          <View style={{ flex: 1 }}>{renderInlineText(bulletText, `b-${i}`, textStyle)}</View>
        </View>
      );
      i++;
      continue;
    }

    // 4. EMPTY LINE
    if (!trimmed) {
      blocks.push(<View key={`empty-${i}`} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // 5. STANDARD PARAGRAPH
    blocks.push(
      <View key={`p-${i}`} style={styles.paragraphContainer}>
        {renderInlineText(line, `p-${i}`, textStyle)}
      </View>
    );
    i++;
  }

  return <View style={styles.container}>{blocks}</View>;
}

// Helper to format inline bold, links, hashtags, key-values
function renderInlineText(rawStr: string, keyPrefix: string, customTextStyle?: object) {
  if (!rawStr) return null;

  // Auto-bold key-value patterns (e.g. "Calories: 420")
  let processed = rawStr;
  const colonIndex = processed.indexOf(':');
  if (colonIndex > 0 && colonIndex < 35 && !processed.substring(0, colonIndex).includes('/')) {
    const key = processed.substring(0, colonIndex);
    const val = processed.substring(colonIndex + 1);
    const trimmedKey = key.trim();
    if (!trimmedKey.includes('**') && /^[a-zA-Z0-9\s\-_]+$/.test(trimmedKey) && trimmedKey.length > 1) {
      processed = `**${trimmedKey}**:${val}`;
    }
  }

  // Markdown Image pattern: ![alt](url)
  const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
  const imgMatch = imgRegex.exec(processed);
  if (imgMatch) {
    return (
      <View key={keyPrefix} style={styles.imageContainer}>
        <Image source={{ uri: imgMatch[2] }} style={styles.inlineImage} resizeMode="cover" />
        {imgMatch[1] ? <Text style={styles.imageCaption}>{imgMatch[1]}</Text> : null}
      </View>
    );
  }

  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  const parseLinksAndHashtags = (str: string, subKey: string): React.ReactNode[] => {
    if (!str) return [];
    const regex = /((?:#[a-zA-Z0-9\-_]+)|(?:\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(?:https?:\/\/[^\s)]+))/g;
    const splitParts = str.split(regex);

    return splitParts.map((part, index) => {
      if (!part) return null;
      const key = `${subKey}-${index}`;

      if (part.startsWith('#')) {
        return (
          <Text key={key} style={styles.hashtagText}>
            {part}{' '}
          </Text>
        );
      }

      const mdLinkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      if (mdLinkMatch) {
        const [, label, url] = mdLinkMatch;
        return (
          <Text key={key} style={styles.linkText} onPress={() => Linking.openURL(url)}>
            {label}
          </Text>
        );
      }

      if (/^https?:\/\//.test(part)) {
        return (
          <Text key={key} style={styles.linkText} onPress={() => Linking.openURL(part)}>
            {part}
          </Text>
        );
      }

      return <Text key={key}>{part}</Text>;
    }).filter(Boolean) as React.ReactNode[];
  };

  while ((match = boldRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...parseLinksAndHashtags(processed.substring(lastIndex, match.index), `${keyPrefix}-pre-${match.index}`));
    }
    parts.push(
      <Text key={`${keyPrefix}-bold-${match.index}`} style={styles.boldText}>
        {match[1]}
      </Text>
    );
    lastIndex = boldRegex.lastIndex;
  }

  if (lastIndex < processed.length) {
    parts.push(...parseLinksAndHashtags(processed.substring(lastIndex), `${keyPrefix}-post-${lastIndex}`));
  }

  return <Text style={[styles.baseText, customTextStyle]}>{parts}</Text>;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  paragraphContainer: {
    marginVertical: 2,
  },
  baseText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  boldText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerText: {
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 10,
    marginBottom: 4,
  },
  h1: { fontSize: 18, color: '#F8FAFC' },
  h2: { fontSize: 16, color: '#E2E8F0' },
  h3: { fontSize: 14, color: '#CBD5E1' },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 3,
    paddingLeft: 4,
  },
  bulletSymbol: {
    color: '#6366F1',
    fontSize: 14,
    marginRight: 8,
    lineHeight: 21,
    fontWeight: 'bold',
  },
  linkText: {
    color: '#818CF8',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  hashtagText: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  imageContainer: {
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
  },
  inlineImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
  },
  imageCaption: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 4,
  },
  // Table Styling Inspired by Grok/Claude
  tableScroll: {
    marginVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: '#0F172A',
    overflow: 'hidden',
  },
  tableContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  tableHeaderCell: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 100,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
  },
  tableHeaderText: {
    color: '#6366F1',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tableBodyRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  tableRowZebra: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  tableCell: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 100,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
  },
  tableCellText: {
    color: '#F8FAFC',
    fontSize: 13,
    lineHeight: 18,
  },
});
