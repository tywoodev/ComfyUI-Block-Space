# Block Space Snap Rules

This document describes how snapping and guide lines work in ComfyUI-Block-Space.

---

## For Users: How Snapping Works

### What is Snapping?

Snapping automatically aligns nodes as you drag or resize them. When your node gets close to an alignment point (like another node's edge), it "snaps" into perfect alignment.

### Types of Snapping

#### 1. Move Snapping (Dragging)

When you drag a node, it can snap to:

| Snap Target | Description | Visual |
|-------------|-------------|--------|
| **Left Edge** | Align your node's left edge with another node's left edge | Vertical guide on left |
| **Right Edge** | Align your node's right edge with another node's right edge | Vertical guide on right |
| **Center** | Align your node's center with another node's center | Vertical guide at center |
| **Top Edge** | Align your node's top edge (below title bar) with another node's top edge | Horizontal guide at top |
| **Bottom Edge** | Align your node's bottom edge with another node's bottom edge | Horizontal guide at bottom |
| **Stack Right** | Position your node to the right with spacing margin | Vertical guide on target's right |
| **Stack Left** | Position your node to the left with spacing margin | Vertical guide on target's left |
| **Stack Below** | Position your node below with spacing margin | Horizontal guide on target's bottom |
| **Stack Above** | Position your node above with spacing margin | Horizontal guide on target's top |

**Raycasting Snapping:** When regular snapping doesn't find a match, Block Space uses "raycasting" to find the closest nodes in each direction (up to 2 neighbors) and snaps to them with your configured margin spacing.

#### 2. Resize Snapping

When you resize a node, it can snap to:

| Snap Target | Description |
|-------------|-------------|
| **Same Width** | Match width of another node |
| **Same Height** | Match height of another node |
| **Right Edge** | Extend to align with another node's right edge |
| **Bottom Edge** | Extend to align with another node's bottom edge |
| **Left Edge** | Extend to align with another node's left edge |
| **Top Edge** | Extend to align with another node's top edge |

### Guide Lines

Purple dotted lines show you exactly which nodes you're snapping to:

- **Vertical guides** appear on the left, right, or center of the target node
- **Horizontal guides** appear at the top and bottom edges (aligned to the content area, below the title bar)
- **Only the closest node** shows a guide - not all possible matches
- When resizing to a specific edge, only that edge shows a guide

### Exit Snap Behavior

Once snapped, the node stays snapped until you drag far enough away:
- The "exit threshold" is 1.5x the normal snap distance
- This prevents annoying flickering when you're near a snap point
- After releasing the mouse, you have 220ms of "grace period" where the snap still applies

### Settings You Can Configure

| Setting | What It Does | Default |
|---------|--------------|---------|
| **Enable Snapping** | Turn snapping on/off | On |
| **Snap Sensitivity** | How close you need to be (in pixels) | 10px |
| **Horizontal Snap Margin** | Preferred gap when stacking side-by-side | 60px |
| **Vertical Snap Margin** | Preferred gap when stacking vertically | 60px |
| **Show Alignment Guides** | Display purple guide lines | On |
| **Guide Line Color** | Choose your preferred color | Comfy Blue |
| **Snap Pulse Duration** | How long the green border glow lasts | 160ms |

---

## Technical Details

### Algorithm Overview

The snapping system operates in three phases:

1. **Discovery** - Find candidate nodes within search radius
2. **Clustering** - Group similar positions/dimensions into clusters
3. **Selection** - Pick the best match within threshold

### Constants

```javascript
// Core thresholds
SNAP_THRESHOLD = 10                           // Base snap distance (pixels)
EXIT_THRESHOLD_MULTIPLIER = 1.5               // Exit snap multiplier
SNAP_MOUSEUP_GRACE_MS = 220                   // Grace period after mouse up
SNAP_MOUSEUP_TOLERANCE_MULTIPLIER = 1.8       // Persistence tolerance

// Search radius
RESIZE_PADDING = 300                          // Resize search radius (px)
MOVE_PADDING = 2000                           // Move search radius (px)

// Visual
DEFAULT_DIMENSION_TOLERANCE_PX = 12           // Cluster tolerance
DEFAULT_H_SNAP_MARGIN = 60                    // Horizontal margin (px)
DEFAULT_V_SNAP_MARGIN = 40                    // Vertical margin (px)
DEFAULT_MOVE_SNAP_STRENGTH = 1.0              // Move threshold multiplier
DEFAULT_MOVE_Y_SNAP_STRENGTH = 2.4            // Y-axis move multiplier
DEFAULT_RESIZE_SNAP_STRENGTH = 2.4            // Resize threshold multiplier

// Node geometry
NODE_TITLE_HEIGHT = 24                        // LiteGraph title bar height
```

### Move Snapping Algorithm

```
On mouse move:
  1. Skip if Shift key held or snapping disabled
  
  2. Get active node bounds
     bounds = { left, right, top, bottom, centerX, centerY }
  
  3. Calculate dynamic threshold
     baseThreshold = SNAP_THRESHOLD / canvasScale
     thresholdX = baseThreshold * moveSnapStrength
     thresholdY = baseThreshold * moveYSnapStrength
     
     If was already snapped on X:
       thresholdX *= EXIT_THRESHOLD_MULTIPLIER
     Same for Y
  
  4. Find candidate nodes within MOVE_PADDING (2000px)
     Skip: groups, selected nodes, the active node itself
  
  5. Build snap points for each candidate:
     
     X-axis points:
       - bounds.left (left_flush)
       - bounds.right - activeWidth (right_flush)
       - bounds.left + width/2 - activeWidth/2 (center_flush)
       - bounds.right + hMargin (stack_right)
       - bounds.left - hMargin - activeWidth (stack_left)
     
     Y-axis points:
       - bounds.top (top_flush)
       - bounds.bottom - activeHeight (bottom_flush)
       - bounds.bottom + vMargin (stack_below)
       - bounds.top - vMargin - activeHeight (stack_above)
  
  6. Cluster points using buildDimensionClusters()
     - Groups points within 12px tolerance
     - Returns clusters with center (mean value)
  
  7. Pick nearest cluster for each axis
     xWinner = cluster with center closest to activeBounds.left
     yWinner = cluster with center closest to activeBounds.top
  
  8. Apply snap if within threshold
     If |activeBounds.left - xWinner.center| <= thresholdX:
       activeNode.pos[0] = xWinner.center
       xDidSnap = true
     Same for Y
  
  9. Raycasting fallback (if no snap yet)
     Find closest 2 neighbors in all 4 directions
     If within threshold * 1.5:
       Snap with margin spacing
  
  10. Update guide rendering state
      xWinnerNodes = [spatially closest node in winning cluster]
      yWinnerNodes = [spatially closest node in winning cluster]
      xSnapEdge = edge type that triggered snap ('left'|'right'|'center')
```

### Resize Snapping Algorithm

```
On resize:
  1. Skip if dragging canvas
  
  2. Get current dimensions
     currentWidth = bounds.right - bounds.left
     currentHeight = bounds.bottom - bounds.top
     currentRight = bounds.right
     currentBottom = bounds.bottom
  
  3. Find candidates within RESIZE_PADDING (300px)
  
  4. Build dimension samples:
     
     Width samples: each candidate's width
     Height samples: each candidate's height
     
     Right edge samples:
       - bounds.right (edge: 'right')
       - bounds.left (edge: 'left')
       - bounds.left - hMargin (edge: 'left')
     
     Bottom edge samples:
       - bounds.bottom (edge: 'bottom')
       - bounds.top (edge: 'top')
       - bounds.top - vMargin (edge: 'top')
  
  5. Cluster each sample type
     widthClusters = cluster(widthSamples, 12px)
     heightClusters = cluster(heightSamples, 12px)
     rightEdgeClusters = cluster(rightEdgeSamples, 12px)
     bottomEdgeClusters = cluster(bottomEdgeSamples, 12px)
  
  6. Pick winners
     widthWinner = pickDirectionalCluster(widthClusters, currentWidth, 'steady')
     heightWinner = pickDirectionalCluster(heightClusters, currentHeight, 'steady')
     rightEdgeWinner = pickNearestMoveCluster(rightEdgeClusters, currentRight)
     bottomEdgeWinner = pickNearestMoveCluster(bottomEdgeClusters, currentBottom)
  
  7. Determine best X match
     Default: widthWinner (dimension matching)
     If rightEdgeWinner is closer by 2px:
       Use rightEdgeWinner (edge alignment)
       xResizeEdge = closestMember.edge ('left' or 'right')
     
     Same logic for Y
  
  8. Apply if within threshold
     threshold = (SNAP_THRESHOLD / canvasScale) * resizeSnapStrength
     If was already snapped on this axis:
       threshold *= EXIT_THRESHOLD_MULTIPLIER
     
     If |currentWidth - bestWidth| <= threshold:
       resizingNode.size[0] = max(minSize, bestWidth)
```

### Guide Rendering Rules

```
For each winning node:
  1. Get node bounds
     bounds = getNodeBounds(node)
  
  2. Calculate visual positions
     // Vertical guides use full bounds
     leftX = bounds.left
     rightX = bounds.right
     
     // Horizontal guides offset by title height
     contentTopY = bounds.top - titleH
     contentBottomY = bounds.bottom - titleH
  
  3. Convert canvas to client coordinates
     topLeft = graphToClient(canvas, leftX, contentTopY)
     bottomRight = graphToClient(canvas, rightX, contentBottomY)
  
  4. Draw guides based on snap type
     
     Move snapping (X):
       If xSnapEdge == 'right':
         Draw line at rightX
       Else if xSnapEdge == 'center':
         Draw line at (leftX + rightX) / 2
       Else:
         Draw line at leftX
     
     Resize snapping (X):
       If xResizeEdge == 'left':
         Draw line at leftX only
       Else if xResizeEdge == 'right':
         Draw line at rightX only
       Else (both):
         Draw lines at leftX AND rightX
     
     Resize snapping (Y):
       If yResizeEdge == 'top':
         Draw line at contentTopY only
       Else if yResizeEdge == 'bottom':
         Draw line at contentBottomY only
       Else (both):
         Draw lines at contentTopY AND contentBottomY
```

### Memory and Caching

For performance, snapping uses memoization:

```javascript
// Move snapping memory
__blockSpaceMoveXPointMemory = {
  nodeId,       // Invalidate if different node
  tolerancePx,  // Cluster tolerance
  points[],     // Pre-computed snap points
  createdAt     // TTL for invalidation
}

// Resize snapping memory
__blockSpaceResizeDimensionMemory = {
  nodeId,
  tolerancePx,
  widthClusters[],      // Pre-computed clusters
  heightClusters[],
  rightEdgeClusters[],
  bottomEdgeClusters[],
  sampleNodeCount,      // Invalidate if node count changes
  createdAt
}
```

Memory is invalidated when:
- A different node is being moved/resized
- Node count changes (nodes added/removed)
- After 5 seconds (implicit via new drag operations)

### Settings Reference

| Setting ID | Type | Default | Description |
|------------|------|---------|-------------|
| `BlockSpace.EnableCustomConnectors` | boolean | true | Enable connector styling |
| `BlockSpace.ConnectorStyle` | combo | "hybrid" | Wire routing style |
| `BlockSpace.ConnectorStubLength` | slider | 34 | Wire stub length (px) |
| `BlockSpace.Snap.Enabled` | boolean | true | Master snapping toggle |
| `BlockSpace.Snap.Sensitivity` | slider | 10 | Base snap distance (px) |
| `BlockSpace.Snap.HMarginPx` | slider | 60 | Horizontal stack margin (px) |
| `BlockSpace.Snap.VMarginPx` | slider | 60 | Vertical stack margin (px) |
| `BlockSpace.Snap.HighlightEnabled` | boolean | true | Show guide lines |
| `BlockSpace.Snap.FeedbackPulseMs` | slider | 160 | Border glow duration (ms) |
| `BlockSpace.Snap.HighlightColor` | combo | "Comfy Blue" | Guide line color |

### Edge Cases

1. **Groups are excluded** - LGraphGroup nodes never participate in snapping
2. **Selected nodes are excluded** - Other selected nodes aren't snap targets
3. **Canvas dragging disables snapping** - Panning the canvas prevents snap interference
4. **Shift key bypass** - Holding Shift temporarily disables snapping
5. **Minimum node size** - Resizing respects node.min_size constraints
6. **Grace period** - After mouseup, snap persists for 220ms with 1.8x tolerance
7. **Zoom compensation** - All thresholds are divided by canvas scale

---

*Document version: 1.0.0*
*Last updated: 2026-03-01*
