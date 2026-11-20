/**
 * English fix-order item 5 Step B (20 November 2026): Add panel name field (R1-11).
 * Enter commits; Escape and blur cancel without adding (no accidental section/group from closing the panel).
 */
import { describe, expect, it } from '@jest/globals';
import { addNameFinish } from '../../components/employer-demo/DocPane';

describe('R1-11 Step B: Add panel name finish', () => {
  it('Enter with a name commits', () => {
    expect(addNameFinish('enter', '  My section  ')).toEqual({ action: 'commit', name: 'My section' });
  });

  it('Enter with only spaces cancels', () => {
    expect(addNameFinish('enter', '   ')).toEqual({ action: 'cancel' });
  });

  it('Escape cancels even with typed text', () => {
    expect(addNameFinish('escape', 'Would have been added')).toEqual({ action: 'cancel' });
  });

  it('Blur cancels even with typed text (abandon; does not add)', () => {
    expect(addNameFinish('blur', 'Would have been added')).toEqual({ action: 'cancel' });
  });
});
