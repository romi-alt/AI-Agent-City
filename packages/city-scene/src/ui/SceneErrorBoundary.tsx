'use client';
import { Component, type ReactNode } from 'react';
import { HudStyles } from './styles.tsx';

interface Props {
  children: ReactNode;
  /** Offer the 2D map instead. */
  onShowMap?: () => void;
}

/** If the 3D scene fails (lost GPU, driver bug), say so plainly and offer the 2D map or a reload. */
export class SceneErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // Logged for developers; the visitor sees the message below.
    console.error('The 3D city stopped:', error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="ac-error" role="alert">
        <HudStyles />
        <div>
          <h1>The 3D city couldn't start</h1>
          <p>
            Your browser or graphics card stopped the 3D view. You can still explore every building on the map, or try
            again (closing other tabs that use 3D can help).
          </p>
          <div className="ac-actions">
            {this.props.onShowMap && (
              <button type="button" className="ac-btn ac-primary" onClick={this.props.onShowMap}>
                Show the city map
              </button>
            )}
            <button type="button" className="ac-btn" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
