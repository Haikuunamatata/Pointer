export const PERFORMANCE_CONFIG = {
  // Virtual scrolling settings
  VIRTUAL_SCROLL: {
    ITEM_HEIGHT: 24,
    BUFFER_SIZE: 5,
    THROTTLE_DELAY: 16, // ~60fps
  },
  
  // Chat streaming optimizations
  CHAT: {
    UPDATE_THROTTLE: 33, // ~30fps during streaming
    MESSAGE_BATCH_SIZE: 10,
    MAX_MESSAGES_RENDERED: 100,
    DEBOUNCE_SAVE: 1000,
  },
  
  // File operations
  FILE_OPERATIONS: {
    DEBOUNCE_SEARCH: 300,
    DEBOUNCE_SAVE: 500,
    THROTTLE_CURSOR_UPDATE: 500,
  },
  
  // Monaco Editor
  EDITOR: {
    LAZY_LOAD_DELAY: 100,
    RESIZE_DEBOUNCE: 150,
    CONTENT_CHANGE_DEBOUNCE: 300,
  },
  
  // Component rendering
  RENDERING: {
    MAX_RENDER_TIME: 16, // Warn if render takes more than 16ms
    ENABLE_PROFILING: process.env.NODE_ENV === 'development',
  }
} as const;

// Performance monitoring utilities
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  measureRender(componentName: string, startTime: number) {
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    if (!this.metrics.has(componentName)) {
      this.metrics.set(componentName, []);
    }
    
    const componentMetrics = this.metrics.get(componentName)!;
    componentMetrics.push(renderTime);
    
    // Keep only last 50 measurements
    if (componentMetrics.length > 50) {
      componentMetrics.shift();
    }
    
    // Warn about slow renders
    if (renderTime > PERFORMANCE_CONFIG.RENDERING.MAX_RENDER_TIME) {
      console.warn(`Slow render detected: ${componentName} took ${renderTime.toFixed(2)}ms`);
    }
    
    return renderTime;
  }
  
  getAverageRenderTime(componentName: string): number {
    const metrics = this.metrics.get(componentName);
    if (!metrics || metrics.length === 0) return 0;
    
    return metrics.reduce((sum, time) => sum + time, 0) / metrics.length;
  }
  
  getReport(): Record<string, { avg: number; max: number; count: number }> {
    const report: Record<string, { avg: number; max: number; count: number }> = {};
    
    this.metrics.forEach((times, componentName) => {
      const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
      const max = Math.max(...times);
      report[componentName] = { avg, max, count: times.length };
    });
    
    return report;
  }
  
  clear() {
    this.metrics.clear();
  }
}

// Memory leak prevention utilities
export const cleanup = {
  // Cancel pending animation frames
  cancelAnimationFrames: (refs: React.MutableRefObject<number | null>[]) => {
    refs.forEach(ref => {
      if (ref.current) {
        cancelAnimationFrame(ref.current);
        ref.current = null;
      }
    });
  },
  
  // Cancel pending timeouts
  cancelTimeouts: (refs: React.MutableRefObject<number | null>[]) => {
    refs.forEach(ref => {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    });
  },
  
  // Remove event listeners
  removeEventListeners: (listeners: Array<{
    element: Element | Window | Document;
    event: string;
    handler: EventListener;
  }>) => {
    listeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
  },
  
  // Disconnect observers
  disconnectObservers: (observers: (ResizeObserver | IntersectionObserver | MutationObserver)[]) => {
    observers.forEach(observer => {
      observer.disconnect();
    });
  }
};

// Bundle size optimization checks
export const bundleOptimizations = {
  // Check if we're importing large libraries unnecessarily
  checkImports: () => {
    if (PERFORMANCE_CONFIG.RENDERING.ENABLE_PROFILING) {
      console.log('Performance monitoring enabled');
      
      // Monitor bundle size in development
      if (typeof window !== 'undefined') {
        console.log('Performance tips:');
        console.log('- Use React.memo for expensive components');
        console.log('- Implement virtual scrolling for large lists');
        console.log('- Debounce/throttle user interactions');
        console.log('- Use code splitting for large features');
      }
    }
  }
};

// React DevTools Profiler integration
export const enableProfiling = () => {
  if (PERFORMANCE_CONFIG.RENDERING.ENABLE_PROFILING && typeof window !== 'undefined') {
    // Enable React DevTools Profiler
    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__?.onCommitFiberRoot = (
      id: any,
      root: any,
      priorityLevel: any
    ) => {
      // Custom profiling logic can be added here
    };
  }
};

// Memory usage monitoring
export const monitorMemory = () => {
  if (PERFORMANCE_CONFIG.RENDERING.ENABLE_PROFILING && 'memory' in performance) {
    const memInfo = (performance as any).memory;
    console.log('Memory usage:', {
      used: Math.round(memInfo.usedJSHeapSize / 1048576) + ' MB',
      total: Math.round(memInfo.totalJSHeapSize / 1048576) + ' MB',
      limit: Math.round(memInfo.jsHeapSizeLimit / 1048576) + ' MB'
    });
  }
}; 