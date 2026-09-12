import 'react-native';
import {fireEvent, render} from '@testing-library/react-native';
import * as React from 'react';

import {App} from '../src/App';

describe('App', () => {
  it('renders the NarraView landing screen', () => {
    const screen = render(<App />);
    expect(screen.getByText('NarraView')).toBeTruthy();
    expect(screen.getByText('Understand what you watch.')).toBeTruthy();
    expect(screen.getByText('AI-native contextual viewing for Fire TV')).toBeTruthy();
    expect(screen.getByTestId('enter-narraview-button')).toBeTruthy();
  });

  it('shows the ready state when the primary button is selected', () => {
    const screen = render(<App />);
    fireEvent.press(screen.getByTestId('enter-narraview-button'));
    expect(screen.getByTestId('ready-message')).toHaveTextContent(
      'NarraView is ready.',
    );
  });
});
