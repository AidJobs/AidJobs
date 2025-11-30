'use client';

import { useEffect, useRef } from 'react';

type PerformanceMetric = {
  name: string;
  value: number;
  timestamp: number;
};

export function usePerformanceMonitor(componentName: string) {
  const metricsRef = useRef<PerformanceMetric[]>([]);

  useEffect(() => {
    // Monitor component render time
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      metricsRef.current.push({
        name: `${componentName}_render`,
        value: renderTime,
        timestamp: Date.now(),
      });

      // Log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Performance] ${componentName} render: ${renderTime.toFixed(2)}ms`);
      }

      // Send to analytics endpoint in production (if needed)
      if (process.env.NODE_ENV === 'production' && metricsRef.current.length % 10 === 0) {
        // Batch send metrics every 10 renders
        fetch('/api/analytics/performance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            component: componentName,
            metrics: metricsRef.current.slice(-10),
          }),
        }).catch(() => {
          // Silently fail - don't block user experience
        });
      }
    };
  }, [componentName]);

  const measure = (name: string, fn: () => void) => {
    const start = performance.now();
    fn();
    const end = performance.now();
    
    metricsRef.current.push({
      name: `${componentName}_${name}`,
      value: end - start,
      timestamp: Date.now(),
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${componentName}_${name}: ${(end - start).toFixed(2)}ms`);
    }
  };

  return { measure };
}

