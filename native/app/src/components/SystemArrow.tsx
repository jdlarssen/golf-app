// #2385: «→» i designet er systemfontens pil. Inter fra Google Fonts har den
// ikke (U+2192 er utenfor delsettene), så nettleseren faller tilbake til
// `system-ui`, som er SF. Appens Inter har sin egen pil, som er 1,3 pt
// bredere i 18 pt og har en annen form. Her tegnes hver pil i en tekst med SF,
// i samme vekt som teksten rundt, slik nettleseren gjør.
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { FONTS } from '../theme';

type Weight = '400' | '500' | '600';

/** Teksten med hver «→» i systemfonten, i tekstens vekt. */
export function withSystemArrows(text: string, weight: Weight): ReactNode {
  const parts = text.split('→');
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <Text style={styles[weight]}>→</Text> : null}
      {part}
    </Fragment>
  ));
}

const styles = StyleSheet.create({
  '400': { fontFamily: FONTS.system, fontWeight: '400' },
  '500': { fontFamily: FONTS.system, fontWeight: '500' },
  '600': { fontFamily: FONTS.system, fontWeight: '600' },
});
