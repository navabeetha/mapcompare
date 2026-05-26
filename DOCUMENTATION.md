# Cartographic scale comparison tool (MapCompare) — Feature Documentation

This document outlines the features, architecture, user stories, acceptance criteria, and specific design notes for **MapCompare**, a high-precision, split-screen geo-spatial application built to compare urban footprints across different latitudes without Web Mercator distortion.

---

## 🗺️ Design Vision & Concept
Standard maps (Web Mercator projections) severely distort landmass sizes as you move away from the Equator (e.g., Greenland appears similar in size to Africa, although Africa is 14x larger). 

**MapCompare** solves this by providing a side-by-side, split-screen viewing experience. 
As the user zooms on one map, the application dynamically computes and adjusts the target zoom level of the opposite map based on the latitudinal difference. This ensures that **both maps display exactly the same spatial scale (meters per pixel)**, enabling true, undistorted size comparisons between global cities.

---

## 🛠️ Feature List

### 1. Dual-Map Split Screen layout
- Split window rendering of two fully-interactive Leaflet maps.
- **Dynamic Splitter Dragging**: An adjustable range slider lets users resize the split offset (percentage) between the left and right maps seamlessly to overlay details or inspect boundaries.

### 2. Latitude Scale Compensation (True Zoom Engine)
- Automatically corrects Web Mercator distortion using the formula:
  $$\text{TargetZoom} = \text{SourceZoom} + \log_2\left(\frac{\cos(\text{TargetLatitude})}{\cos(\text{SourceLatitude})}\right)$$
- Guarantees that $1\text{ cm}$ or $1\text{ pixel}$ on the left screen represents the same physical distance as $1\text{ cm}$ or $1\text{ pixel}$ on the right screen.

### 3. Independent Panning
- Maps can be panned completely independently. This allows users to align center coordinates of specific features (e.g., matching Tokyo's Shibuya Crossing directly with Paris's Arc de Triomphe).

### 4. Coordinated and Interlocked Zooming
- Zooming on the Left Map automatically calculates and sets the scale-compensated zoom for the Right Map and vice-versa.
- Uses advanced **interaction locks** and **event-trigger state tracking** to prevent recursive synchronization cascades, loops, and visual jitters.

### 5. Multi-City Presets
Quick comparisons with curated structural pairings:
- **Sprawl vs. Compactness**: Tokyo vs. Paris
- **Dynamic Sprawls**: Los Angeles vs. London
- **Island Metros**: New York City vs. Singapore
- **Canals vs. Desert**: Amsterdam vs. Cairo

### 6. Universal Search & Localization
- Dual independent search boxes.
- Search for any global city or address on either the Left or Right Map panel. Points of interest are programmatically loaded and synced immediately.

### 7. Geo-Spatial Tools and Data Cards
- **Scale Bars**: Real-time scale bars displaying metric and imperial divisions adjusted for the map's current latitude.
- **Comparison Indicators**: Dynamic statistics detailing the city's Country, Population Area ($\text{km}^2$), and a hand-crafted curio/fun-fact about its planning limits.
- **Grids**: An optional reference grid overlay showing geographic spacing.
- **Map Styles**: Quick-toggle map types between **Roadmap**, **Satellite**, and **Terrain** individually for both layers.

---

## 👥 User Stories

### Story 1: True Scale Size Evaluation
> **As an** urban planner or geography student,  
> **I want to** compare the structural sprawl of Los Angeles directly against London,  
> **So that I can** visually evaluate how high-density historical cores compare size-wise to automobile suburb grids under identical scale bounds.

### Story 2: Pinpoint Alignment with Independent Pan
> **As an** amateur map enthusiast,  
> **I want to** search for Central Park in New York and align the park layout side-by-side with Golden Gate Park in San Francisco at identical scale factors by panning independently,  
> **So that I can** visually compare their dimensions accurately.

---

## ✅ Acceptance Criteria

| ID | Title | Key Criteria | Status |
|---|---|---|---|
| **AC-1** | True Scale Correction | Right map zoom must adapt perfectly when zooming left map based on latitudinal formulas. | **Verified** |
| **AC-2** | Panning Autonomy | Dragging or panning the left map should not programmatically shift or move the center coordinate of the right map. | **Verified** |
| **AC-3** | Loop Prevention | Dual synchronous events must not cause cascading infinite feedback loops or screen flickering/jittering. | **Verified** |
| **AC-4** | Split-Pane Customization | Mouse-down and drag interaction over the middle grip divider must update the split percentage layout smoothly. | **Verified** |

---

## 📐 Design & Synchronization Notes

### The Loop & Jitter Challenge
When coordinate synchronization is bidirectional, setting states or triggers inside Leaflet events (e.g., `move`, `zoomstart`, `zoomend`) often triggers callbacks on the sibling map. If not isolated, this creates an endless recursive cycle: Map A updates Map B, which triggers Map B's event, which updates Map A, causing infinite rendering loops and screen flickering.

### Our Solution
- **Action Triggers (`syncTriggerRef`)**: Explicitly mark whether a zoom transaction is driven by `"left"` or `"right"` on `"zoomstart"`. No programmatic zoom is allowed to overwrite this lock during active zoom transitions.
- **User Interaction Flags (`isUserInteractingLeft`, `isUserInteractingRight`)**: Mark active user engagement on map drag event frames. Programs will never trigger auto-recentering if the user is in the process of dragging or zooming.
- **Debounced Execution**: Zoom syncs are debounced by $150\text{ms}$ with zero-animation overrides (`{ animate: false }`) to make the updates occur instantaneously with no transition delays, neutralizing layout jumps and stabilizing rendering performance.
