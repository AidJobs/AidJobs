import * as React from 'react';
import { render } from '@testing-library/react';
import { FilterChip } from '../components/FilterChip';

describe('FilterChip', () => {
  describe('pressed states', () => {
    it('renders unpressed state', () => {
      const { container } = render(<FilterChip pressed={false}>Filter</FilterChip>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders pressed state', () => {
      const { container } = render(<FilterChip pressed={true}>Filter</FilterChip>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('with count badge', () => {
    it('renders with count badge when count > 0', () => {
      const { container } = render(
        <FilterChip pressed={false} count={5}>
          Filter
        </FilterChip>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders without count badge when count is 0', () => {
      const { container } = render(
        <FilterChip pressed={false} count={0}>
          Filter
        </FilterChip>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders pressed with count badge', () => {
      const { container } = render(
        <FilterChip pressed={true} count={12}>
          Active Filter
        </FilterChip>
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('aria attributes', () => {
    it('sets aria-pressed to false when unpressed', () => {
      const { container } = render(<FilterChip pressed={false}>Filter</FilterChip>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-pressed')).toBe('false');
    });

    it('sets aria-pressed to true when pressed', () => {
      const { container } = render(<FilterChip pressed={true}>Filter</FilterChip>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('combinations', () => {
    it('renders unpressed with large count', () => {
      const { container } = render(
        <FilterChip pressed={false} count={99}>
          Popular Filter
        </FilterChip>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders pressed without count', () => {
      const { container } = render(<FilterChip pressed={true}>Active</FilterChip>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders with custom className', () => {
      const { container } = render(
        <FilterChip pressed={false} className="custom-filter">
          Custom
        </FilterChip>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders disabled state', () => {
      const { container } = render(
        <FilterChip pressed={false} disabled>
          Disabled
        </FilterChip>
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
