import React from 'react';
import { render } from '@testing-library/react-native';
import { NarraViewOverlay } from './src/components/player/NarraViewOverlay';

const { toJSON } = render(<NarraViewOverlay onClose={() => {}} contentId="test" currentTimeSeconds={10} />);
console.log(JSON.stringify(toJSON(), null, 2));
