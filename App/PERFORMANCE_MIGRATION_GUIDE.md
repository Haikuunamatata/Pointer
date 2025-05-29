# Performance Optimization Migration Guide

This guide will help you migrate your current app to use the performance-optimized components and eliminate the 1 FPS lag issues.

## 🚀 Quick Wins (Apply These First)

### 1. Replace Main App Component
```bash
# Backup current App.tsx
mv src/App.tsx src/App.backup.tsx
mv src/App.optimized.tsx src/App.tsx
```

### 2. Add Performance Hooks
The new performance hooks are already created in `src/hooks/usePerformanceOptimizations.ts`.

### 3. Optimize Chat Streaming
Replace heavy markdown rendering during streaming by integrating the optimized chat components:

```typescript
// In your LLMChat component, replace the heavy rendering with:
import VirtualizedChatMessages from './VirtualizedChatMessages';
import OptimizedChatStream from './OptimizedChatStream';

// Use VirtualizedChatMessages for the message list
// Use OptimizedChatStream for streaming content
```

## 📋 Step-by-Step Migration

### Phase 1: Core App Structure (30 minutes)

1. **Replace App Component**
   ```bash
   # The optimized App component is ready to use
   # It includes:
   # - Memoized sub-components
   # - Throttled event handlers  
   # - Performance monitoring
   # - Stable callbacks
   ```

2. **Add Performance Configuration**
   ```typescript
   // Import in your main App file
   import { PERFORMANCE_CONFIG, enableProfiling } from './config/performance';
   
   // Enable performance monitoring in development
   useEffect(() => {
     enableProfiling();
   }, []);
   ```

### Phase 2: Chat Performance (20 minutes)

1. **Replace Chat Rendering**
   ```typescript
   // Instead of rendering all messages directly:
   // OLD:
   {messages.map((message, index) => (
     <MessageComponent key={index} message={message} />
   ))}
   
   // NEW:
   <VirtualizedChatMessages
     messages={messages}
     containerHeight={chatHeight}
     onEditMessage={handleEditMessage}
   />
   ```

2. **Optimize Streaming**
   ```typescript
   // Replace immediate content updates with batched updates:
   // OLD: Direct state updates on every character
   // NEW: Use OptimizedChatStream component
   <OptimizedChatStream
     streamingContent={currentStreamingContent}
     isStreaming={isStreaming}
     onStreamComplete={handleStreamComplete}
   />
   ```

### Phase 3: File Explorer Optimization (15 minutes)

1. **Replace FileExplorer**
   ```bash
   # Backup current FileExplorer
   mv src/components/FileExplorer.tsx src/components/FileExplorer.backup.tsx
   mv src/components/FileExplorer.optimized.tsx src/components/FileExplorer.tsx
   ```

2. **Benefits:**
   - Memoized file items prevent unnecessary re-renders
   - Virtualized large folder contents
   - Throttled folder loading
   - Stable event handlers

### Phase 4: Editor Optimizations (10 minutes)

1. **Add Monaco Editor Optimizations**
   ```typescript
   // In your editor component, add:
   import { useThrottle } from '../hooks/usePerformanceOptimizations';
   
   // Throttle content changes
   const throttledOnChange = useThrottle(onContentChange, 300);
   
   // Throttle resize operations
   const throttledResize = useThrottle(() => {
     editor?.layout();
   }, 150);
   ```

## ⚡ Critical Performance Fixes

### 1. Stop Unnecessary Re-renders

**Problem:** Large components re-rendering on every state change
**Solution:** Break down into smaller, memoized components

```typescript
// Before: 1867-line App component
// After: Multiple memoized components (StatusBar, EditorArea, etc.)

const StatusBar = memo(({ currentFileName, cursorPosition, saveStatus }) => {
  // Only re-renders when these props change
});
```

### 2. Optimize Chat Streaming

**Problem:** Re-rendering entire message list on every character
**Solution:** Batched updates with requestAnimationFrame

```typescript
// Before: setState on every character
setContent(newContent); // Causes immediate re-render

// After: Batched updates
const batchedUpdate = useCallback(() => {
  requestAnimationFrame(() => {
    setDisplayContent(contentBuffer.current);
  });
}, []);
```

### 3. Virtualize Large Lists

**Problem:** Rendering 100+ chat messages or files simultaneously
**Solution:** Only render visible items

```typescript
// Before: Render all items
{allItems.map(item => <Item key={item.id} />)}

// After: Render only visible items  
<VirtualizedChatMessages messages={messages} containerHeight={height} />
```

### 4. Throttle User Interactions

**Problem:** Event handlers firing on every mouse move/scroll
**Solution:** Throttle to ~60fps max

```typescript
// Before: Immediate updates
onScroll={(e) => updateScrollPosition(e.target.scrollTop)}

// After: Throttled updates
const throttledScroll = useThrottle(updateScrollPosition, 16);
```

## 🔍 Monitoring & Debugging

### 1. Enable Performance Monitoring
```typescript
import { PerformanceMonitor } from './config/performance';

const monitor = PerformanceMonitor.getInstance();
// Check performance report
console.log(monitor.getReport());
```

### 2. React DevTools Profiler
1. Install React DevTools browser extension
2. Use the Profiler tab to identify slow components
3. Look for components that re-render frequently

### 3. Performance Metrics
```typescript
// Monitor memory usage
import { monitorMemory } from './config/performance';
monitorMemory(); // Check memory usage in console
```

## 📊 Expected Performance Improvements

| Component | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Chat Streaming | 1-5 FPS | 30-60 FPS | 6-60x faster |
| File Operations | Laggy | Smooth | Near-instant |
| File Explorer | Re-renders all | Memoized | Only changed items |
| Editor Resize | Janky | Smooth | Throttled updates |
| Large Message Lists | Slow scroll | Smooth | Virtualized |

## 🚨 Common Pitfalls to Avoid

1. **Don't over-memoize** - Only memoize expensive components
2. **Watch dependency arrays** - Incorrect deps cause stale closures
3. **Clean up effects** - Cancel timeouts/intervals in cleanup
4. **Monitor bundle size** - Don't import entire libraries for small features

## 🔧 Immediate Actions

1. **Apply optimized App component** (biggest impact)
2. **Add virtualized chat messages** (fixes streaming lag)  
3. **Replace FileExplorer** (fixes file operations lag)
4. **Enable performance monitoring** (track improvements)

## ✅ Verification

After applying optimizations, verify improvements:

1. **Chat streaming should be smooth** - No more 1 FPS during AI responses
2. **File operations should be instant** - Opening/previewing files
3. **Scrolling should be smooth** - Both in chat and file explorer
4. **Memory usage should be stable** - No increasing memory leaks

## 🔄 Rollback Plan

If issues occur:
```bash
# Restore original files
mv src/App.backup.tsx src/App.tsx
mv src/components/FileExplorer.backup.tsx src/components/FileExplorer.tsx
```

---

**Estimated total migration time: 1-2 hours**
**Expected performance improvement: 10-60x faster UI** 