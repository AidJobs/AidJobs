import * as React from 'react';
import { render } from '@testing-library/react';
import { Button } from '../components/Button';

describe('Button', () => {
  describe('variants', () => {
    it('renders solid variant', () => {
      const { container } = render(<Button variant="solid">Click me</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders subtle variant', () => {
      const { container } = render(<Button variant="subtle">Click me</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders ghost variant', () => {
      const { container } = render(<Button variant="ghost">Click me</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders link variant', () => {
      const { container } = render(<Button variant="link">Click me</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('sizes', () => {
    it('renders small size', () => {
      const { container } = render(<Button size="sm">Small</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders medium size', () => {
      const { container } = render(<Button size="md">Medium</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders large size', () => {
      const { container } = render(<Button size="lg">Large</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('states', () => {
    it('renders disabled state', () => {
      const { container } = render(<Button disabled>Disabled</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders with custom className', () => {
      const { container } = render(<Button className="custom-class">Custom</Button>);
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('variant and size combinations', () => {
    it('renders solid + small', () => {
      const { container } = render(
        <Button variant="solid" size="sm">
          Solid Small
        </Button>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders subtle + large', () => {
      const { container } = render(
        <Button variant="subtle" size="lg">
          Subtle Large
        </Button>
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders ghost + medium', () => {
      const { container } = render(
        <Button variant="ghost" size="md">
          Ghost Medium
        </Button>
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
